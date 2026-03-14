from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("manhour", "0024_defaultworkerdirectory"),
        ("manning", "0025_areatemplate"),
    ]

    operations = [
        migrations.AddField(
            model_name="worksession",
            name="manhour_session",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="manning_sessions",
                to="manhour.worksession",
            ),
        ),
    ]
