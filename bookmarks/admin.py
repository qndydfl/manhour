from django.contrib import admin

from .models import CBTemplate


@admin.register(CBTemplate)
class CBTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "aircraft_model", "site", "created_at")
    list_filter = ("aircraft_model", "site")
    search_fields = ("name",)
