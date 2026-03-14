from __future__ import annotations

from .models import DEFAULT_WORKPLACE_CHOICES, Workplace


def get_workplaces(include_inactive: bool = False) -> list[Workplace]:
    qs = Workplace.objects.all()
    if not include_inactive:
        qs = qs.filter(is_active=True)
    return list(qs.order_by("sort_order", "id"))


def get_workplace_choices(include_inactive: bool = False) -> list[tuple[str, str]]:
    workplaces = get_workplaces(include_inactive=include_inactive)
    if workplaces:
        return [(workplace.code, workplace.label) for workplace in workplaces]
    return DEFAULT_WORKPLACE_CHOICES


def get_workplace_label_map(include_inactive: bool = False) -> dict[str, str]:
    return dict(get_workplace_choices(include_inactive=include_inactive))


def normalize_workplace(workplace: str | None) -> str:
    if not workplace:
        return ""
    valid = {code for code, _ in get_workplace_choices(include_inactive=True)}
    if workplace in valid:
        return workplace
    return ""


def get_workplace_label(workplace: str | None) -> str:
    if not workplace:
        return ""
    return get_workplace_label_map(include_inactive=True).get(workplace, workplace)
