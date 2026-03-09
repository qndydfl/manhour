from django.db import transaction
from .models import WorkSession, Worker, WorkItem, Assignment

KANBI_WO = "간비"
DIRECT_WO = "DIRECT"

class Planner:
    """
    세션의 작업 배정(Assignment)을 중앙에서 관리하고 처리하는 클래스.
    A 방식: WorkItem은 공용(간비 1개, DIRECT 1개)만 사용하고,
    실제 입력 내용은 Assignment.code / 시간은 start_min/end_min에 저장.
    """
    def __init__(self, session_id):
        self.session_id = session_id
        self.session = WorkSession.objects.get(id=session_id)
        self.assignments = []  # 메모리에서 관리할 Assignment 목록
        self.conflicts = []    # 충돌 감지용

        # 공용 WorkItem 캐시
        self._kanbi_item = None
        self._direct_item = None

    # -----------------------------
    # 공용 WorkItem 확보
    # -----------------------------
    def _get_or_create_common_item(self, wo: str) -> WorkItem:
        if wo == KANBI_WO:
            if self._kanbi_item:
                return self._kanbi_item
        if wo == DIRECT_WO:
            if self._direct_item:
                return self._direct_item

        defaults = {
            "gibun_input": "COMMON",
            "op": "",
            "description": "공용 항목",
            "work_mh": 0.0,
            "is_manual": True,
            "ordering": 0,
        }
        if wo == KANBI_WO:
            defaults["description"] = "간접비용/휴식(공용)"
        elif wo == DIRECT_WO:
            defaults["description"] = "직접입력(공용)"

        item, _ = WorkItem.objects.get_or_create(
            session=self.session,
            work_order=wo,
            defaults=defaults,
        )

        if wo == KANBI_WO:
            self._kanbi_item = item
        elif wo == DIRECT_WO:
            self._direct_item = item

        return item

    # -----------------------------
    # 로드
    # -----------------------------
    def load_assignments(self, include_auto=True):
        """
        DB에서 현재 세션의 Assignment를 로드.
        - include_auto=True면 전체 로드
        - include_auto=False면 수동 입력(간비/DIRECT + 수동고정)만 로드 같은 형태로 확장 가능
        """
        qs = Assignment.objects.filter(
            work_item__session_id=self.session_id
        ).select_related("work_item", "worker")

        if not include_auto:
            # 필요시 조건 커스터마이즈 가능
            qs = qs.filter(
                work_item__work_order__in=[KANBI_WO, DIRECT_WO]
            )

        self.assignments = list(qs)

    # -----------------------------
    # 추가(메모리만)
    # -----------------------------
    def add_assignment(self, wo, op, code, start_min, end_min, worker_id, is_manual=False):
        """
        A 방식:
        - 간비: work_item=공용 간비, Assignment.code=코드(식사/교육 등)
        - 직비(수동입력): work_item=공용 DIRECT, Assignment.code에 WO/OP 등 문자열로 저장
        """
        if not worker_id or start_min is None or end_min is None:
            print(f"[Planner] 필수 정보 부족: worker_id={worker_id}, start={start_min}, end={end_min}")
            return

        worker = Worker.objects.get(id=worker_id, session_id=self.session_id)

        # 야간 근무 처리(종료가 시작보다 작거나 같으면 익일로)
        calc_end_min = end_min + 1440 if end_min <= start_min else end_min

        duration = calc_end_min - start_min
        if duration <= 0:
            print(f"[Planner] duration<=0 무시: {duration}")
            return

        mh = round(duration / 60.0, 2)

        # -----------------------------
        # WorkItem 선택 + code 정규화
        # -----------------------------
        if code:  # 간비
            work_item = self._get_or_create_common_item(KANBI_WO)
            code_value = str(code).strip()

        elif wo:  # 직비(수동입력)
            work_item = self._get_or_create_common_item(DIRECT_WO)
            wo = str(wo).strip()
            op = (str(op).strip() if op is not None else "")
            # 직비 내용을 code에 저장(가장 간단한 방식)
            code_value = f"{wo}" + (f" / {op}" if op else "")

        else:
            print("[Planner] code도 wo도 없어 저장 불가")
            return

        # -----------------------------
        # 메모리 Assignment 생성
        # -----------------------------
        new_assignment = Assignment(
            work_item=work_item,
            worker=worker,
            start_min=start_min,
            end_min=calc_end_min,
            allocated_mh=mh,     # DIRECT/간비는 화면에서 시간차로 계산할 거면 0으로 둬도 됨
            is_fixed=True,       # 수동 입력은 고정
            code=code_value,
        )

        self.assignments.append(new_assignment)
        print(f"[Planner] 메모리 추가: {worker.name} / {work_item.work_order} / {code_value} ({start_min}~{calc_end_min})")

    # -----------------------------
    # 충돌 감지(현재 정책 유지)
    # -----------------------------
    def resolve_conflicts(self):
        """
        시간이 겹치는 작업 감지.
        현재는 '충돌난 것은 conflicts에 넣고, resolved에는 안 넣는' 형태였는데,
        네 코드가 실제로 self.assignments를 교체하지 않으니(주석처리),
        여기서는 감지만 하도록 명확히 유지.
        """
        self.conflicts = []

        # worker별로 시간 있는 것만 모아서 비교
        occupied_slots = {}

        # 새로 추가된 것(메모리 신규)은 pk=None이므로 뒤로 가게
        self.assignments.sort(key=lambda a: a.pk or float("inf"))

        for a in self.assignments:
            if a.start_min is None or a.end_min is None:
                continue

            wid = a.worker_id
            occupied_slots.setdefault(wid, [])

            for (s, e) in occupied_slots[wid]:
                if a.start_min < e and a.end_min > s:
                    self.conflicts.append(a)
                    print(f"[Planner] 충돌: worker={wid} {a.work_item.work_order} ({a.start_min}~{a.end_min})")
                    break
            else:
                occupied_slots[wid].append((a.start_min, a.end_min))

        print(f"[Planner] 충돌 감지 완료: {len(self.conflicts)}건")

    # -----------------------------
    # 저장
    # -----------------------------
    def save_changes(self, replace_workers=True):
        """
        메모리의 배정을 DB에 저장.
        기존 방식의 문제(WorkItem 폭증/고아 WorkItem)를 제거.

        replace_workers=True:
          - 이번 Planner가 다루는 worker들의 기존 '간비/DIRECT' 배정을 삭제 후 재작성
          - 자동배정(일반 WorkItem)은 건드리지 않음

        replace_workers=False:
          - 메모리 목록 그대로 bulk_create만 (주의: 중복 생길 수 있음)
        """
        worker_ids = {a.worker_id for a in self.assignments if a.worker_id}

        with transaction.atomic():
            if replace_workers and worker_ids:
                # A 방식에서는 간비/DIRECT만 삭제하고 다시 쓰는 것이 안전
                Assignment.objects.filter(
                    work_item__session_id=self.session_id,
                    worker_id__in=worker_ids,
                    work_item__work_order__in=[KANBI_WO, DIRECT_WO],
                ).delete()

            # bulk_create 대상: 새로 만든 것(pk None)만
            new_rows = [a for a in self.assignments if a.pk is None]

            # work_item은 공용이라 반드시 pk 존재
            for a in new_rows:
                a.work_item_id = a.work_item.pk

            Assignment.objects.bulk_create(new_rows)

        print(f"[Planner] 저장 완료: 신규 {len(new_rows)}건 (workers={len(worker_ids)})")
