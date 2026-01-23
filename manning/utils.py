import math

# ---------------------------------------------------------
# 1. 시간 포맷/변환 헬퍼 함수
# ---------------------------------------------------------
def format_min_to_time(minutes):
    """분을 'HH:MM' 문자열로 변환 (24시 넘으면 00:00, 01:00... 으로 순환)"""
    if minutes is None: return ""
    try:
        minutes = int(minutes)
        
        # 정확히 24:00인 경우
        if minutes == 1440:
            return "24:00"
            
        # 24시(1440분)으로 나눈 나머지 사용 -> 25:00은 01:00이 됨
        normalized_min = minutes % 1440
        
        h = math.floor(normalized_min / 60)
        m = int(normalized_min % 60)
        
        return f"{h:02d}:{m:02d}"
    except:
        return ""

MINUTES_PER_DAY = 1440
SHIFT_START_HOUR_DAY = 8
SHIFT_START_MIN_DAY = SHIFT_START_HOUR_DAY * 60  # 480

def get_adjusted_min(minutes):
    if minutes is None: return 99999
    
    # 08:00 이전이면 다음날로 간주
    if minutes < SHIFT_START_MIN_DAY:
        return minutes + MINUTES_PER_DAY
    return minutes

# ---------------------------------------------------------
# 2. 스케줄 계산기 (주간/야간 Shift 적용)
# ---------------------------------------------------------
class ScheduleCalculator:
    """
    고정된 시간(간비)을 피해서, 유동적인 작업(WO)을 빈칸에 채워넣는 클래스
    """
    def __init__(self, floating_tasks, fixed_slots=None, shift_type='DAY'):
        self.tasks = floating_tasks
        self.shift_type = shift_type # DAY 또는 NIGHT
        
        # [핵심] 근무 타입에 따라 시작 시간과 범위 설정
        if self.shift_type == 'NIGHT':
            # 야간: 20:00(1200) ~ 08:00(1920) -> 12시간
            self.shifts = [{'start': 1200, 'end': 1920}]
            self.cursor = 1200 # 시작 커서: 20:00
        else:
            # 주간: 08:00(480) ~ 20:00(1200) -> 12시간
            # 기본값 또는 DAY
            self.shifts = [{'start': 480, 'end': 1200}]
            self.cursor = 480  # 시작 커서: 08:00

        # 고정 시간(간비) 보정 (야간 시간을 26:00 등으로 변환)
        adjusted_slots = []
        for slot in (fixed_slots or []):
            s = get_adjusted_min(slot['start'])
            e = get_adjusted_min(slot['end'])
            
            # 종료 시간이 시작 시간보다 작아지는 경우 보정
            if e < s: e += 1440
            
            adjusted_slots.append({'start': s, 'end': e})

        # 시간순 정렬
        self.occupied = sorted(adjusted_slots, key=lambda x: x['start'])
        self.results = []
        self.block_idx = 0

    def _min_to_time(self, minutes):
        return format_min_to_time(minutes)

    def _is_overlapping(self, current_time, duration):
        end_time = current_time + duration
        for slot in self.occupied:
            # 슬롯 안에 있거나 슬롯과 겹치는 경우
            if current_time < slot['end'] and end_time > slot['start']:
                return True, slot['end'] # 겹침! 겹치는 슬롯의 끝나는 시간을 반환
        return False, None

    def calculate(self):
        # 현재 설정된 시프트 범위 안에서만 배정
        if not self.shifts: return []
        
        current_shift = self.shifts[0] 
        shift_end = current_shift['end']
        
        for task in self.tasks:
            try: mh = float(task.get('mh', 0))
            except: mh = 0.0
            
            remain = int(mh * 60)
            
            # 남은 시간이 있고 근무 시간이 안 끝났으면 계속
            while remain > 0.1:
                # 1. 근무 종료 체크
                if self.cursor >= shift_end:
                    break 

                # 2. 간비 충돌 체크 (점프)
                is_hit, jump_to = self._is_overlapping(self.cursor, 1)
                if is_hit:
                    self.cursor = max(self.cursor, jump_to)
                    continue

                # 3. 가용 시간 계산
                limit = shift_end
                for slot in self.occupied:
                    # 현재 커서보다 뒤에 있는 가장 빠른 간비 시작 시간 찾기
                    if slot['start'] > self.cursor:
                        limit = min(limit, slot['start'])
                        break
                
                duration = limit - self.cursor
                
                # 가용 시간이 없으면 점프
                if duration <= 0:
                    self.cursor = limit
                    continue

                # 4. 할당 (남은 작업량과 가용 시간 중 작은 것)
                use = min(remain, duration)
                start_t = self.cursor
                end_t = self.cursor + use
                
                self.results.append({
                    'wo': task.get('wo', ''),
                    'op': task.get('op', ''),
                    'desc': task.get('desc', ''),
                    'gibun': task.get('gibun', ''),
                    'mh': round(use/60, 2),
                    'start_str': self._min_to_time(start_t),
                    'end_str': self._min_to_time(end_t),
                    'start_min': start_t,
                    'end_min': end_t, # [중요] 뷰에서 자정 분리할 때 필요함
                    'is_fixed': False
                })
                
                # 상태 업데이트
                self.cursor += use
                remain -= use
                
        return self.results