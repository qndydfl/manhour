from django.db import migrations, models


def backfill_original_gibun(apps, schema_editor):
    WorkItem = apps.get_model("manhour", "WorkItem")
    WorkItem.objects.filter(original_gibun__isnull=True).update(
        original_gibun=models.F("gibun_input")
    )


class Migration(migrations.Migration):

    dependencies = [
        ("manhour", "0026_alter_appsetting_site_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="workitem",
            name="original_gibun",
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
        migrations.RunPython(backfill_original_gibun, migrations.RunPython.noop),
    ]
