"""Settings used automatically by ``manage.py runserver``."""

from copy import deepcopy

from .settings import *  # noqa: F403


DEBUG = True

# Read HTML templates from disk for every request. This deliberately avoids
# Django's cached template loader in the local development environment.
TEMPLATES = deepcopy(TEMPLATES)  # noqa: F405
TEMPLATES[0]["APP_DIRS"] = False
TEMPLATES[0]["OPTIONS"]["loaders"] = [
    "django.template.loaders.filesystem.Loader",
    "django.template.loaders.app_directories.Loader",
]

# Prevent the browser from reusing an old HTML document after a template edit.
MIDDLEWARE = [*MIDDLEWARE, "config.middleware.DisableHtmlCacheMiddleware"]  # noqa: F405

# Do not resolve development assets through collectstatic's manifest. Django's
# runserver will serve the current files from STATICFILES_DIRS on every request.
STORAGES = {
    **STORAGES,  # noqa: F405
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}

# Ensure the browser revalidates static responses during local development.
WHITENOISE_MAX_AGE = 0
