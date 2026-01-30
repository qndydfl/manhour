from django.contrib import admin
from django.core.exceptions import ValidationError
from .models import TaskMaster, WorkSession, Worker, WorkItem, YoutubeVideo
from django.utils.html import format_html


# 관리자 페이지에서 표를 예쁘게 보여주는 설정 (선택사항이지만 추천!)
class TaskMasterAdmin(admin.ModelAdmin):
    list_display = ('gibun_code', 'description', 'default_mh') # 목록에 보여줄 컬럼들

# 장고 관리소에 등록!
admin.site.register(TaskMaster, TaskMasterAdmin)
admin.site.register(WorkSession)
admin.site.register(Worker)
admin.site.register(WorkItem)


@admin.register(YoutubeVideo)
class YoutubeVideoAdmin(admin.ModelAdmin):
    readonly_fields = ("preview",)

    def preview(self, obj):
        if not obj.video_id:
            return "-"
        return format_html(
            '<iframe width="560" height="315" '
            'src="https://www.youtube.com/embed/{}" '
            'allow="encrypted-media" allowfullscreen></iframe>',
            obj.video_id
        )
    
    def clean(self):
        vid = self.extract_video_id(self.youtube_url)
        if not vid:
            raise ValidationError({
                "youtube_url": "유효한 YouTube 영상 주소가 아닙니다."
            })

    preview.short_description = "미리보기"