#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys


def main():
    """Run administrative tasks."""
    # The local development server must read files directly from STATICFILES_DIRS.
    # Deployment commands and PythonAnywhere continue to use config.settings.
    is_runserver = len(sys.argv) > 1 and sys.argv[1] == 'runserver'
    has_explicit_settings = any(
        arg == '--settings' or arg.startswith('--settings=') for arg in sys.argv[2:]
    )

    if is_runserver and not has_explicit_settings:
        # Override an IDE's inherited production setting for local runserver.
        os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings_dev'
    else:
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
