from django.db import migrations, models


def initialize_original_ordering(apps, schema_editor):
    WorkItem = apps.get_model("manhour", "WorkItem")
    WorkItem.objects.filter(original_ordering__isnull=True).update(
        original_ordering=models.F("ordering"),
        is_order_moved=False,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("manhour", "0032_workitem_is_order_moved"),
    ]

    operations = [
        migrations.AddField(
            model_name="workitem",
            name="original_ordering",
            field=models.PositiveIntegerField(
                blank=True,
                null=True,
                verbose_name="원래 작업 순서",
            ),
        ),
        migrations.RunPython(
            initialize_original_ordering,
            migrations.RunPython.noop,
        ),
    ]
