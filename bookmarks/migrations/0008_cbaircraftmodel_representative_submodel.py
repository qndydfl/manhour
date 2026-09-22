from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("bookmarks", "0007_remove_cbtemplate_unique_cb_template_per_site_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="cbaircraftmodel",
            name="representative_submodel",
            field=models.CharField(
                blank=True,
                help_text="기종 카드 아래에 작게 표시됩니다. 예: A321-200",
                max_length=50,
                verbose_name="대표 서브 기종",
            ),
        ),
    ]
