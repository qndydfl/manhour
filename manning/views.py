from datetime import timedelta
import math, json, re
import traceback
from django import forms
import pandas as pd
from django.db import transaction
from django.db import models as django_models
from django.db.models import Q, Sum, Count, Max, F, Case, When, Value, IntegerField
from django.forms import IntegerField, modelformset_factory
from django.http import JsonResponse 
from django.shortcuts import render, get_object_or_404, redirect
from django.urls import reverse, reverse_lazy
from django.utils import timezone
from django.views import View
from django.views.generic import DetailView
from django.contrib import messages
from django.views.decorators.http import require_POST
from django.views.generic.edit import UpdateView, CreateView

from config import settings
from manning.utils import ScheduleCalculator, format_min_to_time, get_adjusted_min
from .models import WorkSession, Worker, WorkItem, Assignment, TaskMaster, GibunPriority
from .forms import ManageItemForm, WorkItemForm, DirectWorkItemForm, WorkerIndirectForm
from .services import AutoAssignService, ScheduleSyncService, run_auto_assign, refresh_worker_totals, run_sync_schedule
from .models import Assignment, TaskMaster, WorkSession, Worker, WorkItem
from .models import WorkSession as ManningSession

from django.views.decorators.clickjacking import xframe_options_sameorigin 
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt

from manning import models
from .planner import Planner 
import traceback


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
# 2. 로그인 뷰 (Class-indexd View)
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
# 3. 로그아웃 뷰 (Class-indexd View)
# -----------------------------------------------------------
class SimpleLogoutView(View):
    def get(self, request):
        request.session.flush() # 세션 삭제
        return redirect('login')
    

# class indexView(SimpleLoginRequiredMixin, View):
#     model = WorkSession
#     template_name = 'manning/index.html'
#     context_object_name = 'sessions'

#     def get_queryset(self):
#         """
#         DB에서 세션 목록을 가져올 때, 작업자 수와 일감 수를 미리 계산(annotate)하여
#         성능을 최적화합니다.
#         """
#         # 1. 기본 쿼리셋: 모든 세션 (혹은 is_active=True만 보고 싶다면 filter 추가)
#         queryset = WorkSession.objects.all()
        
#         # 2. 최적화: 작업자 수 & 일감 수(간비 제외) 미리 계산
#         queryset = queryset.annotate(
#             worker_count=Count('worker', distinct=True),
#             item_count=Count('workitem', filter=~Q(workitem__work_order='간비'), distinct=True)
#         )
        
#         # 3. 정렬: 최신 날짜 우선, 그 다음 최신 생성 우선
#         return queryset.order_by('-date', '-id')

#     def get_context_data(self, **kwargs):
#         """
#         템플릿에 추가로 넘겨줄 데이터 (오늘 날짜, 지난 통계 등)
#         """
#         context = super().get_context_data(**kwargs)
        
#         # 오늘 날짜
#         context['today'] = timezone.now().date()
        
#         # (옵션) 과거 통계: 지난 7일간 종료된 세션 수
#         cutoff = timezone.now() - timedelta(days=7)
#         context['history_count'] = WorkSession.objects.filter( created_at__gte=cutoff ).count()
        
#         return context

#     def get(self, request):
#         today = timezone.now().date()      
        
#         # 1. 활성 세션 가져오기 (최적화: 작업자 수와 일감 수를 미리 계산)
#         # order_by('-created_at'): 최신 세션이 리스트 앞쪽으로 오게 함
#         active_sessions = WorkSession.objects.filter(is_active=True).annotate(
#             worker_count=Count('worker', distinct=True),
#             # 간비가 아닌 일감의 개수만 카운트
#             item_count=Count('workitem', filter=~Q(workitem__work_order='간비'), distinct=True)
#         ).order_by('-created_at')

#         # 2. 이름별 중복 처리 및 매핑 (딕셔너리 구성)
#         active_map = {}
#         name_counts = {}

#         for s in active_sessions:
#             # 이름 카운트 (중복 확인용)
#             name_counts[s.name] = name_counts.get(s.name, 0) + 1
            
#             # 매핑 로직:
#             # 1. 아직 맵에 없으면 넣는다.
#             # 2. 이미 있어도, 지금 것이 일감(item_count)이 더 많다면 교체한다. (데이터가 있는 방 우선)
#             if s.name not in active_map:
#                 active_map[s.name] = s
#             else:
#                 current_stored = active_map[s.name]
#                 if s.item_count > current_stored.item_count:
#                     active_map[s.name] = s

#         # 3. 1번~8번 방 슬롯 생성
#         dashboard_slots = []
#         for i in range(1, 9):
#             name = f"Session {i}"
            
#             if name in active_map:
#                 session_obj = active_map[name]
                
#                 dashboard_slots.append({
#                     'name': name,
#                     'status': 'active',
#                     'session_id': session_obj.id,
#                     # 중복된 이름이 있었다면 UI에 표시(옵션)
#                     'multiple': name_counts.get(name, 0) > 1,
#                     # 이미 annotate로 계산했으므로 .count() 호출 불필요
#                     'info': f"작업자 {session_obj.worker_count}명 / 일감 {session_obj.item_count}개"
#                 })
#             else:
#                 dashboard_slots.append({
#                     'name': name,
#                     'status': 'empty',
#                     'session_id': None,
#                     'info': '대기 중'
#                 })

#         # 4. 과거 통계 (지난 7일간 종료된 세션)
#         cutoff = timezone.now() - timedelta(days=7)
#         history_count = WorkSession.objects.filter(is_active=False, created_at__gte=cutoff).count()

#         context = {
#             'today': today,
#             'dashboard_slots': dashboard_slots,
#             'active_count': len(active_map), # 실제 화면에 표시된 활성 방 개수
#             'total_active_sessions': active_sessions.count(), # (중복 포함) DB상 켜져있는 총 개수
#             'history_count': history_count
#         }
        
#         return render(request, 'manning/index.html', context)


class IndexView(SimpleLoginRequiredMixin, View):
    def get(self, request):
        today = timezone.now()
        
        # ---------------------------------------------------------
        # 1. 활성 세션 가져오기 (최적화: 작업자 수와 일감 수를 미리 계산)
        # ---------------------------------------------------------
        active_sessions = WorkSession.objects.filter(is_active=True).annotate(
            worker_count=Count('worker', distinct=True),
            # '간비'가 아닌 실제 일감의 개수만 카운트
            item_count=Count('workitem', filter=~Q(workitem__work_order='간비'), distinct=True)
        ).order_by('-created_at')

        # ---------------------------------------------------------
        # 2. 이름별 중복 처리 및 매핑 (딕셔너리 구성)
        # ---------------------------------------------------------
        active_map = {}
        name_counts = {}

        for s in active_sessions:
            # 이름 카운트 (중복 확인용)
            name_counts[s.name] = name_counts.get(s.name, 0) + 1
            
            # 매핑 로직:
            # 1. 아직 맵에 없으면 넣는다.
            # 2. 이미 있어도, 지금 것이 일감(item_count)이 더 많다면 교체한다. (데이터가 많은 방 우선 표시)
            if s.name not in active_map:
                active_map[s.name] = s
            else:
                current_stored = active_map[s.name]
                if s.item_count > current_stored.item_count:
                    active_map[s.name] = s

        # ---------------------------------------------------------
        # 3. 1번~8번 방 슬롯(Dashboard Slots) 생성
        # ---------------------------------------------------------
        active_list = list(active_sessions) # 예: [세션A, 세션B]
        dashboard_slots = []
        for i in range(1, 9):
            slot_name = f"Session {i}"
            
            # if name in active_map:
            #     session_obj = active_map[name]
            if i <= len(active_list):
                session_obj = active_list[i-1] # 0번 인덱스부터 가져옴
                
                dashboard_slots.append({
                    'name': slot_name,                  # 슬롯 이름
                    'session_name': session_obj.name, # 화면 표시 이름
                    'status': 'active',            # [중요] 상태: active
                    'session_id': session_obj.id,  # 링크 이동용 ID
                    'shift_type': session_obj.shift_type, # [필수] 주간/야간 배지용
                    'info': f"작업자 {session_obj.worker_count}명 / Work Order {session_obj.item_count}개",
                    # 'multiple': name_counts.get(name, 0) > 1 # 중복 여부
                    'multiple': name_counts.get(session_obj.name, 0) > 1 # 중복 여부
                })
            else:
                dashboard_slots.append({
                    'name': slot_name,
                    'status': 'empty',             # [중요] 상태: empty
                    'session_id': None,
                    'info': '대기 중'
                })

        # ---------------------------------------------------------
        # 4. 과거 통계 (지난 7일간 종료된 세션)
        # ---------------------------------------------------------
        cutoff = timezone.now() - timedelta(days=7)
        history_count = WorkSession.objects.filter(is_active=False, created_at__gte=cutoff).count()

        # ---------------------------------------------------------
        # 5. 템플릿 렌더링
        # ---------------------------------------------------------
        context = {
            'today': today,
            'dashboard_slots': dashboard_slots,           # [핵심] HTML 반복문에 사용
            'active_count': len(active_map),              # 실제 화면에 표시된 활성 방 개수
            'total_active_sessions': active_sessions.count(), 
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


# class CreateSessionView(SimpleLoginRequiredMixin, View):
#     def get(self, request):
#         slot_name = request.GET.get('slot', '')
#         return render(request, 'manning/create_session.html', {'slot': slot_name})

#     def post(self, request):
#         session_name = request.POST.get('session_name')
#         worker_names = request.POST.get('worker_names', '')
#         gibun_input = request.POST.get('gibun_input', '')
#         shift_type = request.POST.get('shift_type', 'DAY') 

#         # [안전장치] 만약 이름이 비어있으면 기본값 부여
#         if not session_name:
#             session_name = "Session (이름 없음)"

#         # 1. 세션 이름 중복 처리
#         index_name = session_name
#         new_name = index_name
#         i = 1
#         while WorkSession.objects.filter(name=new_name, is_active=True).exists():
#             new_name = f"{index_name} ({i})"
#             i += 1

#         # 2. 세션 생성 및 데이터 처리
#         with transaction.atomic():
#             session = WorkSession.objects.create(
#                 name=new_name,
#                 shift_type=shift_type 
#             )
            
#             # 3. 작업자 생성
#             normalized_workers = worker_names.replace(',', '\n').replace('\r', '')
#             names = [n.strip() for n in normalized_workers.split('\n') if n.strip()]
#             # 이름 중복 제거
#             names = list(set(names))
            
#             for name in names:
#                 Worker.objects.create(session=session, name=name)

#             # 4. 일감 및 기번 우선순위 생성
#             if gibun_input:
#                 raw_gibuns = [g.strip() for g in gibun_input.split(',') if g.strip()]
#                 # [핵심] 기번 중복 제거 (set 사용)
#                 unique_gibuns = list(set(raw_gibuns))
                
#                 for gibun in unique_gibuns:
#                     # 4-1. 기번 우선순위 테이블 생성 (필수!)
#                     GibunPriority.objects.get_or_create(session=session, gibun=gibun)

#                     # 4-2. 일감(WorkItem) 생성
#                     # (TaskMaster가 있으면 가져오고, 없으면 빈 껍데기 생성)
#                     masters = TaskMaster.objects.filter(gibun_code=gibun)
#                     if masters.exists():
#                         for tm in masters:
#                             WorkItem.objects.create(
#                                 session=session,
#                                 task_master=tm,
#                                 gibun_input=gibun,
#                                 model_type=tm.gibun_code, # 혹은 gibun
#                                 work_order=tm.work_order,
#                                 op=tm.op,
#                                 description=tm.description,
#                                 work_mh=tm.default_mh
#                             )
#                     else:
#                         # 마스터 데이터가 없을 때 기본 일감 하나 생성
#                         WorkItem.objects.create(
#                             session=session,
#                             gibun_input=gibun,
#                             model_type=gibun,
#                             work_order="정보 없음",
#                             description="마스터 데이터가 없습니다.",
#                             work_mh=0.0
#                         )

#         messages.success(request, f"세션이 생성되었습니다. ({session.get_shift_type_display()})")
#         return redirect('result_view', session_id=session.id)  
    
class CreateSessionView(SimpleLoginRequiredMixin, View):
    # GET 함수는 아까 수정해주신 그대로 유지 (이름만 전달)
    def get(self, request):
        # 1. URL에서 값 가져오기 (로그에 찍힌 'Session 4'를 가져옴)
        slot_name = request.GET.get('slot', '') 
        
        # 2. HTML로 보내기 (중요: 키 이름을 'slot'으로 지정)
        context = {'slot': slot_name} 
        return render(request, 'manning/create_session.html', context)

    # [수정] POST 함수: 입력한 이름을 그대로 저장하는 로직
    def post(self, request):
        # 1. HTML 입력값 가져오기
        # create_session.html의 <input name="session_name"> 값을 가져옵니다.

        session_name = request.POST.get('session_name', '').strip()
        worker_names = request.POST.get('worker_names', '')
        gibun_input = request.POST.get('gibun_input', '')
        shift_type = request.POST.get('shift_type', 'DAY')

        # [안전장치] 만약 이름이 비어있으면 기본값 부여
        if not session_name:
            session_name = "Session (이름 없음)"

        # 2. 이름 중복 처리 (선택사항: 입력한 이름이 이미 있으면 (2), (3) 붙이기)
        # "바로 적용"을 원하시므로, 입력한 이름 그대로 저장을 시도하되
        # 혹시 모를 중복 에러를 방지하기 위해 아래 로직을 넣습니다.
        final_name = session_name
        cnt = 1
        while WorkSession.objects.filter(name=final_name, is_active=True).exists():
            cnt += 1
            final_name = f"{session_name} ({cnt})"

        # 3. DB 저장
        with transaction.atomic():
            # [핵심] 여기서 final_name(사용자 입력값)을 name 필드에 저장합니다.
            session = WorkSession.objects.create(
                name=final_name, 
                shift_type=shift_type,
                is_active=True # 활성 상태로 생성
            )
            
            # 4. 작업자 생성
            normalized_workers = worker_names.replace(',', '\n').replace('\r', '')
            names = [n.strip() for n in normalized_workers.split('\n') if n.strip()]
            names = list(set(names)) # 중복 제거
            
            for name in names:
                Worker.objects.create(session=session, name=name)

            # 5. 일감(기번) 생성
            if gibun_input:
                raw_gibuns = [g.strip() for g in gibun_input.split(',') if g.strip()]
                unique_gibuns = list(set(raw_gibuns))
                
                for gibun in unique_gibuns:
                    # 우선순위 테이블 생성
                    GibunPriority.objects.get_or_create(session=session, gibun=gibun)

                    # 마스터 데이터 조회 및 일감 생성
                    masters = TaskMaster.objects.filter(gibun_code=gibun)
                    if masters.exists():
                        for tm in masters:
                            WorkItem.objects.create(
                                session=session,
                                task_master=tm,
                                gibun_input=gibun,
                                model_type=tm.gibun_code,
                                work_order=tm.work_order,
                                op=tm.op,
                                description=tm.description,
                                work_mh=tm.default_mh
                            )
                    else:
                        # 데이터 없을 때 기본 일감
                        WorkItem.objects.create(
                            session=session,
                            gibun_input=gibun,
                            model_type=gibun,
                            work_order="정보 없음",
                            description="마스터 데이터가 없습니다.",
                            work_mh=0.0
                        )

        messages.success(request, f"세션 '{final_name}'이(가) 시작되었습니다!")
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

        # -------------------------------------------------------------
        # [수정] ManageItemsView와 동일한 정렬 로직 적용
        # -------------------------------------------------------------
        
        # 1. 우선순위 데이터 가져오기
        gibun_priorities = GibunPriority.objects.filter(session=session)
        prio_map = {gp.gibun: gp.order for gp in gibun_priorities}
        
        # 2. 정렬을 위한 Case/When 구문 생성
        whens = [When(gibun_input=k, then=v) for k, v in prio_map.items()]
        
        # 3. 쿼리셋 조회 (Annotation + Order By)
        # 정렬 순서: 기종우선순위 -> 기종이름 -> 수동순서(ordering) -> ID
        items_qs = session.workitem_set.all().prefetch_related('assignments__worker').annotate(
            prio_order=Case(
                *whens, 
                default=1, 
                output_field=django_models.IntegerField()
            )
        ).order_by('prio_order', 'gibun_input', 'ordering', 'id')
        
        # -------------------------------------------------------------

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
        
        # [추가] 동기화 로직도 함께 실행해주면 좋습니다.
        run_sync_schedule(session_id)
        
        messages.success(request, "자동 배정 및 동기화가 완료되었습니다! 🤖")
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
        
        # 1. 쿼리셋 준비 (성능 최적화를 위해 prefetch_related 사용 추천)
        # queryset = WorkItem.objects.filter(session=session).prefetch_related('assignments__worker').order_by('gibun_input', 'ordering', 'id')
        queryset = WorkItem.objects.filter(session=session).order_by('gibun_input', 'ordering', 'id')
        # 2. 폼셋 생성
        ManageFormSet = modelformset_factory(WorkItem, form=ManageItemForm, extra=0, can_delete=True)
        formset = ManageFormSet(queryset=queryset)
        
        # ==================================================================
        # [핵심 수정] 기존 배정된 작업자 이름을 폼의 초기값(initial)으로 주입
        # ==================================================================
        for form in formset.forms:
            if form.instance.pk:
                # 해당 아이템에 연결된 배정 내역(Assignments) 가져오기
                # (모델의 related_name이 'assignments'라고 가정. 아니면 'assignment_set' 사용)
                current_assignments = form.instance.assignments.all()
                
                if current_assignments:
                    # 작업자 이름들을 콤마로 연결 (예: "철수, 영희")
                    worker_names = [a.worker.name for a in current_assignments]
                    form.initial['assigned_worker_name'] = ",".join(worker_names)

        # 3. 작업자 목록 텍스트박스용 데이터 준비 (기존 로직)
        workers = Worker.objects.filter(session=session).order_by('name')
        worker_lines = []
        for w in workers:
            limit_val = int(w.limit_mh) if w.limit_mh % 1 == 0 else w.limit_mh
            worker_lines.append(f"{w.name}:{limit_val}")
        
        worker_names_str = "\n".join(worker_lines)
        
        gibun_priorities = GibunPriority.objects.filter(session=session).order_by('order', 'gibun')
        
        return render(request, 'manning/manage_items.html', {
            'session': session,
            'formset': formset,
            'gibun_priorities': gibun_priorities,
            'worker_names_str': worker_names_str,
        })

    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        
        # 폼셋 준비
        ManageFormSet = modelformset_factory(WorkItem, form=ManageItemForm, extra=0, can_delete=True)
        queryset = WorkItem.objects.filter(session=session).order_by('gibun_input', 'id')
        formset = ManageFormSet(request.POST, queryset=queryset)
        
        worker_names_str = request.POST.get('worker_names', '')

        if formset.is_valid():
            with transaction.atomic():
                # ==========================================================
                # 1. [핵심 수정] 작업자 동기화 (추가, 수정, 그리고 삭제!)
                # ==========================================================
                active_worker_names = [] # 이번에 입력된 이름들을 저장할 리스트

                if worker_names_str:
                    lines = worker_names_str.splitlines() # 줄바꿈 문자 자동 처리
                    
                    for line in lines:
                        line = line.strip()
                        if not line: continue
                        
                        # 파싱 로직 (이름:시간)
                        parts = line.split(':', 1) if ':' in line else line.split('：', 1)
                        if len(parts) < 2: 
                            parts = [line, '9'] # 시간 없으면 기본 9

                        name = parts[0].strip()
                        try:
                            limit_mh = float(parts[1].strip())
                        except ValueError:
                            limit_mh = 9.0
                        
                        if name:
                            # A. 있으면 업데이트, 없으면 생성
                            Worker.objects.update_or_create(
                                session=session,
                                name=name,
                                defaults={'limit_mh': limit_mh}
                            )
                            active_worker_names.append(name)

                # B. [삭제 로직] 텍스트박스에 없는 이름은 DB에서 제거
                # (이 코드가 없어서 삭제가 안 됐던 것임)
                Worker.objects.filter(session=session).exclude(name__in=active_worker_names).delete()


                # ==========================================================
                # 2. 아이템 폼셋 저장
                # ==========================================================
                instances = formset.save(commit=False)
                
                # 삭제된 아이템 처리
                for obj in formset.deleted_objects:
                    obj.delete()

                # 수정/추가된 아이템 처리
                for form in formset.forms:
                    if form.instance.pk and form not in formset.deleted_forms:
                        if form.is_valid():
                            item = form.save()

                            # 수동 배정(assigned_worker_name) 로직
                            input_str = form.cleaned_data.get('assigned_worker_name', '').strip()
                            
                            # 기존 배정 초기화
                            item.assignments.all().delete()

                            if input_str:
                                raw_names = [n.strip() for n in input_str.split(',') if n.strip()]
                                valid_workers = []
                                for name in raw_names:
                                    w = Worker.objects.filter(session=session, name=name).first()
                                    if w: valid_workers.append(w)
                                
                                if valid_workers:
                                    mh = round(item.work_mh / len(valid_workers), 2)
                                    for w in valid_workers:
                                        Assignment.objects.create(work_item=item, worker=w, allocated_mh=mh)
                                    item.is_manual = True
                                else:
                                    item.is_manual = False
                            else:
                                item.is_manual = False
                            
                            item.save()

                # ==========================================================
                # 3. [핵심 수정] 자동 배정 초기화 및 재실행
                # ==========================================================
                # 수동 고정(is_manual=True)이 아닌 배정 내역을 싹 지움 (새 판 짜기)
                # 이게 있어야 인원이 추가되었을 때 그 사람에게도 일이 배정됨
                Assignment.objects.filter(
                    work_item__session=session, 
                    work_item__is_manual=False
                ).delete()

                # 서비스 실행
                AutoAssignService(session.id).run()
                run_auto_assign(session.id)
                run_sync_schedule(session.id)
                refresh_worker_totals(session)

            messages.success(request, "✅ 작업자 명단 동기화 및 재배정 완료!")
            return redirect('manage_items', session_id=session.id)
            
        else:
            messages.error(request, "입력값 오류가 있습니다.")
            return render(request, 'manning/manage_items.html', {
                'session': session,
                'formset': formset,
                'gibun_priorities': GibunPriority.objects.filter(session=session),
                'worker_names_str': worker_names_str,
            })
        

class ReorderItemView(SimpleLoginRequiredMixin, View):
    def get(self, request, item_id, direction):
        # 1. 아이템 조회
        item = get_object_or_404(WorkItem, id=item_id)
        session = item.session

        # 2. 같은 세션, 같은 기번을 가진 아이템들을 순서대로 가져옴
        siblings = list(WorkItem.objects.filter(
            session=session,
            gibun_input=item.gibun_input
        ).order_by('ordering', 'id'))

        try:
            idx = siblings.index(item)
        except ValueError:
            return redirect('manage_items', session_id=session.id)

        # 3. 순서 교환 로직 (Swap)
        if direction == 'up' and idx > 0:
            prev_item = siblings[idx - 1]
            # 값 교환
            item.ordering, prev_item.ordering = prev_item.ordering, item.ordering
            # 만약 값이 같아서 교환 효과가 없다면 강제 조정
            if item.ordering == prev_item.ordering:
                prev_item.ordering = max(0, item.ordering - 1)
            
            item.save()
            prev_item.save()

        elif direction == 'down' and idx < len(siblings) - 1:
            next_item = siblings[idx + 1]
            # 값 교환
            item.ordering, next_item.ordering = next_item.ordering, item.ordering
            
            if item.ordering == next_item.ordering:
                next_item.ordering = item.ordering + 1
            
            item.save()
            next_item.save()

        # 4. (옵션) 전체 재정렬 - 구멍 난 번호를 메꿔줌 (0, 1, 2, 3...)
        # DB 부하가 걱정되면 이 부분은 주석 처리해도 됨
        all_items_in_group = WorkItem.objects.filter(
            session=session, 
            gibun_input=item.gibun_input
        ).order_by('ordering', 'id')
        
        for i, obj in enumerate(all_items_in_group):
            if obj.ordering != i:
                obj.ordering = i
                obj.save()

        return redirect('manage_items', session_id=session.id)
    
    
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
    def post(self, request, session_id):
        try:
            data = json.loads(request.body)
            assignments_data = data.get('assignments', [])
            
            session = get_object_or_404(WorkSession, id=session_id)

            with transaction.atomic():
                # 1. 수정 대상 작업자 식별
                target_worker_ids = set()
                for item in assignments_data:
                    target_worker_ids.add(int(item['worker_id']))

                # 2. 기존 데이터 삭제 (해당 작업자의 간비/수동입력 초기화)
                if target_worker_ids:
                    Assignment.objects.filter(
                        work_item__session=session,
                        worker__id__in=target_worker_ids
                    ).filter(
                        Q(work_item__isnull=True) | Q(work_item__work_order='간비')
                    ).delete()

                # 3. '간비'용 공용 WorkItem 확보
                kanbi_item = WorkItem.objects.filter(session=session, work_order='간비').first()
                if not kanbi_item:
                    kanbi_item = WorkItem.objects.create(
                        session=session,
                        work_order='간비',
                        gibun_input='COMMON',
                        description='간접비용/휴식',
                        work_mh=0
                    )

                # 4. 신규 데이터 저장
                for item in assignments_data:
                    code = str(item['code']).strip()
                    # [수정] 0이어도 저장은 해야 함 (그래야 시간표 자리를 차지함)
                    # if code == '0': continue  <-- 이 줄 삭제함!

                    worker_id = item['worker_id']
                    start_min = item['start_min']
                    end_min = item['end_min']

                    worker = get_object_or_404(Worker, id=worker_id)
                    
                    Assignment.objects.create(
                        work_item=kanbi_item, 
                        worker=worker,
                        code=code, 
                        start_min=start_min,
                        end_min=end_min,
                        allocated_mh=0
                    )

            return JsonResponse({'status': 'success'})

        except Exception as e:
            print(f"Manual Save Error: {e}")
            return JsonResponse({'status': 'error', 'message': str(e)}, status=400)
        

class UploadDataView(SimpleLoginRequiredMixin, View):
    def post(self, request, pk):
        # 1. 세션 가져오기
        session = get_object_or_404(WorkSession, pk=pk)
        
        # 2. 파일 유무 확인
        if 'file' not in request.FILES:
            messages.error(request, "파일이 선택되지 않았습니다.")
            return redirect('result_view', session_id=pk)

        excel_file = request.FILES['file']
        
        try:
            # 3. 판다스로 엑셀 읽기
            df = pd.read_excel(excel_file)
            
            # -----------------------------------------------------------
            # [핵심 수정] 기번(기종) 중복 방지 및 우선순위 테이블 등록
            # -----------------------------------------------------------
            if '기종' in df.columns:
                # 1) 엑셀 내에서 중복 제거 (unique)
                unique_gibuns = df['기종'].dropna().astype(str).unique()
                
                # 2) DB에 없는 것만 생성 (get_or_create)
                for g_val in unique_gibuns:
                    g_clean = g_val.strip()
                    if g_clean:
                        GibunPriority.objects.get_or_create(
                            session=session, 
                            gibun=g_clean
                        )
            # -----------------------------------------------------------

            # 4. 일감(WorkItem) 데이터 저장
            new_items = []
            
            for index, row in df.iterrows():
                # 데이터 추출 (없는 경우 빈 문자열)
                model_val = str(row.get('기종', '')).strip()
                wo_val = str(row.get('WO', '')).strip()
                op_val = str(row.get('OP', '')).strip()
                desc_val = str(row.get('설명', '')).strip()
                
                # M/H는 숫자로 변환
                try:
                    mh_val = float(row.get('M/H', 0))
                except (ValueError, TypeError):
                    mh_val = 0.0

                # 필수값(WO)이 없으면 건너뛰기
                if not wo_val: 
                    continue

                # 객체 생성 (저장은 나중에 한 번에)
                new_items.append(WorkItem(
                    session=session,
                    gibun_input=model_val, # [주의] 모델 필드명 확인 (gibun_input or model_type)
                    work_order=wo_val,
                    op=op_val,
                    description=desc_val,
                    work_mh=mh_val
                ))
            
            # 5. DB에 한 번에 저장 (Bulk Create)
            with transaction.atomic():
                WorkItem.objects.bulk_create(new_items)
                
            messages.success(request, f"엑셀 업로드 완료! ({len(new_items)}건 등록됨)")
                
        except Exception as e:
            print(f"엑셀 업로드 오류: {e}")
            messages.error(request, f"업로드 중 오류가 발생했습니다: {str(e)}")
        
        return redirect('manage_items', session_id=pk) 
    

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
                calc = ScheduleCalculator(
                    floating_list, 
                    fixed_slots=occupied_slots, 
                    shift_type=session.shift_type 
                )
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
        
        # 1. 우선순위 데이터 로드 (정렬용)
        gibun_priorities = GibunPriority.objects.filter(session=self.object)
        prio_map = {gp.gibun: gp.order for gp in gibun_priorities}

        if worker_id:
            # 2. 해당 작업자의 모든 배정 내역 조회
            assignments = Assignment.objects.filter(
                work_item__session=self.object,
                worker_id=worker_id
            ).select_related('work_item', 'worker')
            
            fixed_schedule = []   # 시간이 고정된 작업 (간비, 수동고정)
            occupied_slots = []   # 계산기에게 알려줄 '이미 찬 시간'
            floating_tasks = []   # 시간을 다시 계산할 작업들
            
            # [핵심] 모달 수정용 데이터 리스트 (JSON 변환용)
            manual_edit_list = []

            total_mh = 0.0
            worker_name = ""
            task_count = 0

            for a in assignments:
                if not worker_name: worker_name = a.worker.name
                # total_mh += float(a.allocated_mh)
                
                # ------------------------------------------------------------------
                # [핵심 수정] 총 시간 계산 로직 변경 (간비 포함)
                # ------------------------------------------------------------------
                # 1. 간비(또는 순수 수동 입력)인지 확인
                is_kanbi = False
                if a.work_item and a.work_item.work_order == '간비':
                    is_kanbi = True
                elif not a.work_item: # WorkItem이 없으면 수동 입력(간비 취급)
                    is_kanbi = True

                # 2. 시간 합산
                if is_kanbi:
                    # 간비는 저장된 M/H가 0일 수 있으므로, 실제 시간(End - Start)으로 계산
                    if a.start_min is not None and a.end_min is not None:
                        duration_min = a.end_min - a.start_min
                        if duration_min > 0:
                            total_mh += (duration_min / 60.0) # 분 -> 시간 환산
                else:
                    # 일반 작업은 할당된 M/H 사용
                    total_mh += float(a.allocated_mh)
                # ------------------------------------------------------------------

                # 데이터 추출
                prio_rank = 1
                gibun_val = ""
                ordering_val = 0
                item_id = 0
                is_item_manual = False 

                # WorkItem이 있는 경우 vs 없는 경우(순수 수동) 구분
                if a.work_item:
                    wo_raw = a.work_item.work_order.strip()
                    op_raw = a.work_item.op
                    gibun_val = a.work_item.gibun_input or ""
                    ordering_val = a.work_item.ordering
                    item_id = a.work_item.id
                    prio_rank = prio_map.get(gibun_val, 1)
                    is_item_manual = a.work_item.is_manual

                    if wo_raw == '간비':
                        # 간비 내용: code가 있으면 code, 없으면 description
                        desc_disp = a.code if a.code else ""
                    else:
                        desc_disp = a.work_item.description
                else:
                    # WorkItem 없이 Assignment만 있는 경우 (순수 수동 입력)
                    wo_raw, op_raw, desc_disp = "Direct", "", ""
                    if a.code: desc_disp = a.code 
                    is_item_manual = True 

                # 템플릿 표시용 데이터 객체
                item_data = {
                    'wo': wo_raw, 
                    'op': op_raw, 
                    'desc': desc_disp, 
                    'mh': float(a.allocated_mh),
                    'gibun': gibun_val,
                    'sort_key': (prio_rank, gibun_val, ordering_val, item_id)
                }

                # ----------------------------------------------------------------
                # [A] 고정 vs 유동 분류 및 모달 데이터 수집
                # ----------------------------------------------------------------
                is_fixed_anchor = False
                
                # 시간이 DB에 저장되어 있어야 고정으로 취급
                if a.start_min is not None and a.end_min is not None:
                    
                    # 1. 간비 작업
                    if wo_raw == '간비':
                        is_fixed_anchor = True
                        
                        # [모달용 데이터 수집]
                        # 0은 이미 SaveManualInputView에서 저장 안 했으므로 여기엔 정상 데이터만 옴
                        s_hhmm = format_min_to_time(a.start_min).replace(":", "")
                        e_hhmm = format_min_to_time(a.end_min).replace(":", "")
                        manual_edit_list.append({
                            'start': s_hhmm,
                            'code': desc_disp, 
                            'end': e_hhmm
                        })

                    # 2. 순수 수동 입력 (WorkItem 없음)
                    elif not a.work_item:
                        is_fixed_anchor = True
                        s_hhmm = format_min_to_time(a.start_min).replace(":", "")
                        e_hhmm = format_min_to_time(a.end_min).replace(":", "")
                        manual_edit_list.append({
                            'start': s_hhmm, 'code': desc_disp, 'end': e_hhmm
                        })
                    
                    # 3. 일반 작업이지만 사용자가 이름을 지정해 고정한 경우
                    elif is_item_manual:
                        is_fixed_anchor = True
                        # 주의: 일반 작업 고정은 '수동 입력 모달(간비용)'에는 띄우지 않음

                if is_fixed_anchor:
                    # [고정 스케줄 등록]
                    item_data.update({
                        'start_min': a.start_min,
                        'end_min': a.end_min,
                        'is_fixed': True,
                        'start_str': format_min_to_time(a.start_min),
                        'end_str': format_min_to_time(a.end_min)
                    })
                    fixed_schedule.append(item_data)
                    occupied_slots.append({'start': a.start_min, 'end': a.end_min})
                    
                    # 간비가 아니면 건수 포함
                    if wo_raw != '간비': task_count += 1

                else:
                    # [유동 스케줄 등록]
                    # 시간이 있어도 일반 작업이면 재계산을 위해 None 처리 (간비 뒤로 밀림)
                    item_data['start_min'] = None
                    item_data['end_min'] = None
                    floating_tasks.append(item_data)
                    
                    if wo_raw != '간비': task_count += 1

            # ----------------------------------------------------------------
            # [B] 스케줄 자동 계산 (빈칸 채우기)
            # ----------------------------------------------------------------
            floating_tasks.sort(key=lambda x: x.get('sort_key'))

            calculated_schedule = []
            if floating_tasks:
                try:                    
                    calc = ScheduleCalculator(
                        floating_tasks, 
                        fixed_slots=occupied_slots, # 이미 찬 시간(간비 등) 회피
                        shift_type=self.object.shift_type
                    )
                    calculated_schedule = calc.calculate()
                except Exception as e:
                    print(f"Schedule Calc Error: {e}")
                    calculated_schedule = floating_tasks

            # ----------------------------------------------------------------
            # [C] 최종 합치기 및 렌더링 준비
            # ----------------------------------------------------------------
            raw_combined = fixed_schedule + calculated_schedule
            raw_combined.sort(key=lambda x: get_adjusted_min(x.get('start_min')))

            final_schedule = []
            last_end_min = 0
            
            # 야간조 등 시작 시간 오프셋 설정
            night_start_offset = 21 * 60 if self.object.shift_type == 'NIGHT' else 0
            if self.object.shift_type == 'NIGHT':
                last_end_min = night_start_offset

            for item in raw_combined:
                s = item.get('start_min')
                e = item.get('end_min')
                
                # 시간이 없으면(계산 실패 등) 목록 맨 뒤로
                if s is None or e is None:
                    item['start_str'] = "-"
                    item['end_str'] = "-"
                    final_schedule.append(item)
                    continue

                # 빈 시간(Gap) 표시
                if s > last_end_min:
                    final_schedule.append({
                        'wo': 'EMPTY_SLOT',
                        'start_min': last_end_min,
                        'end_min': s,
                        'start_str': format_min_to_time(last_end_min),
                        'end_str': format_min_to_time(s),
                    })

                # 자정(1440분) 분리 처리
                if s < 1440 and e > 1440:
                    part1 = item.copy()
                    part1.update({'end_min': 1440, 'start_str': format_min_to_time(s), 'end_str': "24:00"})
                    final_schedule.append(part1)
                    
                    part2 = item.copy()
                    part2.update({'start_min': 1440, 'start_str': "00:00", 'end_str': format_min_to_time(e)})
                    final_schedule.append(part2)
                else:
                    item['start_str'] = format_min_to_time(s)
                    item['end_str'] = format_min_to_time(e)
                    final_schedule.append(item)
                
                last_end_min = e

            # 모달 데이터는 시간순 정렬해서 보냄
            manual_edit_list.sort(key=lambda x: x['start'])

            context.update({
                'schedule': final_schedule,
                'worker_name': worker_name,
                'worker_id': int(worker_id),
                'total_mh': round(total_mh, 1),
                'task_count': task_count,
                # 모달에 기존 데이터 뿌려주기 위함
                'manual_data_json': manual_edit_list, 
            })
            
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
        session = get_object_or_404(WorkSession, pk=pk)
        
        try:
            # 1. 기본 자동 배정 (누가 무엇을 할지 결정, 시간은 미정)
            run_auto_assign(session.id) 
            
            # 2. [필수] 스케줄 동기화 및 당기기 실행
            # 이 함수가 실행되어야 DB에 start_min/end_min이 저장됩니다.
            run_sync_schedule(session.id)
            
            # 3. 결과 갱신
            refresh_worker_totals(session)
            
            messages.success(request, "배정 및 시간 동기화(Gap 채우기) 완료! 🚀")
            
        except Exception as e:
            # 에러 로그 출력 (디버깅용)
            import traceback
            traceback.print_exc()
            messages.error(request, f"배정 중 오류 발생: {str(e)}")
            
        return redirect('result_view', session_id=pk)
    

class CheckGibunView(View):
    """
    항공기 기번 존재 여부 확인 API (클래스형 뷰)
    """
    def get(self, request):
        gibun = request.GET.get('gibun', '').strip().upper()
        
        # 기번이 비어있으면 False 반환
        if not gibun:
            return JsonResponse({'exists': False})

        # DB 조회
        exists = TaskMaster.objects.filter(gibun_code=gibun).exists()
        
        return JsonResponse({'exists': exists})


class TriggerAutoAssignView(SimpleLoginRequiredMixin, View):
    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        
        try:
            AutoAssignService(session.id).run()
            # 1. 자동 배정 실행
            # (services.py 내부에서 기존 자동 배정분을 삭제하고 다시 배정함)
            run_auto_assign(session.id)
            
            # 2. 시간 동기화 (Gap 채우기 및 정렬)
            run_sync_schedule(session.id)
            
            # 3. 작업자별 총 시간(M/H) 갱신
            refresh_worker_totals(session)
            
            messages.success(request, "✅ 자동 배정이 완료되었습니다! (새로운 인원이 반영되었습니다)")
            
        except Exception as e:
            print(f"Auto Assign Error: {e}")
            messages.error(request, f"배정 중 오류가 발생했습니다: {str(e)}")
            
        return redirect('result_view', session_id=session.id)
    

