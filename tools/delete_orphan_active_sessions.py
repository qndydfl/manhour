import os
import django
import sys
import csv
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

mapped_ids = {s.id for s in active_map.values()}
orphans = [s for s in active_sessions if s.id not in mapped_ids]

if not orphans:
    print("No orphan active sessions to delete.")
    sys.exit(0)

# Backup CSV
bak_dir = os.path.join(os.getcwd(), 'tools', 'backups')
os.makedirs(bak_dir, exist_ok=True)
now = datetime.now().strftime('%Y%m%d_%H%M%S')
bak_file = os.path.join(bak_dir, f'orphan_active_sessions_backup_{now}.csv')

with open(bak_file, 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerow(['id', 'name', 'created_at', 'is_active', 'workitem_count'])
    for s in orphans:
        try:
            item_count = s.workitem_set.count()
        except Exception:
            item_count = ''
        created = s.created_at.strftime('%Y-%m-%d %H:%M:%S') if hasattr(s, 'created_at') else ''
        writer.writerow([s.id, s.name, created, s.is_active, item_count])

print(f"Backup written to: {bak_file}")

# Delete orphans
deleted = []
for s in orphans:
    sid = s.id
    s.delete()
    deleted.append(sid)

print(f"Deleted orphan session ids: {deleted}")
print("Done.")
