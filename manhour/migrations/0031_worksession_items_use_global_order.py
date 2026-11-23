from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("manhour", "0030_workplace_rotation_and_session_schedule"),
    ]

    operations = [
        migrations.AddField(
            model_name="worksession",
            name="items_use_global_order",
            field=models.BooleanField(
                default=False,
                verbose_name="작업 항목 전체 순서 사용",
            ),
        ),
    ]
