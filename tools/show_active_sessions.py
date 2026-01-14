import os
import django
import sys
from datetime import datetime

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
# ensure project root is on sys.path when invoked from tools/
sys.path.insert(0, os.getcwd())

django.setup()

from manning.models import WorkSession

active_sessions = WorkSession.objects.filter(is_active=True).order_by('created_at')

# build active_map like HomeView to mark which session is shown on dashboard
active_map = {}
for s in active_sessions:
    name = s.name
    if name not in active_map:
        active_map[name] = s
    else:
        try:
            if s.workitem_set.count() > active_map[name].workitem_set.count():
                active_map[name] = s
        except Exception:
            pass

print(f"Found {active_sessions.count()} active sessions:\n")
for s in active_sessions:
    try:
        items = s.workitem_set.count()
    except Exception:
        items = 'ERR'
    created = s.created_at.strftime('%Y-%m-%d %H:%M:%S') if hasattr(s, 'created_at') else 'unknown'
    shown_on_dashboard = 'YES' if active_map.get(s.name) and active_map[s.name].id == s.id else 'NO'
    print(f"- id={s.id}\tname={s.name}\titems={items}\tcreated={created}\tshown_on_dashboard={shown_on_dashboard}")

print('\nTo export to CSV, run: python tools/show_active_sessions.py > active_sessions.txt')
