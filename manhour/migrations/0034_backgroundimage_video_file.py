import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("manhour", "0033_workitem_original_ordering"),
    ]

    operations = [
        migrations.AddField(
            model_name="backgroundimage",
            name="video_file",
            field=models.FileField(
                blank=True,
                help_text="홈 배경 동영상은 MP4 또는 WebM 파일을 사용하세요.",
                null=True,
                upload_to="backgrounds/videos/",
                validators=[
                    django.core.validators.FileExtensionValidator(
                        allowed_extensions=["mp4", "webm"]
                    )
                ],
            ),
        ),
    ]
