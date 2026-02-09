from urllib.parse import parse_qs, urlparse

from django import template
from django.db.utils import OperationalError, ProgrammingError

from manning.models import BackgroundImage

register = template.Library()


def _extract_youtube_id(url: str) -> str:
    if not url:
        return ""

    parsed = urlparse(url)
    host = parsed.netloc.lower()

    if "youtu.be" in host:
        return parsed.path.lstrip("/")

    if "youtube.com" in host:
        if parsed.path == "/watch":
            return parse_qs(parsed.query).get("v", [""])[0]
        if parsed.path.startswith("/embed/"):
            return parsed.path.split("/", 2)[2]
        if parsed.path.startswith("/shorts/"):
            return parsed.path.split("/", 2)[2]

    return ""


def _build_youtube_embed_url(url: str) -> str:
    video_id = _extract_youtube_id(url)
    if not video_id:
        return ""
    return (
        "https://www.youtube.com/embed/"
        f"{video_id}?autoplay=1&mute=1&loop=1&playlist={video_id}"
        "&controls=0&modestbranding=1&playsinline=1"
    )


@register.simple_tag
def background_config(key, default_url=""):
    try:
        record = BackgroundImage.objects.filter(key=key).first()
    except (OperationalError, ProgrammingError):
        return {
            "image_url": default_url,
            "youtube_embed_url": "",
        }

    image_url = default_url
    youtube_embed_url = ""

    if record:
        if record.image_file:
            image_url = record.image_file.url
        elif record.image_url:
            image_url = record.image_url

        if record.youtube_url:
            youtube_embed_url = _build_youtube_embed_url(record.youtube_url)

    return {
        "image_url": image_url,
        "youtube_embed_url": youtube_embed_url,
    }
