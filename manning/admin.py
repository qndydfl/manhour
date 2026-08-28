from django.contrib import admin
from .models import (
    AreaTemplate,
    AreaTemplateItem,
    Manning,
    SessionArea,
    WorkPackage,
    WorkSession,
)


class WorkSessionAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "work_package_name",
        "site",
        "shift_type",
        "is_active",
        "created_at",
    )
    list_filter = ("site", "is_active", "shift_type")
    search_fields = ("name", "work_package_name", "aircraft_reg")


class AreaTemplateItemInline(admin.TabularInline):
    model = AreaTemplateItem
    extra = 1
    fields = ("position", "name", "sort_order")


@admin.register(AreaTemplate)
class AreaTemplateAdmin(admin.ModelAdmin):
    list_display = ("label", "key", "is_active", "sort_order")
    list_filter = ("is_active",)
    search_fields = ("label", "key")
    ordering = ("sort_order", "id")
    inlines = (AreaTemplateItemInline,)


@admin.register(WorkPackage)
class WorkPackageAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "sort_order", "template_count")
    list_filter = ("is_active",)
    search_fields = ("name",)
    ordering = ("sort_order", "id")
    filter_horizontal = ("area_templates",)

    @admin.display(description="Template 수")
    def template_count(self, obj):
        return obj.area_templates.count()


admin.site.register(WorkSession, WorkSessionAdmin)
admin.site.register(SessionArea)
admin.site.register(Manning)
