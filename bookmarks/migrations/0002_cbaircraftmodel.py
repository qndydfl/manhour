from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("bookmarks", "0001_initial")]

    operations = [
        migrations.CreateModel(
            name="CBAircraftModel",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("site", models.CharField(max_length=50, verbose_name="근무지")),
                ("code", models.CharField(max_length=20, verbose_name="기종")),
            ],
            options={"ordering": ["code"]},
        ),
        migrations.AddConstraint(
            model_name="cbaircraftmodel",
            constraint=models.UniqueConstraint(fields=("site", "code"), name="unique_cb_aircraft_model_per_site"),
        ),
    ]
