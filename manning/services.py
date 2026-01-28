import random
from django.db import transaction
from django.db.models import Sum, Count, Q
from .models import WorkSession, Assignment, Worker, WorkItem, GibunPriority

# -----------------------------------------------------------
# 상수 정의
# -----------------------------------------------------------
KANBI_WO = "간비"
DIRECT_WO = "DIRECT"
SLOT_UNIT = 0.1  # 0.1시간(6분) 단위로 쪼개서 배정 (Water Filling)


# -----------------------------------------------------------
# 1. 자동 배정 서비스 (개선된 Water Filling 로직)
# -----------------------------------------------------------
class AutoAssignService:
    def __init__(self, session_id):
        self.session = WorkSession.objects.get(id=session_id)
        self.workers = list(self.session.worker_set.all())
        self.items = self.session.workitem_set.all()
        self.worker_map = {w.id: w for w in self.workers}
        
        # 임시 부하량 변수 초기화
        for w in self.workers:
            w._temp_mh = 0.0

    def run(self):
        with transaction.atomic():
            # 1. 자동 배정할 아이템 식별
            auto_items_qs = self.items.filter(
                is_manual=False
            ).exclude(
                work_order__in=[KANBI_WO, DIRECT_WO]
            )
            
            self.auto_items = list(auto_items_qs)
            self.auto_item_ids = [item.id for item in self.auto_items]

            # 2. 기저 부하(Base Load) 로드
            self._load_base_assignments()
            
            # 3. 자동 아이템 배정 수행
            self._distribute_auto_items_water_filling()
            
            # 4. 결과 저장
            refresh_worker_totals(self.session)

    def _load_base_assignments(self):
        """
        자동 배정 대상을 제외한 모든 기존 배정 내역을 부하량으로 로드
        """
        base_assignments = Assignment.objects.filter(
            work_item__session=self.session
        ).exclude(
            work_item_id__in=self.auto_item_ids
        ).select_related('work_item')

        for assign in base_assignments:
            if assign.worker_id not in self.worker_map:
                continue

            mh = 0.0
            if assign.start_min is not None and assign.end_min is not None:
                duration = assign.end_min - assign.start_min
                if duration < 0: duration += 1440
                mh = duration / 60.0
            else:
                mh = float(assign.allocated_mh or 0.0)

            self.worker_map[assign.worker_id]._temp_mh += mh

    def _distribute_auto_items_water_filling(self):
        """
        [수정됨] 
        1단계: 가능한 모든 인원에게 0.1씩 공평하게 분배 (참여 유도)
        2단계: 남은 시간은 가장 한가한 사람에게 Water Filling
        """
        if not self.auto_items:
            return

        # 우선순위 정렬
        priorities = {gp.gibun: gp.order for gp in GibunPriority.objects.filter(session=self.session)}
        self.auto_items.sort(key=lambda x: (
            priorities.get(x.gibun_input, 999),
            x.ordering,
            -float(x.work_mh or 0)
        ))

        # 기존 자동 배정 삭제
        Assignment.objects.filter(work_item_id__in=self.auto_item_ids).delete()

        new_assignments = []

        for item in self.auto_items:
            needed = float(item.work_mh or 0.0)
            if needed <= 0: continue

            allocation = {w.id: 0.0 for w in self.workers}
            remaining = needed

            # -------------------------------------------------------
            # [1단계] 최소 참여 보장 (Round Robin)
            # 한도(Limit)가 남은 모든 사람에게 일단 0.1씩 돌립니다.
            # -------------------------------------------------------
            
            # 후보군 선정 (한도 남은 사람)
            candidates = [w for w in self.workers if w._temp_mh < w.limit_mh]
            # 전원 한도 초과 시, 전원 후보로 전환 (일은 해야 하니까)
            if not candidates: 
                candidates = self.workers

            # 공평성을 위해 매번 순서를 섞음 (작업량이 매우 적을 때 특정인만 걸리는 것 방지)
            random.shuffle(candidates)

            # 한 바퀴 돌면서 0.1씩 투척
            for w in candidates:
                if remaining <= 0.001: 
                    break # 남은 시간이 없으면 중단
                
                step = min(SLOT_UNIT, remaining)
                
                w._temp_mh += step
                allocation[w.id] += step
                remaining -= step

            # -------------------------------------------------------
            # [2단계] 남은 시간은 "가장 한가한 사람"에게 몰아주기 (Water Filling)
            # -------------------------------------------------------
            while remaining > 0.001:
                step = min(SLOT_UNIT, remaining)
                
                # 후보 재선정 (1단계 배정으로 한도가 찼을 수도 있으므로)
                candidates = [w for w in self.workers if w._temp_mh < w.limit_mh]
                if not candidates: candidates = self.workers

                # 가장 부하가 적은 사람 찾기
                min_load = min(c._temp_mh for c in candidates)
                min_group = [c for c in candidates if abs(c._temp_mh - min_load) < 0.001]

                target = random.choice(min_group)
                
                target._temp_mh += step
                allocation[target.id] += step
                remaining -= step

            # -------------------------------------------------------
            # 결과 저장
            # -------------------------------------------------------
            for w_id, amt in allocation.items():
                final_amt = round(amt, 2)
                if final_amt > 0:
                    new_assignments.append(Assignment(
                        work_item=item,
                        worker_id=w_id,
                        allocated_mh=final_amt,
                        is_fixed=False
                    ))

        if new_assignments:
            Assignment.objects.bulk_create(new_assignments)


# -----------------------------------------------------------
# 2. 스케줄 동기화 서비스 (Timeline Sync)
# -----------------------------------------------------------
class ScheduleSyncService:
    def __init__(self, session_id):
        self.session = WorkSession.objects.get(id=session_id)
        self.workers = list(self.session.worker_set.all())
        if self.session.shift_type == 'NIGHT':
            self.shift_start = 1200
            self.shift_end = 1920
        else:
            self.shift_start = 480
            self.shift_end = 1200

    def run(self):
        with transaction.atomic():
            shared_items = WorkItem.objects.filter(
                session=self.session
            ).annotate(
                assign_count=Count('assignments')
            ).filter(assign_count__gt=0) 

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
                    max_duration_min,
                    involved_worker_ids,
                    worker_timelines
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
            end_min__isnull=False
        )
        for a in fixed_assigns:
            s = a.start_min
            e = a.end_min
            if e < s: e += 1440
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


# -----------------------------------------------------------
# 3. 헬퍼 함수
# -----------------------------------------------------------

def run_auto_assign(session_id):
    service = AutoAssignService(session_id)
    service.run()

def run_sync_schedule(session_id):
    service = ScheduleSyncService(session_id)
    service.run()

def refresh_worker_totals(session):
    workers = session.worker_set.all()
    for w in workers:
        total = w.assignments.filter(
            work_item__session=session
        ).exclude(
            work_item__work_order__in=[KANBI_WO, DIRECT_WO]
        ).aggregate(Sum('allocated_mh'))['allocated_mh__sum']

        w.used_mh = round(total or 0.0, 2)
        w.save()

# import random
# from django.db import transaction
# from django.db.models import Sum, Count, Q
# from .models import WorkSession, Assignment, Worker, WorkItem, GibunPriority

# # -----------------------------------------------------------
# # 상수 정의
# # -----------------------------------------------------------
# KANBI_WO = "간비"
# DIRECT_WO = "DIRECT"
# SLOT_UNIT = 0.1  # 0.1시간(6분) 단위로 쪼개서 배정 (Water Filling)


# # -----------------------------------------------------------
# # 1. 자동 배정 서비스 (개선된 Water Filling 로직)
# # -----------------------------------------------------------
# class AutoAssignService:
#     def __init__(self, session_id):
#         self.session = WorkSession.objects.get(id=session_id)
#         # 쿼리셋을 리스트로 변환하여 메모리에 고정
#         self.workers = list(self.session.worker_set.all())
#         self.items = self.session.workitem_set.all()
#         self.worker_map = {w.id: w for w in self.workers}
        
#         # 임시 부하량 변수 초기화
#         for w in self.workers:
#             w._temp_mh = 0.0

#     def run(self):
#         with transaction.atomic():
#             # 1. 자동 배정할 아이템 식별 (Manual False & 간비/Direct 제외)
#             auto_items_qs = self.items.filter(
#                 is_manual=False
#             ).exclude(
#                 work_order__in=[KANBI_WO, DIRECT_WO]
#             )
            
#             # 리스트로 변환하여 고정
#             self.auto_items = list(auto_items_qs)
#             self.auto_item_ids = [item.id for item in self.auto_items]

#             # 2. 기저 부하(Base Load) 계산
#             # (자동 배정 대상이 아닌 모든 기존 배정 내역을 부하량으로 로드)
#             self._load_base_assignments()
            
#             # 3. 자동 아이템 Water Filling 수행
#             self._distribute_auto_items_water_filling()
            
#             # 4. 결과 저장 (DB 집계 갱신)
#             # (이 함수는 파일 맨 아래에 정의되어 있음)
#             refresh_worker_totals(self.session)

#     def _load_base_assignments(self):
#         """
#         자동 배정 대상을 제외한 모든 기존 배정 내역(수동, 간비, Direct 등)을
#         작업자의 현재 부하량(_temp_mh)으로 로드합니다.
#         """
#         base_assignments = Assignment.objects.filter(
#             work_item__session=self.session
#         ).exclude(
#             work_item_id__in=self.auto_item_ids  # 자동 배정 예정인 건 제외
#         ).select_related('work_item')

#         for assign in base_assignments:
#             if assign.worker_id not in self.worker_map:
#                 continue

#             mh = 0.0
#             # A. 시간표(Timeline)가 확정된 경우 -> 시간 차이로 계산
#             if assign.start_min is not None and assign.end_min is not None:
#                 duration = assign.end_min - assign.start_min
#                 if duration < 0: duration += 1440  # 자정 넘김 처리
#                 mh = duration / 60.0
#             # B. M/H만 할당된 경우 -> 할당량 사용
#             else:
#                 mh = float(assign.allocated_mh or 0.0)

#             self.worker_map[assign.worker_id]._temp_mh += mh

#     def _distribute_auto_items_water_filling(self):
#         """
#         [Water Filling] 작업을 0.1시간씩 쪼개서 가장 한가한 사람에게 배정
#         """
#         if not self.auto_items:
#             return

#         # 우선순위 정렬 (기번 우선순위 -> 정렬순서 -> 작업량 큰 순)
#         priorities = {gp.gibun: gp.order for gp in GibunPriority.objects.filter(session=self.session)}
#         self.auto_items.sort(key=lambda x: (
#             priorities.get(x.gibun_input, 999),
#             x.ordering,
#             -float(x.work_mh or 0)
#         ))

#         # 기존 자동 배정 내역 삭제 (깨끗하게 다시 채우기 위함)
#         Assignment.objects.filter(work_item_id__in=self.auto_item_ids).delete()

#         new_assignments = []

#         for item in self.auto_items:
#             needed = float(item.work_mh or 0.0)
#             if needed <= 0: continue

#             # 이 아이템에 대해 각 작업자가 얼마를 가져갈지 계산
#             allocation = {w.id: 0.0 for w in self.workers}
#             remaining = needed

#             # 0.1시간(6분) 단위로 쪼개서 가장 부하가 적은 사람에게 줌
#             while remaining > 0.001:
#                 step = min(SLOT_UNIT, remaining)
                
#                 # [한도 체크] 현재 부하가 한도보다 적은 사람만 후보
#                 candidates = [w for w in self.workers if w._temp_mh < w.limit_mh]
                
#                 # 만약 모두가 한도를 초과했다면? -> 전원 후보 (오버로드 허용)
#                 if not candidates: 
#                     candidates = self.workers

#                 # 현재 가장 부하가 적은 사람 찾기
#                 min_load = min(c._temp_mh for c in candidates)
#                 # 부동소수점 오차 고려하여 최소값과 근접한 그룹 추출
#                 min_group = [c for c in candidates if abs(c._temp_mh - min_load) < 0.001]

#                 # 동점자 중 무작위 1명 선택
#                 target = random.choice(min_group)
                
#                 # 할당
#                 target._temp_mh += step       # 전체 부하량 갱신 (다음 루프 판단용)
#                 allocation[target.id] += step # 현재 아이템 할당량 갱신
#                 remaining -= step

#             # 계산된 할당량을 바탕으로 DB 객체 생성
#             for w_id, amt in allocation.items():
#                 final_amt = round(amt, 2)
#                 if final_amt > 0:
#                     new_assignments.append(Assignment(
#                         work_item=item,
#                         worker_id=w_id,
#                         allocated_mh=final_amt,
#                         is_fixed=False
#                     ))

#         if new_assignments:
#             Assignment.objects.bulk_create(new_assignments)


# # -----------------------------------------------------------
# # 2. 스케줄 동기화 서비스 (Timeline Sync)
# # -----------------------------------------------------------
# class ScheduleSyncService:
#     def __init__(self, session_id):
#         self.session = WorkSession.objects.get(id=session_id)
#         self.workers = list(self.session.worker_set.all())
#         if self.session.shift_type == 'NIGHT':
#             self.shift_start = 1200
#             self.shift_end = 1920
#         else:
#             self.shift_start = 480
#             self.shift_end = 1200

#     def run(self):
#         with transaction.atomic():
#             # 여러 명이 같이 하는 자동 배정 아이템 찾기 (할당 인원 > 0)
#             shared_items = WorkItem.objects.filter(
#                 session=self.session
#             ).annotate(
#                 assign_count=Count('assignments')
#             ).filter(assign_count__gt=0) 

#             worker_timelines = self._load_existing_timelines()

#             for item in shared_items:
#                 # 시간이 정해지지 않은(자동/유동) 배정만 가져옴
#                 assigns = list(item.assignments.filter(start_min__isnull=True))
#                 if not assigns:
#                     continue

#                 # 배정된 시간 중 가장 긴 시간을 기준 시간으로 잡음 (동시 시작을 위해)
#                 max_duration_min = 0
#                 assign_durations = {}
#                 for a in assigns:
#                     d = int(float(a.allocated_mh or 0.0) * 60)
#                     assign_durations[a.id] = d
#                     if d > max_duration_min:
#                         max_duration_min = d

#                 if max_duration_min <= 0:
#                     continue

#                 involved_worker_ids = [a.worker.id for a in assigns]

#                 # 모든 참여자가 가능한 공통 시간대 찾기
#                 common_start = self._find_common_slot_forward(
#                     max_duration_min,
#                     involved_worker_ids,
#                     worker_timelines
#                 )

#                 if common_start is None:
#                     continue 

#                 # 시간 확정 및 저장
#                 for a in assigns:
#                     my_duration = assign_durations[a.id]
#                     w_id = a.worker.id
                    
#                     real_start = common_start
#                     real_end = real_start + my_duration

#                     a.start_min = real_start
#                     a.end_min = real_end
#                     a.save()

#                     # 타임라인 업데이트 (다음 아이템 배정 시 충돌 방지)
#                     worker_timelines.setdefault(w_id, [])
#                     worker_timelines[w_id].append((real_start, real_end))
#                     worker_timelines[w_id].sort()

#             refresh_worker_totals(self.session)

#     def _load_existing_timelines(self):
#         """
#         이미 시간이 확정된(is_fixed=True 이거나 start_min이 있는) 배정 내역을 로드
#         """
#         timelines = {w.id: [] for w in self.workers}
#         fixed_assigns = Assignment.objects.filter(
#             work_item__session=self.session,
#             start_min__isnull=False,
#             end_min__isnull=False
#         )
#         for a in fixed_assigns:
#             s = a.start_min
#             e = a.end_min
#             if e < s: e += 1440
#             timelines[a.worker.id].append((s, e))
#         for w_id in timelines:
#             timelines[w_id].sort()
#         return timelines

#     def _find_common_slot_forward(self, duration, worker_ids, timelines):
#         """
#         참여자 전원이 비어있는 가장 빠른 시간 슬롯 탐색
#         """
#         cursor = self.shift_start
#         while cursor + duration <= self.shift_end:
#             proposed_start = cursor
#             proposed_end = cursor + duration
#             collision = False
#             next_jump = cursor + 10

#             for w_id in worker_ids:
#                 for occ_start, occ_end in timelines.get(w_id, []):
#                     # 겹치는지 확인
#                     if proposed_start < occ_end and proposed_end > occ_start:
#                         collision = True
#                         if occ_end > next_jump:
#                             next_jump = occ_end
#                         break
#                 if collision:
#                     break

#             if not collision:
#                 return proposed_start
#             cursor = next_jump
#         return None


# # -----------------------------------------------------------
# # 3. 헬퍼 함수 (Views에서 호출하는 함수들)
# # -----------------------------------------------------------

# def run_auto_assign(session_id):
#     service = AutoAssignService(session_id)
#     service.run()

# def run_sync_schedule(session_id):
#     # 같은 파일 내에 있으므로 import 없이 바로 사용
#     service = ScheduleSyncService(session_id)
#     service.run()

# def refresh_worker_totals(session):
#     """
#     화면 표시용: 간비/Direct를 제외한 순수 작업 M/H 합계 갱신
#     """
#     workers = session.worker_set.all()
#     for w in workers:
#         total = w.assignments.filter(
#             work_item__session=session
#         ).exclude(
#             work_item__work_order__in=[KANBI_WO, DIRECT_WO]
#         ).aggregate(Sum('allocated_mh'))['allocated_mh__sum']

#         w.used_mh = round(total or 0.0, 2)
#         w.save()