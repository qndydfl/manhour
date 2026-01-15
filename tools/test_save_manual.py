import os,sys,json
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings')
sys.path.insert(0, os.path.abspath('.'))
import django
django.setup()
from django.test import Client
from manning.models import WorkSession, WorkItem, Worker, Assignment

session = WorkSession.objects.filter(is_active=True).first() or WorkSession.objects.first()
if not session:
    print('No session found')
    sys.exit(1)

item = WorkItem.objects.filter(session=session).first()
worker = Worker.objects.filter(session=session).first()
if not item or not worker:
    print('Missing item or worker:', item, worker)
    sys.exit(1)

c = Client()
payload = {
    'assignments': [
        {
            'item_id': item.id,
            'type': 'DIRECT',
            'start_min': 60,
            'end_min': 120,
            'worker_id': worker.id,
            'worker': worker.name,
            'code': 'TEST'
        }
    ]
}

resp = c.post(f'/session/{session.id}/save-manual/', data=json.dumps(payload), content_type='application/json', **{'HTTP_HOST':'127.0.0.1'})
print('response status:', resp.status_code)
try:
    print('response json:', resp.json())
except Exception as e:
    print('no json, content:', resp.content)

created = Assignment.objects.filter(work_item=item, worker=worker, code='TEST')
print('assignments created count:', created.count())
if created.exists():
    a = created.first()
    print('created allocated_mh, start_min, end_min:', a.allocated_mh, a.start_min, a.end_min)
else:
    print('No assignment created.')
