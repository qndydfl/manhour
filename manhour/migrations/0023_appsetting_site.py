from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("manhour", "0022_workitem_adjusted_mh"),
    ]

    operations = [
        migrations.AddField(
            model_name="appsetting",
            name="site",
            field=models.CharField(
                blank=True,
                choices=[
                    ("ICN-1그룹", "ICN-1그룹"),
                    ("ICN-2그룹", "ICN-2그룹"),
                    ("ICN-3그룹", "ICN-3그룹"),
                    ("GMP-1그룹", "GMP-1그룹"),
                    ("GMP-2그룹", "GMP-2그룹"),
                    ("GMP-3그룹", "GMP-3그룹"),
                ],
                default="",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="appsetting",
            name="key",
            field=models.CharField(max_length=50),
        ),
        migrations.AlterUniqueTogether(
            name="appsetting",
            unique_together={("key", "site")},
        ),
    ]
