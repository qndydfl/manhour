from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('manning', '0006_workitem_model_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='assignment',
            name='start_min',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='assignment',
            name='end_min',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='assignment',
            name='code',
            field=models.CharField(max_length=50, blank=True, null=True),
        ),
    ]
