from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name="CBTemplate",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("site", models.CharField(max_length=50, verbose_name="근무지")),
                ("aircraft_model", models.CharField(max_length=20, verbose_name="기종")),
                ("name", models.CharField(max_length=100, verbose_name="템플릿 이름")),
                ("rows", models.JSONField(default=list, verbose_name="기본 데이터")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["aircraft_model", "name"],
                "constraints": [models.UniqueConstraint(fields=("site", "aircraft_model", "name"), name="unique_cb_template_per_site")],
            },
        ),
    ]
