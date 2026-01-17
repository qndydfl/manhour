import math


# ---------------------------------------------------------
# 1. 시간 포맷 헬퍼 함수 (전역)
# ---------------------------------------------------------
def format_min_to_time(minutes):
    """분을 'HH:MM' 문자열로 변환 (24시 넘으면 +1 표시)"""
    if minutes is None: return ""
    try:
        minutes = int(minutes)
        h = math.floor(minutes / 60)
        m = int(minutes % 60)
        
        if h >= 24:
            h = h % 24
            return f"{h:02d}:{m:02d} (+1)"
        return f"{h:02d}:{m:02d}"
    except:
        return ""
    
def get_adjusted_min(minutes):
    """
    [핵심 정렬 로직]
    하루의 시작을 08:00로 봅니다.
    00:00 ~ 07:59 사이의 시간은 '다음날'로 간주하여 24시간(1440분)을 더합니다.
    예: 02:00(120) -> 26:00(1560) -> 그래야 20:00(1200)보다 뒤에 옴
    """
    if minutes is None: return 99999
    
    # 08:00(480분)보다 작으면 다음날 새벽으로 간주
    if minutes < 480:
        return minutes + 1440
    return minutes


# ---------------------------------------------------------
# [수정] 스케줄 계산기 (주간/야간 풀타임 적용)
# ---------------------------------------------------------
class ScheduleCalculator:
    # 1. 주간: 08:00(480) ~ 20:00(1200)
    # 2. 야간: 20:00(1200) ~ 08:00(1920, 익일)
    DEFAULT_SHIFTS = [
        {'start': 480, 'end': 1200},   
        {'start': 1200, 'end': 1920},  
    ]

    def __init__(self, floating_tasks, fixed_slots=None):
        self.tasks = floating_tasks
        
        # [핵심 수정] 고정된 시간(간비)을 받을 때, 야간 시간(02:00 등)을 26:00으로 변환해서 저장
        # 그래야 계산기가 1200~1920 사이의 장애물로 인식함
        adjusted_slots = []
        for slot in (fixed_slots or []):
            start = slot['start']
            end = slot['end']
            
            # 종료 시간이 시작 시간보다 작으면(자정 넘김), 종료 시간에 +1440
            if end < start:
                end += 1440
            
            # 시작 시간이 08:00 이전이면(새벽), 시작/종료 모두 +1440
            if start < 480:
                start += 1440
                if end < start: # 종료시간 보정 재확인
                    end += 1440
            
            # 만약 08:00~08:00 처럼 종료가 08:00인 경우 야간조 끝으로 처리
            if end < 480:
                end += 1440

            adjusted_slots.append({'start': start, 'end': end})

        # 변환된 시간대로 정렬
        self.occupied = sorted(adjusted_slots, key=lambda x: x['start'])
        
        self.results = []
        self.block_idx = 0
        self.cursor = self.DEFAULT_SHIFTS[0]['start']

    def _min_to_time(self, minutes):
        return format_min_to_time(minutes)

    def _is_overlapping(self, current_time, duration):
        end_time = current_time + duration
        for slot in self.occupied:
            # 슬롯 안에 있거나 슬롯과 겹치는 경우
            if current_time < slot['end'] and end_time > slot['start']:
                return True, slot['end']
        return False, None

    def calculate(self):
        shifts = self.DEFAULT_SHIFTS
        
        for task in self.tasks:
            try: mh_val = float(task.get('mh', 0))
            except: mh_val = 0.0
            
            mh_remain = int(mh_val * 60)
            
            while mh_remain > 0.1 and self.block_idx < len(shifts):
                current_shift = shifts[self.block_idx]
                
                if self.cursor < current_shift['start']:
                    self.cursor = current_shift['start']
                
                if self.cursor >= current_shift['end']:
                    self.block_idx += 1
                    continue

                is_hit, jump_to = self._is_overlapping(self.cursor, 1)
                if is_hit:
                    self.cursor = max(self.cursor, jump_to)
                    continue

                limit = current_shift['end']
                for slot in self.occupied:
                    if slot['start'] > self.cursor:
                        limit = min(limit, slot['start'])
                        break
                
                duration = limit - self.cursor
                
                if duration <= 0:
                    if limit >= current_shift['end']:
                        self.block_idx += 1
                    continue

                use = min(mh_remain, duration)
                start_t = self.cursor
                end_t = self.cursor + use
                
                self.results.append({
                    'wo': task.get('wo', ''),
                    'op': task.get('op', ''),
                    'desc': task.get('desc', ''),
                    'gibun': task.get('gibun', ''),
                    'mh': round(use / 60, 2),
                    'start_str': self._min_to_time(start_t),
                    'end_str': self._min_to_time(end_t),
                    'start_min': start_t,
                    'is_fixed': False
                })
                
                self.cursor += use
                mh_remain -= use
                
        return self.results
    