import os
import django
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
# ensure project root is on sys.path when invoked from tools/
sys.path.insert(0, os.getcwd())
django.setup()

from manning.models import WorkSession

active_sessions = WorkSession.objects.filter(is_active=True)
active_sessions_count = active_sessions.count()

# Build active_map like HomeView
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

# dashboard slots
from pprint import pprint

dashboard_slots = []
for i in range(1, 9):
    name = f"Session {i}"
    if name in active_map:
        dashboard_slots.append({'name': name, 'status': 'active', 'session_id': active_map[name].id, 'items': active_map[name].workitem_set.count()})
    else:
        dashboard_slots.append({'name': name, 'status': 'empty', 'session_id': None, 'items': 0})

active_slot_count = sum(1 for slot in dashboard_slots if slot['status'] == 'active')

print("total active sessions:", active_sessions_count)
print("active slots (visible on dashboard):", active_slot_count)
print("dashboard slots summary:")
for s in dashboard_slots:
    print(f" - {s['name']}: {s['status']} (items={s['items']}) session_id={s['session_id']}")
