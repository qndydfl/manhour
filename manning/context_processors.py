from django.conf import settings

from .models import WorkSession
from manhour.workplaces import get_workplace_choices


def active_session_status(request):
    active_count = WorkSession.objects.filter(is_active=True).count()
    return {
        "active_count": active_count,
        "navbar_workplace_options": get_workplace_choices(),
        "site_revision": settings.SITE_REVISION,
        "site_last_updated": settings.SITE_LAST_UPDATED,
    }
