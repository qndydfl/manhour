from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("manhour", "0027_workitem_original_gibun"),
    ]

    operations = [
        migrations.AddField(
            model_name="appsetting",
            name="text_value",
            field=models.TextField(blank=True, default=""),
        ),
    ]
