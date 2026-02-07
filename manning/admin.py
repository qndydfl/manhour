from django.contrib import admin
from .models import TaskMaster, WorkSession, Worker, WorkItem


# 관리자 페이지에서 표를 예쁘게 보여주는 설정 (선택사항이지만 추천!)
class TaskMasterAdmin(admin.ModelAdmin):
    list_display = (
        "gibun_code",
        "description",
        "default_mh",
        "site",
    )  # 목록에 보여줄 컬럼들
    list_filter = ("site",)


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


# 장고 관리소에 등록!
admin.site.register(TaskMaster, TaskMasterAdmin)
admin.site.register(WorkSession, WorkSessionAdmin)
admin.site.register(Worker)
admin.site.register(WorkItem)
