import random
from django.db import transaction
from django.db.models import Sum, Count, Q

from manning.utils import get_adjusted_min
from .models import WorkSession, Assignment, Worker, WorkItem, GibunPriority

# class AutoAssignService:
#     SLOT_UNIT = 0.1  # 0.1시간 단위로 쪼개서 배정 (Water Filling)

#     def __init__(self, session_id):
#         self.session = WorkSession.objects.get(id=session_id)
#         # 작업자 리스트를 이름순이나 ID순으로 고정하지 않고 가져옴
#         self.workers = list(self.session.worker_set.all())
        
#         self.items = self.session.workitem_set.all()
#         self.worker_map = {w.id: w for w in self.workers}
        
#         # 임시 계산용 변수 초기화
#         for w in self.workers:
#             w._temp_mh = 0.0

#     def run(self):
#         with transaction.atomic():
#             # 1. 수동 배정된 시간 먼저 계산 (로드 밸런싱 기준점 잡기)
#             self._load_manual_assignments()
            
#             # 2. 자동 배정 항목들 분배 (우선순위 정렬 + 워터 필링)
#             self._distribute_auto_items()
            
#             # 3. 결과 DB 반영 (간비 제외 로직 포함)
#             refresh_worker_totals(self.session)

#     def _load_manual_assignments(self):
#         """수동으로 고정된 작업들의 시간을 먼저 작업자에게 반영"""
#         manual_items = self.items.filter(is_manual=True)
#         for item in manual_items:
#             assignments = item.assignments.all()
#             for assign in assignments:
#                 if assign.worker_id in self.worker_map:
#                     self.worker_map[assign.worker_id]._temp_mh += assign.allocated_mh

#     def _distribute_auto_items(self):
#         # 1. 자동 배정 대상 일감 가져오기
#         auto_items = list(self.items.filter(is_manual=False))
        
#         # 2. 기번별 우선순위 적용 (Dictionary 형태: {'HL7777': 1, 'HL8888': 2})
#         priorities = {gp.gibun: gp.order for gp in GibunPriority.objects.filter(session=self.session)}
        
#         # [핵심 수정 1] 정렬 로직 변경 (균등 분배의 핵심)
#         # 1순위: 기번 우선순위 (오름차순: 1 -> 2 -> 3)
#         # 2순위: 작업 시간 (내림차순: 큰 작업부터 배정해야 골고루 들어감) [-x.work_mh]
#         # 3순위: ID (등록순)
#         auto_items.sort(key=lambda x: (
#             priorities.get(x.gibun_input, 999), 
#             x.ordering,
#             -x.work_mh, 
#             x.id
#         ))

#         # 3. 기존 자동 배정 기록 삭제 (초기화)
#         auto_item_ids = [item.id for item in auto_items]
#         Assignment.objects.filter(
#             work_item_id__in=auto_item_ids,
#             start_min__isnull=True,
#             end_min__isnull=True,
#             work_item__is_manual=False
#         ).delete()
#         # 4. 워터 필링 (Water Filling) 시작
#         for item in auto_items:
#             mh_needed = item.work_mh
#             if mh_needed <= 0:
#                 continue

#             # 0.1시간 단위로 조각내어 슬롯 수 계산
#             # 예: 1.5시간 -> 15개 슬롯
#             total_slots = int(round(mh_needed / self.SLOT_UNIT))
            
#             # 현재 아이템에 대해 각 작업자가 얼만큼 가져갈지 임시 저장
#             current_task_allocation = {w.id: 0.0 for w in self.workers}

#             for _ in range(total_slots):
#                 # 근무 한도(limit_mh)를 넘지 않은 사람만 후보로 선정
#                 candidates = [w for w in self.workers if w._temp_mh < w.limit_mh]
                
#                 # 모든 작업자가 한도를 넘었다면? 전원 후보 (Overload 허용)
#                 if not candidates:
#                     candidates = self.workers

#                 # 현재 가장 일이 적은 사람(Min Load) 찾기
#                 min_load = min(c._temp_mh for c in candidates)
                
#                 # min_load와 차이가 미세한(0.001 이내) 동점자 그룹 찾기
#                 min_group = [c for c in candidates if c._temp_mh <= min_load + 0.001]
                
#                 # [핵심 수정 2] 동점자 중 '랜덤' 선택
#                 # 기존에는 min_group[0]으로 항상 앞사람만 선택되어 쏠림 현상 발생
#                 target_worker = sorted(min_group, key=lambda w: w.id)[0]

#                 # 선택된 사람에게 0.1시간 추가
#                 target_worker._temp_mh += self.SLOT_UNIT
#                 current_task_allocation[target_worker.id] += self.SLOT_UNIT

#             # 계산된 할당량을 실제 Assignment 객체로 생성 (한 아이템이 여러 명에게 쪼개질 수 있음)
#             for w in self.workers:
#                 amount = current_task_allocation[w.id]
#                 if amount > 0.001:
#                     Assignment.objects.create(
#                         work_item=item,
#                         worker=w,
#                         allocated_mh=round(amount, 2)
#                     )

class AutoAssignService:
    SLOT_UNIT = 0.1  # 0.1시간 단위로 쪼개서 배정 (Water Filling)

    def __init__(self, session_id):
        self.session = WorkSession.objects.get(id=session_id)
        # 작업자 리스트 가져오기
        self.workers = list(self.session.worker_set.all())
        self.items = self.session.workitem_set.all()
        self.worker_map = {w.id: w for w in self.workers}
        
        # 임시 계산용 변수 초기화 (DB 저장 전 메모리에서 계산)
        for w in self.workers:
            w._temp_mh = 0.0

    def run(self):
        with transaction.atomic():
            # 1. 수동 배정된 시간 먼저 반영 (이미 확정된 부하)
            self._load_manual_assignments()
            
            # 2. 자동 배정 항목들 분배 (Water Filling 알고리즘)
            self._distribute_auto_items()
            
            # 3. 결과 DB 반영 (작업자별 총 시간 갱신)
            # (주의: refresh_worker_totals가 이 파일에 있다면 바로 호출, 아니면 import 확인)
            try:
                from .services import refresh_worker_totals
                refresh_worker_totals(self.session)
            except ImportError:
                pass 

    def _load_manual_assignments(self):
        """
        수동으로 고정된(is_manual=True) 작업들의 시간을 
        작업자 _temp_mh에 미리 더해놓습니다. (로드 밸런싱 기준점)
        """
        manual_items = self.items.filter(is_manual=True)
        for item in manual_items:
            # 해당 아이템에 연결된 배정 내역 조회
            assignments = item.assignments.all()
            for assign in assignments:
                if assign.worker_id in self.worker_map:
                    self.worker_map[assign.worker_id]._temp_mh += float(assign.allocated_mh)

    def _distribute_auto_items(self):
        # 1. 자동 배정 대상 일감 가져오기
        auto_items = list(self.items.filter(is_manual=False))
        if not auto_items:
            return        
        
        # 2. 기번별 우선순위 매핑
        priorities = {gp.gibun: gp.order for gp in GibunPriority.objects.filter(session=self.session)}
        
        # [정렬 로직] 
        # 1순위: 기번 우선순위 (1 -> 2 -> 3)
        # 2순위: 작업량이 큰 것부터 (-x.work_mh) -> 큰 돌을 먼저 넣어야 채우기 쉬움
        # 3순위: 등록 순서 (x.id)
        auto_items.sort(key=lambda x: (
            priorities.get(x.gibun_input, 999), 
            x.ordering,
            -x.work_mh, 
            x.id
        ))

        # [핵심 수정 1] 기존 자동 배정 기록 '완전' 삭제 (초기화)
        # start_min__isnull=True 조건을 빼야 재배정 시 기존 데이터가 확실히 날아갑니다.
        auto_item_ids = [item.id for item in auto_items]
        Assignment.objects.filter(work_item_id__in=auto_item_ids).delete()

        # 4. 워터 필링 (Water Filling) 시작
        for item in auto_items:
            mh_needed = float(item.work_mh)
            if mh_needed <= 0:
                continue

            # 슬롯 수 계산 (예: 1.5시간 -> 15개 조각)
            total_slots = int(round(mh_needed / self.SLOT_UNIT))
            
            # 현재 아이템을 누구에게 얼마큼 줄지 임시 저장 (worker_id: hours)
            current_task_allocation = {w.id: 0.0 for w in self.workers}

            for _ in range(total_slots):
                # A. 근무 한도(limit_mh)를 넘지 않은 사람만 후보로 선정
                candidates = [w for w in self.workers if w._temp_mh < w.limit_mh]
                
                # B. 전원 한도 초과 시, 어쩔 수 없이 전원 후보 (Overload)
                if not candidates:
                    candidates = self.workers

                # C. 현재 가장 일이 적은(Min Load) 부하량 찾기
                min_load = min(c._temp_mh for c in candidates)
                
                # D. 최소 부하와 거의 같은(동점자) 그룹 찾기 (부동소수점 오차 고려 0.001)
                min_group = [c for c in candidates if c._temp_mh <= min_load + 0.001]
                
                # [핵심 수정 2] 동점자 중 '진짜 랜덤' 선택
                # 주석에는 랜덤이라고 되어있었으나 코드는 sorted()[0]으로 ID순이었습니다.
                # random.choice를 써야 0.1 조각들이 골고루 퍼집니다.
                target_worker = random.choice(min_group)

                # 선택된 사람에게 0.1시간(1 슬롯) 추가
                target_worker._temp_mh += self.SLOT_UNIT
                current_task_allocation[target_worker.id] += self.SLOT_UNIT

            # 5. DB에 Assignment 생성 (0.1 조각들을 합쳐서 저장)
            for w in self.workers:
                amount = current_task_allocation[w.id]
                if amount > 0.001: # 0보다 크면 저장
                    Assignment.objects.create(
                        work_item=item,
                        worker=w,
                        allocated_mh=round(amount, 2)
                    )


# =========================================================
# [신규] 스케줄 동기화 서비스 (Synchronized Scheduling)
# =========================================================
# class ScheduleSyncService:
#     """
#     같은 작업(WO)을 수행하는 멤버들이 '같은 시간'에 시작하도록 
#     공통된 빈 시간(Intersection)을 찾아 배정하는 서비스
#     """
#     def __init__(self, session_id):
#         self.session = WorkSession.objects.get(id=session_id)
#         self.workers = list(self.session.worker_set.all())
        
#         # 근무 시간 범위 설정 (분 단위)
#         if self.session.shift_type == 'NIGHT':
#             # 야간: 20:00(1200) ~ 08:00(1920, 다음날)
#             self.shift_start = 1200 
#             self.shift_end = 1920   
#         else:
#             # 주간: 08:00(480) ~ 20:00(1200)
#             self.shift_start = 480
#             self.shift_end = 1200
            
#         # 작업자별 타임라인 초기화 (이미 점유된 시간 목록)
#         self.timelines = {w.id: [] for w in self.workers}

#     def run(self):
#         """실행 진입점"""
#         with transaction.atomic():
#             # 1. 이미 고정된 스케줄(간비, 수동입력) 로드
#             self._load_fixed_schedules()
            
#             # 2. 동기화 배정 시작
#             self._allocate_synced_slots()
            
#             # 3. 작업자 총 시간 갱신
#             refresh_worker_totals(self.session)

#     def _load_fixed_schedules(self):
#         """DB에 시간이 박혀있는(수동/간비) 항목들을 타임라인에 등록"""
#         fixed_assigns = Assignment.objects.filter(
#             work_item__session=self.session,
#             start_min__isnull=False # 시간이 있는 것만
#         )
#         for a in fixed_assigns:
#             # 시간 보정 (야간의 01:00 -> 25:00 등으로 변환하여 비교 용이하게)
#             s = get_adjusted_min(a.start_min)
#             e = get_adjusted_min(a.end_min)
            
#             # 종료 시간이 역전된 경우(새벽 넘어감) 보정
#             if e < s: e += 1440
            
#             if a.worker_id in self.timelines:
#                 self.timelines[a.worker_id].append((s, e))
        
#         # 시간순 정렬
#         for w_id in self.timelines:
#             self.timelines[w_id].sort(key=lambda x: x[0])

#     def _allocate_synced_slots(self):
#         """
#         자동 배정된(시간이 없는) 작업들을 가져와서,
#         참여 작업자 모두가 가능한 시간을 찾아 할당함
#         """
#         # 정렬: 기번 우선순위 -> 작업량 큰 순 (큰 돌을 먼저 넣어야 함)
#         target_items = WorkItem.objects.filter(
#             session=self.session, 
#             is_manual=False # 자동 배정 대상만
#         ).order_by('gibun_input', '-work_mh')

#         # 기존에 자동 배정으로 들어갔던 시간들 초기화 (재배치를 위해)
#         # (주의: is_manual=True인 것은 위에서 _load_fixed_schedules로 이미 로드했으므로 건드리지 않음)
#         Assignment.objects.filter(
#             work_item__in=target_items
#         ).update(start_min=None, end_min=None)

#         for item in target_items:
#             assigns = list(item.assignments.all())
#             if not assigns: continue
            
#             # 필요한 시간 (분)
#             duration = int(item.work_mh * 60)
#             if duration <= 0: continue

#             # 이 작업에 참여하는 모든 작업자 ID
#             involved_worker_ids = [a.worker.id for a in assigns]
            
#             # [핵심] 공통 시간 찾기
#             found_start = self._find_common_slot(duration, involved_worker_ids)

#             if found_start is not None:
#                 final_end = found_start + duration
                
#                 # DB 저장 (모두 같은 시간으로)
#                 for a in assigns:
#                     a.start_min = found_start
#                     a.end_min = final_end
#                     a.save()
                    
#                     # 메모리 타임라인에도 추가 (다음 루프의 충돌 방지)
#                     self.timelines[a.worker.id].append((found_start, final_end))
#                     self.timelines[a.worker.id].sort(key=lambda x: x[0])

#     def _find_common_slot(self, duration, worker_ids):
#         """
#         주어진 작업자들(worker_ids) 모두가 
#         동시에 'duration'만큼 비어있는 시간을 찾음
#         """
#         cursor = self.shift_start
        
#         # 시프트 종료 시간 전까지 탐색
#         while cursor + duration <= self.shift_end:
#             proposed_start = cursor
#             proposed_end = cursor + duration
#             collision = False
            
#             # 최적화: 충돌이 나면 어디까지 점프할지 결정
#             next_jump = cursor + 10 # 기본 10분 단위 전진

#             # 모든 참여자에 대해 검사
#             for w_id in worker_ids:
#                 # 해당 작업자의 기존 일정과 겹치는지 확인
#                 for occ_start, occ_end in self.timelines[w_id]:
#                     # 겹침 조건: (제안 시작 < 점유 끝) AND (제안 끝 > 점유 시작)
#                     if proposed_start < occ_end and proposed_end > occ_start:
#                         collision = True
#                         # 충돌 발생 시, 해당 점유 끝나는 시간으로 커서 점프 (최적화)
#                         if occ_end > next_jump:
#                             next_jump = occ_end
#                         break # 한 명이라도 안 되면 즉시 중단
#                 if collision: break
            
#             if not collision:
#                 # 모두 통과! 찾았다.
#                 return proposed_start
            
#             # 충돌했으면 점프
#             cursor = next_jump
            
#         return None # 끝까지 뒤져도 다 같이 비는 시간이 없음
    
class ScheduleSyncService:
    def __init__(self, session_id):
        self.session = WorkSession.objects.get(id=session_id)
        self.workers = list(self.session.worker_set.all())
        
        # 근무 시간 설정
        if self.session.shift_type == 'NIGHT':
            self.shift_start = 1200 # 20:00
            self.shift_end = 1920   # 08:00
        else:
            self.shift_start = 480  # 08:00
            self.shift_end = 1200   # 20:00

    def run(self):
        with transaction.atomic():
            # 1. 공동 작업(2인 이상) 찾기
            shared_items = WorkItem.objects.filter(
                session=self.session,
                is_manual=False
            ).annotate(
                assign_count=Count(
                    'assignments',
                    filter=Q(assignments__start_min__isnull=True)
                )
            ).filter(assign_count__gt=1)

            # 2. 타임라인 로드 (간비, 수동입력 등 고정 스케줄)
            worker_timelines = self._load_existing_timelines()

            # 3. 배치 시작
            for item in shared_items:
                assigns = list(item.assignments.all())
                if not assigns: continue

                # 최대 소요 시간 계산
                max_duration_min = 0
                assign_durations = {} 
                for a in assigns:
                    d = int(a.allocated_mh * 60)
                    assign_durations[a.id] = d
                    if d > max_duration_min: max_duration_min = d
                
                if max_duration_min <= 0: continue
                involved_worker_ids = [a.worker.id for a in assigns]

                # [STEP 1] Forward Search로 공통 시작 시간 찾기 (예: 13:00)
                # 이 함수 안에서 이미 간비 충돌 체크를 수행함
                common_start = self._find_common_slot_forward(
                    max_duration_min, 
                    involved_worker_ids, 
                    worker_timelines
                )

                if common_start is not None:
                    # [STEP 2] 개별적으로 앞으로 당기기 (Gap Filling) 시도
                    for a in assigns:
                        my_duration = assign_durations[a.id]
                        w_id = a.worker.id
                        user_schedule = worker_timelines.get(w_id, [])
                        
                        # 내 일정 중 common_start 바로 앞의 끝나는 시간(Bumper) 찾기
                        # 예: 09:00에 간비가 끝나면 bumper=09:00
                        bumper = self.shift_start
                        for _, occ_end in user_schedule:
                            if occ_end <= common_start:
                                if occ_end > bumper:
                                    bumper = occ_end
                        
                        # 후보: Bumper(09:00)부터 시작해보기
                        proposed_start = bumper
                        
                        # [안전장치] 당겼을 때 간비랑 겹치는지 재확인!
                        if self._is_interval_free(w_id, proposed_start, my_duration, worker_timelines):
                            real_start = proposed_start # 안전함 -> 당김 (09:00 시작)
                        else:
                            real_start = common_start # 위험함 -> 그냥 공통 시간(13:00) 사용

                        real_end = real_start + my_duration
                        
                        if a.start_min is not None or a.end_min is not None: continue
                        a.start_min = real_start
                        a.end_min = real_end
                        a.save()
                        
                        # 타임라인 업데이트 (다음 작업 배치를 위해)
                        if w_id not in worker_timelines: worker_timelines[w_id] = []
                        worker_timelines[w_id].append((real_start, real_end))
                        worker_timelines[w_id].sort()

    def _load_existing_timelines(self):
        """DB에 저장된 고정된 시간(간비 포함)을 로드"""
        timelines = {w.id: [] for w in self.workers}
        fixed_assigns = Assignment.objects.filter(
            work_item__session=self.session
        ).exclude(
            start_min__isnull=True,
            end_min__isnull=True
        )
        for a in fixed_assigns:
            s = a.start_min
            e = a.end_min
            if s is not None and e is not None:
                if e < s: e += 1440 
                timelines[a.worker.id].append((s, e))
        for w_id in timelines:
            timelines[w_id].sort()
        return timelines

    def _is_interval_free(self, worker_id, start, duration, timelines):
        """해당 구간이 진짜로 비어있는지(간비와 안 겹치는지) 확인"""
        end = start + duration
        user_schedule = timelines.get(worker_id, [])
        for occ_start, occ_end in user_schedule:
            # 겹침 조건: (내시작 < 남끝) AND (내끝 > 남시작)
            if start < occ_end and end > occ_start:
                return False # 겹침!
        return True # 안전함

    def _find_common_slot_forward(self, duration, worker_ids, timelines):
        """앞에서부터 빈 공간 탐색 (간비 회피 기능 포함)"""
        cursor = self.shift_start
        while cursor + duration <= self.shift_end:
            proposed_start = cursor
            proposed_end = cursor + duration
            collision = False
            next_jump = cursor + 10 

            for w_id in worker_ids:
                user_schedule = timelines.get(w_id, [])
                for occ_start, occ_end in user_schedule:
                    if proposed_start < occ_end and proposed_end > occ_start:
                        collision = True
                        if occ_end > next_jump: next_jump = occ_end
                        break 
                if collision: break
            
            if not collision: return proposed_start 
            cursor = next_jump
        return None
    
# ---------------------------------------------------------
# 실행 함수
# ---------------------------------------------------------

def run_auto_assign(session_id):
    service = AutoAssignService(session_id)
    service.run()

def run_sync_schedule(session_id):
    """[NEW] 스케줄 동기화 실행 (이 함수가 없어서 에러가 난 것입니다)"""
    service = ScheduleSyncService(session_id)
    service.run()

def refresh_worker_totals(session):
    """
    작업자의 누적 시간(used_mh)을 갱신. 간비 제외.
    """
    workers = session.worker_set.all()
    for w in workers:
        # DB 집계 함수 사용
        total = w.assignments.exclude(work_item__work_order='간비') \
            .aggregate(Sum('allocated_mh'))['allocated_mh__sum']
        
        w.used_mh = round(total or 0.0, 2)
        w.save()
        