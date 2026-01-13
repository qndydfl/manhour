from .models import WorkSession, Assignment
from django.db.models import Sum


# 0.1시간 단위로 쪼개서 배분 (변경 가능)
SLOT_UNIT = 0.1 

SLOT_UNIT = 0.1 

def refresh_worker_totals(session):
    workers = session.worker_set.all()
    for w in workers:
        total = w.assignments.aggregate(Sum('allocated_mh'))['allocated_mh__sum']
        w.used_mh = round(total or 0.0, 2)
        w.save()

def run_auto_assign(session_id):
    session = WorkSession.objects.get(id=session_id)
    items = session.workitem_set.all()
    
    # 1. 작업자 리스트 가져오기
    workers = list(session.worker_set.all())

    # [핵심] 작업자 ID로 원본 객체를 찾을 수 있는 '지도(Map)'를 만듭니다.
    # 예: { 1번: 김철수객체, 2번: 이영희객체 }
    worker_map = {} 
    
    for w in workers:
        w.used_mh = 0.0
        w._temp_mh = 0.0  # 원본에 이름표 붙이기
        worker_map[w.id] = w # 지도에 등록!

    # 2. [수동 고정]된 시간 계산
    manual_items = items.filter(is_manual=True)
    for item in manual_items:
        assignments = item.assignments.all()
        for assign in assignments:
            # [수정된 부분] assign.worker를 바로 쓰지 않고, ID로 원본을 찾습니다!
            worker_id = assign.worker_id
            
            # 지도에 있는 사람이라면 (혹시 모를 에러 방지)
            if worker_id in worker_map:
                original_worker = worker_map[worker_id]
                original_worker._temp_mh += assign.allocated_mh
    
    # 3. 자동 배정 시작 (수동 아닌 것)
    auto_items = items.filter(is_manual=False)
    Assignment.objects.filter(work_item__in=auto_items).delete()

    for item in auto_items:
        mh_needed = item.work_mh
        if mh_needed <= 0:
            continue

        total_slots = int(round(mh_needed / SLOT_UNIT))
        
        # 누구한테 줄지 기록할 임시 장부 (DB ID 기준)
        allocation_ids = {w.id: 0.0 for w in workers}

        # 카드 돌리기 (슬롯 배분)
        for _ in range(total_slots):
            candidates = [w for w in workers if w._temp_mh < w.limit_mh]
            
            if not candidates:
                candidates = workers

            # 가장 한가한 사람 찾기 (원본 객체들의 _temp_mh 비교)
            min_load = min(c._temp_mh for c in candidates)
            min_group = [c for c in candidates if c._temp_mh <= min_load + 0.001]
            
            target_worker = min_group[0]

            # 원본 객체에 시간 더하기
            target_worker._temp_mh += SLOT_UNIT
            allocation_ids[target_worker.id] += SLOT_UNIT

        # 최종 저장
        for worker in workers:
            amount = allocation_ids[worker.id]
            
            if amount > 0.001:
                Assignment.objects.create(
                    work_item=item,
                    worker=worker,
                    allocated_mh=round(amount, 2)
                )

    # 4. 실제 DB 업데이트
    for w in workers:
        w.used_mh = round(w._temp_mh, 2)
        w.save()
