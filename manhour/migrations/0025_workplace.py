from django.db import migrations, models


def seed_workplaces(apps, schema_editor):
    Workplace = apps.get_model("manhour", "Workplace")
    if Workplace.objects.exists():
        return
    defaults = [
        ("ICN-1그룹", "ICN-1그룹"),
        ("ICN-2그룹", "ICN-2그룹"),
        ("ICN-3그룹", "ICN-3그룹"),
        ("GMP-1그룹", "GMP-1그룹"),
        ("GMP-2그룹", "GMP-2그룹"),
        ("GMP-3그룹", "GMP-3그룹"),
    ]
    Workplace.objects.bulk_create(
        [
            Workplace(code=code, label=label, sort_order=idx)
            for idx, (code, label) in enumerate(defaults)
        ]
    )


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):
    dependencies = [
        ("manhour", "0024_defaultworkerdirectory"),
    ]

    operations = [
        migrations.CreateModel(
            name="Workplace",
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
                ("code", models.CharField(max_length=20, unique=True)),
                ("label", models.CharField(max_length=50)),
                ("is_active", models.BooleanField(default=True)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["sort_order", "id"],
            },
        ),
        migrations.RunPython(seed_workplaces, noop_reverse),
    ]
