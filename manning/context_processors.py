from manhour.models import AppSetting

from .models import WorkSession


def active_session_status(request):
    active_count = WorkSession.objects.filter(is_active=True).count()
    show_settings_menu_value = (
        AppSetting.objects.filter(key="show_settings_menu")
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
    return {
        "active_count": active_count,
        "show_settings_menu": show_settings_menu,
    }
