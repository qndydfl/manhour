import random
from django.db import transaction
from django.db.models import Sum
from .models import WorkSession, Assignment, Worker, WorkItem, GibunPriority

class AutoAssignService:
    SLOT_UNIT = 0.1  # 0.1시간 단위로 쪼개서 배정 (Water Filling)

    def __init__(self, session_id):
        self.session = WorkSession.objects.get(id=session_id)
        # 작업자 리스트를 이름순이나 ID순으로 고정하지 않고 가져옴
        self.workers = list(self.session.worker_set.all())
        
        self.items = self.session.workitem_set.all()
        self.worker_map = {w.id: w for w in self.workers}
        
        # 임시 계산용 변수 초기화
        for w in self.workers:
            w._temp_mh = 0.0

    def run(self):
        with transaction.atomic():
            # 1. 수동 배정된 시간 먼저 계산 (로드 밸런싱 기준점 잡기)
            self._load_manual_assignments()
            
            # 2. 자동 배정 항목들 분배 (우선순위 정렬 + 워터 필링)
            self._distribute_auto_items()
            
            # 3. 결과 DB 반영 (간비 제외 로직 포함)
            refresh_worker_totals(self.session)

    def _load_manual_assignments(self):
        """수동으로 고정된 작업들의 시간을 먼저 작업자에게 반영"""
        manual_items = self.items.filter(is_manual=True)
        for item in manual_items:
            assignments = item.assignments.all()
            for assign in assignments:
                if assign.worker_id in self.worker_map:
                    self.worker_map[assign.worker_id]._temp_mh += assign.allocated_mh

    def _distribute_auto_items(self):
        # 1. 자동 배정 대상 일감 가져오기
        auto_items = list(self.items.filter(is_manual=False))
        
        # 2. 기번별 우선순위 적용 (Dictionary 형태: {'HL7777': 1, 'HL8888': 2})
        priorities = {gp.gibun: gp.order for gp in GibunPriority.objects.filter(session=self.session)}
        
        # [핵심 수정 1] 정렬 로직 변경 (균등 분배의 핵심)
        # 1순위: 기번 우선순위 (오름차순: 1 -> 2 -> 3)
        # 2순위: 작업 시간 (내림차순: 큰 작업부터 배정해야 골고루 들어감) [-x.work_mh]
        # 3순위: ID (등록순)
        auto_items.sort(key=lambda x: (
            priorities.get(x.gibun_input, 999), 
            -x.work_mh, 
            x.id
        ))

        # 3. 기존 자동 배정 기록 삭제 (초기화)
        auto_item_ids = [item.id for item in auto_items]
        Assignment.objects.filter(work_item_id__in=auto_item_ids).delete()

        # 4. 워터 필링 (Water Filling) 시작
        for item in auto_items:
            mh_needed = item.work_mh
            if mh_needed <= 0:
                continue

            # 0.1시간 단위로 조각내어 슬롯 수 계산
            # 예: 1.5시간 -> 15개 슬롯
            total_slots = int(round(mh_needed / self.SLOT_UNIT))
            
            # 현재 아이템에 대해 각 작업자가 얼만큼 가져갈지 임시 저장
            current_task_allocation = {w.id: 0.0 for w in self.workers}

            for _ in range(total_slots):
                # 근무 한도(limit_mh)를 넘지 않은 사람만 후보로 선정
                candidates = [w for w in self.workers if w._temp_mh < w.limit_mh]
                
                # 모든 작업자가 한도를 넘었다면? 전원 후보 (Overload 허용)
                if not candidates:
                    candidates = self.workers

                # 현재 가장 일이 적은 사람(Min Load) 찾기
                min_load = min(c._temp_mh for c in candidates)
                
                # min_load와 차이가 미세한(0.001 이내) 동점자 그룹 찾기
                min_group = [c for c in candidates if c._temp_mh <= min_load + 0.001]
                
                # [핵심 수정 2] 동점자 중 '랜덤' 선택
                # 기존에는 min_group[0]으로 항상 앞사람만 선택되어 쏠림 현상 발생
                target_worker = random.choice(min_group)

                # 선택된 사람에게 0.1시간 추가
                target_worker._temp_mh += self.SLOT_UNIT
                current_task_allocation[target_worker.id] += self.SLOT_UNIT

            # 계산된 할당량을 실제 Assignment 객체로 생성 (한 아이템이 여러 명에게 쪼개질 수 있음)
            for w in self.workers:
                amount = current_task_allocation[w.id]
                if amount > 0.001:
                    Assignment.objects.create(
                        work_item=item,
                        worker=w,
                        allocated_mh=round(amount, 2)
                    )

# ---------------------------------------------------------
# 실행 함수
# ---------------------------------------------------------

def run_auto_assign(session_id):
    service = AutoAssignService(session_id)
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