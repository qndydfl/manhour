from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("manning", "0036_worksession_memo_labels"),
    ]

    operations = [
        migrations.CreateModel(
            name="MemoDefault",
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
                        max_length=50, unique=True, verbose_name="근무지"
                    ),
                ),
                (
                    "settings",
                    models.JSONField(
                        blank=True, default=dict, verbose_name="기본 구성"
                    ),
                ),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "전체 메모 기본 구성",
                "verbose_name_plural": "전체 메모 기본 구성",
            },
        ),
    ]
