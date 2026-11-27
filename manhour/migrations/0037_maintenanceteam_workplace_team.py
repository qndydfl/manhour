from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("manhour", "0036_delete_featuredvideo")]

    operations = [
        migrations.CreateModel(
            name="MaintenanceTeam",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100, unique=True)),
            ],
            options={"ordering": ["name", "id"]},
        ),
        migrations.AddField(
            model_name="workplace",
            name="team",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="workplaces", to="manhour.maintenanceteam"),
        ),
    ]
