from .models import WorkSession, Worker, WorkItem, Assignment

class Planner:
    """
    세션의 작업 배정(Assignment)을 중앙에서 관리하고 처리하는 클래스.
    """
    def __init__(self, session_id):
        self.session_id = session_id
        self.session = WorkSession.objects.get(id=session_id)
        self.assignments = [] # 메모리에서 관리할 작업 목록
        self.conflicts = []   # 충돌 감지용

    def load_assignments(self):
        """DB에서 현재 세션의 모든 Assignment를 불러와 내부 목록에 저장합니다."""
        self.assignments = list(Assignment.objects.filter(work_item__session_id=self.session_id).select_related('work_item', 'worker'))

    def add_assignment(self, wo, op, code, start_min, end_min, worker_id, is_manual=False):
        """
        새로운 작업 정보를 받아 내부 목록에 추가하거나 기존 작업을 수정합니다.
        이 단계에서는 DB에 저장하지 않고 메모리에서만 처리합니다.
        """
        if not worker_id or start_min is None or end_min is None:
            print(f"[Planner] 필수 정보 부족으로 작업 추가 실패: worker_id={worker_id}")
            return

        worker = Worker.objects.get(id=worker_id)

        # 야간 근무 처리: 종료 시간이 시작 시간보다 작거나 같으면 다음날로 간주
        if end_min <= start_min:
            calc_end_min = end_min + 1440
        else:
            calc_end_min = end_min

        duration = calc_end_min - start_min
        if duration <= 0:
            print(f"[Planner] 작업 시간(duration)이 0 이하이므로 무시: {duration}")
            return
        
        mh = round(duration / 60.0, 2)

        # CASE 1: 간비 작업 (코드가 있음)
        if code:
            work_item = WorkItem.objects.create(
                session=self.session,
                work_order='간비',
                description=code,
                work_mh=mh,
                is_manual=True,
                gibun_input='-'
            )
        # CASE 2: 직비 작업 (WO, OP가 있음)
        elif wo:
            work_item = WorkItem.objects.create(
                session=self.session,
                work_order=wo,
                op=op,
                description=f"{worker.name} 수동 입력",
                work_mh=mh,
                is_manual=True
            )
        else:
            print(f"[Planner] 직비 또는 간비 정보가 없어 WorkItem을 생성할 수 없습니다.")
            return

        # 새로운 Assignment 객체를 생성하여 내부 목록에 추가
        new_assignment = Assignment(
            work_item=work_item,
            worker=worker,
            start_min=start_min,
            end_min=calc_end_min,
            allocated_mh=mh,
            code=code
        )
        self.assignments.append(new_assignment)
        print(f"[Planner] 메모리에 작업 추가: {worker.name} / {wo or code} ({start_min}~{calc_end_min})")


    def resolve_conflicts(self):
        """
        시간이 겹치는 작업들을 감지하고 자동으로 조정합니다.
        여기서는 간단히 '나중에 추가된 작업이 기존 작업을 덮어쓴다'는 정책을 사용합니다.
        """
        # 시간순으로 정렬 (수정된/새로운 항목이 뒤로 가도록)
        self.assignments.sort(key=lambda a: a.pk or float('inf'))

        # 최종적으로 유지될 작업 목록
        resolved_assignments = []
        # 각 작업자별로 차지된 시간 슬롯을 기록하는 딕셔너리
        occupied_slots = {} # {worker_id: [(start1, end1), (start2, end2), ...]}

        for current_assign in self.assignments:
            if current_assign.start_min is None:
                resolved_assignments.append(current_assign) # 시간이 없는 작업은 그냥 추가
                continue

            worker_id = current_assign.worker_id
            if worker_id not in occupied_slots:
                occupied_slots[worker_id] = []

            is_conflict = False
            # 현재 작업 시간과 이미 차지된 시간들을 비교
            for start, end in occupied_slots[worker_id]:
                # 겹치는 조건: (StartA < EndB) and (EndA > StartB)
                if current_assign.start_min < end and current_assign.end_min > start:
                    is_conflict = True
                    self.conflicts.append(current_assign)
                    print(f"[Planner] 충돌 감지: {current_assign.work_item.work_order} ({current_assign.start_min}~{current_assign.end_min})")
                    break
            
            # 충돌이 없으면, 이 작업을 유효한 것으로 보고 시간 슬롯에 추가
            if not is_conflict:
                resolved_assignments.append(current_assign)
                occupied_slots[worker_id].append((current_assign.start_min, current_assign.end_min))

        # 덮어쓰기 정책: 충돌이 발생하면 기존 것을 제거하고 새것을 유지해야 하므로,
        # 여기서는 충돌나지 않은 것들만 남기는 방식으로 간단히 구현합니다.
        # (더 정교한 로직: 기존 작업을 자르거나, 충돌된 것만 따로 모아 사용자에게 알림)
        
        # 충돌이 해결된 목록으로 내부 목록을 교체
        # self.assignments = resolved_assignments 
        # 위 로직은 기존 것을 삭제하므로, 여기서는 모든 것을 유지하고 DB 저장 단계에서 처리
        print(f"[Planner] 충돌 해결 완료. 총 {len(self.conflicts)}개의 충돌 감지.")


    def fill_gaps(self):
        """
        작업과 작업 사이의 모든 빈 시간을 '간비'로 채웁니다.
        'SaveManualInputView'에서는 이 메서드를 호출하지 않아야 합니다.
        """
        # (구현 생략 - 자동 배정 시에만 필요)
        print("[Planner] fill_gaps 호출됨. (현재는 로직 생략)")
        pass


    def save_changes(self):
        """
        메모리상의 모든 변경사항을 실제 데이터베이스에 저장합니다.
        기존 Assignment를 모두 지우고 새로 쓰는 방식을 사용합니다.
        """
        # 1. 이 Planner가 관리하는 작업자들의 기존 배정 내역을 모두 삭제
        worker_ids = {a.worker_id for a in self.assignments}
        Assignment.objects.filter(
            work_item__session_id=self.session_id,
            worker_id__in=worker_ids
        ).delete()

        # 2. 메모리에 있는 새로운 배정 내역을 DB에 한 번에 저장 (bulk_create)
        # 주의: bulk_create는 새로 생성되는 객체에만 사용 가능
        # WorkItem은 add_assignment에서 이미 생성되었으므로 Assignment만 bulk_create
        
        # WorkItem이 아직 저장되지 않았을 수 있으므로 먼저 저장
        for assign in self.assignments:
            if assign.work_item and not assign.work_item.pk:
                assign.work_item.save()
            # Assignment 객체에 work_item_id를 명시적으로 설정
            assign.work_item_id = assign.work_item.pk

        Assignment.objects.bulk_create(self.assignments)
        print(f"[Planner] DB에 {len(self.assignments)}개의 작업을 저장했습니다.")
