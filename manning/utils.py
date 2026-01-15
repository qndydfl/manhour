import math

class ScheduleCalculator:
    """
    작업 목록을 받아 빈 시간을 찾아 채워넣는 계산기
    """
    DEFAULT_SHIFTS = [
        {'start': 480, 'end': 720},   # 08:00 ~ 12:00
        {'start': 780, 'end': 1020},  # 13:00 ~ 17:00
        {'start': 1050, 'end': 1290}, # 17:30 ~ 21:30
    ]

    def __init__(self, assignments, occupied_slots=None):
        """
        :param assignments: 배치할 유동적 작업 목록
        :param occupied_slots: [{'start': 540, 'end': 600}, ...] 이미 자리가 찬 시간대(간비 등)
        """
        self.assignments = assignments
        # 이미 배정된 시간들을 시작 시간 순서로 정렬
        self.occupied_slots = sorted(occupied_slots or [], key=lambda x: x['start'])
        self.schedule_events = []
        self.block_idx = 0
        self.cursor = self.DEFAULT_SHIFTS[0]['start']

    def _min_to_time(self, minutes):
        h = math.floor(minutes / 60)
        m = int(minutes % 60)
        return f"{h:02d}:{m:02d}"

    def _is_overlapping(self, current_time, duration):
        """현재 시간부터 duration만큼 작업할 때, 고정된 일정과 겹치는지 확인"""
        end_time = current_time + duration
        for slot in self.occupied_slots:
            # 겹치는 조건: (일정 시작 < 슬롯 끝) AND (일정 끝 > 슬롯 시작)
            if current_time < slot['end'] and end_time > slot['start']:
                return True, slot['end'] # 겹침! 그리고 겹치는 슬롯의 끝나는 시간을 반환
        return False, None

    def calculate(self):
        shifts = self.DEFAULT_SHIFTS
        
        for task in self.assignments:
            remain_min = int(float(task['mh']) * 60)
            
            # [루프] 작업 시간이 남았고, 아직 퇴근 시간이 안 되었다면 계속 진행
            while remain_min > 0 and self.block_idx < len(shifts):
                block = shifts[self.block_idx] # 현재 근무 타임 (예: 오전)

                # 1. 커서 위치 보정 (블록 범위 밖이면 안으로 이동)
                if self.cursor < block['start']:
                    self.cursor = block['start']
                
                # 2. 커서가 현재 블록을 넘어갔으면 다음 블록으로
                if self.cursor >= block['end']:
                    self.block_idx += 1
                    continue

                # 3. [핵심 로직] 현재 커서가 '고정된 일정(간비)'과 겹치는지 확인
                # 현재 위치에 1분이라도 작업을 넣을 수 있는지 체크한다고 가정
                is_hit, jump_to = self._is_overlapping(self.cursor, 1) 
                if is_hit:
                    # 겹친다면, 그 일정의 끝나는 시간으로 점프!
                    self.cursor = max(self.cursor, jump_to)
                    continue

                # 4. 가용 시간 계산 (다음 고정 일정 전까지, 또는 블록 끝까지)
                limit_time = block['end']
                # 현재 커서 이후에 오는 가장 빠른 고정 일정 시작 시간을 찾음
                for slot in self.occupied_slots:
                    if slot['start'] > self.cursor:
                        limit_time = min(limit_time, slot['start'])
                        break
                
                available = limit_time - self.cursor
                
                # 5. 시간 배정 (가용 시간과 남은 작업 시간 중 작은 쪽 선택)
                if available <= 0:
                    # 가용 공간이 없으면(바로 뒤에 간비가 붙어있으면) 루프 다시 돌면서 점프 처리
                    continue

                use = min(remain_min, available)
                
                start_t = self.cursor
                end_t = self.cursor + use
                
                self.schedule_events.append({
                    'wo': task['wo'],
                    'op': task['op'],
                    'desc': task['desc'],
                    'start_str': self._min_to_time(start_t),
                    'end_str': self._min_to_time(end_t),
                    'start_min': start_t,
                    'duration': round(use / 60, 2)
                })
                
                # 상태 업데이트
                self.cursor += use
                remain_min -= use

        return self.schedule_events
    
    