from datetime import timedelta
import math, json, re
import traceback
from django import forms
import pandas as pd
from django.db import transaction
from django.db.models import Q, Sum, Count, Max
from django.forms import modelformset_factory
from django.http import JsonResponse 
from django.shortcuts import render, get_object_or_404, redirect
from django.urls import reverse, reverse_lazy
from django.utils import timezone
from django.views import View
from django.views.generic import DetailView
from django.contrib import messages
from django.views.decorators.http import require_POST

from config import settings
from manning.utils import ScheduleCalculator, format_min_to_time, get_adjusted_min
from .models import WorkSession, Worker, WorkItem, Assignment, TaskMaster, GibunPriority
from .forms import ManageItemForm, WorkItemForm, DirectWorkItemForm, WorkerIndirectForm
from .services import run_auto_assign, refresh_worker_totals
from .models import Assignment, TaskMaster, WorkSession, Worker, WorkItem
from .models import WorkSession as ManningSession

from django.views.decorators.clickjacking import xframe_options_sameorigin 
from django.utils.decorators import method_decorator

from manning import models


# -----------------------------------------------------------
# 1. [핵심] 인증 체크용 Mixin 클래스 (보안관)
# -----------------------------------------------------------
class SimpleLoginRequiredMixin:
    """
    이 클래스를 상속받으면 로그인 여부를 자동으로 검사합니다.
    로그인이 안 되어 있으면 로그인 페이지로 튕겨냅니다.
    """
    def dispatch(self, request, *args, **kwargs):
        if not request.session.get('is_authenticated'):
            return redirect('login')  # 로그인 페이지 URL name
        return super().dispatch(request, *args, **kwargs)

# -----------------------------------------------------------
# 2. 로그인 뷰 (Class-Based View)
# -----------------------------------------------------------
class SimpleLoginView(View):
    def get(self, request):
        if request.session.get('is_authenticated'):
            return redirect('index')
        return render(request, 'manning/login.html')

    def post(self, request):
        password = request.POST.get('password')
        
        # 1. 관리자 비밀번호 확인 (편집 권한 있음)
        if password == settings.SIMPLE_PASSWORD_ADMIN:
            request.session['is_authenticated'] = True
            request.session['user_role'] = 'admin'
            return redirect('index')
            
        # 2. 일반 사용자 비밀번호 확인 (조회 권한만 있음)
        elif password == settings.SIMPLE_PASSWORD_USER:
            request.session['is_authenticated'] = True
            request.session['user_role'] = 'user'
            return redirect('index')
            
        else:
            messages.error(request, "비밀번호가 올바르지 않습니다.")
            return render(request, 'manning/login.html')

# -----------------------------------------------------------
# 3. 로그아웃 뷰 (Class-Based View)
# -----------------------------------------------------------
class SimpleLogoutView(View):
    def get(self, request):
        request.session.flush() # 세션 삭제
        return redirect('login')
    

class indexView(SimpleLoginRequiredMixin, View):
    def get(self, request):
        today = timezone.now().date()
        
        # 1. 활성 세션 가져오기 (최적화: 작업자 수와 일감 수를 미리 계산)
        # order_by('-created_at'): 최신 세션이 리스트 앞쪽으로 오게 함
        active_sessions = WorkSession.objects.filter(is_active=True).annotate(
            worker_count=Count('worker', distinct=True),
            # 간비가 아닌 일감의 개수만 카운트
            item_count=Count('workitem', filter=~Q(workitem__work_order='간비'), distinct=True)
        ).order_by('-created_at')

        # 2. 이름별 중복 처리 및 매핑 (딕셔너리 구성)
        active_map = {}
        name_counts = {}

        for s in active_sessions:
            # 이름 카운트 (중복 확인용)
            name_counts[s.name] = name_counts.get(s.name, 0) + 1
            
            # 매핑 로직:
            # 1. 아직 맵에 없으면 넣는다.
            # 2. 이미 있어도, 지금 것이 일감(item_count)이 더 많다면 교체한다. (데이터가 있는 방 우선)
            if s.name not in active_map:
                active_map[s.name] = s
            else:
                current_stored = active_map[s.name]
                if s.item_count > current_stored.item_count:
                    active_map[s.name] = s

        # 3. 1번~8번 방 슬롯 생성
        dashboard_slots = []
        for i in range(1, 9):
            name = f"Session {i}"
            
            if name in active_map:
                session_obj = active_map[name]
                
                dashboard_slots.append({
                    'name': name,
                    'status': 'active',
                    'session_id': session_obj.id,
                    # 중복된 이름이 있었다면 UI에 표시(옵션)
                    'multiple': name_counts.get(name, 0) > 1,
                    # 이미 annotate로 계산했으므로 .count() 호출 불필요
                    'info': f"작업자 {session_obj.worker_count}명 / 일감 {session_obj.item_count}개"
                })
            else:
                dashboard_slots.append({
                    'name': name,
                    'status': 'empty',
                    'session_id': None,
                    'info': '대기 중'
                })

        # 4. 과거 통계 (지난 7일간 종료된 세션)
        cutoff = timezone.now() - timedelta(days=7)
        history_count = WorkSession.objects.filter(is_active=False, created_at__gte=cutoff).count()

        context = {
            'today': today,
            'dashboard_slots': dashboard_slots,
            'active_count': len(active_map), # 실제 화면에 표시된 활성 방 개수
            'total_active_sessions': active_sessions.count(), # (중복 포함) DB상 켜져있는 총 개수
            'history_count': history_count
        }
        
        return render(request, 'manning/index.html', context)


class SelectSessionView(SimpleLoginRequiredMixin, View):
    def get(self, request, name):
        # list all active sessions with this slot name so user can choose which one to open
        sessions = WorkSession.objects.filter(name=name, is_active=True).order_by('-created_at')
        
        # 각 세션에 대한 일감 수를 계산하여 추가합니다.
        for session in sessions:
            session.item_count = session.workitem_set.exclude(work_order='간비').count()
            
        return render(request, 'manning/select_session.html', {'sessions': sessions, 'slot_name': name})


class CreateSessionView(SimpleLoginRequiredMixin, View):
    def get(self, request):
        # 파라미터로 slot이 넘어오면 템플릿에 전달 (자동 선택용)
        slot = request.GET.get('slot', '')
        return render(request, 'manning/create_session.html', {'slot': slot})

    def post(self, request):
        session_name = request.POST.get('session_name') or 'Session'
        worker_names = request.POST.get('worker_names', '')
        # HTML의 hidden input에서 기번 리스트 가져오기
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
            
            # ---------------------------------------------------------
            # [수정] 3. 작업자 생성 (콤마와 엔터 모두 처리)
            # ---------------------------------------------------------
            # (1) 쉼표(,)를 모두 줄바꿈(\n)으로 바꿉니다.
            # (2) \r 제거 (윈도우 줄바꿈 대응)
            normalized_workers = worker_names.replace(',', '\n').replace('\r', '')
            
            # (3) 줄바꿈을 기준으로 나누고, 앞뒤 공백을 제거합니다.
            names = [n.strip() for n in normalized_workers.split('\n') if n.strip()]
            
            # (4) 중복 이름 제거
            names = list(set(names))
            
            # (5) 각각 저장합니다.
            for name in names:
                # 필요하다면 limit_mh 기본값을 여기서 설정 (예: limit_mh=8.0)
                Worker.objects.create(session=session, name=name)
            # ---------------------------------------------------------

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

        messages.success(request, f'세션이 생성되었습니다.')
        
        # urls.py 설정에 따라 session_id 인지 pk 인지 확인 필요 (보통 pk 사용)
        # 기존 코드에 session_id라고 되어있으면 그대로 유지
        return redirect('result_view', session_id=session.id)
    

class EditSessionView(SimpleLoginRequiredMixin, View):
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


class EditAllView(SimpleLoginRequiredMixin, View):
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
        
        # 폼셋 생성
        WorkItemFormSet = modelformset_factory(WorkItem, form=WorkItemForm, extra=3, can_delete=True)
        formset = WorkItemFormSet(request.POST, request.FILES, queryset=WorkItem.objects.filter(session=session))

        if formset.is_valid():
            # 1. 변경사항 저장 (commit=False로 인스턴스 생성 후 세션 연결)
            instances = formset.save(commit=False)
            for inst in instances:
                if not inst.session_id:
                    inst.session = session
                inst.save()
            
            # 2. 삭제된 항목 처리
            for obj in formset.deleted_objects:
                obj.delete()

            messages.success(request, '변경사항이 저장되었습니다.')
            return redirect('edit_all', session_id=session.id)
        
        else:
            # 에러 발생 시 입력값 유지하며 페이지 다시 로드
            worker_names = "\n".join([w.name for w in session.worker_set.all()])
            messages.error(request, '입력값에 오류가 있습니다. 다시 확인하세요.')
            
            return render(request, 'manning/edit_all.html', {
                'session': session, 
                'formset': formset, 
                'worker_names_str': worker_names
            })
        

class ResultView(SimpleLoginRequiredMixin, View):
    def get(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        
        # [기존 로직] 집계 갱신
        refresh_worker_totals(session)
        filter_worker = request.GET.get('worker')

        # [수정] 정렬 기준 추가 (.order_by)
        # 기번 -> Work Order -> OP 순서로 정렬하여, 수정해도 순서가 고정됩니다.
        items_qs = session.workitem_set.all().order_by('gibun_input', 'work_order', 'op').prefetch_related('assignments__worker')
        
        if filter_worker:
            items_qs = items_qs.filter(assignments__worker__name=filter_worker).distinct()

        items = list(items_qs)
        
        # 빈 기번 채우기 로직 (기존 유지)
        for it in items:
            if (not getattr(it, 'gibun_input', None) or str(getattr(it, 'gibun_input', '')).strip() == ''):
                if getattr(it, 'task_master', None):
                    it.gibun_input = it.task_master.gibun_code
                elif getattr(it, 'model_type', None):
                    it.gibun_input = it.model_type

        context = {
            'session': session,
            'workers': session.worker_set.all(),
            'items': items,
            'filter_worker': filter_worker or '',
        }
        return render(request, 'manning/result_view.html', context)

    def post(self, request, session_id):
        # (기존 POST 로직 동일)
        run_auto_assign(session_id)
        messages.success(request, "자동 배정이 완료되었습니다! 🤖")
        return redirect('result_view', session_id=session_id)
    

class EditItemView(SimpleLoginRequiredMixin, View):
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
    

# ---------------------------------------------------------
# 2. 통합 관리 화면 뷰 수정 (우선순위 설정 기능 추가)
# ---------------------------------------------------------
class ManageItemsView(SimpleLoginRequiredMixin, View):
    def get(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        
        # [우선순위 로직] 현재 등록된 기번들을 스캔해서 Priority 모델이 없으면 생성
        exist_gibuns = WorkItem.objects.filter(session=session).values_list('gibun_input', flat=True).distinct()
        for g_name in exist_gibuns:
            if g_name:
                GibunPriority.objects.get_or_create(session=session, gibun=g_name)

        # 우선순위 목록 가져오기 (화면 표시용)
        gibun_priorities = GibunPriority.objects.filter(session=session).order_by('order', 'gibun')

        # 아이템 리스트 가져오기 (기번 우선순위 순으로 정렬해서 보여주면 더 좋음)
        # 하지만 SQL 조인이 복잡해지므로, 여기선 기존대로 '기번 이름' 순으로 보여줍니다.
        queryset = WorkItem.objects.filter(session=session).prefetch_related('assignments__worker').order_by('gibun_input', 'id')
        
        ManageFormSet = modelformset_factory(WorkItem, form=ManageItemForm, extra=0, can_delete=True)
        formset = ManageFormSet(queryset=queryset)

        # 텍스트 입력창 초기값 (이름 표시)
        for form in formset.forms:
            if form.instance.pk:
                assigns = None
                if hasattr(form.instance, 'assignments'): assigns = form.instance.assignments.all()
                elif hasattr(form.instance, 'assignment_set'): assigns = form.instance.assignment_set.all()
                
                if assigns and assigns.exists():
                    names = [a.worker.name for a in assigns]
                    form.initial['assigned_worker_name'] = ", ".join(names)

        return render(request, 'manning/manage_items.html', {
            'session': session,
            'formset': formset,
            'gibun_priorities': gibun_priorities, # 템플릿으로 전달
            'worker_names_str': "\n".join([f"{w.name}:{w.max_mh}" for w in session.worker_set.all()])
        })

    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        
        # A. 근무 한도 저장 (기존 코드)
        worker_limits = request.POST.get('worker_limits', '')
        if worker_limits:
            lines = worker_limits.strip().split('\n')
            for line in lines:
                if ':' in line:
                    name, mh_str = line.split(':', 1)
                    name = name.strip()
                    try: mh = float(mh_str)
                    except: mh = 8.0
                    worker, created = Worker.objects.get_or_create(session=session, name=name)
                    worker.max_mh = mh
                    worker.save()

        # B. [추가] 기번 우선순위 저장 로직
        # 폼에서 name="prio_HL7777" value="1" 형태로 넘어옴
        priorities = GibunPriority.objects.filter(session=session)
        for p in priorities:
            input_name = f"prio_{p.id}" # 예: prio_5
            new_order = request.POST.get(input_name)
            if new_order:
                try:
                    p.order = int(new_order)
                    p.save()
                except ValueError:
                    pass

        # C. 폼셋(아이템 리스트) 저장 (기존 코드)
        queryset = WorkItem.objects.filter(session=session).prefetch_related('assignments__worker').order_by('gibun_input', 'id')
        ManageFormSet = modelformset_factory(WorkItem, form=ManageItemForm, extra=0, can_delete=True)
        formset = ManageFormSet(request.POST, queryset=queryset)

        if formset.is_valid():
            instances = formset.save(commit=False)
            for obj in formset.deleted_objects: obj.delete()

            for form in formset.forms:
                if form in formset.deleted_forms or not form.instance.pk: continue
                
                item = form.save()
                input_str = form.cleaned_data.get('assigned_worker_name', '').strip()
                
                if input_str:
                    raw_names = [n.strip() for n in input_str.split(',') if n.strip()]
                    if raw_names:
                        if hasattr(item, 'assignments'): item.assignments.all().delete()
                        elif hasattr(item, 'assignment_set'): item.assignment_set.all().delete()

                        valid_workers = []
                        for name in raw_names:
                            worker = Worker.objects.filter(session=session, name=name).first()
                            if worker: valid_workers.append(worker)

                        if valid_workers:
                            mh_per_person = round(item.work_mh / len(valid_workers), 2)
                            for worker in valid_workers:
                                Assignment.objects.create(work_item=item, worker=worker, allocated_mh=mh_per_person)
                            item.is_manual = True
                            item.save()
                else:
                    if hasattr(item, 'assignments'): item.assignments.all().delete()
                    elif hasattr(item, 'assignment_set'): item.assignment_set.all().delete()
                    item.is_manual = False
                    item.save()

            # D. 재배정 실행 (이제 우선순위에 따라 배정됨)
            run_auto_assign(session.id)
            messages.success(request, "저장 및 재배정 완료! (우선순위가 높은 기종부터 배정되었습니다) 🚀")
            return redirect('manage_items', session_id=session.id)
            
        else:
            # 에러 시
            worker_names_str = request.POST.get('worker_limits', '')

            # 우선순위 목록 다시 불러오기
            gibun_priorities = GibunPriority.objects.filter(session=session).order_by('order', 'gibun')
            
            messages.error(request, "입력값에 오류가 있습니다. 빨간색 경고 메시지를 확인해주세요.")
            
            return render(request, 'manning/manage_items.html', {
                'session': session,
                'formset': formset,
                'gibun_priorities': gibun_priorities,
                'worker_names_str': worker_names_str,
            })
        

class PasteDataView(SimpleLoginRequiredMixin, View):
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
            # [수정] 저장이 잘 되었으면 'index'으로 이동
            return redirect('index')
        else:
            messages.warning(request, "저장된 데이터가 없습니다. 형식을 확인해주세요.")
            # 실패했으면 다시 시도할 수 있게 현재 페이지 유지
            return redirect('paste_data')
    
        

class UndoDeleteView(SimpleLoginRequiredMixin, View):
    def post(self, request):
        last_list = request.session.get('last_deleted_items')
        if not last_list:
            messages.error(request, "복원할 삭제 항목이 없습니다.")
            return redirect('index')

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
    

class UpdateLimitsView(SimpleLoginRequiredMixin, View):
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
    

class FinishSessionView(SimpleLoginRequiredMixin, View):
    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        
        # 삭제(delete)하지 않고, 상태만 '종료'로 변경
        session.is_active = False 
        session.save()
        
        messages.success(request, f"✅ {session.name} 작업이 완료되었습니다. 기록 보관소로 이동합니다.")
        return redirect('index')

class HistoryView(View):
    def get(self, request):
        # 1. 종료된(is_active=False) 세션들만 가져옴 (최신순 정렬)
        history_list = WorkSession.objects.filter(is_active=False).order_by('-created_at')
        
        # 2. 검색어 확인
        query = request.GET.get('q')
        
        if query:
            # 3. 검색 로직: 세션 이름 OR 기번 OR 작업자 이름
            history_list = history_list.filter(
                Q(name__icontains=query) |                  # 세션 이름 검색
                Q(workitem__gibun_input__icontains=query) | # 기번 검색 (일감)
                Q(worker__name__icontains=query)            # 작업자 이름 검색 (명단)
            ).distinct() # 중복 제거 (한 세션에 검색된 작업자가 여러 명일 경우 대비)

        return render(request, 'manning/history.html', {'history_list': history_list})
    

@require_POST # POST 요청으로만 접근 가능 (보안)
def clear_history(request):
    # 완료된(is_active=False) 세션만 일괄 삭제
    WorkSession.objects.filter(is_active=False).delete()
    
    # 삭제 후 다시 히스토리 페이지로 이동
    return redirect('history')
    

class SaveManualInputView(SimpleLoginRequiredMixin, View):
    def post(self, request, pk):
        try:
            data = json.loads(request.body)
            assignments_data = data.get('assignments', [])
            session = WorkSession.objects.get(pk=pk)

            # (1) 간비 아이템 준비 (코드가 있을 때만 사용됨)
            ganbi_item, _ = WorkItem.objects.get_or_create(
                session=session,
                work_order='간비',
                defaults={
                    'op': '-', 'gibun_input': '-', 'model_type': '-',
                    'description': '기타/대기/이동 시간', 'work_mh': 0.0, 'is_manual': True
                }
            )

            with transaction.atomic():
                for item in assignments_data:
                    worker_id = item.get('worker_id')
                    start_min = item.get('start_min')
                    end_min = item.get('end_min')
                    code = item.get('code', '').strip() # 입력한 코드 (예: 식사)

                    if worker_id and start_min is not None and end_min is not None:
                        worker = Worker.objects.get(id=worker_id)
                        
                        # [시간 계산 로직] 자정 넘김 처리
                        if end_min < start_min:
                            calc_end = end_min + 1440
                        elif end_min == start_min and start_min > 0:
                             calc_end = end_min # 0시간 입력 방지 필요시 +1440
                        else:
                            calc_end = end_min

                        duration = calc_end - start_min
                        allocated_mh = round(duration / 60.0, 2)

                        # 시간이 유효할 때만 처리
                        if allocated_mh > 0:
                            
                            # ========================================================
                            # CASE A: 코드가 있음 -> "간비(고정)" 생성
                            # ========================================================
                            if code:
                                # 간비 WorkItem 개별 생성 (수정/삭제 용이성을 위해)
                                new_ganbi = WorkItem.objects.create(
                                    session=session,
                                    work_order='간비',
                                    description=code, 
                                    work_mh=allocated_mh,
                                    is_manual=True,
                                    gibun_input='-'
                                )
                                Assignment.objects.create(
                                    work_item=new_ganbi,
                                    worker=worker,
                                    allocated_mh=allocated_mh,
                                    start_min=start_min,
                                    end_min=calc_end,
                                    code=code
                                )

                            # ========================================================
                            # CASE B: 코드가 없음(공란) -> "일반 작업(WO)" 끌어와서 고정
                            # ========================================================
                            else:
                                # 1. 해당 작업자에게 자동 배정된 일감 중, 아직 시간 고정이 안 된 것을 찾음
                                target_assign = Assignment.objects.filter(
                                    worker=worker,
                                    work_item__session=session,
                                    start_min__isnull=True # 아직 시간이 안 정해진 것
                                ).exclude(
                                    work_item__work_order='간비' # 간비 제외
                                ).select_related('work_item').order_by(
                                    'work_item__gibun_input', 'work_item__work_order' # 정렬: 기번 -> WO 순
                                ).first()

                                if target_assign:
                                    # 2. 찾은 일감을 이 시간대에 "고정"시킴
                                    target_assign.start_min = start_min
                                    target_assign.end_min = calc_end
                                    
                                    # [중요] 해당 시간만큼만 수행한다고 가정하고 M/H를 맞춤 (Manual Override)
                                    # 예: 원래 2시간짜리 일인데 09:00~10:00(1시간)으로 잡으면 1시간으로 변경
                                    target_assign.allocated_mh = allocated_mh
                                    target_assign.save()

                                    # 3. 해당 WorkItem을 수동(Manual) 모드로 변경하여
                                    #    다음 자동 배정 때 삭제되지 않도록 보호
                                    wi = target_assign.work_item
                                    wi.is_manual = True
                                    wi.save()
                                else:
                                    # 할당된 일반 작업이 하나도 없다면? -> 그냥 빈 간비로 생성하거나 무시
                                    # 여기서는 사용자의 혼동을 막기 위해 '작업 없음'이라는 간비를 생성해줌
                                    pass 

            # 총 시간 갱신
            refresh_worker_totals(session)
            return JsonResponse({'status': 'success', 'message': '저장되었습니다.'})

        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)


class UploadDataView(SimpleLoginRequiredMixin, View):
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
    

class PasteInputView(SimpleLoginRequiredMixin, View):
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
            return redirect('index')

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
        return redirect('index')
    

class AssignedSummaryView(SimpleLoginRequiredMixin, View):
    def get(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        
        # ... (공통 일정 로직 생략) ...
        common_schedule = [] # 생략된 부분 기존 유지

        workers = session.worker_set.all().order_by('name')
        workers_schedule = []

        for w in workers:
            assigns = Assignment.objects.filter(work_item__session=session, worker=w).select_related('work_item')
            total_mh = sum(float(a.allocated_mh) for a in assigns)
            
            task_count = 0
            for a in assigns:
                if a.work_item and a.work_item.work_order != '간비':
                    task_count += 1

            fixed_list = []
            occupied_slots = []
            floating_list = []

            for a in assigns:
                if a.work_item:
                    wo_raw = a.work_item.work_order.strip()
                    op_raw = a.work_item.op
                    gibun_raw = a.work_item.gibun_input
                    desc_raw = a.work_item.description
                else:
                    wo_raw, op_raw, gibun_raw, desc_raw = "Direct", "", "", ""

                # [수정] 간비 표시 로직 개선
                if (wo_raw == '간비') or (a.start_min is not None and a.end_min is not None):
                    if wo_raw == '간비':
                        # 간비는 코드가 있으면 코드 표시, 없으면 빈칸 (기존 '기타' 무시)
                        desc_disp = a.code if a.code else ""
                    else:
                        desc_disp = desc_raw

                    item_data = {
                        'wo': wo_raw, 'op': op_raw, 'gibun': gibun_raw, 'desc': desc_disp,
                        'mh': float(a.allocated_mh),
                        'start_str': format_min_to_time(a.start_min),
                        'end_str': format_min_to_time(a.end_min),
                        'start_min': a.start_min,
                        'is_fixed': True,
                        'class': 'table-warning' if wo_raw == '간비' else 'table-info'
                    }
                    fixed_list.append(item_data)
                    
                    if a.start_min is not None and a.end_min is not None:
                        occupied_slots.append({'start': a.start_min, 'end': a.end_min})
                
                else:
                    floating_list.append({
                        'wo': wo_raw, 'op': op_raw, 'gibun': gibun_raw, 'desc': desc_raw,
                        'mh': float(a.allocated_mh),
                        'sort_key': (gibun_raw or 'z', wo_raw or 'z', op_raw or 'z')
                    })

            # ... (스케줄 계산 및 정렬 로직 기존 유지) ...
            floating_list.sort(key=lambda x: x['sort_key'])
            
            try:
                calc = ScheduleCalculator(floating_list, fixed_slots=occupied_slots)
                calculated_schedule = calc.calculate()
            except Exception as e:
                print(f"Calc Error: {e}")
                for item in floating_list: item['start_str'] = "-"; item['end_str'] = "-"
                calculated_schedule = floating_list

            final_schedule = fixed_list + calculated_schedule
            final_schedule.sort(key=lambda x: x.get('start_min') if x.get('start_min') is not None else 99999)

            workers_schedule.append({
                'worker': w, 'worker_name': w.name,
                'total_mh': round(total_mh, 1), 'task_count': task_count,
                'schedule': final_schedule,
            })

        return render(request, 'manning/assigned_summary.html', {
            'session': session, 'workers_schedule': workers_schedule, 'common_schedule': common_schedule
        })
    

class AssignedDetailView(SimpleLoginRequiredMixin, View):
    def get(self, request, session_id, worker_id):
        session = get_object_or_404(WorkSession, id=session_id)
        worker = get_object_or_404(Worker, id=worker_id, session=session)
        # Redirect into result_view page with worker name as query param so
        # the final result page shows only that worker's assigned rows.
        from django.urls import reverse
        url = reverse('result_view', args=[session.id]) + f'?worker={worker.name}'
        return redirect(url)


# ---------------------------------------------------------
# 3. 개인 시간표 뷰 (PersonalScheduleView)
# ---------------------------------------------------------
class PersonalScheduleView(SimpleLoginRequiredMixin, DetailView):
    model = WorkSession
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
            ).select_related('work_item', 'worker')
            
            fixed_schedule = []
            occupied_slots = []
            floating_tasks = []
            total_mh = 0.0
            worker_name = ""
            task_count = 0

            for a in assignments:
                if not worker_name: worker_name = a.worker.name
                total_mh += float(a.allocated_mh)
                
                if a.work_item:
                    wo_raw = a.work_item.work_order.strip()
                    op_raw = a.work_item.op
                    gibun_val = a.work_item.gibun_input
                    # 간비 코드 처리
                    desc_disp = a.code if (wo_raw == '간비' and a.code) else a.work_item.description
                    if wo_raw != '간비':
                        task_count += 1
                else:
                    wo_raw, op_raw, gibun_val, desc_disp = "Direct", "", "", ""

                item_data = {
                    'wo': wo_raw, 'op': op_raw, 'desc': desc_disp, 'mh': float(a.allocated_mh),
                    'gibun': gibun_val,
                    'sort_key': (gibun_val or 'z', wo_raw or 'z', op_raw or 'z')
                }

                # 고정 일정 (간비 등)
                if a.start_min is not None and a.end_min is not None:
                    item_data.update({
                        'start_str': format_min_to_time(a.start_min),
                        'end_str': format_min_to_time(a.end_min),
                        'start_min': a.start_min,
                        'is_fixed': True
                    })
                    fixed_schedule.append(item_data)
                    # [주의] occupied_slots에는 원본 분(min)을 넘깁니다. 
                    # 변환은 ScheduleCalculator 내부 __init__에서 수행합니다.
                    occupied_slots.append({'start': a.start_min, 'end': a.end_min})
                else:
                    floating_tasks.append(item_data)

            # 유동 작업 정렬
            floating_tasks.sort(key=lambda x: x.get('sort_key', ('', '', '')))

            # 스케줄 계산 (빈칸 채우기)
            calculated_schedule = []
            if floating_tasks:
                try:
                    calc = ScheduleCalculator(floating_tasks, occupied_slots=occupied_slots)
                    calculated_schedule = calc.calculate()
                except Exception as e:
                    print(f"Schedule Calc Error: {e}")
                    for item in floating_tasks:
                        item['start_str'] = "-"
                        item['end_str'] = "-"
                    calculated_schedule = floating_tasks

            # 최종 합치기
            final_schedule = fixed_schedule + calculated_schedule
            
            # [핵심 수정] 화면 표시용 정렬: get_adjusted_min 사용!
            # 02:00(120) -> 26:00(1560)으로 변환되어 20:00(1200)보다 뒤에 옵니다.
            final_schedule.sort(key=lambda x: get_adjusted_min(x.get('start_min')))

            context['schedule'] = final_schedule
            context['worker_name'] = worker_name
            context['worker_id'] = int(worker_id)
            context['total_mh'] = round(total_mh, 1)
            context['task_count'] = task_count
            
        return context
      

class DeleteTaskMasterView(SimpleLoginRequiredMixin, View):
    def post(self, request, pk):
        try:
            task = get_object_or_404(TaskMaster, pk=pk)
            task.delete()
            messages.success(request, f"데이터 '{task.work_order}'가 삭제되었습니다.")
        except Exception as e:
            messages.error(request, f"삭제 중 오류가 발생했습니다: {e}")
        
        return redirect(request.META.get('HTTP_REFERER', 'paste_data'))


class DeleteAllTaskMastersView(SimpleLoginRequiredMixin, View):
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
class WorkerIndirectView(SimpleLoginRequiredMixin, View):
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

        # 3. [중요] 저장된 시간(분)을 HH:MM으로 변환해서 폼에 채워넣기
        for form in formset.forms:
            if form.instance.pk:
                # 이 WorkItem에 연결된 배정 정보를 찾음
                assign = Assignment.objects.filter(work_item=form.instance, worker=worker).first()
                if assign:
                    # helper 함수(min_to_hhmm)는 views.py 어딘가에 정의되어 있어야 합니다.
                    form.initial['start_time'] = min_to_hhmm(assign.start_min)
                    form.initial['end_time'] = min_to_hhmm(assign.end_min)
                    # 설명이 비어있으면 코드 값으로 채움
                    if not form.instance.description and assign.code:
                        form.initial['description'] = assign.code

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
    

class AddItemsDirectView(SimpleLoginRequiredMixin, View):
    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        raw_data = request.POST.get('raw_data', '')

        if not raw_data:
            messages.error(request, "입력된 데이터가 없습니다.")
            return redirect('manage_items', session_id=session.id)

        rows = raw_data.strip().split('\n')
        success_count = 0
        error_logs = []
        
        # [특수문자 제거 함수]
        def clean_str(text):
            if not text: return ""
            return re.sub(r'[^ \w\.\,\/\-\(\)\[\]가-힣]', '', text)

        for row in rows:
            row = row.strip()
            if not row: continue

            # 1. 탭으로 분리
            cols = row.split('\t')

            # 2. 탭이 없으면 2칸 공백으로 시도
            if len(cols) < 2:
                cols = re.split(r'\s{2,}', row)

            try:
                cols = [c.strip() for c in cols]

                gibun = cols[0]
                wo = cols[1] if len(cols) > 1 else ""
                op = cols[2] if len(cols) > 2 else ""
                desc = cols[3] if len(cols) > 3 else ""
                
                # M/H 처리
                mh = 0.0
                if len(cols) >= 5:
                    last_val = cols[4]
                    try:
                        mh = float(last_val)
                    except ValueError:
                        desc += " " + last_val
                        mh = 0.0

                # 특수문자 제거
                gibun = clean_str(gibun)
                wo = clean_str(wo)
                op = clean_str(op)
                desc = clean_str(desc)

                # [수정됨] worker_count=1 삭제함 (모델에 필드가 없으므로)
                WorkItem.objects.create(
                    session=session,
                    gibun_input=gibun,
                    work_order=wo,
                    op=op,
                    description=desc,
                    work_mh=mh,
                    # worker_count=1,  <-- 이 줄을 삭제했습니다!
                    is_manual=False
                )
                success_count += 1
                
            except Exception as e:
                error_logs.append(f"Row Error: {str(e)}")
                continue

        if success_count > 0:
            run_auto_assign(session.id)
            messages.success(request, f"✅ 총 {success_count}건 등록 성공!")
        else:
            error_msg = error_logs[0] if error_logs else "데이터 형식 불일치"
            messages.error(request, f"❌ 등록 실패. 원인: {error_msg}")
            
        return redirect('manage_items', session_id=session.id)


class AddSingleItemView(SimpleLoginRequiredMixin, View):
    # [추가] GET 요청(주소 직접 접속)이 오면 관리 페이지로 튕겨내기
    def get(self, request, session_id):
        return redirect('manage_items', session_id=session_id)

    # 기존 POST 로직 (데이터 저장용)
    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        
        # ... (아까 작성한 저장 로직 그대로 유지) ...
        
        # 1. 입력값 가져오기
        gibun = request.POST.get('gibun', '').strip()
        wo = request.POST.get('wo', '').strip()
        op = request.POST.get('op', '').strip()
        desc = request.POST.get('description', '').strip()
        mh_str = request.POST.get('mh', '0')
        worker_name = request.POST.get('worker_name', '').strip()
        
        try:
            mh = float(mh_str)
        except ValueError:
            mh = 0.0

        if gibun and wo:
            item = WorkItem.objects.create(
                session=session,
                gibun_input=gibun,
                work_order=wo,
                op=op,
                description=desc,
                work_mh=mh
            )
            
            if not GibunPriority.objects.filter(session=session, gibun=gibun).exists():
                last_prio_dict = GibunPriority.objects.filter(session=session).aggregate(Max('order'))
                last_prio = last_prio_dict['order__max']
                new_order = (last_prio or 0) + 1
                GibunPriority.objects.create(session=session, gibun=gibun, order=new_order)

            if worker_name:
                worker, created = Worker.objects.get_or_create(session=session, name=worker_name)
                Assignment.objects.create(work_item=item, worker=worker, allocated_mh=mh)
                item.is_manual = True
                item.save()

            run_auto_assign(session.id)
            messages.success(request, f"추가 완료: {gibun} - {wo}")
        
        else:
            messages.error(request, "기번과 Work Order는 필수 입력값입니다.")
            
        return redirect('manage_items', session_id=session_id)


class ResetSessionView(SimpleLoginRequiredMixin, View):
    def post(self, request, session_id):
        
        if request.session.get('user_role') != 'admin':
            messages.error(request, "관리자 권한이 필요합니다.")
            return redirect('index')
        
        # 1. 세션 찾기
        session = get_object_or_404(WorkSession, id=session_id)
        
        # 2. 비활성화 처리 (슬롯 비우기)
        # 만약 영구 삭제를 원하시면 session.delete()를 사용하세요.
        session.is_active = False 
        session.save()
        
        # 3. 메시지 및 리다이렉트
        messages.success(request, f"'{session.name}' 세션이 종료되어 슬롯이 초기화되었습니다.")
        return redirect('index')
    

class ResetAllSessionsView(SimpleLoginRequiredMixin, View):
    def post(self, request):
        # 1. 활성화된 모든 세션을 찾아서 한 번에 '비활성(False)'으로 변경
        # update()는 변경된 행의 개수를 반환합니다.
        updated_count = WorkSession.objects.filter(is_active=True).update(is_active=False)
        
        if updated_count > 0:
            messages.success(request, f"총 {updated_count}개의 세션이 모두 종료되어 보관소로 이동되었습니다.")
        else:
            messages.info(request, "현재 활성화된 세션이 없습니다.")
            
        return redirect('index')
    

class AutoAssignView(SimpleLoginRequiredMixin, View):
    def post(self, request, pk):
        try:
            # services.py에 있는 로직 실행
            run_auto_assign(pk)
            messages.success(request, "자동 균등 배정이 완료되었습니다.")
        except Exception as e:
            # 에러 발생 시 로그 출력 등 처리
            print(f"Auto Assign Error: {e}")
            messages.error(request, "배정 중 오류가 발생했습니다.")
            
        # 결과 페이지로 이동 (urls.py 설정에 따라 session_id 파라미터명 확인)
        return redirect('result_view', session_id=pk)
    

