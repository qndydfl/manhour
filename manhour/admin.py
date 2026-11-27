from django.contrib import admin
from .models import (
    TaskMaster,
    WorkSession,
    Worker,
    WorkItem,
    BackgroundImage,
)


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
class BackgroundImageAdmin(admin.ModelAdmin):
    list_display = ("key", "image_url", "image_file", "video_file")
    search_fields = ("key",)
    exclude = ("youtube_url",)

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        if "key" in form.base_fields:
            form.base_fields["key"].help_text = (
                "홈 배경: 영상 index_background_video, 사진 index_background_image, "
                "슬라이드 index_background_image_01, _02, …, 공통 예비 배경 index_background."
            )
        return form




admin.site.register(TaskMaster, TaskMasterAdmin)
admin.site.register(WorkSession, WorkSessionAdmin)
admin.site.register(Worker)
admin.site.register(WorkItem)
admin.site.register(BackgroundImage, BackgroundImageAdmin)
