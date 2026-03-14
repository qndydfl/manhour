from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("manning", "0026_worksession_manhour_session"),
    ]

    operations = [
        migrations.AddField(
            model_name="sessionarea",
            name="ordering",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
