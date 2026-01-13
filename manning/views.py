import json
from turtle import pd
from django.db.models import Sum
from django.db.models.functions import Coalesce
from datetime import timedelta  
from django.http import JsonResponse
from django.utils import timezone
from django.forms import modelformset_factory 
from .forms import WorkItemForm
from django.shortcuts import get_object_or_404, render, redirect
from django.views import View
from django.contrib import messages
from django.db import transaction

from manning.services import run_auto_assign, refresh_worker_totals
from .models import Assignment, TaskMaster, WorkSession, Worker, WorkItem
from django.views.generic import DetailView
from django.core.serializers.json import DjangoJSONEncoder
from .models import WorkSession as ManningSession


class HomeView(View):
    def get(self, request):
        today = timezone.now().date()
        
        # 1. 오늘 활성화된(is_active=True) 세션들을 다 가져옵니다.
        # { 'Session 1': 세션객체, 'Session 3': 세션객체 ... } 형태로 만듭니다.
        active_sessions = WorkSession.objects.filter(created_at__date=today, is_active=True)
        active_map = {s.name: s for s in active_sessions}
        
        # 2. 1번~8번 방의 상태를 정리합니다.
        dashboard_slots = []
        for i in range(1, 9):
            name = f"Session {i}"
            if name in active_map:
                # 사용 중인 방
                session = active_map[name]
                # 작업자가 몇 명인지, 일감이 몇 개인지 미리 세어봅니다.
                worker_count = session.worker_set.count()
                item_count = session.workitem_set.count()
                
                dashboard_slots.append({
                    'name': name,
                    'status': 'active',
                    'session_id': session.id,
                    'info': f"작업자 {worker_count}명 / 일감 {item_count}개"
                })
            else:
                # 빈 방
                dashboard_slots.append({
                    'name': name,
                    'status': 'empty',
                    'session_id': None,
                    'info': "대기 중"
                })

        # 3. 지난 7일간 기록 카운트 (통계용)
        cutoff = timezone.now() - timedelta(days=7)
        history_count = WorkSession.objects.filter(is_active=False, created_at__gte=cutoff).count()

        context = {
            'today': today,
            'dashboard_slots': dashboard_slots,
            'active_count': len(active_sessions),
            'history_count': history_count
        }
        return render(request, 'manning/home.html', context)
    

# 1. 데이터 붙여넣기 기능 (PasteDataView)
class PasteDataView(View):
    # GET: 페이지를 보여달라고 할 때
    def get(self, request):
        return render(request, 'manning/paste_input.html')

    # POST: 데이터를 보내서 저장해달라고 할 때
    def post(self, request):
        raw_text = request.POST.get('excel_data')
        
        if raw_text:
            rows = raw_text.strip().split('\n')
            count = 0
            for row in rows:
                columns = row.split('\t')
                
                if len(columns) >= 5:
                    # 중복 허용 저장 (create)
                    TaskMaster.objects.create(
                        gibun_code=columns[0].strip(),
                        work_order=columns[1].strip(),
                        op=columns[2].strip(),
                        description=columns[3].strip(),
                        default_mh=float(columns[4].strip() or 0)
                    )
                    count += 1
            
            messages.success(request, f"{count}개의 데이터가 성공적으로 저장되었습니다!")

        return render(request, 'manning/paste_input.html')


# 2. 세션 생성 기능 (CreateSessionView)
class CreateSessionView(View):
    def get(self, request):
        # (청소 로직 유지: 7일 지난 건 완전히 삭제)
        cleanup_cutoff = timezone.now() - timedelta(days=7)
        WorkSession.objects.filter(created_at__lt=cleanup_cutoff).delete()

        # [수정] 오늘 만들어졌는데, 아직 "사용 중(is_active=True)"인 방만 찾음
        today = timezone.now().date()
        active_sessions = WorkSession.objects.filter(created_at__date=today, is_active=True).values_list('name', flat=True)
        
        slots = []
        for i in range(1, 9):
            name = f"Session {i}"
            is_taken = name in active_sessions # 활성 상태인 것만 '사용 중' 표시
            slots.append({'name': name, 'is_taken': is_taken})

        return render(request, 'manning/create_session.html', {'slots': slots})

    def post(self, request):
        session_name = request.POST.get('session_name')
        worker_names = request.POST.get('worker_names')
        target_gibun = request.POST.get('target_gibun')
        
        # [수정] 사용 중인 방인지 체크할 때도 is_active=True 조건 추가
        today = timezone.now().date()
        if WorkSession.objects.filter(created_at__date=today, name=session_name, is_active=True).exists():
            messages.error(request, f"⛔ {session_name}은(는) 현재 사용 중입니다!")
            return redirect('create_session')

        # ... (나머지 생성 로직은 기존과 동일) ...
        session = WorkSession.objects.create(name=session_name)
        # ... (작업자, 일감 생성 코드 그대로 유지) ...
        # (생략: 기존 코드 복사해서 쓰시면 됩니다)
        
        names = worker_names.replace('\n', ',').split(',')
        for name in names:
            clean_name = name.strip()
            if clean_name:
                Worker.objects.create(session=session, name=clean_name)

        tasks = TaskMaster.objects.filter(gibun_code=target_gibun.strip())
        for task in tasks:
            WorkItem.objects.create(
                session=session, task_master=task, gibun_input=task.gibun_code,
                work_order=task.work_order, op=task.op, description=task.description, work_mh=task.default_mh
            )
        
        return redirect('result_view', session_id=session.id)
    

class EditSessionView(View):
    def get(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        # 세션에 등록된 작업자 이름들을 줄바꿈으로 나열
        worker_names = "\n".join([w.name for w in session.worker_set.all()])

        context = {
            'session': session,
            'worker_names_str': worker_names
        }
        return render(request, 'manning/edit_session.html', context)

    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)

        session_name = request.POST.get('session_name')
        worker_names = request.POST.get('worker_names', '')

        # 세션 이름 업데이트
        if session_name:
            session.name = session_name
            session.save()

        # 입력된 작업자 목록 파싱 (줄 단위)
        # [팁] set()을 사용하면 사용자가 실수로 두 번 적은 이름도 하나로 합쳐줍니다!
        raw_names = [n.strip() for n in worker_names.replace('\r', '').split('\n') if n.strip()]
        new_names = list(set(raw_names)) # 중복 제거

        # 기존 작업자 조회
        existing_workers = list(session.worker_set.all())
        existing_names = [w.name for w in existing_workers]

        # 1. 삭제 처리 (기존에는 있는데, 입력칸에서 지운 사람)
        for w in existing_workers:
            if w.name not in new_names:
                w.delete() # CASCADE 덕분에 배정 기록도 자동 삭제됨

        # 2. 추가 처리 (기존에는 없는데, 입력칸에 새로 적은 사람)
        for name in new_names:
            if name not in existing_names:
                Worker.objects.create(session=session, name=name)

        messages.success(request, "세션 정보가 수정되었습니다!")
        return redirect('result_view', session_id=session.id)
    

# 3. 배정 실행 및 결과 보기 (ResultView)
class ResultView(View):
    # GET: 결과를 보여줘!
    def get(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)

        # [추가] 화면을 그리기 전에, 누적 시간을 최신 상태로 갱신!
        refresh_worker_totals(session)
        
        # 화면에 보여줄 데이터 묶음
        context = {
            'session': session,
            'workers': session.worker_set.all(), # 작업자 명단
            'items': session.workitem_set.all(), # 일감 목록
        }
        return render(request, 'manning/result_view.html', context)

    # POST: 배정 로봇을 실행해! (버튼 눌렀을 때)
    def post(self, request, session_id):
        # 로봇 가동!
        run_auto_assign(session_id)
        
        messages.success(request, "자동 배정이 완료되었습니다! 🤖")
        # 같은 페이지를 다시 보여줘서 결과 확인
        return redirect('result_view', session_id=session_id)
    

class EditItemView(View):
    # GET: 수정할 내용을 화면에 채워서 보여줘!
    def get(self, request, item_id):
        # 고칠 작업 데이터를 가져옵니다 (없으면 404 에러)
        item = get_object_or_404(WorkItem, id=item_id)
        
        context = {'item': item}
        return render(request, 'manning/edit_item.html', context)

    # POST: 수정한 내용을 저장해!
    def post(self, request, item_id):
        item = get_object_or_404(WorkItem, id=item_id)

        # 화면에서 보낸 값으로 덮어쓰기
        item.work_order = request.POST.get('work_order')
        item.op = request.POST.get('op')
        item.description = request.POST.get('description')
        item.work_mh = float(request.POST.get('work_mh'))
        item.save() # 저장!

        # [중요] 수정을 하면 기존 배정(Assignment)은 틀린 게 되니까 지워버립니다.
        # (그러면 다시 자동 배정 버튼을 눌러서 맞추면 돼요)
        item.assignments.all().delete()
        
        messages.success(request, "작업 내용이 수정되었습니다! (재배정 필요)")
        
        # 다시 결과 화면(리스트)으로 돌아가기
        return redirect('result_view', session_id=item.session.id)
    

class EditItemView(View):
    def get(self, request, item_id):
        item = get_object_or_404(WorkItem, id=item_id)
        # 세션에 있는 모든 작업자
        all_workers = item.session.worker_set.all()
        # 현재 이 작업에 배정된 작업자 ID들 (체크박스 미리 체크용)
        assigned_worker_ids = item.assignments.values_list('worker_id', flat=True)

        context = {
            'item': item,
            'all_workers': all_workers,
            'assigned_ids': assigned_worker_ids
        }
        return render(request, 'manning/edit_item.html', context)

    def post(self, request, item_id):
        item = get_object_or_404(WorkItem, id=item_id)

        # 1. 기본 정보 수정
        item.work_order = request.POST.get('work_order')
        item.op = request.POST.get('op')
        item.description = request.POST.get('description')
        item.work_mh = float(request.POST.get('work_mh'))
        
        # 2. 수동 배정 처리
        # 화면에서 체크된 작업자들의 ID 리스트를 가져옴
        selected_ids = request.POST.getlist('worker_ids')

        # 기존 배정 싹 지우기 (새로 넣을 거니까)
        item.assignments.all().delete()

        if selected_ids:
            # 선택된 사람이 있으면 -> 수동 모드 켜기 (is_manual = True)
            item.is_manual = True
            
            # 시간 계산 (총시간 / 사람수)
            share = round(item.work_mh / len(selected_ids), 2)
            
            for w_id in selected_ids:
                worker = Worker.objects.get(id=w_id)
                Assignment.objects.create(work_item=item, worker=worker, allocated_mh=share)
        else:
            # 선택된 사람이 없으면 -> 수동 모드 끄기 (is_manual = False)
            # 나중에 자동 배정 버튼 누르면 로봇이 알아서 채워줄 것임
            item.is_manual = False
        
        item.save()
        
        messages.success(request, "작업 수정 완료! (인원을 선택했다면 고정됩니다)")
        return redirect('result_view', session_id=item.session.id)
    

class ManageItemsView(View):
    def get(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        WorkItemFormSet = modelformset_factory(WorkItem, form=WorkItemForm, extra=3, can_delete=True)
        formset = WorkItemFormSet(queryset=WorkItem.objects.filter(session=session))
        
        # [핵심] 각 폼마다 현재 배정된 사람 이름을 찾아서 assigned_text 칸에 넣어줌
        for form in formset:
            if form.instance.pk: # 이미 저장된 아이템이라면
                # 배정된 사람 이름들을 콤마로 합침
                names = [a.worker.name for a in form.instance.assignments.all()]
                form.initial['assigned_text'] = ",".join(names)

        return render(request, 'manning/manage_items.html', {
            'session': session,
            'formset': formset
        })

    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        WorkItemFormSet = modelformset_factory(WorkItem, form=WorkItemForm, extra=3, can_delete=True)
        formset = WorkItemFormSet(request.POST)

        if formset.is_valid():
            items = formset.save(commit=False)
            
            # 폼셋에는 순서대로 폼들이 들어있음. 데이터와 폼을 매칭해야 함.
            for form in formset:
                # 삭제 체크된 건 건너뜀
                if form.cleaned_data.get('DELETE'):
                    continue
                
                # 방금 저장된(또는 저장될) item 객체 가져오기
                item = form.instance 
                item.session = session
                
                # [핵심] assigned_text 칸에 적은 내용 가져오기
                assign_str = form.cleaned_data.get('assigned_text', '').strip()
                
                # 이름이 적혀있으면 -> 수동 배정 처리
                if assign_str:
                    item.save() # 일단 아이템 저장
                    item.assignments.all().delete() # 기존 배정 삭제
                    
                    names = assign_str.replace(' ', '').split(',') # 콤마로 분리
                    assigned_count = 0
                    
                    for name in names:
                        # 이름으로 작업자 찾기 (세션 내에서)
                        worker = Worker.objects.filter(session=session, name=name).first()
                        if worker:
                            assigned_count += 1
                    
                    if assigned_count > 0:
                        share = round(item.work_mh / assigned_count, 2)
                        for name in names:
                            worker = Worker.objects.filter(session=session, name=name).first()
                            if worker:
                                Assignment.objects.create(work_item=item, worker=worker, allocated_mh=share)
                        
                        item.is_manual = True # 수동 고정!
                    
                else:
                    # 빈칸이면 -> 건드리지 않음 (기존 속성 유지하거나, 필요시 로직 추가 가능)
                    # 여기서는 그냥 아이템만 저장
                    item.save()

            # 삭제 처리
            for obj in formset.deleted_objects:
                obj.delete()

            messages.success(request, "일감 및 배정 정보가 수정되었습니다!")
            return redirect('result_view', session_id=session.id)
        
        # 에러 나면 다시 보여주기
        return render(request, 'manning/manage_items.html', {
            'session': session,
            'formset': formset
        })
    

class UpdateWorkerLimitsView(View):
    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        
        # 화면에서 넘어온 모든 데이터를 확인합니다.
        # 데이터 이름이 "limit_작업자ID" 형식인 것만 찾습니다.
        for key, value in request.POST.items():
            if key.startswith('limit_'):
                # "limit_15" -> "15" (작업자 ID 추출)
                worker_id = key.split('_')[1]
                
                # 입력된 한도 값 (숫자로 변환)
                new_limit = float(value)
                
                # 작업자를 찾아서 한도 업데이트
                worker = Worker.objects.get(id=worker_id)
                worker.limit_mh = new_limit
                worker.save()

        messages.success(request, "작업자별 근무 한도가 수정되었습니다! 🕒")
        return redirect('result_view', session_id=session.id)
    

class FinishSessionView(View):
    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        
        # 삭제(delete)하지 않고, 상태만 '종료'로 변경
        session.is_active = False 
        session.save()
        
        messages.success(request, f"✅ {session.name} 작업이 완료되었습니다. 기록 보관소로 이동합니다.")
        return redirect('create_session')

class HistoryView(View):
    def get(self, request):
        # 종료된(is_active=False) 세션들만 가져옴 (최신순 정렬)
        history_list = WorkSession.objects.filter(is_active=False).order_by('-created_at')
        
        # 검색 기능 (세션 이름, 기번, 날짜 등으로 검색)
        query = request.GET.get('q')
        if query:
            # 세션 이름이나, 그 세션에 포함된 기번(gibun_input)으로 검색
            history_list = history_list.filter(
                name__icontains=query
            ) | history_list.filter(
                workitem__gibun_input__icontains=query
            ).distinct()

        return render(request, 'manning/history.html', {'history_list': history_list})
    

class ManualInputView(DetailView):
    model = ManningSession
    template_name = 'manning/manual_input.html'
    context_object_name = 'session'
    pk_url_kwarg = 'session_id' 

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        
        # 1. 일감 데이터 가져오기 (WorkItem)
        # annotate를 사용하여 '이미 배정된 시간(assigned_sum)'을 미리 계산합니다.
        items = WorkItem.objects.filter(session=self.object).annotate(
            assigned_sum=Coalesce(Sum('assignments__allocated_mh'), 0.0)
        ).order_by('id')

        # 2. 자바스크립트용 리스트로 변환
        items_list = []
        items_list.append({
            'id': item.id,
            'wo': item.work_order,
            'op': item.op,
            'desc': item.description,
            'totalMH': float(item.work_mh),
            'remainMH': float(item.work_mh)  # 초기에는 총 필요 시간이 남은 시간            
        })

        for item in items:
            # 남은 시간 = 총 필요 시간 - 이미 배정된 시간
            remain_mh = float(item.work_mh) - float(item.assigned_sum)
            
            # 남은 시간이 0보다 큰 일감만 큐에 넣습니다. (완료된 건 제외하려면)
            if remain_mh > 0:
                items_list.append({
                    'id': item.id,
                    'wo': item.work_order,
                    'op': item.op,
                    'desc': item.description,
                    'totalMH': float(item.work_mh),
                    'remainMH': remain_mh  # ★ 핵심: 계산된 잔여 시간을 넘김
                })
        
        # 3. JSON 변환 후 context에 저장
        context['items_json'] = json.dumps(items_list, cls=DjangoJSONEncoder)
        
        return context
    

class SaveManualInputView(View):
    def post(self, request, session_id):
        try:
            session = get_object_or_404(ManningSession, id=session_id)
            data = json.loads(request.body)
            assignments_list = data.get('assignments', [])

            # 트랜잭션 사용 (중간에 에러나면 전체 롤백)
            with transaction.atomic():
                # 옵션 1: 기존 배정 싹 지우고 새로 저장? (상황에 따라 다름)
                # Assignment.objects.filter(session=session, worker=...).delete() 
                # 여기서는 일단 추가(Create)하는 로직으로 짭니다.

                for item in assignments_list:
                    start_min = item['start_min']
                    end_min = item['end_min']
                    
                    # 분 -> 시간 문자열 변환 (예: 480 -> "08:00")
                    def min_to_time(m):
                        h = m // 60
                        mn = m % 60
                        return f"{h:02d}:{mn:02d}"

                    start_time = min_to_time(start_min)
                    end_time = min_to_time(end_min)
                    
                    # 1. 직비 (WorkItem 연결)
                    if item['type'] == 'DIRECT' and item['item_id']:
                        work_item = WorkItem.objects.get(id=item['item_id'])
                        
                        Assignment.objects.create(
                            session=session,
                            work_item=work_item,
                            # worker=... (현재 로그인한 작업자나 세션 주인?),
                            start_time=start_time,
                            end_time=end_time,
                            allocated_mh=(end_min - start_min) / 60.0
                        )
                        
                    # 2. 간비 (WorkItem 없음, Code만 저장)
                    elif item['type'] == 'INDIRECT':
                        # 간비를 저장하는 별도 모델이나 필드가 있어야 함
                        # 여기서는 예시로 Assignment 모델에 indirect_code 필드가 있다고 가정
                        Assignment.objects.create(
                            session=session,
                            work_item=None, # 직비 아님
                            indirect_code=item['code'], 
                            start_time=start_time,
                            end_time=end_time,
                            allocated_mh=(end_min - start_min) / 60.0
                        )

            return JsonResponse({'status': 'success'})

        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)
        

class UploadDataView(View):
    def post(self, request, pk):
        # 1. 세션 가져오기 (pk는 url의 session_id)
        session = get_object_or_404(ManningSession, pk=pk)
        
        # 2. 파일 유무 확인
        if 'file' not in request.FILES:
            print("파일이 없습니다.")
            return redirect('result_view', pk=pk)

        excel_file = request.FILES['file']
        
        try:
            # 3. 판다스로 엑셀 읽기
            # (header=0은 첫번째 줄을 제목으로 쓴다는 뜻)
            df = pd.read_excel(excel_file)
            
            # 4. 데이터 저장 (Bulk Create 사용으로 속도 최적화)
            new_items = []
            
            # 엑셀의 각 행(row)을 돌면서 객체 생성
            for index, row in df.iterrows():
                # 엑셀 데이터가 비어있을 경우 방지 (fillna 등 사용 가능하지만 간단히 get 처리)
                model_val = str(row.get('기종', ''))
                wo_val = str(row.get('WO', ''))
                op_val = str(row.get('OP', ''))
                desc_val = str(row.get('설명', ''))
                mh_val = row.get('M/H', 0)

                # 필수값이 없으면 건너뛰기 (선택사항)
                if not wo_val: 
                    continue

                new_items.append(WorkItem(
                    session=session,
                    model_type=model_val,  # ★ 기종 정보 저장
                    work_order=wo_val,
                    op=op_val,
                    description=desc_val,
                    work_mh=float(mh_val) if mh_val else 0.0
                ))
            
            # 5. DB에 한 번에 저장 (속도가 훨씬 빠름)
            with transaction.atomic():
                WorkItem.objects.bulk_create(new_items)
                
        except Exception as e:
            print(f"엑셀 업로드 중 오류 발생: {e}")
            # 필요하다면 에러 메시지를 사용자에게 전달하는 로직 추가 가능
        
        # 6. 저장 후 결과 페이지로 이동
        return redirect('result_view', pk=pk)
    

