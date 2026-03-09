from django.contrib import admin
from .models import Manning, SessionArea, WorkSession


class WorkSessionAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "site",
        "shift_type",
        "is_active",
        "created_at",
    )
    list_filter = ("site", "is_active", "shift_type")
    search_fields = ("name",)


admin.site.register(WorkSession, WorkSessionAdmin)
admin.site.register(SessionArea)
admin.site.register(Manning)
