from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("manning", "0024_workerdirectory"),
    ]

    operations = [
        migrations.CreateModel(
            name="AreaTemplate",
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
                ("key", models.CharField(max_length=50, unique=True)),
                ("label", models.CharField(max_length=100)),
                ("is_active", models.BooleanField(default=True)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["sort_order", "id"],
            },
        ),
        migrations.CreateModel(
            name="AreaTemplateItem",
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
                    "position",
                    models.CharField(
                        choices=[
                            ("LEFT", "LEFT SIDE"),
                            ("RIGHT", "RIGHT SIDE"),
                            ("NONE", "N/A"),
                        ],
                        default="LEFT",
                        max_length=10,
                    ),
                ),
                ("name", models.CharField(max_length=100)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                (
                    "template",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="items",
                        to="manning.areatemplate",
                    ),
                ),
            ],
            options={
                "ordering": ["sort_order", "id"],
            },
        ),
    ]
