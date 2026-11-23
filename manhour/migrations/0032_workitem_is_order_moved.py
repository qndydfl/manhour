from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("manhour", "0031_worksession_items_use_global_order"),
    ]

    operations = [
        migrations.AddField(
            model_name="workitem",
            name="is_order_moved",
            field=models.BooleanField(
                default=False,
                verbose_name="순서 이동 여부",
            ),
        ),
    ]
