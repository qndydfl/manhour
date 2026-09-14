from django.contrib import admin
from django.utils.html import format_html

from .models import CBAircraftModel, CBTemplate


@admin.register(CBAircraftModel)
class CBAircraftModelAdmin(admin.ModelAdmin):
    list_display = (
        "code",
        "image_preview",
    )

    search_fields = ("code",)

    readonly_fields = ("image_preview",)

    fields = (
        "code",
        "image",
        "image_preview",
    )

    @admin.display(description="이미지")
    def image_preview(
        self,
        obj,
    ):
        if not obj.image:
            return "등록된 이미지 없음"

        return format_html(
            '<img src="{}" '
            'style="'
            "width:220px;"
            "height:120px;"
            "object-fit:cover;"
            "border-radius:10px;"
            '" />',
            obj.image.url,
        )


@admin.register(CBTemplate)
class CBTemplateAdmin(admin.ModelAdmin):
    list_display = (
        "aircraft_model",
        "name",
        "created_at",
    )

    list_filter = ("aircraft_model",)

    search_fields = (
        "aircraft_model",
        "name",
    )
