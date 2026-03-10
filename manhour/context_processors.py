# 모든 HTML에서 “가동 중/대기 중” 배지가 항상 보이도록
# navbar_base.html에서도 조건을 단순화했어요.

from .models import AppSetting, WorkSession

WORKPLACE_SESSION_KEY = "workplace"
WORKPLACE_LABEL_SESSION_KEY = "workplace_label"


def _normalize_workplace(workplace):
    valid = {choice[0] for choice in WorkSession.SITE_CHOICES}
    if workplace in valid:
        return workplace
    return ""


def _set_workplace_in_session(request, workplace):
    normalized = _normalize_workplace(workplace)
    if not normalized:
        request.session.pop(WORKPLACE_SESSION_KEY, None)
        request.session.pop(WORKPLACE_LABEL_SESSION_KEY, None)
        return ""
    request.session[WORKPLACE_SESSION_KEY] = normalized
    request.session[WORKPLACE_LABEL_SESSION_KEY] = dict(WorkSession.SITE_CHOICES).get(
        normalized, normalized
    )
    return normalized


def _get_current_workplace(request):
    current = request.session.get(WORKPLACE_SESSION_KEY)
    normalized = _normalize_workplace(current)
    if not normalized:
        return ""
    return _set_workplace_in_session(request, normalized)


def active_session_status(request):
    workplace = _get_current_workplace(request)
    if not workplace:
        active_count = 0
    else:
        active_count = WorkSession.objects.filter(
            is_active=True,
            site=workplace,
        ).count()
    show_settings_menu_value = (
        AppSetting.objects.filter(key="show_settings_menu", site="")
        .values_list("int_value", flat=True)
        .first()
    )
    if show_settings_menu_value is None:
        show_settings_menu = True
    else:
        try:
            show_settings_menu = bool(int(show_settings_menu_value))
        except (TypeError, ValueError):
            show_settings_menu = True
    sidebar_value = (
        AppSetting.objects.filter(key="sidebar_position", site=workplace)
        .values_list("int_value", flat=True)
        .first()
    )
    navbar_value = (
        AppSetting.objects.filter(key="navbar_toggle_position", site=workplace)
        .values_list("int_value", flat=True)
        .first()
    )
    return {
        "active_count": active_count,
        "show_settings_menu": show_settings_menu,
        "sidebar_position": "right" if sidebar_value == 1 else "left",
        "navbar_toggle_position": "right" if navbar_value == 1 else "left",
    }
