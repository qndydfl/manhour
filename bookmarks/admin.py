from django.contrib import admin

from .models import CBAircraftModel, CBTemplate


@admin.register(CBAircraftModel)
class CBAircraftModelAdmin(admin.ModelAdmin):
    list_display = ("code", "site")
    list_filter = ("site",)
    search_fields = ("code",)


@admin.register(CBTemplate)
class CBTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "aircraft_model", "site", "created_at")
    list_filter = ("aircraft_model", "site")
    search_fields = ("name",)
