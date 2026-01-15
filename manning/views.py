from datetime import timedelta
import math
import traceback
from django import forms
import pandas as pd
import json
from django.db import transaction
from django.db.models import Q, Sum
from django.forms import modelformset_factory
from django.http import JsonResponse 
from django.shortcuts import render, get_object_or_404, redirect
from django.urls import reverse, reverse_lazy
from django.utils import timezone
from django.views import View
from django.views.generic import DetailView
from django.contrib import messages

from manning.utils import ScheduleCalculator
from .models import WorkSession, Worker, WorkItem, Assignment, TaskMaster
from .forms import WorkItemForm, DirectWorkItemForm, WorkerIndirectForm
from .services import run_auto_assign, refresh_worker_totals
from .models import Assignment, TaskMaster, WorkSession, Worker, WorkItem
from .models import WorkSession as ManningSession

from django.views.decorators.clickjacking import xframe_options_sameorigin 
from django.utils.decorators import method_decorator


class HomeView(View):
    def get(self, request):
        today = timezone.now().date()
        
        # 1. 오늘 활성화된(is_active=True) 세션들을 다 가져옵니다.
        # { 'Session 1': 세션객체, 'Session 3': 세션객체 ... } 형태로 만듭니다.
        # 모든 활성 세션을 가져오도록 변경 (날짜 제한 제거)
        active_sessions_qs = WorkSession.objects.filter(is_active=True)
        active_sessions = list(active_sessions_qs)
        # 이름별 개수 카운트 (동일 이름이 여러 개 있는지 판단)
        name_counts = {}
        for s in active_sessions:
            name_counts[s.name] = name_counts.get(s.name, 0) + 1
        # 같은 이름의 세션이 여러 개일 수 있으므로, 일감(WorkItem)이 존재하는 세션을 우선하도록 선택
        active_map = {}
        for s in active_sessions:
            name = s.name
            if name not in active_map:
                active_map[name] = s
            else:
                # 이미 같은 이름의 세션이 있으면 일감 수가 더 많은 쪽을 우선
                try:
                    current_count = active_map[name].workitem_set.count()
                    new_count = s.workitem_set.count()
                except Exception:
                    current_count = 0
                    new_count = 0

                if new_count > current_count:
                    active_map[name] = s

        # 2. 1번~8번 방의 상태를 정리합니다.
        dashboard_slots = []
        for i in range(1, 9):
            name = f"Session {i}"
            if name in active_map:
                session_obj = active_map[name]
                worker_count = session_obj.worker_set.count()
                # 간비(보조 업무)는 작업 건수 집계에서 제외합니다.
                item_count = session_obj.workitem_set.exclude(work_order='간비').count()
                dashboard_slots.append({
                    'name': name,
                    'status': 'active',
                    'session_id': session_obj.id,
                    'multiple': name_counts.get(name, 0) > 1,
                    'info': f"작업자 {worker_count}명 / 일감 {item_count}개"
                })
            else:
                dashboard_slots.append({
                    'name': name,
                    'status': 'empty',
                    'session_id': None,
                    'info': '대기 중'
                })

        # 3. 지난 7일간 기록 카운트 (통계용)
        cutoff = timezone.now() - timedelta(days=7)
        history_count = WorkSession.objects.filter(is_active=False, created_at__gte=cutoff).count()

        context = {
            'today': today,
            'dashboard_slots': dashboard_slots,
            'active_count': sum(1 for slot in dashboard_slots if slot['status'] == 'active'),
            'total_active_sessions': len(active_sessions),
            'history_count': history_count
        }
        return render(request, 'manning/home.html', context)


class SelectSessionView(View):
    def get(self, request, name):
        # list all active sessions with this slot name so user can choose which one to open
        sessions = WorkSession.objects.filter(name=name, is_active=True).order_by('-created_at')
        
        # 각 세션에 대한 일감 수를 계산하여 추가합니다.
        for session in sessions:
            session.item_count = session.workitem_set.exclude(work_order='간비').count()
            
        return render(request, 'manning/select_session.html', {'sessions': sessions, 'slot_name': name})


class CreateSessionView(View):
    def get(self, request):
        # 파라미터로 slot이 넘어오면 템플릿에 전달 (자동 선택용)
        slot = request.GET.get('slot', '')
        return render(request, 'manning/create_session.html', {'slot': slot})

    def post(self, request):
        session_name = request.POST.get('session_name') or 'Session'
        worker_names = request.POST.get('worker_names', '')
        # [추가] HTML의 hidden input에서 기번 리스트 가져오기
        gibun_input = request.POST.get('gibun_input', '') 

        # 1. 세션 이름 중복 처리 (Session A (1), Session A (2)...)
        base_name = session_name
        new_name = base_name
        i = 1
        while WorkSession.objects.filter(name=new_name, is_active=True).exists():
            new_name = f"{base_name} ({i})"
            i += 1

        # 2. 세션 생성
        with transaction.atomic():
            session = WorkSession.objects.create(name=new_name)
            
            # 3. 작업자 생성
            names = [n.strip() for n in worker_names.replace('\r', '').split('\n') if n.strip()]
            # 중복 이름 제거
            names = list(set(names))
            for name in names:
                Worker.objects.create(session=session, name=name)

            # 4. [핵심] 입력된 기번으로 일감(WorkItem) 생성
            if gibun_input:
                # 콤마로 구분된 기번들을 리스트로 변환 (예: "HL7777,HL8200")
                gibuns = [g.strip() for g in gibun_input.split(',') if g.strip()]
                
                created_count = 0
                for gibun in gibuns:
                    # 해당 기번(또는 기종)과 일치하는 마스터 데이터 찾기
                    masters = TaskMaster.objects.filter(gibun_code=gibun)
                    
                    if masters.exists():
                        # 마스터 데이터가 있으면 그 정보대로 일감 생성
                        for tm in masters:
                            WorkItem.objects.create(
                                session=session,
                                task_master=tm,
                                gibun_input=gibun,  # 사용자가 입력한 값
                                model_type=tm.gibun_code, # 마스터의 기종/기번
                                work_order=tm.work_order,
                                op=tm.op,
                                description=tm.description,
                                work_mh=tm.default_mh
                            )
                            created_count += 1
                    else:
                        # 마스터 데이터가 없으면? 빈 껍데기라도 생성해서 알려줌
                        WorkItem.objects.create(
                            session=session,
                            gibun_input=gibun,
                            model_type=gibun,
                            work_order="정보 없음",
                            description="마스터 데이터가 없습니다. 수정 필요",
                            work_mh=0.0
                        )
                        created_count += 1

        messages.success(request, f'세션이 생성되었습니다. (일감 {created_count}개 추가됨)')
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


class EditAllView(View):
    """Combined edit page: session info, manage items (formset), paste input and upload."""
    def get(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)

        # session/edit form data
        worker_names = "\n".join([w.name for w in session.worker_set.all()])

        # manage items formset
        WorkItemFormSet = modelformset_factory(WorkItem, form=WorkItemForm, extra=3, can_delete=True)
        formset = WorkItemFormSet(queryset=WorkItem.objects.filter(session=session))

        context = {
            'session': session,
            'worker_names_str': worker_names,
            'formset': formset,
        }
        return render(request, 'manning/edit_all.html', context)
    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        WorkItemFormSet = modelformset_factory(WorkItem, form=WorkItemForm, extra=3, can_delete=True)
        formset = WorkItemFormSet(request.POST, request.FILES, queryset=WorkItem.objects.filter(session=session))

        # Default: save changes (and deletions)
        if formset.is_valid():
            instances = formset.save(commit=False)
            for inst in instances:
                if not inst.session_id:
                    inst.session = session
                inst.save()
            for obj in formset.deleted_objects:
                obj.delete()

            messages.success(request, '변경사항이 저장되었습니다.')
            return redirect('edit_all', session_id=session.id)
        else:
            messages.error(request, '입력값에 오류가 있습니다. 다시 확인하세요.')
            return render(request, 'manning/edit_all.html', {'session': session, 'formset': formset, 'worker_names_str': "\n".join([w.name for w in session.worker_set.all()])})

        # Default: save changes (and deletions)
        instances = formset.save(commit=False)
        for inst in instances:
            if not inst.session_id:
                inst.session = session
            inst.save()
        for obj in formset.deleted_objects:
            obj.delete()

        messages.success(request, '변경사항이 저장되었습니다.')
        return redirect('edit_all', session_id=session.id)
    

# 3. 배정 실행 및 결과 보기 (ResultView)
class ResultView(View):
    # GET: 결과를 보여줘!
    def get(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)

        # [추가] 화면을 그리기 전에, 누적 시간을 최신 상태로 갱신!
        refresh_worker_totals(session)
        # optional worker filter (by name)
        filter_worker = request.GET.get('worker')

        # base items queryset with assignments prefetched
        items_qs = session.workitem_set.all().prefetch_related('assignments__worker')
        if filter_worker:
            items_qs = items_qs.filter(assignments__worker__name=filter_worker).distinct()

        # 화면에 보여줄 데이터 묶음
        # 빈 `gibun_input`이 있을 경우, 서버에서 `task_master.gibun_code`로 대체하여 템플릿에 전달합니다.
        items = list(items_qs)
        for it in items:
            # 우선: gibun_input이 비어있다면 task_master의 gibun_code로 채워봄
            if (not getattr(it, 'gibun_input', None) or str(getattr(it, 'gibun_input', '')).strip() == ''):
                # 1) TaskMaster가 연결된 경우 그것의 gibun_code 사용
                if getattr(it, 'task_master', None):
                    try:
                        it.gibun_input = it.task_master.gibun_code
                        continue
                    except Exception:
                        pass

                # 2) task_master가 없고 model_type에 값이 있으면 그 값을 대체값으로 사용
                if getattr(it, 'model_type', None):
                    try:
                        it.gibun_input = it.model_type
                    except Exception:
                        pass

        print("[DEBUG] Items in ResultView:", items)  # 디버깅 메시지 추가

        context = {
            'session': session,
            'workers': session.worker_set.all(), # 작업자 명단
            'items': items, # 일감 목록 (필터 적용 가능)
            'filter_worker': filter_worker or ''
        }
        return render(request, 'manning/result_view.html', context)

    # POST: 배정 로봇을 실행해! (버튼 눌렀을 때)
    def post(self, request, session_id):
        # 로봇 가동!
        run_auto_assign(session_id)
        
        messages.success(request, "자동 배정이 완료되었습니다! 🤖")
        # 같은 페이지를 다시 보여줘서 결과 확인
        return redirect('result_view', session_id=session_id)
    

# views.py

class EditItemView(View):
    # [GET] 수정 화면 보여주기
    def get(self, request, item_id):
        # 1. 수정할 아이템 가져오기
        item = get_object_or_404(WorkItem, id=item_id)
        
        # 2. 세션의 모든 작업자 가져오기 (수동 배정용)
        all_workers = item.session.worker_set.all().order_by('name')
        
        # 3. 현재 이 작업에 배정된 작업자 ID들 (체크박스 미리 체크용)
        assigned_worker_ids = item.assignments.values_list('worker_id', flat=True)

        context = {
            'item': item,
            'all_workers': all_workers,
            'assigned_ids': assigned_worker_ids
        }
        return render(request, 'manning/edit_item.html', context)

    # [POST] 수정 내용 저장하기
    def post(self, request, item_id):
        item = get_object_or_404(WorkItem, id=item_id)

        # 1. 텍스트 정보 수정
        item.model_type = request.POST.get('model_type', '')
        item.work_order = request.POST.get('work_order')
        item.op = request.POST.get('op')
        item.description = request.POST.get('description')
        item.work_mh = float(request.POST.get('work_mh') or 0)
        
        # 2. 수동 배정 처리 (작업자 체크박스)
        selected_ids = request.POST.getlist('worker_ids') # 선택된 작업자 ID들

        # 기존 배정 내역 삭제 (새로 덮어쓰기 위함)
        item.assignments.all().delete()

        if selected_ids:
            # 작업자를 선택했다면 -> 수동 모드(is_manual=True)로 설정
            item.is_manual = True
            
            # 시간 N등분 (총시간 / 사람수)
            share_mh = round(item.work_mh / len(selected_ids), 2)
            
            for w_id in selected_ids:
                worker = Worker.objects.get(id=w_id)
                Assignment.objects.create(
                    work_item=item,
                    worker=worker,
                    allocated_mh=share_mh
                )
        else:
            # 작업자를 아무도 선택 안 했다면 -> 자동 배정 대상(is_manual=False)으로 변경
            item.is_manual = False
        
        item.save()
        
        messages.success(request, f"'{item.work_order}' 작업이 수정되었습니다.")
        
        # 수정 후 다시 결과 화면(result_view)으로 복귀
        return redirect('result_view', session_id=item.session.id)
    


class ManageItemsView(View):
    def get(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        
        workers = session.worker_set.all().order_by('name')
        worker_names = "\n".join([f"{w.name}:{w.limit_mh}" for w in workers])

        # 1. 직비 폼셋 (WO가 '간비'가 아닌 것들)
        # NOTE: 'gibun_input'을 포함하여 GET/POST에서 필드 정의를 일치시킵니다.
        DirectFormSet = modelformset_factory(
            WorkItem, form=DirectWorkItemForm,
            extra=3, can_delete=True
        )
        # 쿼리셋: '간비' 제외
        direct_qs = WorkItem.objects.filter(session=session).exclude(work_order='간비')
        direct_formset = DirectFormSet(queryset=direct_qs, prefix='direct')

        
        return render(request, 'manning/manage_items.html', {
            'session': session,
            'worker_names_str': worker_names,
            'direct_formset': direct_formset,     # 직비용
            'workers': workers
        })

    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)

        # 2. 직비 폼셋 (fields에 'gibun_input' 추가!)
        DirectFormSet = modelformset_factory(
            WorkItem, 
            # ★ 여기에 'gibun_input'을 꼭 추가해야 입력받아 저장할 수 있습니다.
            fields=('gibun_input', 'model_type', 'work_order', 'op', 'description', 'work_mh'),
            extra=3, can_delete=True
        )
        direct_formset = DirectFormSet(
            request.POST, request.FILES, 
            queryset=WorkItem.objects.filter(session=session).exclude(work_order='간비'),
            prefix='direct'
        )

        if direct_formset.is_valid():
            
            # --- (A) 직비 저장 ---
            instances = direct_formset.save(commit=False)
            for obj in instances:
                obj.session = session
                
                # ★ [에러 해결 핵심] 기번이 비어있으면 빈 문자열로 채움
                if not obj.gibun_input:
                    obj.gibun_input = "" 
                
                obj.save()

            for obj in direct_formset.deleted_objects:
                obj.delete()

            messages.success(request, '✅ 저장되었습니다.')
            return redirect('result_view', session_id=session.id)
        
        else:
            print("❌ 직비 에러:", direct_formset.errors)
            messages.error(request, '입력값에 오류가 있습니다.')
            
            workers = session.worker_set.all().order_by('name')
            return render(request, 'manning/manage_items.html', {
                'session': session,
                'direct_formset': direct_formset,
                # 'indirect_formset': indirect_formset, <-- 제거
                'workers': workers,
                'worker_names_str': request.POST.get('worker_limits', '')
            })


class PasteDataView(View):
    """
    네비게이션 바의 '데이터 등록' 메뉴.
    세션과 관계없이 '기번 마스터(TaskMaster)' 데이터를 일괄 등록/수정하는 페이지입니다.
    """
    def get(self, request):
        # 저장된 마스터 데이터를 기번 순으로 정렬해서 보여줌
        taskmasters = TaskMaster.objects.all().order_by('gibun_code')
        return render(request, 'manning/paste_input.html', {'taskmasters': taskmasters})

    def post(self, request):
        # 1. 입력된 텍스트 가져오기
        raw_data = request.POST.get('excel_data', '')

        if not raw_data:
            messages.warning(request, "입력된 데이터가 없습니다.")
            return redirect('paste_data')

        lines = raw_data.strip().split('\n')
        saved_count = 0
        
        # 2. 데이터 한 줄씩 분석 (파싱)
        with transaction.atomic():
            for idx, line in enumerate(lines):
                line = line.strip()
                if not line: continue
                
                # 헤더(제목) 줄 건너뛰기
                if idx == 0 and ('기번' in line or 'WO' in line or 'Work Order' in line):
                    continue
                
                columns = line.split('\t')
                if len(columns) < 2: continue # 데이터가 너무 적으면 패스

                try:
                    # 엑셀 컬럼 순서: 기번 | WO | OP | 설명 | M/H
                    model_val = columns[0].strip()
                    wo_val    = columns[1].strip() if len(columns) > 1 else ''
                    op_val    = columns[2].strip() if len(columns) > 2 else ''
                    desc_val  = columns[3].strip() if len(columns) > 3 else ''
                    mh_str    = columns[4].strip() if len(columns) > 4 else ''
                    
                    if mh_str == '': mh_val = 0.0
                    else:
                        try: mh_val = float(mh_str)
                        except ValueError: mh_val = 0.0

                    if wo_val:
                        # 3. TaskMaster 테이블에 저장 (이미 있으면 업데이트, 없으면 생성)
                        TaskMaster.objects.update_or_create(
                            work_order=wo_val,
                            op=op_val,
                            defaults={
                                'gibun_code': model_val,
                                'description': desc_val,
                                'default_mh': mh_val
                            }
                        )
                        saved_count += 1

                except Exception as e:
                    print(f"Error parsing line {idx}: {e}")
                    continue

        if saved_count > 0:
            messages.success(request, f"✅ 총 {saved_count}건의 마스터 데이터가 등록되었습니다.")
            # [수정] 저장이 잘 되었으면 'home'으로 이동
            return redirect('home')
        else:
            messages.warning(request, "저장된 데이터가 없습니다. 형식을 확인해주세요.")
            # 실패했으면 다시 시도할 수 있게 현재 페이지 유지
            return redirect('paste_data')
    
        

class UndoDeleteView(View):
    def post(self, request):
        last_list = request.session.get('last_deleted_items')
        if not last_list:
            messages.error(request, "복원할 삭제 항목이 없습니다.")
            return redirect('home')

        # all items belong to same session (we stored session_id per item)
        session_id = last_list[0].get('session_id')
        session = get_object_or_404(WorkSession, id=session_id)

        recreated = 0
        for last in last_list:
            task_master = None
            tm_id = last.get('task_master_id')
            if tm_id:
                try:
                    task_master = TaskMaster.objects.get(id=tm_id)
                except TaskMaster.DoesNotExist:
                    task_master = None

            WorkItem.objects.create(
                session=session,
                task_master=task_master,
                gibun_input=last.get('gibun_input', ''),
                model_type=last.get('model_type', ''),
                work_order=last.get('work_order', ''),
                op=last.get('op', ''),
                description=last.get('description', ''),
                work_mh=last.get('work_mh', 0.0)
            )
            recreated += 1

        # clear stored list
        try:
            del request.session['last_deleted_items']
            request.session.modified = True
        except KeyError:
            pass

        messages.success(request, f"{recreated}개의 삭제 항목을 복원했습니다.")
        return redirect('result_view', session_id=session.id)
    

class UpdateLimitsView(View):
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
        return redirect('home')

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
    

class SaveManualInputView(View):
    def post(self, request, pk):
        try:
            # 1. 세션 가져오기 (ManningSession -> WorkSession으로 변경하여 안전성 확보)
            session = get_object_or_404(WorkSession, id=pk)
            
            # 2. JSON 데이터 파싱
            try:
                data = json.loads(request.body)
            except json.JSONDecodeError:
                print("❌ JSON 파싱 실패: request.body가 비어있거나 잘못된 형식입니다.")
                return JsonResponse({'status': 'error', 'message': 'Invalid JSON format'}, status=400)

            assignments_list = data.get('assignments', [])
            
            created = 0
            skipped = 0
            
            # 3. 요청된 작업에 포함된 '작업자 ID' 수집
            target_worker_ids = set()
            for item in assignments_list:
                w_id = item.get('worker_id')
                if w_id:
                    target_worker_ids.add(w_id)

            with transaction.atomic():
                # [중요] 해당 세션의 *전체*가 아니라, *수정하려는 작업자*의 기존 배정만 삭제
                if target_worker_ids:
                    Assignment.objects.filter(
                        work_item__session=session, 
                        worker_id__in=target_worker_ids
                    ).delete()

                for item in assignments_list:
                    start_min = item.get('start_min')
                    end_min = item.get('end_min')
                    
                    # 시간이 없으면 스킵
                    if start_min is None or end_min is None:
                        skipped += 1
                        continue

                    allocated = (end_min - start_min) / 60.0
                    worker_id = item.get('worker_id')
                    code_val = item.get('code')

                    # 작업자 객체 찾기
                    worker_obj = None
                    if worker_id:
                        worker_obj = Worker.objects.filter(id=worker_id, session=session).first()
                    
                    # INDIRECT(간비) 항목 처리
                    if item.get('type') == 'INDIRECT':
                        if not code_val: # 코드가 없으면 생성 불가
                            skipped += 1
                            continue
                            
                        # 간비용 WorkItem 생성 (항상 새로 생성)
                        wi = WorkItem.objects.create(
                            session=session,
                            work_order='간비',
                            op='',
                            description=str(code_val),
                            work_mh=allocated,
                            is_manual=True
                        )
                        
                        # 작업자가 없으면(전체 배정 등에서 누락 시) 가상의 '(간비)' 작업자 생성/사용
                        if not worker_obj:
                            worker_obj, _ = Worker.objects.get_or_create(session=session, name='(간비)')

                        Assignment.objects.create(
                            work_item=wi,
                            worker=worker_obj,
                            allocated_mh=allocated,
                            start_min=start_min,
                            end_min=end_min,
                            code=code_val
                        )
                        created += 1
                        
                    # DIRECT(직비) 항목 처리    
                    else: 
                        # 직비는 work_item 찾기/생성 로직이 필요하지만
                        # 현재 팝업에서는 주로 '간비'나 '시간표 수정' 용도로 사용되므로
                        # 필요한 경우 여기에 로직을 추가합니다.
                        pass

            # 4. 저장 후 집계 갱신 (에러 나도 저장은 취소되지 않도록 try 감싸기)
            try:
                from .services import refresh_worker_totals
                refresh_worker_totals(session)
            except Exception as e:
                print(f"⚠️ 집계 갱신 중 오류 (무시됨): {e}")

            return JsonResponse({'status': 'success', 'created': created, 'skipped': skipped})

        except Exception as e:
            # ★ 에러 내용을 터미널에 출력 (디버깅용)
            print("❌ SaveManualInputView 에러 발생:")
            traceback.print_exc()
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
        return redirect('result_view', session_id=pk)
    

class PasteInputView(View):
    # 화면 보여주기
    def get(self, request, pk):
        session = get_object_or_404(ManningSession, pk=pk)
        taskmasters = TaskMaster.objects.all().order_by('gibun_code')
        return render(request, 'manning/paste_input.html', {'session': session, 'taskmasters': taskmasters})

    # 저장하기 버튼 눌렀을 때
    def post(self, request, pk):
        # 1. 세션 찾기 (없으면 404 에러)
        session = get_object_or_404(ManningSession, pk=pk)
        
        # 2. 데이터 가져오기
        raw_data = request.POST.get('excel_data', '')

        # 3. 데이터가 없으면? 경고 메시지 띄우고 바로 홈으로 이동 (에러 방지)
        if not raw_data:
            messages.warning(request, "입력된 데이터가 없어서 홈으로 돌아갑니다.")
            return redirect('home')

        new_items = []
        lines = raw_data.strip().split('\n')
        
        # 4. 데이터 파싱 (분석)
        for idx, line in enumerate(lines):
            line = line.strip()
            if not line: continue
            
            # 첫 번째 줄이 헤더인 경우 건너뛰기 (기번, Work Order 등)
            if idx == 0 and ('기번' in line or 'work order' in line.lower() or 'wo' in line.lower()):
                continue
            
            columns = line.split('\t')
            if len(columns) < 2: continue # 데이터 부족하면 패스

            try:
                # 데이터 추출
                model_val = columns[0].strip()
                wo_val    = columns[1].strip() if len(columns) > 1 else ''
                op_val    = columns[2].strip() if len(columns) > 2 else ''
                desc_val  = columns[3].strip() if len(columns) > 3 else ''
                mh_str    = columns[4].strip() if len(columns) > 4 else ''
                
                # M/H 숫자로 변환 (헤더인 경우 저장 안함)
                if mh_str == '': mh_val = 0.0
                else:
                    try: mh_val = float(mh_str)
                    except ValueError: continue 

                if wo_val:
                    # TaskMaster 업데이트 또는 생성
                    task_master, created = TaskMaster.objects.update_or_create(
                        work_order=wo_val,
                        op=op_val,
                        defaults={
                            'gibun_code': model_val,
                            'description': desc_val,
                            'default_mh': mh_val
                        }
                    )

                    new_items.append(WorkItem(
                        session=session,
                        task_master=task_master, # TaskMaster 연결
                        model_type=model_val,
                        work_order=wo_val,
                        op=op_val,
                        description=desc_val,
                        work_mh=mh_val
                    ))
            except Exception as e:
                print(f"Error processing line: {line}, Error: {e}")
                continue

        # 5. DB 저장
        if new_items:
            with transaction.atomic():
                WorkItem.objects.bulk_create(new_items)
            messages.success(request, f"✅ {len(new_items)}건 저장 완료!")
        else:
            messages.warning(request, "저장할 유효한 데이터가 없습니다.")

        # ★★★ [핵심] 모든 처리가 끝나면 무조건 홈으로 이동 ★★★
        return redirect('home')
    

class AssignedSummaryView(View):
    def get(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)

        # 1. 세션에 속한 모든 작업자 가져오기
        workers = session.worker_set.all().order_by('name')
        workers_schedule = []

        for w in workers:
            # 2. 해당 작업자의 모든 배정 내역 가져오기 (WorkItem 정보 포함)
            # select_related로 DB 쿼리 최적화
            assigns = Assignment.objects.filter(
                work_item__session=session, 
                worker=w
            ).select_related('work_item')

            # ---------------------------------------------------------
            # [수정 1] 총 할당 시간 (Total MH) 계산
            # start_min(시작시간) 유무와 상관없이, 배정된 시간(allocated_mh)을 모두 더함
            # ---------------------------------------------------------
            total_mh_agg = assigns.aggregate(total=Sum('allocated_mh'))
            total_mh = total_mh_agg['total'] or 0.0

            # ---------------------------------------------------------
            # [수정 2] 작업 건수 (Task Count) 계산
            # '간비'는 제외하고, 실제 작업(WorkItem)의 개수만 셈
            # ---------------------------------------------------------
            task_count = assigns.filter(
                work_item__isnull=False
            ).exclude(
                work_item__work_order='간비'
            ).values('work_item').distinct().count()

            # 3. 시간표 시각화 데이터 준비 (ScheduleCalculator용)
            # 여기서는 시간표를 그리기 위한 데이터 리스트를 만듭니다.
            task_list = []
            for a in assigns:
                if a.work_item:
                    # 간비인 경우 코드를 설명으로 사용
                    desc = a.code if a.code else a.work_item.description
                    
                    task_list.append({
                        'wo': a.work_item.work_order,
                        'op': a.work_item.op,
                        'desc': desc,
                        'mh': float(a.allocated_mh),
                    })

            # 4. 시간표 계산기 실행 (막대 그래프용 데이터 생성)
            schedule = []
            if task_list:
                try:
                    # utils.py에 있는 계산기
                    calc = ScheduleCalculator(task_list)
                    schedule = calc.calculate()
                except Exception:
                    schedule = []

            # 5. 최종 데이터 리스트에 추가
            workers_schedule.append({
                'worker': w,
                'worker_name': w.name,
                'total_mh': round(total_mh, 1), # 소수점 1자리 반올림
                'task_count': task_count,
                'schedule': schedule,
            })

        context = {
            'session': session, 
            'workers_schedule': workers_schedule
        }
        return render(request, 'manning/assigned_summary.html', context)
    

class AssignedDetailView(View):
    def get(self, request, session_id, worker_id):
        session = get_object_or_404(WorkSession, id=session_id)
        worker = get_object_or_404(Worker, id=worker_id, session=session)
        # Redirect into result_view page with worker name as query param so
        # the final result page shows only that worker's assigned rows.
        from django.urls import reverse
        url = reverse('result_view', args=[session.id]) + f'?worker={worker.name}'
        return redirect(url)


def format_min_to_time(minutes):
    if minutes is None: return ""
    import math
    h = math.floor(minutes / 60)
    m = int(minutes % 60)
    return f"{h:02d}:{m:02d}"


class PersonalScheduleView(DetailView):
    model = WorkSession # 상단 import 확인: .models import WorkSession (ManningSession -> WorkSession)
    template_name = 'manning/personal_schedule.html'
    context_object_name = 'session'
    pk_url_kwarg = 'session_id'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        worker_id = self.request.GET.get('worker_id')
        
        if worker_id:
            assignments = Assignment.objects.filter(
                work_item__session=self.object,
                worker_id=worker_id
            ).select_related('work_item', 'worker').order_by('id')
            
            fixed_schedule = []   # 고정된 일정 (결과 화면용)
            occupied_slots = []   # 계산기에게 알려줄 '예약된 시간' 정보
            floating_tasks = []   # 계산기가 배치해야 할 작업들
            
            total_mh = 0.0
            worker_name = ""

            for a in assignments:
                if not worker_name: worker_name = a.worker.name
                mh = float(a.allocated_mh)
                total_mh += mh
                
                # 화면 표시 텍스트 정리
                if a.work_item.work_order == '간비':
                    wo_disp = "간비"
                    desc_disp = a.work_item.description
                else:
                    wo_disp = a.work_item.work_order
                    desc_disp = a.work_item.description

                # [분기] 고정 시간이 있느냐?
                if a.start_min is not None and a.end_min is not None:
                    # 1. 화면에 보여줄 고정 리스트에 추가
                    fixed_schedule.append({
                        'wo': wo_disp,
                        'op': a.work_item.op,
                        'desc': desc_disp,
                        'mh': mh,
                        'start_str': format_min_to_time(a.start_min),
                        'end_str': format_min_to_time(a.end_min),
                        'start_min': a.start_min,
                        'is_fixed': True
                    })
                    # 2. [핵심] 계산기용 '예약석' 리스트에도 추가
                    occupied_slots.append({
                        'start': a.start_min,
                        'end': a.end_min
                    })
                else:
                    # 유동 작업
                    floating_tasks.append({
                        'wo': wo_disp,
                        'op': a.work_item.op,
                        'desc': desc_disp,
                        'mh': mh
                    })

            # 3. 계산기 실행 (유동 작업 + 예약석 정보 전달)
            calculated_schedule = []
            if floating_tasks:
                try:
                    # occupied_slots를 인자로 넘깁니다!
                    calc = ScheduleCalculator(floating_tasks, occupied_slots=occupied_slots)
                    calculated_schedule = calc.calculate()
                except Exception as e:
                    print(f"스케줄 계산 오류: {e}")
                    calculated_schedule = []

            # 4. 결과 합치기 및 정렬
            final_schedule = fixed_schedule + calculated_schedule
            final_schedule.sort(key=lambda x: x.get('start_min') if x.get('start_min') is not None else 9999)

            context['schedule'] = final_schedule
            context['worker_name'] = worker_name
            context['worker_id'] = int(worker_id)
            context['total_mh'] = round(total_mh, 1)
            context['task_count'] = len(final_schedule)
            
        return context
    

class DeleteTaskMasterView(View):
    def post(self, request, pk):
        try:
            task = get_object_or_404(TaskMaster, pk=pk)
            task.delete()
            messages.success(request, f"데이터 '{task.work_order}'가 삭제되었습니다.")
        except Exception as e:
            messages.error(request, f"삭제 중 오류가 발생했습니다: {e}")
        
        return redirect(request.META.get('HTTP_REFERER', 'paste_data'))


class DeleteAllTaskMastersView(View):
    def post(self, request):
        try:
            count = TaskMaster.objects.all().count()
            TaskMaster.objects.all().delete()
            messages.success(request, f"총 {count}개의 모든 데이터가 삭제되었습니다.")
        except Exception as e:
            messages.error(request, f"삭제 중 오류가 발생했습니다: {e}")

        return redirect(request.META.get('HTTP_REFERER', 'paste_data'))
    

# 시간 변환 헬퍼 (분 -> HHMM)
def min_to_hhmm(minutes):
    if minutes is None: return ""
    try:
        minutes = int(minutes)
        h = math.floor(minutes / 60)
        m = int(minutes % 60)
        return f"{h:02d}{m:02d}"
    except:
        return ""

# 시간 변환 헬퍼 (HHMM -> 분)
def hhmm_to_min(time_str):
    if not time_str: return None
    time_str = str(time_str).strip()
    if len(time_str) < 3: return None
    try:
        h = int(time_str[:2])
        m = int(time_str[2:])
        return h * 60 + m
    except ValueError:
        return None
    

@method_decorator(xframe_options_sameorigin, name='dispatch') # [핵심] iframe 안에서 열리도록 허용
class WorkerIndirectView(View):
    def get(self, request, session_id, worker_id):
        session = get_object_or_404(WorkSession, id=session_id)
        worker = get_object_or_404(Worker, id=worker_id)

        # 1. 해당 작업자의 간비 항목 조회
        queryset = WorkItem.objects.filter(
            session=session,
            work_order='간비',
            assignments__worker=worker
        ).distinct()

        # 2. 폼셋 생성 (WorkerIndirectForm 사용)
        IndirectFormSet = modelformset_factory(
            WorkItem, 
            form=WorkerIndirectForm, 
            extra=1, 
            can_delete=True
        )
        
        formset = IndirectFormSet(queryset=queryset)

        # 3. 기존 데이터가 있으면 시작/종료 시간 채워넣기
        for form in formset:
            if form.instance.pk:
                # 안전하게 배정 정보 가져오기 (filter().first() 사용)
                assign = Assignment.objects.filter(work_item=form.instance, worker=worker).first()
                if assign:
                    form.fields['start_time'].initial = min_to_hhmm(assign.start_min)
                    form.fields['end_time'].initial = min_to_hhmm(assign.end_min)

        return render(request, 'manning/worker_indirect_form.html', {
            'session': session,
            'worker': worker,
            'formset': formset
        })

    def post(self, request, session_id, worker_id):
        session = get_object_or_404(WorkSession, id=session_id)
        worker = get_object_or_404(Worker, id=worker_id)

        queryset = WorkItem.objects.filter(
            session=session,
            work_order='간비',
            assignments__worker=worker
        ).distinct()

        IndirectFormSet = modelformset_factory(
            WorkItem, form=WorkerIndirectForm, extra=1, can_delete=True
        )

        formset = IndirectFormSet(request.POST, queryset=queryset)

        if formset.is_valid():
            instances = formset.save(commit=False)
            
            # 저장된 폼들을 순회하며 처리
            for form in formset.forms:
                # 삭제 체크된 경우
                if form in formset.deleted_forms:
                    if form.instance.pk:
                        form.instance.delete()
                    continue
                
                # 빈 폼이면 패스
                if not form.has_changed() and not form.instance.pk:
                    continue

                # WorkItem 저장
                item = form.save(commit=False)
                item.session = session
                item.work_order = '간비'
                item.op = ''
                item.is_manual = True
                if not item.gibun_input: item.gibun_input = ""
                item.save()

                # 시간 변환
                start_val = form.cleaned_data.get('start_time')
                end_val = form.cleaned_data.get('end_time')
                start_m = hhmm_to_min(start_val)
                end_m = hhmm_to_min(end_val)

                # Assignment 연결 및 저장
                assign, _ = Assignment.objects.get_or_create(
                    work_item=item,
                    worker=worker
                )
                assign.allocated_mh = item.work_mh
                assign.start_min = start_m
                assign.end_min = end_m
                assign.save()

            # 총 시간 갱신
            refresh_worker_totals(session)
            
            return render(request, 'manning/worker_indirect_close.html')

        else:
            # 폼 에러 시 디버깅용 출력
            print("폼 에러 발생:", formset.errors)

        return render(request, 'manning/worker_indirect_form.html', {
            'session': session,
            'worker': worker,
            'formset': formset
        })