from encodings.punycode import T
import os
from pathlib import Path
from re import DEBUG
from dotenv import load_dotenv
from django.core.exceptions import ImproperlyConfigured


# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# .env 파일에서 환경 변수 로드
load_dotenv()

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY 환경변수가 설정되어야 합니다.")

# 관리자 및 일반 사용자 비밀번호
SIMPLE_PASSWORD_ADMIN = os.getenv("SIMPLE_PASSWORD_ADMIN")
SIMPLE_PASSWORD_USER = os.getenv("SIMPLE_PASSWORD_USER")

allowed_hosts = os.getenv(
    "DJANGO_ALLOWED_HOSTS",
    "qndydfl.pythonanywhere.com,localhost,127.0.0.1",
)
ALLOWED_HOSTS = [h.strip() for h in allowed_hosts.split(",") if h.strip()]

DEBUG = os.getenv("DJANGO_DEBUG", "False").lower() in ("1", "true", "yes")

# -----개발 환경 시작-----

# DEBUG = True

# ALLOWED_HOSTS = ["*"]

# -----개발 환경 끝-----

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "manning",
    "widget_tweaks",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # django-session-timeout 미들웨어
    "django_session_timeout.middleware.SessionTimeoutMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [os.path.join(BASE_DIR, "templates")],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "django.template.context_processors.debug",
                "manning.context_processors.active_session_status",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# Database
# https://docs.djangoproject.com/en/6.0/ref/settings/#databases

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}


# Password validation
# https://docs.djangoproject.com/en/6.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


# Internationalization
# https://docs.djangoproject.com/en/6.0/topics/i18n/

LANGUAGE_CODE = "ko-kr"

TIME_ZONE = "Asia/Seoul"

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.0/howto/static-files/

from pathlib import Path

STATIC_URL = "/static/"

STATIC_ROOT = os.path.join(BASE_DIR, "staticfiles")

STATICFILES_DIRS = [
    os.path.join(BASE_DIR, "static"),
]

MEDIA_URL = "/media/"
MEDIA_ROOT = os.path.join(BASE_DIR, "media")


# 세션 설정

# -- django-session-timeout 설정 --
# 세션 만료 시간(초 단위)
SESSION_EXPIRE_SECONDS = 3600  # 1시간 (초 단위)
SESSION_EXPIRE_AFTER_LAST_ACTIVITY = True  # 마지막 활동 후 만료 시간 적용
# -------------------------------

SESSION_EXPIRE_AT_BROWSER_CLOSE = True  # 브라우저 닫으면 세션 종료
SESSION_COOKIE_HTTPS_ONLY = True  # HTTPS 사용 시에만 쿠키 전송
SESSION_COOKIE_SECURE = True  # HTTPS 사용 시에만 쿠키 전송
SESSION_COOKIE_SAMESITE = "Strict"  # CSRF 공격 방지


# Default primary key field type
# https://docs.djangoproject.com/en/6.0/ref/settings/#default-auto-field
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# 유튜브 보안 설정
SECURE_REFERRER_POLICY = "origin-when-cross-origin"
