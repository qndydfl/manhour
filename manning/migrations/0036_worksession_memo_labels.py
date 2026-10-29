from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("manning", "0035_workpackage"),
    ]

    operations = [
        migrations.AddField(
            model_name="worksession",
            name="memo_labels",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
