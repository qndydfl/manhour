from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        (
            "manhour",
            "0021_rename_manning_gib_session_3525d4_idx_manhour_gib_session_e6338f_idx",
        ),
    ]

    operations = [
        migrations.AddField(
            model_name="workitem",
            name="adjusted_mh",
            field=models.FloatField(blank=True, null=True),
        ),
    ]
