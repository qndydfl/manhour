from __future__ import annotations

from django.db import transaction
from django.db.utils import OperationalError, ProgrammingError

from .models import (
    AppSetting,
    DefaultWorkerDirectory,
    FeaturedVideo,
    TaskMaster,
    WorkSession,
    Workplace,
)
from .workplace_config import (
    DEFAULT_WORKPLACE_DEFINITIONS,
    get_default_workplace_choices,
)


def _update_scoped_models_for_code_change(old_codes: set[str], new_code: str) -> None:
    source_codes = {code for code in old_codes if code and code != new_code}
    if not source_codes:
        return

    from manning.models import WorkSession as ManningWorkSession

    app_setting_qs = AppSetting.objects.filter(site__in=source_codes).exclude(
        site=new_code
    )
    for app_setting in app_setting_qs:
        AppSetting.objects.update_or_create(
            key=app_setting.key,
            site=new_code,
            defaults={
                "int_value": app_setting.int_value,
                "text_value": app_setting.text_value,
            },
        )
        app_setting.delete()

    default_worker_qs = DefaultWorkerDirectory.objects.filter(
        site__in=source_codes
    ).exclude(site=new_code)
    for directory in default_worker_qs:
        DefaultWorkerDirectory.objects.get_or_create(site=new_code, name=directory.name)
        directory.delete()

    TaskMaster.objects.filter(site__in=source_codes).update(site=new_code)
    WorkSession.objects.filter(site__in=source_codes).update(site=new_code)
    FeaturedVideo.objects.filter(site__in=source_codes).update(site=new_code)
    ManningWorkSession.objects.filter(site__in=source_codes).update(site=new_code)


def rename_workplace_code(
    old_code: str, new_code: str, aliases: list[str] | None = None
) -> None:
    alias_values = set(aliases or [])
    alias_values.add(old_code)
    with transaction.atomic():
        _update_scoped_models_for_code_change(alias_values, new_code)


def ensure_default_workplaces() -> None:
    try:
        if Workplace.objects.exists():
            return
    except (OperationalError, ProgrammingError):
        return

    Workplace.objects.bulk_create(
        [
            Workplace(
                code=definition["code"],
                label=definition["label"],
                sort_order=definition["sort_order"],
                is_active=definition["is_active"],
            )
            for definition in DEFAULT_WORKPLACE_DEFINITIONS
        ]
    )


def get_workplaces(include_inactive: bool = False) -> list[Workplace]:
    ensure_default_workplaces()
    try:
        qs = Workplace.objects.all()
        if not include_inactive:
            qs = qs.filter(is_active=True)
        return list(qs.order_by("sort_order", "id"))
    except (OperationalError, ProgrammingError):
        return []


def get_workplace_choices(include_inactive: bool = False) -> list[tuple[str, str]]:
    workplaces = get_workplaces(include_inactive=include_inactive)
    if workplaces:
        return [(workplace.code, workplace.label) for workplace in workplaces]
    return get_default_workplace_choices()


def get_workplace_label_map(include_inactive: bool = False) -> dict[str, str]:
    return dict(get_workplace_choices(include_inactive=include_inactive))


def normalize_workplace(workplace: str | None) -> str:
    if not workplace:
        return ""
    valid = {code for code, _ in get_workplace_choices(include_inactive=True)}
    if workplace in valid:
        return workplace
    label_map = {
        label: code for code, label in get_workplace_choices(include_inactive=True)
    }
    if workplace in label_map:
        return label_map[workplace]
    return ""


def get_workplace_label(workplace: str | None) -> str:
    if not workplace:
        return ""
    normalized = normalize_workplace(workplace)
    if not normalized:
        return workplace
    return get_workplace_label_map(include_inactive=True).get(normalized, normalized)
