from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("manhour", "0029_workplace_config_key_and_site_length"),
    ]

    operations = [
        migrations.AddField(
            model_name="workplace",
            name="rotation_anchor_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="workplace",
            name="rotation_pattern",
            field=models.CharField(
                blank=True,
                choices=[
                    ("DAY_FIRST", "주간 시작 (주간 5일)"),
                    ("NIGHT_FIRST", "야간 시작 (야간/야퇴 교대)"),
                    ("OFF_FIRST", "야퇴 시작 (야퇴/야간 교대)"),
                ],
                default="",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="worksession",
            name="schedule_status",
            field=models.CharField(
                blank=True,
                choices=[
                    ("DAY", "주간"),
                    ("NIGHT", "야간"),
                    ("POST_NIGHT", "야퇴"),
                ],
                default="",
                max_length=16,
                verbose_name="교대 패턴 상태",
            ),
        ),
        migrations.AddField(
            model_name="worksession",
            name="work_date",
            field=models.DateField(blank=True, null=True, verbose_name="작업 날짜"),
        ),
    ]
