from django import template
from django.db.utils import OperationalError, ProgrammingError

from manning.models import BackgroundImage

register = template.Library()


@register.simple_tag
def background_url(key, default_url=""):
    try:
        record = BackgroundImage.objects.filter(key=key).first()
    except (OperationalError, ProgrammingError):
        return default_url

    if record:
        if record.image_file:
            return record.image_file.url
        if record.image_url:
            return record.image_url
    return default_url
