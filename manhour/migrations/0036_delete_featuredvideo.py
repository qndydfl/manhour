from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("manhour", "0035_alter_backgroundimage_video_file")]

    operations = [migrations.DeleteModel(name="FeaturedVideo")]
