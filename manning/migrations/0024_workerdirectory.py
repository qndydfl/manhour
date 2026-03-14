from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("manning", "0023_delete_appsetting_remove_assignment_work_item_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="WorkerDirectory",
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
                (
                    "site",
                    models.CharField(
                        choices=[
                            ("ICN-1\uadf8\ub8f9", "ICN-1\uadf8\ub8f9"),
                            ("ICN-2\uadf8\ub8f9", "ICN-2\uadf8\ub8f9"),
                            ("ICN-3\uadf8\ub8f9", "ICN-3\uadf8\ub8f9"),
                            ("GMP-1\uadf8\ub8f9", "GMP-1\uadf8\ub8f9"),
                            ("GMP-2\uadf8\ub8f9", "GMP-2\uadf8\ub8f9"),
                            ("GMP-3\uadf8\ub8f9", "GMP-3\uadf8\ub8f9"),
                        ],
                        max_length=20,
                        verbose_name="\uadfc\ubb34\uc9c0",
                    ),
                ),
                ("name", models.CharField(max_length=50)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["name", "id"],
                "unique_together": {("site", "name")},
            },
        ),
    ]
