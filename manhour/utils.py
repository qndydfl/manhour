import math

MINUTES_PER_DAY = 1440

SHIFT_START_DAY = 8 * 60      # 08:00 = 480
SHIFT_END_DAY   = 20 * 60     # 20:00 = 1200

SHIFT_START_NIGHT = 20 * 60   # 20:00 = 1200
SHIFT_END_NIGHT   = 32 * 60   # 08:00 next day = 1920


# ---------------------------------------------------------
# 1. 시간 포맷/변환 헬퍼 함수
# ---------------------------------------------------------
def format_min_to_time(minutes):
    """분을 'HH:MM' 문자열로 변환 (24시 넘으면 00:00, 01:00... 으로 순환)"""
    if minutes is None:
        return ""
    try:
        minutes = int(minutes)

        # 정확히 24:00
        if minutes == 1440:
            return "24:00"

        normalized_min = minutes % 1440
        h = normalized_min // 60
        m = normalized_min % 60
        return f"{h:02d}:{m:02d}"
    except:
        return ""


def get_adjusted_min(minutes, shift_type='DAY'):
    """
    정렬/비교용 시간 보정.
    - DAY: 08:00 이전(0~479)은 다음날(+1440)로 보정
    - NIGHT: 20:00 이전(0~1199)은 다음날(+1440)로 보정
      (야간 근무는 20:00~익일08:00 범위를 1200~1920으로 맞추기 위함)
    """
    if minutes is None:
        return 99999

    try:
        minutes = int(minutes)
    except:
        return 99999

    if shift_type == 'NIGHT':
        # 20:00(1200) 이전이면 다음날로 보정 (00:30 -> 1470, 19:00 -> 2580)
        if minutes < SHIFT_START_NIGHT:
            return minutes + MINUTES_PER_DAY
        return minutes
    else:
        # DAY: 08:00 이전이면 다음날로 보정 (00:30 -> 1470)
        if minutes < SHIFT_START_DAY:
            return minutes + MINUTES_PER_DAY
        return minutes


# ---------------------------------------------------------
# 2. 스케줄 계산기 (주간/야간 Shift 적용)
# ---------------------------------------------------------
class ScheduleCalculator:
    """
    고정된 시간(간비/수동고정)을 피해서,
    유동적인 작업(WO)을 빈칸에 채워넣는 클래스
    """
    def __init__(self, floating_tasks, fixed_slots=None, shift_type='DAY'):
        self.tasks = floating_tasks or []
        self.shift_type = shift_type or 'DAY'

        if self.shift_type == 'NIGHT':
            self.shift_start = SHIFT_START_NIGHT     # 1200
            self.shift_end   = SHIFT_END_NIGHT       # 1920
        else:
            self.shift_start = SHIFT_START_DAY       # 480
            self.shift_end   = SHIFT_END_DAY         # 1200

        self.cursor = self.shift_start

        # 고정 시간(간비 등) 보정 + 정리
        self.occupied = self._normalize_fixed_slots(fixed_slots or [])
        self.results = []

    def _normalize_fixed_slots(self, fixed_slots):
        """
        3) 수정: fixed slot들을 shift 기준으로 보정 + 범위 밖 제거/클램프.
        """
        normalized = []
        for slot in fixed_slots:
            s_raw = slot.get('start')
            e_raw = slot.get('end')
            if s_raw is None or e_raw is None:
                continue

            s = get_adjusted_min(s_raw, self.shift_type)
            e = get_adjusted_min(e_raw, self.shift_type)
            if e < s:
                e += MINUTES_PER_DAY

            # shift 범위로 클램프 (아예 밖이면 skip)
            # 예: NIGHT(1200~1920)인데 fixed가 1000~1100 이면 의미 없음 -> skip
            if e <= self.shift_start or s >= self.shift_end:
                continue

            s = max(s, self.shift_start)
            e = min(e, self.shift_end)

            if e > s:
                normalized.append({'start': s, 'end': e})

        normalized.sort(key=lambda x: x['start'])

        # 겹치는 슬롯 병합(안전장치)
        merged = []
        for slot in normalized:
            if not merged:
                merged.append(slot)
                continue
            last = merged[-1]
            if slot['start'] <= last['end']:
                last['end'] = max(last['end'], slot['end'])
            else:
                merged.append(slot)

        return merged

    def _min_to_time(self, minutes):
        return format_min_to_time(minutes)

    def _jump_if_inside_occupied(self):
        """
        4) 수정: 1분 overlap 체크 대신,
        '현재 커서가 슬롯 내부면 슬롯 끝으로 점프'만 수행.
        """
        for slot in self.occupied:
            if self.cursor < slot['end'] and self.cursor >= slot['start']:
                self.cursor = slot['end']
                return True
        return False

    def _next_block_start(self):
        """
        현재 커서 이후 가장 가까운 occupied 시작 시각 반환.
        없으면 shift_end.
        """
        for slot in self.occupied:
            if slot['start'] > self.cursor:
                return slot['start']
        return self.shift_end

    def calculate(self):
        if not self.tasks:
            return []

        for task in self.tasks:
            try:
                mh = float(task.get('mh', 0) or 0)
            except:
                mh = 0.0

            remain = int(round(mh * 60))
            if remain <= 0:
                continue

            while remain > 0 and self.cursor < self.shift_end:
                # 커서가 고정 슬롯 안이면 끝으로 점프
                if self._jump_if_inside_occupied():
                    continue

                next_block = self._next_block_start()
                free_until = min(next_block, self.shift_end)
                free_duration = free_until - self.cursor

                if free_duration <= 0:
                    self.cursor = free_until
                    continue

                use = min(remain, free_duration)
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
                    'end_min': end_t,
                    'is_fixed': False,
                })

                self.cursor = end_t
                remain -= use

        return self.results
