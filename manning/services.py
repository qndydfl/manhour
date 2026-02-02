import random
import re
from collections import defaultdict

from django.db import transaction
from django.db.models import Sum, Count

from .models import GibunPriority, WorkSession, Assignment, Worker, WorkItem

# -----------------------------------------------------------
# 상수
# -----------------------------------------------------------
KANBI_WO = "간비"
DIRECT_WO = "DIRECT"
SLOT_UNIT = 0.1  # 0.1시간(6분) 단위


# -----------------------------------------------------------
# 1) 자동 배정 서비스 (단순화: 팀 지정 -> 공용 풀 fallback)
# -----------------------------------------------------------
class AutoAssignService:
    def __init__(self, session_id: int):
        self.session = WorkSession.objects.get(id=session_id)
        # ✅ 입력 순서(ID)대로 작업자를 가져옵니다.
        self.workers = list(self.session.worker_set.all().order_by("id"))
        self.items = self.session.workitem_set.all()

        self.temp_load = {w.id: 0.0 for w in self.workers}
        self.target_load = None
        self.ignore_existing_loads = True

        # ❌ self.team_workers_map 삭제됨 (여기서 에러가 났었음)

    def run(self):
        with transaction.atomic():
            auto_items_qs = (
                WorkItem.objects.filter(is_manual=False, session=self.session)
                .exclude(work_order__in=[KANBI_WO, DIRECT_WO])
                .exclude(assignments__is_fixed=True)
                .distinct()
            )

            self.auto_items = list(auto_items_qs)
            self.auto_item_ids = [it.id for it in self.auto_items]

            if not self.auto_items:
                return

            if not self.ignore_existing_loads:
                self._load_base_assignments()
            total_base = sum(self.temp_load.values())
            total_auto = sum(float(it.work_mh or 0.0) for it in self.auto_items)
            if self.workers:
                self.target_load = (total_base + total_auto) / len(self.workers)
            Assignment.objects.filter(
                work_item_id__in=self.auto_item_ids, is_fixed=False
            ).delete()

            # 1. 기번 우선순위 로드
            gibun_orders = {
                gp.gibun: gp.order
                for gp in GibunPriority.objects.filter(session=self.session)
            }

            # 2. 아이템 그룹화
            items_by_gibun = {}
            for item in self.auto_items:
                gibun = (item.gibun_input or "").strip().upper()
                if gibun not in items_by_gibun:
                    items_by_gibun[gibun] = []
                items_by_gibun[gibun].append(item)

            # 3. 정렬된 기번 리스트
            sorted_gibuns = sorted(
                items_by_gibun.keys(), key=lambda g: gibun_orders.get(g, 999)
            )

            # 4. 순차 배정 실행
            # 팀 구분 없이 전체 작업자(self.workers)를 대상으로 하되,
            # 리스트 앞쪽(먼저 입력된 사람)부터 채워나가는 방식입니다.
            new_assignments = []

            for gibun in sorted_gibuns:
                team_items = items_by_gibun[gibun]
                team_items.sort(
                    key=lambda x: (int(x.ordering or 0), -float(x.work_mh or 0.0))
                )

                c_part, _ = self._assign_items_with_candidates(
                    team_items,
                    candidates=self.workers,  # 전체 인원 대상
                    allow_over_limit=True,
                )
                new_assignments.extend(c_part)

            if new_assignments:
                Assignment.objects.bulk_create(new_assignments)

            refresh_worker_totals(self.session)

    def _load_base_assignments(self):
        base_assignments = (
            Assignment.objects.filter(work_item__session=self.session)
            .exclude(work_item_id__in=self.auto_item_ids)
            .select_related("work_item")
        )
        for a in base_assignments:
            w_id = a.worker_id
            if w_id in self.temp_load:
                mh = 0.0
                if a.start_min is not None and a.end_min is not None:
                    dur = a.end_min - a.start_min
                    if dur < 0:
                        dur += 1440
                    mh = dur / 60.0
                else:
                    mh = float(a.allocated_mh or 0.0)
                self.temp_load[w_id] += mh

    def _assign_items_with_candidates(self, items, candidates, allow_over_limit):
        created = []
        if not candidates:
            return created, items

        cand_ids = [w.id for w in candidates]

        for item in items:
            needed = float(item.work_mh or 0.0)
            if needed <= 0:
                continue

            allocation = {w_id: 0.0 for w_id in cand_ids}
            remaining = needed

            # 입력 순서(ID)가 빠른 사람부터 일을 채움
            while remaining > 0.001:
                step = min(SLOT_UNIT, remaining)

                valid_cands = [
                    w for w in candidates if self.temp_load[w.id] < w.limit_mh
                ]
                if not valid_cands:
                    valid_cands = candidates

                target = None
                if self.target_load is not None:
                    deficits = {
                        w: self.target_load - self.temp_load[w.id] for w in valid_cands
                    }
                    max_deficit = max(deficits.values())
                    if max_deficit > 0:
                        targets = [
                            w
                            for w, d in deficits.items()
                            if abs(d - max_deficit) < 0.001
                        ]
                        targets.sort(key=lambda w: (self.temp_load[w.id], w.id))
                        target = targets[0]

                if target is None:
                    min_load = min(self.temp_load[w.id] for w in valid_cands)
                    targets = [
                        w
                        for w in valid_cands
                        if abs(self.temp_load[w.id] - min_load) < 0.001
                    ]
                    # ID(입력순서)가 빠른 순으로 정렬 -> 앞 사람이 먼저 선택됨
                    targets.sort(key=lambda w: w.id)
                    target = targets[0]

                self.temp_load[target.id] += step
                allocation[target.id] += step
                remaining -= step

            for w_id, amt in allocation.items():
                if amt > 0:
                    created.append(
                        Assignment(
                            work_item=item,
                            worker_id=w_id,
                            allocated_mh=round(amt, 2),
                            is_fixed=False,
                        )
                    )

        return created, []


# (ScheduleSyncService 및 helper 함수들은 이전과 동일하여 생략, 위 코드에 포함됨)
class ScheduleSyncService:
    def __init__(self, session_id):
        self.session = WorkSession.objects.get(id=session_id)
        self.workers = list(self.session.worker_set.all())
        if self.session.shift_type == "NIGHT":
            self.shift_start = 1200
            self.shift_end = 1920
        else:
            self.shift_start = 480
            self.shift_end = 1200

    def run(self):
        with transaction.atomic():
            shared_items = (
                WorkItem.objects.filter(session=self.session)
                .annotate(assign_count=Count("assignments"))
                .filter(assign_count__gt=0)
            )
            worker_timelines = self._load_existing_timelines()

            for item in shared_items:
                assigns = list(item.assignments.filter(start_min__isnull=True))
                if not assigns:
                    continue

                max_duration_min = 0
                assign_durations = {}
                for a in assigns:
                    d = int(float(a.allocated_mh or 0.0) * 60)
                    assign_durations[a.id] = d
                    if d > max_duration_min:
                        max_duration_min = d

                if max_duration_min <= 0:
                    continue
                involved_worker_ids = [a.worker.id for a in assigns]
                common_start = self._find_common_slot_forward(
                    max_duration_min, involved_worker_ids, worker_timelines
                )
                if common_start is None:
                    continue

                for a in assigns:
                    my_duration = assign_durations[a.id]
                    w_id = a.worker.id
                    real_start = common_start
                    real_end = real_start + my_duration
                    a.start_min = real_start
                    a.end_min = real_end
                    a.save()
                    worker_timelines.setdefault(w_id, [])
                    worker_timelines[w_id].append((real_start, real_end))
                    worker_timelines[w_id].sort()
            refresh_worker_totals(self.session)

    def _load_existing_timelines(self):
        timelines = {w.id: [] for w in self.workers}
        fixed_assigns = Assignment.objects.filter(
            work_item__session=self.session,
            start_min__isnull=False,
            end_min__isnull=False,
        )
        for a in fixed_assigns:
            s = a.start_min
            e = a.end_min
            if e < s:
                e += 1440
            timelines[a.worker.id].append((s, e))
        for w_id in timelines:
            timelines[w_id].sort()
        return timelines

    def _find_common_slot_forward(self, duration, worker_ids, timelines):
        cursor = self.shift_start
        while cursor + duration <= self.shift_end:
            proposed_start = cursor
            proposed_end = cursor + duration
            collision = False
            next_jump = cursor + 10
            for w_id in worker_ids:
                for occ_start, occ_end in timelines.get(w_id, []):
                    if proposed_start < occ_end and proposed_end > occ_start:
                        collision = True
                        if occ_end > next_jump:
                            next_jump = occ_end
                        break
                if collision:
                    break
            if not collision:
                return proposed_start
            cursor = next_jump
        return None


def run_auto_assign(session_id):
    AutoAssignService(session_id).run()


def run_sync_schedule(session_id):
    ScheduleSyncService(session_id).run()


def refresh_worker_totals(session):
    workers = session.worker_set.all()
    for w in workers:
        total = (
            w.assignments.filter(work_item__session=session)
            .exclude(work_item__work_order__in=[KANBI_WO, DIRECT_WO])
            .aggregate(Sum("allocated_mh"))["allocated_mh__sum"]
        )
        w.used_mh = round(total or 0.0, 2)
        w.save(update_fields=["used_mh"])
