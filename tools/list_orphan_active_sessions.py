import os
import django
import sys
from datetime import datetime

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
# ensure project root is on sys.path when invoked from tools/
sys.path.insert(0, os.getcwd())

django.setup()

from manning.models import WorkSession

active_sessions = list(WorkSession.objects.filter(is_active=True).order_by('created_at'))
# build active_map same as HomeView
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

# determine orphan sessions: active sessions not present in active_map.values()
mapped_ids = {s.id for s in active_map.values()}
orphans = [s for s in active_sessions if s.id not in mapped_ids]

print(f"total active sessions: {len(active_sessions)}")
print(f"mapped session ids: {sorted(mapped_ids)}")
print(f"orphan candidate count: {len(orphans)}\n")

if not orphans:
    print("No orphan active sessions found.")
else:
    print("Orphan active sessions (candidates for deletion):")
    for s in orphans:
        try:
            item_count = s.workitem_set.count()
        except Exception:
            item_count = 'ERR'
        created = s.created_at.strftime('%Y-%m-%d %H:%M:%S') if hasattr(s, 'created_at') else 'unknown'
        print(f" - id={s.id}, name={s.name}, items={item_count}, created_at={created}")

print('\nTo delete these, run:')
print('  python tools/delete_orphan_active_sessions.py')
