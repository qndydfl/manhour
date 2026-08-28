import re

from django.db import migrations, models


def create_default_work_packages(apps, schema_editor):
    AreaTemplate = apps.get_model("manning", "AreaTemplate")
    WorkPackage = apps.get_model("manning", "WorkPackage")

    def normalized(value):
        return re.sub(r"[^a-z0-9]", "", (value or "").lower())

    mappings = {
        "A-Check": {
            "standard",
            "lubrication",
            "engineonly",
            "engineexception",
        },
        "Engine-Change": {
            "engchange",
            "enginechange",
            "engchangetemplate",
            "enginechangetemplate",
        },
    }

    templates = list(AreaTemplate.objects.all())
    for sort_order, (package_name, allowed_names) in enumerate(mappings.items()):
        package, _created = WorkPackage.objects.get_or_create(
            name=package_name,
            defaults={"sort_order": sort_order, "is_active": True},
        )
        template_ids = [
            template.id
            for template in templates
            if normalized(template.key) in allowed_names
            or normalized(template.label) in allowed_names
        ]
        if template_ids:
            package.area_templates.add(*template_ids)


def remove_default_work_packages(apps, schema_editor):
    WorkPackage = apps.get_model("manning", "WorkPackage")
    WorkPackage.objects.filter(name__in=["A-Check", "Engine-Change"]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("manning", "0034_worksession_memo_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="WorkPackage",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(max_length=150, unique=True, verbose_name="이름")),
                ("is_active", models.BooleanField(default=True, verbose_name="사용")),
                ("sort_order", models.PositiveIntegerField(default=0, verbose_name="정렬 순서")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "area_templates",
                    models.ManyToManyField(
                        blank=True,
                        related_name="work_packages",
                        to="manning.areatemplate",
                        verbose_name="사용 가능한 Area Template",
                    ),
                ),
            ],
            options={
                "verbose_name": "Work Package",
                "verbose_name_plural": "Work Packages",
                "ordering": ["sort_order", "id"],
            },
        ),
        migrations.RunPython(
            create_default_work_packages,
            remove_default_work_packages,
        ),
    ]
