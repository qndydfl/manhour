from django.db import transaction
from django.db.models import Sum
from .models import WorkSession, Assignment, Worker

class AutoAssignService:
    SLOT_UNIT = 0.1  # 0.1시간 단위

    def __init__(self, session_id):
        self.session = WorkSession.objects.get(id=session_id)
        self.workers = list(self.session.worker_set.all())
        self.items = self.session.workitem_set.all()
        
        self.worker_map = {w.id: w for w in self.workers}
        
        for w in self.workers:
            w._temp_mh = 0.0

    def run(self):
        with transaction.atomic():
            self._load_manual_assignments()
            self._distribute_auto_items()
            self._update_db_totals()

    def _load_manual_assignments(self):
        manual_items = self.items.filter(is_manual=True)
        for item in manual_items:
            # 여기도 item.assignments 로 접근 (models.py 설정에 따름)
            assignments = item.assignments.all()
            for assign in assignments:
                if assign.worker_id in self.worker_map:
                    self.worker_map[assign.worker_id]._temp_mh += assign.allocated_mh

    def _distribute_auto_items(self):
        auto_items = self.items.filter(is_manual=False)
        Assignment.objects.filter(work_item__in=auto_items).delete()

        for item in auto_items:
            mh_needed = item.work_mh
            if mh_needed <= 0:
                continue

            total_slots = int(round(mh_needed / self.SLOT_UNIT))
            current_task_allocation = {w.id: 0.0 for w in self.workers}

            for _ in range(total_slots):
                candidates = [w for w in self.workers if w._temp_mh < w.limit_mh]
                if not candidates:
                    candidates = self.workers

                min_load = min(c._temp_mh for c in candidates)
                min_group = [c for c in candidates if c._temp_mh <= min_load + 0.001]
                target_worker = min_group[0]

                target_worker._temp_mh += self.SLOT_UNIT
                current_task_allocation[target_worker.id] += self.SLOT_UNIT

            for w in self.workers:
                amount = current_task_allocation[w.id]
                if amount > 0.001:
                    Assignment.objects.create(
                        work_item=item,
                        worker=w,
                        allocated_mh=round(amount, 2)
                    )

    def _update_db_totals(self):
        for w in self.workers:
            w.used_mh = round(w._temp_mh, 2)
            w.save()

def run_auto_assign(session_id):
    service = AutoAssignService(session_id)
    service.run()

def refresh_worker_totals(session):
    """
    작업자의 누적 시간(used_mh)을 갱신하는 함수.
    [수정] '간비'를 제외하고 순수 '직비' 시간만 합산하여 저장합니다.
    """
    workers = session.worker_set.all()
    for w in workers:
        # exclude(work_item__work_order='간비') 조건을 추가하여 간비를 합계에서 뺍니다.
        total = w.assignments.exclude(work_item__work_order='간비') \
            .aggregate(Sum('allocated_mh'))['allocated_mh__sum']
        
        w.used_mh = round(total or 0.0, 2)
        w.save()