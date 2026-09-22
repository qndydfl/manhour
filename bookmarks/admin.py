from django import forms
from django.contrib import admin
from django.db import transaction
from django.utils.html import format_html

from .models import CBAircraftModel, CBTemplate


class CBAircraftModelAdminForm(forms.ModelForm):
    class Meta:
        model = CBAircraftModel
        fields = "__all__"

    def clean_code(self):
        return self.cleaned_data["code"].strip().upper()


@admin.register(CBAircraftModel)
class CBAircraftModelAdmin(admin.ModelAdmin):
    form = CBAircraftModelAdminForm

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

    @transaction.atomic
    def save_model(self, request, obj, form, change):
        old_code = ""
        if change and obj.pk:
            old_code = (
                CBAircraftModel.objects.filter(pk=obj.pk)
                .values_list("code", flat=True)
                .first()
                or ""
            )

        obj.code = obj.code.strip().upper()
        super().save_model(request, obj, form, change)

        if old_code and old_code != obj.code:
            CBTemplate.objects.filter(aircraft_model=old_code).update(
                aircraft_model=obj.code,
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
