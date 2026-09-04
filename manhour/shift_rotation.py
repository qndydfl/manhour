from __future__ import annotations

from datetime import date, datetime, time, timedelta

from django.utils import timezone

from .models import Workplace, WorkSession


ROTATION_PATTERNS = {
    # 매일 한 조는 주간, 한 조는 야간, 한 조는 야퇴가 되도록 구성된 15일 주기입니다.
    Workplace.ROTATION_DAY_FIRST: (
        [WorkSession.SCHEDULE_DAY] * 5
        + [
            WorkSession.SCHEDULE_NIGHT,
            WorkSession.SCHEDULE_POST_NIGHT,
            WorkSession.SCHEDULE_NIGHT,
            WorkSession.SCHEDULE_POST_NIGHT,
            WorkSession.SCHEDULE_NIGHT,
        ]
        + [
            WorkSession.SCHEDULE_POST_NIGHT,
            WorkSession.SCHEDULE_NIGHT,
            WorkSession.SCHEDULE_POST_NIGHT,
            WorkSession.SCHEDULE_NIGHT,
            WorkSession.SCHEDULE_POST_NIGHT,
        ]
    ),
    Workplace.ROTATION_NIGHT_FIRST: (
        [
            WorkSession.SCHEDULE_NIGHT,
            WorkSession.SCHEDULE_POST_NIGHT,
            WorkSession.SCHEDULE_NIGHT,
            WorkSession.SCHEDULE_POST_NIGHT,
            WorkSession.SCHEDULE_NIGHT,
        ]
        + [
            WorkSession.SCHEDULE_POST_NIGHT,
            WorkSession.SCHEDULE_NIGHT,
            WorkSession.SCHEDULE_POST_NIGHT,
            WorkSession.SCHEDULE_NIGHT,
            WorkSession.SCHEDULE_POST_NIGHT,
        ]
        + [WorkSession.SCHEDULE_DAY] * 5
    ),
    Workplace.ROTATION_OFF_FIRST: (
        [
            WorkSession.SCHEDULE_POST_NIGHT,
            WorkSession.SCHEDULE_NIGHT,
            WorkSession.SCHEDULE_POST_NIGHT,
            WorkSession.SCHEDULE_NIGHT,
            WorkSession.SCHEDULE_POST_NIGHT,
        ]
        + [WorkSession.SCHEDULE_DAY] * 5
        + [
            WorkSession.SCHEDULE_NIGHT,
            WorkSession.SCHEDULE_POST_NIGHT,
            WorkSession.SCHEDULE_NIGHT,
            WorkSession.SCHEDULE_POST_NIGHT,
            WorkSession.SCHEDULE_NIGHT,
        ]
    ),
}


def get_rotation_status(workplace: Workplace | None, target_date: date) -> str:
    if not workplace or not workplace.rotation_anchor_date:
        return ""
    pattern = ROTATION_PATTERNS.get(workplace.rotation_pattern)
    if not pattern:
        return ""
    offset = (target_date - workplace.rotation_anchor_date).days % len(pattern)
    return pattern[offset]


def get_rotation_status_label(status: str) -> str:
    return dict(WorkSession.SCHEDULE_STATUS_CHOICES).get(status, "미설정")


def get_operational_work_date(current_time: datetime | None = None) -> date:
    """오전 08:00 전은 전날 시작한 야간 근무일로 처리합니다."""
    local_now = (
        timezone.localtime(current_time)
        if current_time is not None
        else timezone.localtime()
    )
    work_date = local_now.date()
    if local_now.time() < time(8, 0):
        work_date -= timedelta(days=1)
    return work_date
