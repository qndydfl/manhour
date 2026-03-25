from manhour.models import AppSetting

from .models import WorkSession


def active_session_status(request):
    active_count = WorkSession.objects.filter(is_active=True).count()
    return {
        "active_count": active_count,
    }
