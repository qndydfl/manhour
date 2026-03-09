from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("manhour", "0018_featuredvideo"),
    ]

    operations = [
        migrations.AddField(
            model_name="worksession",
            name="finished_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
