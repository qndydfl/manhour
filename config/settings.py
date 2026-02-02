import os
from pathlib import Path
from re import S
from dotenv import load_dotenv


# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# ------개발 환경-------시작

# .env 파일에서 환경 변수 로드
load_dotenv()
# .env보다 보안 강화 --> os.environ

SECRET_KEY = os.getenv(
    "DJANGO_SECRET_KEY",
    # "django-insecure-(ypmf6_cgmn!h-$1_g$qz!7lhnu9+#v!5165eiy^7+3^$ym1i&",
)

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = "True"

# 관리자 및 일반 사용자 비밀번호 도출 방지
SIMPLE_PASSWORD_ADMIN = os.getenv('SIMPLE_PASSWORD_ADMIN')
SIMPLE_PASSWORD_USER = os.getenv('SIMPLE_PASSWORD_USER')

ALLOWED_HOSTS = ["*",]

# ------개발 환경-------끝


# ------배포 개발 환경-------시작

# SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")

# DEBUG = "False"

## 로그인에 사용할 공통 비밀번호
# 환경 변수 등록
# export SIMPLE_PASSWORD_ADMIN="비밀번호" 
# export SIMPLE_PASSWORD_USER="비밀번호"

# SIMPLE_PASSWORD_ADMIN = os.environ.get("SIMPLE_PASSWORD_ADMIN")# 관리자용
# SIMPLE_PASSWORD_USER = os.environ.get("SIMPLE_PASSWORD_USER")# 일반 사용자용 (조회 전용)

# ALLOWED_HOSTS = ["qndydfl.pythonanywhere.com",]

# ------배포 개발 환경-------끝


# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "manning",
    "widget_tweaks",
    "embed_video",
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
    'django_session_timeout.middleware.SessionTimeoutMiddleware', 
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

STATIC_ROOT = BASE_DIR / "staticfiles"

STATICFILES_DIRS = [
    BASE_DIR / "static",
]


# 세션 설정

#-- django-session-timeout 설정 --
# 세션 만료 시간(초 단위)
SESSION_EXPIRE_SECONDS = 3600  # 1시간 (초 단위)
SESSION_EXPIRE_AFTER_LAST_ACTIVITY = True  # 마지막 활동 후 만료 시간 적용
#-------------------------------

SESSION_EXPIRE_AT_BROWSER_CLOSE = True  # 브라우저 닫으면 세션 종료
SESSION_COOKIE_HTTPS_ONLY = True  # HTTPS 사용 시에만 쿠키 전송
SESSION_COOKIE_SECURE = True  # HTTPS 사용 시에만 쿠키 전송
SESSION_COOKIE_SAMESITE = "Strict"  # CSRF 공격 방지


# Default primary key field type
# https://docs.djangoproject.com/en/6.0/ref/settings/#default-auto-field
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


LOGIN_URL = "/login/"
