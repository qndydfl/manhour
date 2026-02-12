from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("manning", "0017_alter_worksession_site"),
    ]

    operations = [
        migrations.CreateModel(
            name="FeaturedVideo",
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
                ("title", models.CharField(max_length=100)),
                ("youtube_url", models.URLField(help_text="Full YouTube URL")),
                (
                    "kind",
                    models.CharField(
                        choices=[("VIDEO", "Video"), ("SHORTS", "Shorts")],
                        default="VIDEO",
                        max_length=10,
                    ),
                ),
                (
                    "site",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("ICN-1\uadf8\ub8f9", "ICN-1\uadf8\ub8f9"),
                            ("ICN-2\uadf8\ub8f9", "ICN-2\uadf8\ub8f9"),
                            ("ICN-3\uadf8\ub8f9", "ICN-3\uadf8\ub8f9"),
                            ("GMP-1\uadf8\ub8f9", "GMP-1\uadf8\ub8f9"),
                            ("GMP-2\uadf8\ub8f9", "GMP-2\uadf8\ub8f9"),
                            ("GMP-3\uadf8\ub8f9", "GMP-3\uadf8\ub8f9"),
                        ],
                        default="",
                        help_text="Blank = all sites",
                        max_length=20,
                    ),
                ),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
            ],
            options={
                "ordering": ["sort_order", "id"],
            },
        ),
    ]
