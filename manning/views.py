import math, json, re
from datetime import timedelta

from django.conf import settings
from django.contrib import messages
from django.db import transaction
from django.db import models as django_models
from django.db.models import Q, Count, Max, Case, When, Sum, FloatField, Min
from django.db.models.functions import Coalesce
from django.forms import modelformset_factory
from django.http import JsonResponse
from django.shortcuts import render, get_object_or_404, redirect
from django.urls import reverse_lazy, reverse
from django.utils import timezone
from django.views import View
from django.views.generic import (
    TemplateView,
    ListView,
    CreateView,
    DeleteView,
    DetailView,
)
from django.views.decorators.http import require_POST
from django.utils.decorators import method_decorator
from django.views.decorators.clickjacking import xframe_options_sameorigin

from manning.planner import Planner
from manning.utils import ScheduleCalculator, format_min_to_time, get_adjusted_min
from .models import (
    GibunTeam,
    WorkSession,
    Worker,
    WorkItem,
    Assignment,
    TaskMaster,
    GibunPriority,
)
from .forms import KanbiAssignmentForm, ManageItemForm, WorkItemForm, WorkerIndirectForm
from .services import run_auto_assign, refresh_worker_totals, run_sync_schedule
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.decorators.csrf import csrf_exempt


# -----------------------------------------------------------
# 공용 헬퍼 함수
# -----------------------------------------------------------
KANBI_WO = "간비"
DIRECT_WO = "DIRECT"


def get_or_create_common_item(session, wo: str) -> WorkItem:
    defaults = {
        "gibun_input": "COMMON",
        "op": "",
        "description": "공용 항목",
        "work_mh": 0.0,
        "is_manual": True,
        "ordering": 0,
    }

    if wo == KANBI_WO:
        defaults["description"] = "간접비용/휴식(공용)"
    elif wo == DIRECT_WO:
        defaults["description"] = "직접 입력(공용)"

    item, _ = WorkItem.objects.get_or_create(
        session=session, work_order=wo, defaults=defaults
    )
    return item


class SimpleLoginRequiredMixin:
    def dispatch(self, request, *args, **kwargs):
        if not request.session.get("is_authenticated"):
            return redirect("login")
        return super().dispatch(request, *args, **kwargs)


class SimpleLoginView(View):
    def get(self, request):
        if request.session.get("is_authenticated"):
            return redirect("index")
        return render(request, "manning/login.html")

    def post(self, request):
        password = request.POST.get("password")

        if password == settings.SIMPLE_PASSWORD_ADMIN:
            request.session["is_authenticated"] = True
            request.session["user_role"] = "admin"
            return redirect("index")

        elif password == settings.SIMPLE_PASSWORD_USER:
            request.session["is_authenticated"] = True
            request.session["user_role"] = "user"
            return redirect("index")

        else:
            messages.error(request, "비밀번호가 올바르지 않습니다.")
            return render(request, "manning/login.html")


class SimpleLogoutView(View):
    def get(self, request):
        request.session.flush()
        return redirect("login")


class IndexView(SimpleLoginRequiredMixin, TemplateView):
    template_name = "manning/index.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        # 활성 세션 통계
        active_qs = WorkSession.objects.filter(is_active=True)
        active_count = active_qs.count()

        # 이력 통계 (최근 7일 기준 예시)
        cutoff = timezone.now() - timedelta(days=7)
        history_count = WorkSession.objects.filter(is_active=False).count()

        context.update(
            {
                "today": timezone.localdate(),
                "active_count": active_count,
                "day_count": active_qs.filter(shift_type="DAY").count(),
                "night_count": active_qs.filter(shift_type="NIGHT").count(),
                "history_count": history_count,
            }
        )
        return context


class SessionListView(SimpleLoginRequiredMixin, ListView):
    model = WorkSession
    template_name = "manning/session_list.html"
    context_object_name = "active_sessions"

    def get_queryset(self):
        return (
            WorkSession.objects.filter(is_active=True)
            .annotate(
                worker_count=Count("worker", distinct=True),
                item_count=Count(
                    "workitem", filter=~Q(workitem__work_order="간비"), distinct=True
                ),
                total_mh=Coalesce(
                    Sum("workitem__work_mh", filter=~Q(workitem__work_order="간비")),
                    0.0,
                    output_field=FloatField(),
                ),
            )
            .order_by("-created_at")
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["active_count"] = self.object_list.count()
        context["navbar_template"] = "manning/navbar/navbar_back_session.html"
        return context


class CreateSessionView(SimpleLoginRequiredMixin, View):
    def get(self, request):
        slot_name = request.GET.get("slot", "")
        return render(
            request,
            "manning/create_session.html",
            # navbar
            {
                "slot": slot_name,
                "navbar_template": "manning/navbar/navbar_back_create.html",
            },
        )

    def post(self, request):
        session_name = request.POST.get("session_name", "").strip()
        worker_names = request.POST.get("worker_names", "")
        gibun_input = request.POST.get("gibun_input", "")
        shift_type = request.POST.get("shift_type", "DAY")

        if not session_name:
            session_name = "Session (이름 없음)"

        final_name = session_name
        cnt = 1
        while WorkSession.objects.filter(name=final_name, is_active=True).exists():
            cnt += 1
            final_name = f"{session_name} ({cnt})"

        with transaction.atomic():
            session = WorkSession.objects.create(
                name=final_name, shift_type=shift_type, is_active=True
            )

            # -------------------------------------------------------------
            # 1. 작업자 등록 (순서 보장)
            # -------------------------------------------------------------
            lines = worker_names.splitlines()
            seen_names = set()

            for line in lines:
                # 쉼표, 탭, 공백 등으로 이름 분리
                names = re.split(r"[,\t/;|\s]+", line)
                names = [n.strip() for n in names if n.strip()]

                for name in names:
                    if name not in seen_names:
                        # 팀 정보 없이 이름만 저장 -> 입력 순서(ID)대로 저장됨
                        Worker.objects.create(session=session, name=name)
                        seen_names.add(name)

            # -------------------------------------------------------------
            # 2. 기번 및 마스터 데이터 저장
            # -------------------------------------------------------------
            if gibun_input:
                raw_gibuns = re.split(r"[,\s]+", gibun_input)
                raw_gibuns = [g.strip() for g in raw_gibuns if g.strip()]

                for idx, gibun in enumerate(raw_gibuns, start=1):
                    # GibunPriority는 입력 순서를 기억합니다.
                    GibunPriority.objects.create(
                        session=session, gibun=gibun, order=idx
                    )

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
                                work_mh=tm.default_mh,
                            )
                    else:
                        WorkItem.objects.create(
                            session=session,
                            gibun_input=gibun,
                            model_type=gibun,
                            work_order="정보 없음",
                            description="마스터 데이터가 없습니다.",
                            work_mh=0.0,
                        )

        messages.success(request, f"세션 '{final_name}'이(가) 시작되었습니다!")

        run_auto_assign(session.id)
        run_sync_schedule(session.id)

        return redirect("session_list")


def parse_worker_names(worker_names: str):
    """
    허용 입력:
      - 홍길동, 홍이동
      - 홍길동\n홍이동
      - HL8705: 홍길동, 홍이동
      - 8705: 홍길동, 홍이동
      - HL8398: 홍삼동
    결과: Worker 이름 리스트(중복 제거, 입력 순서 유지)
    """
    if not worker_names:
        return []

    text = worker_names.replace("\r", "").strip()
    if not text:
        return []

    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]

    names = []
    for line in lines:
        # "기번: ..." 형태면 ':' 뒤만 이름 구간으로 취급
        part = line.split(":", 1)[1].strip() if ":" in line else line

        # 콤마/탭 기준 분리 (필요하면 구분자 추가 가능)
        tokens = re.split(r"[,\t]+", part)
        for t in tokens:
            n = t.strip()
            if n:
                names.append(n)

    # 중복 제거(입력 순서 유지)
    seen = set()
    uniq = []
    for n in names:
        if n not in seen:
            uniq.append(n)
            seen.add(n)

    return uniq


class EditSessionView(SimpleLoginRequiredMixin, View):
    # 세션 정보 및 작업자 명단 수정
    def get(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        worker_names = "\n".join([w.name for w in session.worker_set.all()])
        return render(
            request,
            "manning/edit_session.html",
            {
                "session": session,
                "worker_names_str": worker_names,
                "navbar_template": "manning/navbar/navbar_back_edit.html",
            },
        )

    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)

        session_name = request.POST.get("session_name")
        if session_name:
            session.name = session_name
            session.save()

        worker_names = request.POST.get("worker_names", "")

        # [수정된 부분] 쉼표(,)를 줄바꿈(\n)으로 먼저 변경해야 합니다!
        normalized_str = worker_names.replace(",", "\n").replace("\r", "")

        # 그 다음 줄바꿈 기준으로 쪼개고 공백 제거
        raw_names = [n.strip() for n in normalized_str.split("\n") if n.strip()]

        # 중복 제거
        new_names = list(dict.fromkeys(raw_names))

        workers_to_delete = session.worker_set.exclude(name__in=new_names)

        if workers_to_delete.exists():
            affected_items = WorkItem.objects.filter(
                session=session, assignments__worker__in=workers_to_delete
            ).distinct()
            # 삭제되는 작업자가 포함된 아이템은 자동 배정 대상으로 전환
            affected_items.update(is_manual=False)

        workers_to_delete.delete()

        # 신규 작업자 추가 (이미 있는 사람은 건너뜀)
        existing_names = session.worker_set.values_list("name", flat=True)
        for name in new_names:
            if name not in existing_names:
                Worker.objects.create(session=session, name=name)

        run_auto_assign(session.id)
        run_sync_schedule(session.id)
        refresh_worker_totals(session)

        messages.success(request, "세션 정보가 수정되었습니다!")
        return redirect(f"{reverse('result_view', args=[session.id])}?reassigned=1")


class EditAllView(SimpleLoginRequiredMixin, View):
    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)

        WorkItemFormSet = modelformset_factory(
            WorkItem, form=WorkItemForm, extra=3, can_delete=True
        )
        formset = WorkItemFormSet(
            request.POST,
            request.FILES,
            queryset=WorkItem.objects.filter(session=session),
        )

        if not formset.is_valid():
            worker_names = "\n".join([w.name for w in session.worker_set.all()])
            messages.error(request, "입력값에 오류가 있습니다. 다시 확인하세요.")
            return render(
                request,
                "manning/edit_all.html",
                {
                    "session": session,
                    "formset": formset,
                    "worker_names_str": worker_names,
                },
            )

        with transaction.atomic():
            instances = formset.save(commit=False)

            for inst in instances:
                if not inst.session_id:
                    inst.session = session
                inst.save()

            for obj in formset.deleted_objects:
                obj.delete()

            for form in formset.forms:
                if form in formset.deleted_forms:
                    continue
                if not form.instance.pk:
                    continue

                item = form.instance
                input_str = (form.cleaned_data.get("assigned_text") or "").strip()

                # 기존 배정 초기화
                item.assignments.all().delete()

                if input_str:
                    normalized = input_str.replace("\n", ",")
                    raw_names = [n.strip() for n in normalized.split(",") if n.strip()]

                    valid_workers = list(
                        Worker.objects.filter(session=session, name__in=raw_names)
                    )

                    if valid_workers:
                        mh = (
                            round(float(item.work_mh or 0) / len(valid_workers), 2)
                            if item.work_mh
                            else 0
                        )
                        for w in valid_workers:
                            # [수정 1] create -> update_or_create (IntegrityError 방지)
                            Assignment.objects.update_or_create(
                                work_item=item,
                                worker=w,
                                start_min__isnull=True,  # 시간이 없는 건에 한해 유니크 체크
                                end_min__isnull=True,
                                defaults={"allocated_mh": mh},
                            )
                        item.is_manual = True
                    else:
                        item.is_manual = False
                else:
                    item.is_manual = False

                item.save(update_fields=["is_manual"])

        messages.success(request, "변경사항이 저장되었습니다.")
        return redirect("edit_all", session_id=session.id)


class ResultView(SimpleLoginRequiredMixin, DetailView):
    model = WorkSession
    template_name = "manning/result_view.html"
    context_object_name = "session"
    pk_url_kwarg = "session_id"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        session = self.object

        # 1. 화면에 들어올 때마다 최신 M/H 합계 갱신 (데이터 불일치 방지)
        refresh_worker_totals(session)

        filter_worker = self.request.GET.get("worker")

        # 2. 우선순위 맵핑 준비
        gibun_priorities = GibunPriority.objects.filter(session=session)
        prio_map = {gp.gibun: gp.order for gp in gibun_priorities}
        whens = [When(gibun_input=k, then=v) for k, v in prio_map.items()]

        # 3. 아이템 조회 (Assignment와 Worker를 미리 가져옴 - Prefetch)
        items_qs = (
            session.workitem_set.all()
            .prefetch_related("assignments__worker")
            .annotate(
                prio_order=Case(
                    *whens, default=999, output_field=django_models.IntegerField()
                )
            )
            .order_by("prio_order", "gibun_input", "ordering", "id")
        )

        if filter_worker:
            items_qs = items_qs.filter(
                assignments__worker__name=filter_worker
            ).distinct()

        # [핵심 수정] 템플릿에서 쉽게 쓰도록 Python 단에서 이름 합치기 처리
        items = list(items_qs)
        for item in items:
            # 이 아이템에 배정된 모든 배정 내역(Assignments) 가져오기
            assigns = item.assignments.all()
            if assigns:
                # 작업자 이름들만 뽑아서 중복 제거 후 리스트화
                names = list(set([a.worker.name for a in assigns if a.worker]))
                names.sort()  # 가나다순 정렬
                item.assigned_names_str = ", ".join(
                    names
                )  # "김철수, 이영희" 형태로 저장
            else:
                item.assigned_names_str = ""  # 배정 없음

        wo_total = sum(1 for item in items if item.work_order != KANBI_WO)

        context.update(
            {
                "workers": session.worker_set.all(),
                "items": items,  # 가공된 items 리스트 전달
                "filter_worker": filter_worker or "",
                "wo_total": wo_total,
                "navbar_template": "manning/navbar/navbar_back_result.html",
            }
        )
        return context

    def post(self, request, session_id):
        # 결과 화면에서 '자동 배정' 버튼 눌렀을 때
        run_auto_assign(session_id)
        run_sync_schedule(session_id)
        messages.success(request, "자동 배정 및 동기화가 완료되었습니다! 🤖")
        return redirect("result_view", session_id=session_id)


class EditItemView(SimpleLoginRequiredMixin, View):
    def get(self, request, item_id):
        item = get_object_or_404(WorkItem, id=item_id)
        all_workers = item.session.worker_set.all().order_by("name")
        assigned_worker_ids = item.assignments.values_list("worker_id", flat=True)

        context = {
            "item": item,
            "all_workers": all_workers,
            "assigned_ids": assigned_worker_ids,
        }
        return render(request, "manning/edit_item.html", context)

    def post(self, request, item_id):
        item = get_object_or_404(WorkItem, id=item_id)

        item.model_type = request.POST.get("model_type", "")
        item.work_order = request.POST.get("work_order")
        item.op = request.POST.get("op")
        item.description = request.POST.get("description")
        item.work_mh = float(request.POST.get("work_mh") or 0)

        selected_ids = request.POST.getlist("worker_ids")

        # 기존 배정 내역 삭제
        item.assignments.all().delete()

        if selected_ids:
            item.is_manual = True
            share_mh = round(item.work_mh / len(selected_ids), 2)

            for w_id in selected_ids:
                worker = Worker.objects.get(id=w_id)
                # [수정 2] create -> update_or_create
                Assignment.objects.update_or_create(
                    work_item=item,
                    worker=worker,
                    start_min__isnull=True,
                    end_min__isnull=True,
                    defaults={"allocated_mh": share_mh},
                )
        else:
            item.is_manual = False

        item.save()

        messages.success(request, f"'{item.work_order}' 작업이 수정되었습니다.")
        return redirect("result_view", session_id=item.session.id)


from django.shortcuts import render, redirect, get_object_or_404
from django.views import View
from django.contrib.auth.mixins import LoginRequiredMixin
from django.db import transaction
from django.forms import modelformset_factory
from django.db.models import Case, When  # ✅ 정렬 순서 보장을 위해 필수

from .models import WorkSession, WorkItem, Worker, GibunPriority, Assignment
from .forms import WorkItemForm
from .services import run_auto_assign, run_sync_schedule


class ManageItemsView(SimpleLoginRequiredMixin, View):
    def get(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)

        # ---------------------------------------------------------
        # 1. [정렬 로직] 기번 우선순위 -> 작업순서 -> 등록순서
        # ---------------------------------------------------------
        gibun_priority_map = {
            gp.gibun: gp.order for gp in GibunPriority.objects.filter(session=session)
        }

        all_items = WorkItem.objects.filter(session=session)

        sorted_item_list = sorted(
            all_items,
            key=lambda x: (
                gibun_priority_map.get((x.gibun_input or "").strip().upper(), 999),
                int(x.ordering or 0),
                x.id,
            ),
        )

        sorted_ids = [item.id for item in sorted_item_list]

        if sorted_ids:
            preserved_order = Case(
                *[When(pk=pk, then=pos) for pos, pk in enumerate(sorted_ids)]
            )
            queryset = WorkItem.objects.filter(pk__in=sorted_ids).order_by(
                preserved_order
            )
        else:
            queryset = WorkItem.objects.none()

        # ---------------------------------------------------------
        # 2. Formset 생성 및 초기값(이름) 설정
        # ---------------------------------------------------------
        ItemFormSet = modelformset_factory(
            WorkItem, form=WorkItemForm, extra=0, can_delete=True
        )
        formset = ItemFormSet(queryset=queryset)

        for form in formset:
            if form.instance.pk:
                assigns = form.instance.assignments.all()
                if assigns.exists():
                    text_parts = []
                    for a in assigns:
                        # 소수점 .0 제거 (5.0 -> 5,  5.5 -> 5.5)
                        mh_str = (
                            f"{int(a.allocated_mh)}"
                            if a.allocated_mh.is_integer()
                            else f"{a.allocated_mh}"
                        )
                        text_parts.append(f"{a.worker.name}: {mh_str}")
                    worker_names = ", ".join(text_parts)
                    form.initial["assigned_text"] = worker_names

        # ---------------------------------------------------------
        # 3. 화면 표시용 데이터 준비
        # ---------------------------------------------------------
        gibun_priorities = GibunPriority.objects.filter(session=session).order_by(
            "order"
        )

        workers = session.worker_set.all().order_by("id")
        worker_names_list = []
        for w in workers:
            limit_str = (
                f"{int(w.limit_mh)}" if w.limit_mh.is_integer() else f"{w.limit_mh}"
            )
            worker_names_list.append(f"{w.name}: {limit_str}")
        worker_names_str = "\n".join(worker_names_list)

        return render(
            request,
            "manning/manage_items.html",
            {
                "session": session,
                "formset": formset,
                "gibun_priorities": gibun_priorities,
                "worker_names_str": worker_names_str,
                "navbar_template": "manning/navbar/navbar_back_manage.html",
            },
        )

    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)

        # ---------------------------------------------------------
        # 0. 기번 우선순위 업데이트 (prio_ 로 들어오는 값)
        # ---------------------------------------------------------
        for key, value in request.POST.items():
            if key.startswith("prio_"):
                try:
                    p_id = int(key.split("_")[1])
                    new_order = int(value)
                    gp = GibunPriority.objects.filter(id=p_id, session=session).first()
                    if gp and gp.order != new_order:
                        gp.order = new_order
                        gp.save()
                except ValueError:
                    continue

        ItemFormSet = modelformset_factory(
            WorkItem, form=WorkItemForm, extra=0, can_delete=True
        )

        # ⚠️ queryset은 반드시 session으로 제한
        qs = WorkItem.objects.filter(session=session)
        formset = ItemFormSet(request.POST, queryset=qs)

        if not formset.is_valid():
            print("\n❌ [Formset 유효성 검사 실패] ❌")
            print(formset.errors)
            print("----------------------------------\n")
            return redirect("manage_items", session_id=session.id)

        # ---------------------------------------------------------
        # 1. 저장 트랜잭션
        # ---------------------------------------------------------
        with transaction.atomic():
            # -----------------------------------------------------
            # (0) 근무 한도/명단 업데이트를 먼저 반영
            # -----------------------------------------------------
            worker_str = request.POST.get("worker_names_str", "")
            valid_names = set()

            lines = worker_str.splitlines()

            for line in lines:
                line = line.strip()
                if not line:
                    continue

                # "이름: 시간" 파싱
                if ":" in line:
                    parts = line.split(":", 1)
                    name_part = parts[0].strip()
                    limit_part = parts[1].strip()
                    try:
                        limit_val = float(limit_part)
                    except ValueError:
                        limit_val = 12.0
                else:
                    name_part = line
                    limit_val = 12.0

                if name_part:
                    valid_names.add(name_part)
                    worker, created = Worker.objects.get_or_create(
                        session=session, name=name_part
                    )
                    if worker.limit_mh != limit_val:
                        worker.limit_mh = limit_val
                        worker.save(update_fields=["limit_mh"])

            workers_to_delete = Worker.objects.filter(session=session).exclude(
                name__in=valid_names
            )

            if workers_to_delete.exists():
                affected_items = WorkItem.objects.filter(
                    session=session,
                    assignments__worker__in=workers_to_delete,
                ).distinct()

                # 삭제되는 작업자가 포함된 아이템은 자동 배정 대상으로 전환
                affected_items.update(is_manual=False)

                workers_to_delete.delete()
            # (1) 삭제 처리
            formset.save(commit=False)
            for obj in formset.deleted_objects:
                obj.delete()

            # (2) 수정/추가 처리
            for form in formset.forms:
                if form in formset.deleted_forms:
                    continue
                if not form.is_valid():
                    print(f"❌ 폼 에러 (ID: {form.instance.id}): {form.errors}")
                    continue

                instance = form.save(commit=False)
                instance.session = session

                # ✅ [핵심] assigned_text가 있으면 해당 WorkItem을 manual로 전환
                worker_name_input = (
                    form.cleaned_data.get("assigned_text") or ""
                ).strip()

                # (3) assigned_text 처리: 고정 배정 생성
                current_assigns = instance.assignments.all()
                current_names_set = set(a.worker.name for a in current_assigns)

                raw_inputs = [
                    n.strip()
                    for n in re.split(r"[\n\s,]+", worker_name_input)
                    if n.strip()
                ]
                clean_names_list = []
                for item in raw_inputs:
                    if ":" in item:
                        # 콜론이 있으면 앞부분(이름)만 가져옴
                        clean_names_list.append(item.split(":")[0].strip())
                    else:
                        clean_names_list.append(item)

                # 근무 한도 명단이 있으면 그 명단만 허용
                if valid_names:
                    clean_names_list = [n for n in clean_names_list if n in valid_names]

                ordered_names = []
                seen_names = set()
                for n in clean_names_list:
                    if n not in seen_names:
                        ordered_names.append(n)
                        seen_names.add(n)

                new_names_set = set(ordered_names)

                if new_names_set:
                    instance.is_manual = True  # 자동배정 대상 제외
                else:
                    instance.is_manual = False  # 다시 자동배정 포함

                instance.save()

                if current_names_set != new_names_set:
                    # 기존 배정 삭제 후 재생성 (균등 분배 로직 유지)
                    instance.assignments.all().delete()

                    if ordered_names:
                        total_mh = float(instance.work_mh or 0.0)

                        workers_all = list(Worker.objects.filter(session=session))
                        worker_count = len(workers_all)
                        name_to_worker = {w.name: w for w in workers_all}

                        selected_workers = [
                            name_to_worker[n]
                            for n in ordered_names
                            if n in name_to_worker
                        ]

                        if selected_workers:
                            load_map = {w.id: 0.0 for w in workers_all}
                            load_qs = (
                                Assignment.objects.filter(work_item__session=session)
                                .exclude(work_item=instance)
                                .exclude(
                                    work_item__work_order__in=[KANBI_WO, DIRECT_WO]
                                )
                                .values("worker_id")
                                .annotate(total=Sum("allocated_mh"))
                            )
                            for row in load_qs:
                                load_map[row["worker_id"]] = float(row["total"] or 0.0)

                            total_existing = sum(load_map.values())
                            target_avg = (
                                (total_existing + total_mh) / worker_count
                                if worker_count
                                else 0.0
                            )

                            deficits = [
                                max(target_avg - load_map[w.id], 0.0)
                                for w in selected_workers
                            ]

                            if sum(deficits) > 0:
                                allocations = [
                                    round(total_mh * d / sum(deficits), 2)
                                    for d in deficits
                                ]
                            else:
                                base = round(total_mh / len(selected_workers), 2)
                                allocations = [base] * len(selected_workers)

                            diff = round(total_mh - sum(allocations), 2)
                            allocations[-1] = round(allocations[-1] + diff, 2)

                            for worker_obj, alloc in zip(selected_workers, allocations):
                                Assignment.objects.create(
                                    work_item=instance,
                                    worker=worker_obj,
                                    is_fixed=True,
                                    allocated_mh=alloc,
                                )

            # -----------------------------------------------------
            # (3) 남은 기번이 없으면 우선순위도 정리
            # -----------------------------------------------------
            remaining_gibuns = set(
                WorkItem.objects.filter(session=session)
                .exclude(gibun_input__isnull=True)
                .exclude(gibun_input__exact="")
                .values_list("gibun_input", flat=True)
                .distinct()
            )
            GibunPriority.objects.filter(session=session).exclude(
                gibun__in=remaining_gibuns
            ).delete()

        # ---------------------------------------------------------
        # 2. 자동 배정/스케줄 동기화 재실행
        # ---------------------------------------------------------
        run_auto_assign(session.id)
        run_sync_schedule(session.id)

        return redirect(f"{reverse('result_view', args=[session.id])}?reassigned=1")


# @method_decorator(csrf_exempt, name="dispatch")
class PasteDataView(SimpleLoginRequiredMixin, View):
    def get(self, request):
        return render(
            request,
            "manning/paste_data.html",
            {
                "navbar_template": "manning/navbar/navbar_back_paste.html",
            },
        )

    def post(self, request):
        try:
            data = json.loads(request.body)

            if not isinstance(data, list):
                return JsonResponse(
                    {
                        "status": "error",
                        "message": "리스트 형태(JSON 배열)로 보내야 합니다.",
                    },
                    status=400,
                )

            # ✅ 임시 OP 부여용 카운터: (gibun, wo)별로 9000부터
            temp_op_counter = {}

            normalized = []
            for item in data:
                gibun = (item.get("gibun_code") or "").strip().upper()
                wo = (item.get("work_order") or "").strip()
                op = (item.get("op") or "").strip()
                desc = (item.get("description") or "").strip()
                mh_raw = item.get("default_mh")

                # 완전 공란 행 스킵
                if not any([gibun, wo, op, desc, str(mh_raw or "").strip()]):
                    continue

                # ✅ 기번은 필수
                if not gibun:
                    continue

                # ✅ 해결안 2: WO/OP 임시값 자동 부여
                if not wo:
                    wo = "UNKNOWN"

                if not op:
                    key = (gibun, wo)
                    n = temp_op_counter.get(key, 9000)
                    op = str(n)
                    temp_op_counter[key] = n + 1

                # MH 파싱
                try:
                    default_mh = float(mh_raw or 0)
                except (ValueError, TypeError):
                    default_mh = 0.0

                normalized.append(
                    {
                        "gibun_code": gibun,
                        "work_order": wo,
                        "op": op,
                        "description": desc,
                        "default_mh": default_mh,
                    }
                )

            # ✅ 정렬: gibun, wo, op(숫자 우선)
            def op_sort_key(op_str):
                s = str(op_str).strip()
                return (0, int(s)) if s.isdigit() else (1, s)

            normalized.sort(
                key=lambda x: (x["gibun_code"], x["work_order"], op_sort_key(x["op"]))
            )

            saved_count = 0
            with transaction.atomic():
                for item in normalized:
                    TaskMaster.objects.update_or_create(
                        gibun_code=item["gibun_code"],
                        work_order=item["work_order"],
                        op=item["op"],
                        defaults={
                            "description": item["description"],
                            "default_mh": item["default_mh"],
                        },
                    )
                    saved_count += 1

            return JsonResponse({"status": "success", "count": saved_count})

        except json.JSONDecodeError:
            return JsonResponse(
                {"status": "error", "message": "잘못된 JSON 형식입니다."}, status=400
            )
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)


class UpdateLimitsView(SimpleLoginRequiredMixin, View):
    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)

        for key, value in request.POST.items():
            if key.startswith("limit_"):
                worker_id = key.split("_")[1]
                new_limit = float(value)

                worker = Worker.objects.get(id=worker_id)
                worker.limit_mh = new_limit
                worker.save()

        messages.success(request, "작업자별 근무 한도가 수정되었습니다! 🕒")
        return redirect("result_view", session_id=session.id)


class FinishSessionView(SimpleLoginRequiredMixin, View):
    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        session.is_active = False
        session.save()

        messages.success(
            request,
            f"✅ {session.name} 작업이 완료되었습니다. 기록 보관소로 이동합니다.",
        )
        return redirect("index")


class HistoryView(SimpleLoginRequiredMixin, ListView):
    model = WorkSession
    template_name = "manning/history.html"
    context_object_name = "history_list"

    def get_queryset(self):
        qs = WorkSession.objects.filter(is_active=False).order_by("-created_at")
        query = self.request.GET.get("q")
        if query:
            qs = qs.filter(
                Q(name__icontains=query)
                | Q(workitem__gibun_input__icontains=query)
                | Q(worker__name__icontains=query)
            ).distinct()
        return qs

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["navbar_template"] = "manning/navbar/navbar_back_history.html"
        return context


@require_POST
def clear_history(request):
    WorkSession.objects.filter(is_active=False).delete()
    return redirect("history")


@require_POST
def delete_history_session(request, session_id):
    if request.session.get("user_role") != "admin" and not request.user.is_superuser:
        messages.error(request, "관리자 권한이 필요합니다.")
        return redirect("history")

    session = get_object_or_404(WorkSession, id=session_id, is_active=False)
    session.delete()
    messages.success(request, "기록이 삭제되었습니다.")
    return redirect("history")


def _norm_int(v, default=None):
    try:
        return int(v)
    except Exception:
        return default


def hhmm_to_min(hhmm: str):
    if not hhmm:
        return None
    s = str(hhmm).strip()
    if len(s) != 4 or not s.isdigit():
        return None
    hh = int(s[:2])
    mm = int(s[2:])
    if hh < 0 or hh > 24:
        return None
    if mm < 0 or mm >= 60:
        return None
    if hh == 24 and mm != 0:
        return None
    return hh * 60 + mm


def _clip_if_invalid_time(s, e):
    if s is None or e is None:
        return None
    if e <= s:
        return None
    return (s, e)


def _split_direct_by_indirect(d_start, d_end, k_start, k_end):
    """
    direct(d_start~d_end)에서 indirect(k_start~k_end) 구간을 '도려내기' (trimming)
    반환: 남는 (start,end) 조각 리스트
    """
    # 안겹치면 원본 유지
    if k_end <= d_start or k_start >= d_end:
        return [(d_start, d_end)]

    pieces = []
    # 앞 조각
    if d_start < k_start:
        pieces.append((d_start, min(k_start, d_end)))
    # 뒤 조각
    if d_end > k_end:
        pieces.append((max(k_end, d_start), d_end))

    # 유효한 조각만
    return [(s, e) for (s, e) in pieces if e > s]


class SaveManualInputView(SimpleLoginRequiredMixin, View):
    """
    ✅ 새 설계 포인트
    1) 요청으로 들어온 건 '간비(code)' 위주
    2) 저장 시점에 DB에 있는 기존 직비(wo/op)를 읽음
    3) 간비와 겹치는 기존 직비를 조각내서(앞/뒤) 다시 저장
    4) 간비는 우선순위로 저장
    """

    @transaction.atomic
    def post(self, request, session_id):
        try:
            data = json.loads(request.body or "{}")
            raw_assignments = data.get("assignments", [])

            session = get_object_or_404(WorkSession, id=session_id)

            # -----------------------------
            # 1) 들어온 간비 리스트 정리
            # -----------------------------
            kanbi_list = []
            for row in raw_assignments:
                worker_id = _norm_int(row.get("worker_id"))
                s = _norm_int(row.get("start_min"))
                e = _norm_int(row.get("end_min"))
                code = (row.get("code") or "").strip()

                if worker_id is None or s is None or e is None:
                    continue
                if not code:
                    continue

                # 야간 보정은 JS에서 했지만 혹시 몰라 서버에서도 보강
                if e <= s:
                    e += 1440

                # 시간 유효성
                if _clip_if_invalid_time(s, e) is None:
                    continue

                kanbi_list.append(
                    {
                        "worker_id": worker_id,
                        "start_min": s,
                        "end_min": e,
                        "code": code,
                    }
                )

            if not kanbi_list:
                return JsonResponse(
                    {"status": "error", "message": "저장할 간비 데이터가 없습니다."},
                    status=400,
                )

            # -----------------------------
            # 2) 간비 저장 + 기존 스케줄 재계산
            # -----------------------------
            worker_ids = sorted(set(k["worker_id"] for k in kanbi_list))

            kanbi_item = get_or_create_common_item(session, KANBI_WO)

            # 기존 간비 제거(같은 작업자)
            Assignment.objects.filter(
                work_item=kanbi_item,
                worker_id__in=worker_ids,
            ).delete()

            # 간비 저장 (우선순위)
            new_kanbi_to_create = []
            for k in kanbi_list:
                new_kanbi_to_create.append(
                    Assignment(
                        work_item=kanbi_item,
                        worker_id=k["worker_id"],
                        code=k["code"],
                        start_min=k["start_min"],
                        end_min=k["end_min"],
                        allocated_mh=0.0,
                        is_fixed=True,
                    )
                )
            Assignment.objects.bulk_create(new_kanbi_to_create)

            # 기존 직비(일반 작업) 시간만 초기화 -> 재계산
            Assignment.objects.filter(
                work_item__session=session,
                worker_id__in=worker_ids,
            ).exclude(work_item__work_order__in=[KANBI_WO, DIRECT_WO]).update(
                start_min=None, end_min=None
            )

            run_sync_schedule(session.id)
            refresh_worker_totals(session)

            # -----------------------------
            # 6) 최종 정렬/후처리(선택)
            # -----------------------------
            # 시간표 화면에서 정렬이 start_min 기준이면 OK
            # 혹시 다른 기준이면 여기서 정렬 키를 보장해주는 후처리 메서드를 호출해도 됨.

            return JsonResponse(
                {
                    "status": "success",
                    "kanbi_saved": len(new_kanbi_to_create),
                }
            )

        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=400)


def _reset_manual_for_workers(session, worker_ids):
    kanbi_item = get_or_create_common_item(session, KANBI_WO)

    deleted_qs = Assignment.objects.filter(
        work_item=kanbi_item,
        worker_id__in=worker_ids,
    )
    deleted_count = deleted_qs.count()
    deleted_qs.delete()

    Assignment.objects.filter(
        work_item__session=session,
        worker_id__in=worker_ids,
    ).exclude(work_item__work_order__in=[KANBI_WO, DIRECT_WO]).update(
        start_min=None, end_min=None
    )

    run_sync_schedule(session.id)
    refresh_worker_totals(session)

    return deleted_count


class ResetManualInputView(SimpleLoginRequiredMixin, View):
    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        try:
            data = json.loads(request.body or "{}")
        except json.JSONDecodeError:
            data = {}

        worker_id = data.get("worker_id")
        if worker_id in (None, "", "all"):
            worker_ids = list(session.worker_set.values_list("id", flat=True))
        else:
            try:
                worker_id = int(worker_id)
            except (TypeError, ValueError):
                return JsonResponse(
                    {"status": "error", "message": "잘못된 작업자 ID입니다."},
                    status=400,
                )
            if not session.worker_set.filter(id=worker_id).exists():
                return JsonResponse(
                    {"status": "error", "message": "작업자를 찾을 수 없습니다."},
                    status=404,
                )
            worker_ids = [worker_id]

        deleted_count = _reset_manual_for_workers(session, worker_ids)
        return JsonResponse({"status": "success", "deleted": deleted_count}, status=200)


class ResetWorkerManualInputView(SimpleLoginRequiredMixin, View):
    def post(self, request, session_id, worker_id):
        session = get_object_or_404(WorkSession, id=session_id)
        if not session.worker_set.filter(id=worker_id).exists():
            return JsonResponse(
                {"status": "error", "message": "작업자를 찾을 수 없습니다."},
                status=404,
            )

        deleted_count = _reset_manual_for_workers(session, [worker_id])
        return JsonResponse({"status": "success", "deleted": deleted_count}, status=200)


class PasteInputView(SimpleLoginRequiredMixin, View):
    def get(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        taskmasters = TaskMaster.objects.all().order_by("gibun_code")
        return render(
            request,
            "manning/paste_data.html",
            {
                "session": session,
                "taskmasters": taskmasters,
                "navbar_template": "manning/navbar/navbar_back_paste.html",
            },
        )

    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        raw_data = request.POST.get("excel_data", "")

        if not raw_data:
            messages.warning(request, "입력된 데이터가 없어서 홈으로 돌아갑니다.")
            return redirect("index")

        new_items = []
        lines = raw_data.strip().split("\n")

        for idx, line in enumerate(lines):
            line = line.strip()
            if not line:
                continue

            if idx == 0 and (
                "기번" in line or "work order" in line.lower() or "wo" in line.lower()
            ):
                continue

            columns = line.split("\t")
            if len(columns) < 2:
                continue

            try:
                model_val = columns[0].strip()
                wo_val = columns[1].strip() if len(columns) > 1 else ""
                op_val = columns[2].strip() if len(columns) > 2 else ""
                desc_val = columns[3].strip() if len(columns) > 3 else ""
                mh_str = columns[4].strip() if len(columns) > 4 else ""

                if mh_str == "":
                    mh_val = 0.0
                else:
                    try:
                        mh_val = float(mh_str)
                    except ValueError:
                        continue

                if wo_val:
                    task_master, created = TaskMaster.objects.update_or_create(
                        work_order=wo_val,
                        op=op_val,
                        defaults={
                            "gibun_code": model_val,
                            "description": desc_val,
                            "default_mh": mh_val,
                        },
                    )

                    new_items.append(
                        WorkItem(
                            session=session,
                            task_master=task_master,
                            model_type=model_val,
                            work_order=wo_val,
                            op=op_val,
                            description=desc_val,
                            work_mh=mh_val,
                        )
                    )
            except Exception as e:
                print(f"Error processing line: {line}, Error: {e}")
                continue

        if new_items:
            with transaction.atomic():
                WorkItem.objects.bulk_create(new_items)
            messages.success(request, f"✅ {len(new_items)}건 저장 완료!")
        else:
            messages.warning(request, "저장할 유효한 데이터가 없습니다.")

        return redirect("index")


class PasteItemsView(SimpleLoginRequiredMixin, View):
    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)

        try:
            data = json.loads(request.body or "[]")
            if not isinstance(data, list):
                return JsonResponse(
                    {
                        "status": "error",
                        "message": "리스트 형태(JSON 배열)로 보내야 합니다.",
                    },
                    status=400,
                )

            normalized = []
            for item in data:
                gibun = (item.get("gibun_code") or "").strip().upper()
                wo = (item.get("work_order") or "").strip()
                op = (item.get("op") or "").strip()
                desc = (item.get("description") or "").strip()
                mh_raw = item.get("default_mh")

                if not any([gibun, wo, op, desc, str(mh_raw or "").strip()]):
                    continue
                if not gibun or not wo:
                    continue

                try:
                    mh_val = float(mh_raw or 0)
                except (ValueError, TypeError):
                    mh_val = 0.0

                normalized.append(
                    {
                        "gibun": gibun,
                        "wo": wo,
                        "op": op,
                        "desc": desc,
                        "mh": mh_val,
                    }
                )

            if not normalized:
                return JsonResponse(
                    {"status": "error", "message": "저장할 유효한 데이터가 없습니다."},
                    status=400,
                )

            # ✅ 기존 데이터(현재 세션)와 WO+OP 중복 체크
            incoming_pairs = set(
                (item["wo"].strip(), item["op"].strip())
                for item in normalized
                if item.get("wo") and item.get("op")
            )
            if incoming_pairs:
                existing_pairs = set(
                    WorkItem.objects.filter(session=session)
                    .exclude(work_order="")
                    .exclude(op="")
                    .values_list("work_order", "op")
                )
                duplicates = incoming_pairs & existing_pairs
                if duplicates:
                    preview = ", ".join(
                        [f"{wo}/{op}" for wo, op in list(duplicates)[:5]]
                    )
                    return JsonResponse(
                        {
                            "status": "error",
                            "message": f"이미 등록된 WO/OP가 있습니다: {preview}",
                        },
                        status=400,
                    )

            existing_gibuns = set(
                GibunPriority.objects.filter(session=session).values_list(
                    "gibun", flat=True
                )
            )
            last_order = (
                GibunPriority.objects.filter(session=session).aggregate(Max("order"))[
                    "order__max"
                ]
                or 0
            )
            last_item_ordering = (
                WorkItem.objects.filter(session=session).aggregate(Max("ordering"))[
                    "ordering__max"
                ]
                or 0
            )

            new_priorities = []
            added_gibuns = set()
            work_items = []

            with transaction.atomic():
                for item in normalized:
                    last_item_ordering += 10
                    gibun = item["gibun"]

                    if gibun not in existing_gibuns and gibun not in added_gibuns:
                        last_order += 1
                        new_priorities.append(
                            GibunPriority(
                                session=session, gibun=gibun, order=last_order
                            )
                        )
                        added_gibuns.add(gibun)

                    task_master, _ = TaskMaster.objects.update_or_create(
                        work_order=item["wo"],
                        op=item["op"],
                        defaults={
                            "gibun_code": gibun,
                            "description": item["desc"],
                            "default_mh": item["mh"],
                        },
                    )

                    work_items.append(
                        WorkItem(
                            session=session,
                            task_master=task_master,
                            model_type=gibun,
                            gibun_input=gibun,
                            work_order=item["wo"],
                            op=item["op"],
                            description=item["desc"],
                            work_mh=item["mh"],
                            ordering=last_item_ordering,
                        )
                    )

                if new_priorities:
                    GibunPriority.objects.bulk_create(new_priorities)

                WorkItem.objects.bulk_create(work_items)

            return JsonResponse({"status": "success", "count": len(work_items)})

        except json.JSONDecodeError:
            return JsonResponse(
                {"status": "error", "message": "잘못된 JSON 형식입니다."}, status=400
            )
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)


class AssignedSummaryView(SimpleLoginRequiredMixin, View):
    def get(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)

        common_schedule = []

        workers = session.worker_set.all().order_by("name")
        workers_schedule = []

        for w in workers:
            assigns = Assignment.objects.filter(
                work_item__session=session, worker=w
            ).select_related("work_item")

            total_mh = 0.0
            task_count = 0

            fixed_list = []
            occupied_slots = []
            floating_list = []

            for a in assigns:
                wi = a.work_item
                wo_raw = (wi.work_order or "").strip()
                op_raw = wi.op
                gibun_raw = wi.gibun_input
                desc_raw = wi.description

                if wo_raw in (KANBI_WO, DIRECT_WO):
                    desc_disp = a.code if a.code else ""
                else:
                    desc_disp = desc_raw

                if wo_raw in (KANBI_WO, DIRECT_WO):
                    if a.start_min is not None and a.end_min is not None:
                        dur = a.end_min - a.start_min
                        if dur > 0:
                            total_mh += dur / 60.0
                else:
                    total_mh += float(a.allocated_mh or 0.0)

                is_fixed = (
                    a.start_min is not None
                    and a.end_min is not None
                    and (wo_raw in (KANBI_WO, DIRECT_WO))
                )

                if is_fixed:
                    fixed_list.append(
                        {
                            "wo": wo_raw,
                            "op": op_raw,
                            "gibun": gibun_raw,
                            "desc": desc_disp,
                            "mh": float(a.allocated_mh or 0.0),
                            "start_str": format_min_to_time(a.start_min),
                            "end_str": format_min_to_time(a.end_min),
                            "start_min": a.start_min,
                            "is_fixed": True,
                            "class": (
                                "table-warning"
                                if wo_raw == KANBI_WO
                                else (
                                    "table-secondary"
                                    if wo_raw == DIRECT_WO
                                    else "table-info"
                                )
                            ),
                        }
                    )
                    occupied_slots.append({"start": a.start_min, "end": a.end_min})

                    if wo_raw not in (KANBI_WO, DIRECT_WO):
                        task_count += 1
                else:
                    floating_list.append(
                        {
                            "wo": wo_raw,
                            "op": op_raw,
                            "gibun": gibun_raw,
                            "desc": desc_disp,
                            "mh": float(a.allocated_mh or 0.0),
                            "sort_key": (
                                gibun_raw or "z",
                                wo_raw or "z",
                                op_raw or "z",
                            ),
                        }
                    )

                    if wo_raw not in (KANBI_WO, DIRECT_WO):
                        task_count += 1

            floating_list.sort(key=lambda x: x["sort_key"])

            try:
                calc = ScheduleCalculator(
                    floating_list,
                    fixed_slots=occupied_slots,
                    shift_type=session.shift_type,
                )
                calculated_schedule = calc.calculate()
            except Exception as e:
                print(f"Calc Error: {e}")
                for item in floating_list:
                    item["start_str"] = "-"
                    item["end_str"] = "-"
                calculated_schedule = floating_list

            final_schedule = fixed_list + calculated_schedule
            final_schedule.sort(
                key=lambda x: get_adjusted_min(x.get("start_min"), session.shift_type)
            )

            workers_schedule.append(
                {
                    "worker": w,
                    "worker_name": w.name,
                    "is_night": session.shift_type == "NIGHT",
                    "total_mh": round(total_mh, 1),
                    "task_count": task_count,
                    "schedule": final_schedule,
                }
            )

        return render(
            request,
            "manning/assigned_summary.html",
            {
                "session": session,
                "workers_schedule": workers_schedule,
                "common_schedule": common_schedule,
                "navbar_template": "manning/navbar/navbar_back_assign.html",
            },
        )


class PersonalScheduleView(SimpleLoginRequiredMixin, DetailView):
    model = WorkSession
    template_name = "manning/personal_schedule.html"
    context_object_name = "session"
    pk_url_kwarg = "session_id"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        worker_id = self.request.GET.get("worker_id")

        gibun_priorities = GibunPriority.objects.filter(session=self.object)
        prio_map = {gp.gibun: gp.order for gp in gibun_priorities}

        if not worker_id:
            context["navbar_template"] = "manning/navbar/navbar_back_personal.html"
            return context

        session = self.object
        worker = get_object_or_404(Worker, id=worker_id, session=session)

        assignments = Assignment.objects.filter(
            work_item__session=session, worker=worker
        ).select_related("work_item", "worker")

        fixed_schedule = []
        occupied_slots = []
        floating_tasks = []

        manual_edit_list = []
        total_mh = 0.0
        task_count = 0

        for a in assignments:
            wi = a.work_item
            wo_raw = (wi.work_order or "").strip()
            op_raw = wi.op
            gibun_val = wi.gibun_input or ""
            ordering_val = wi.ordering
            item_id = wi.id
            prio_rank = prio_map.get(gibun_val, 1)
            if wo_raw in (KANBI_WO, DIRECT_WO):
                desc_disp = a.code if a.code else ""
            else:
                desc_disp = wi.description

            if wo_raw in (KANBI_WO, DIRECT_WO):
                if a.start_min is not None and a.end_min is not None:
                    dur = a.end_min - a.start_min
                    if dur > 0:
                        total_mh += dur / 60.0
            else:
                total_mh += float(a.allocated_mh or 0.0)

            item_data = {
                "wo": wo_raw,
                "op": op_raw,
                "desc": desc_disp,
                "mh": float(a.allocated_mh or 0.0),
                "gibun": gibun_val,
                "sort_key": (prio_rank, gibun_val, ordering_val, item_id),
            }

            is_fixed_anchor = False
            if a.start_min is not None and a.end_min is not None:
                if wo_raw in (KANBI_WO, DIRECT_WO):
                    is_fixed_anchor = True

                    s_hhmm = format_min_to_time(a.start_min).replace(":", "")
                    e_hhmm = format_min_to_time(a.end_min).replace(":", "")
                    manual_edit_list.append(
                        {"id": wi.id, "start": s_hhmm, "code": desc_disp, "end": e_hhmm}
                    )

            if is_fixed_anchor:
                item_data.update(
                    {
                        "start_min": a.start_min,
                        "end_min": a.end_min,
                        "is_fixed": True,
                        "start_str": format_min_to_time(a.start_min),
                        "end_str": format_min_to_time(a.end_min),
                    }
                )
                fixed_schedule.append(item_data)
                occupied_slots.append({"start": a.start_min, "end": a.end_min})

                if wo_raw not in (KANBI_WO, DIRECT_WO):
                    task_count += 1
            else:
                item_data["start_min"] = None
                item_data["end_min"] = None
                floating_tasks.append(item_data)

                if wo_raw not in (KANBI_WO, DIRECT_WO):
                    task_count += 1

        floating_tasks.sort(key=lambda x: x.get("sort_key"))

        calculated_schedule = []
        if floating_tasks:
            try:
                calc = ScheduleCalculator(
                    floating_tasks,
                    fixed_slots=occupied_slots,
                    shift_type=session.shift_type,
                )
                calculated_schedule = calc.calculate()
            except Exception as e:
                print(f"Schedule Calc Error: {e}")
                calculated_schedule = floating_tasks

        raw_combined = fixed_schedule + calculated_schedule
        raw_combined.sort(
            key=lambda x: get_adjusted_min(x.get("start_min"), session.shift_type)
        )

        final_schedule = []
        last_end_min = 0

        night_start_offset = 21 * 60 if session.shift_type == "NIGHT" else 0
        if session.shift_type == "NIGHT":
            last_end_min = 20 * 60

        for item in raw_combined:
            s = item.get("start_min")
            e = item.get("end_min")

            if s is None or e is None:
                item["start_str"] = "-"
                item["end_str"] = "-"
                final_schedule.append(item)
                continue

            if s > last_end_min:
                final_schedule.append(
                    {
                        "wo": "EMPTY_SLOT",
                        "start_min": last_end_min,
                        "end_min": s,
                        "start_str": format_min_to_time(last_end_min),
                        "end_str": format_min_to_time(s),
                    }
                )

            if s < 1440 and e > 1440:
                part1 = item.copy()
                part1.update(
                    {
                        "end_min": 1440,
                        "start_str": format_min_to_time(s),
                        "end_str": "24:00",
                    }
                )
                final_schedule.append(part1)

                part2 = item.copy()
                part2.update(
                    {
                        "start_min": 1440,
                        "start_str": "00:00",
                        "end_str": format_min_to_time(e),
                    }
                )
                final_schedule.append(part2)
            else:
                item["start_str"] = format_min_to_time(s)
                item["end_str"] = format_min_to_time(e)
                final_schedule.append(item)

            last_end_min = e

        manual_edit_list.sort(key=lambda x: x["start"])

        context.update(
            {
                "worker": worker,
                "schedule": final_schedule,
                "worker_name": worker.name,
                "worker_id": int(worker_id),
                "total_mh": round(total_mh, 1),
                "task_count": task_count,
                "manual_data_json": manual_edit_list,
                "navbar_template": "manning/navbar/navbar_back_personal.html",
            }
        )

        return context


class DeleteTaskMasterView(SimpleLoginRequiredMixin, View):
    def get(self, request, pk=None, session_id=None, **kwargs):
        return redirect("master_data_list")

    def post(self, request, pk=None, session_id=None, **kwargs):
        target_pk = pk or session_id
        try:
            task = get_object_or_404(TaskMaster, pk=target_pk)
            task.delete()
            messages.success(request, f"데이터 '{task.work_order}'가 삭제되었습니다.")
        except Exception as e:
            messages.error(request, f"삭제 중 오류가 발생했습니다: {e}")

        next_url = request.POST.get("next") or "master_data_list"
        return redirect(next_url)


class WorkerIndirectView(SimpleLoginRequiredMixin, View):
    def _get_kanbi_item(self, session):
        return get_or_create_common_item(session, KANBI_WO)

    def get(self, request, session_id, worker_id):
        session = get_object_or_404(WorkSession, id=session_id)
        worker = get_object_or_404(Worker, id=worker_id, session=session)
        kanbi_item = self._get_kanbi_item(session)

        qs = Assignment.objects.filter(work_item=kanbi_item, worker=worker).order_by(
            "start_min", "id"
        )

        KanbiFormSet = modelformset_factory(
            Assignment, form=KanbiAssignmentForm, extra=1, can_delete=True
        )
        formset = KanbiFormSet(queryset=qs)

        return render(
            request,
            "manning/worker_indirect_form.html",
            {"session": session, "worker": worker, "formset": formset},
        )

    def post(self, request, session_id, worker_id):
        session = get_object_or_404(WorkSession, id=session_id)
        worker = get_object_or_404(Worker, id=worker_id, session=session)
        kanbi_item = self._get_kanbi_item(session)

        qs = Assignment.objects.filter(work_item=kanbi_item, worker=worker).order_by(
            "start_min", "id"
        )

        KanbiFormSet = modelformset_factory(
            Assignment, form=KanbiAssignmentForm, extra=1, can_delete=True
        )
        formset = KanbiFormSet(request.POST, queryset=qs)

        # 폼 검증 실패 시
        if not formset.is_valid():
            return render(
                request,
                "manning/worker_indirect_form.html",
                {"session": session, "worker": worker, "formset": formset},
            )

        with transaction.atomic():
            # 1. 삭제 먼저 수행
            for obj in formset.deleted_objects:
                obj.delete()

            # 2. 저장/수정 수행
            # form.save()를 바로 쓰지 않고, 데이터를 꺼내서 안전하게 처리합니다.
            for form in formset.forms:
                # 삭제된 폼이나 빈 폼은 건너뜀
                if form in formset.deleted_forms:
                    continue

                # 입력값 추출
                s_str = (form.cleaned_data.get("start_time") or "").strip()
                e_str = (form.cleaned_data.get("end_time") or "").strip()
                code = (form.cleaned_data.get("code") or "").strip()

                # 시간 변환
                s_min = hhmm_to_min(s_str)
                e_min = hhmm_to_min(e_str)

                if s_min is None or e_min is None:
                    continue

                if session.shift_type == "NIGHT" and e_min <= s_min:
                    e_min += 1440

                # 인스턴스 준비 (기존 객체 수정 or 새 객체 생성)
                assign = form.save(commit=False)
                assign.work_item = kanbi_item
                assign.worker = worker
                assign.allocated_mh = 0.0
                assign.is_fixed = True
                assign.start_min = s_min
                assign.end_min = e_min
                assign.code = code

                # 안전 저장: 여기서 create가 호출되더라도 start_min/end_min이 값이 있으므로 중복 에러 안 남
                assign.save()

        # 집계 갱신
        refresh_worker_totals(session)
        return render(request, "manning/worker_indirect_close.html")


class AddSingleItemView(SimpleLoginRequiredMixin, View):
    def get(self, request, session_id):
        return redirect("manage_items", session_id=session_id)

    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)

        gibun = request.POST.get("gibun", "").strip()
        wo = request.POST.get("wo", "").strip()
        op = request.POST.get("op", "").strip()
        desc = request.POST.get("description", "").strip()
        mh_str = request.POST.get("mh", "0")
        worker_name = request.POST.get("worker_name", "").strip()

        try:
            mh = float(mh_str)
        except ValueError:
            mh = 0.0

        if gibun and wo:
            # 1. 일감 생성
            item = WorkItem.objects.create(
                session=session,
                gibun_input=gibun,
                work_order=wo,
                op=op,
                description=desc,
                work_mh=mh,
            )

            # 2. 우선순위 등록
            if not GibunPriority.objects.filter(session=session, gibun=gibun).exists():
                last_prio_dict = GibunPriority.objects.filter(
                    session=session
                ).aggregate(Max("order"))
                last_prio = last_prio_dict["order__max"]
                new_order = (last_prio or 0) + 1
                GibunPriority.objects.create(
                    session=session, gibun=gibun, order=new_order
                )

            # 3. 작업자 수동 배정 (있을 경우만)
            if worker_name:
                worker, created = Worker.objects.get_or_create(
                    session=session, name=worker_name
                )

                # [수정] create -> update_or_create (IntegrityError 방지)
                Assignment.objects.update_or_create(
                    work_item=item,
                    worker=worker,
                    start_min__isnull=True,
                    end_min__isnull=True,
                    defaults={"allocated_mh": mh, "is_fixed": False},
                )
                item.is_manual = True
                item.save()

            # 4. 자동 배정 및 갱신
            run_auto_assign(session.id)
            messages.success(request, f"추가 완료: {gibun} - {wo}")

        else:
            messages.error(request, "기번과 Work Order는 필수 입력값입니다.")

        return redirect("manage_items", session_id=session_id)


class ResetSessionView(SimpleLoginRequiredMixin, View):
    def post(self, request, session_id):
        if request.session.get("user_role") != "admin":
            messages.error(request, "관리자 권한이 필요합니다.")
            return redirect("index")

        session = get_object_or_404(WorkSession, id=session_id)
        session.is_active = False
        session.save()
        messages.success(request, f"'{session.name}' 세션이 종료되었습니다.")
        return redirect("index")


class ResetAllSessionsView(SimpleLoginRequiredMixin, View):
    def post(self, request):
        updated_count = WorkSession.objects.filter(is_active=True).update(
            is_active=False
        )
        if updated_count > 0:
            messages.success(request, f"총 {updated_count}개의 세션이 종료되었습니다.")
        return redirect("index")


class CheckGibunView(View):
    def get(self, request):
        gibun = request.GET.get("gibun", "").strip().upper()

        if not gibun:
            return JsonResponse({"exists": False})

        exists = TaskMaster.objects.filter(gibun_code=gibun).exists()

        return JsonResponse({"exists": exists})


class MasterDataListView(SimpleLoginRequiredMixin, ListView):
    model = TaskMaster
    template_name = "manning/master_data_list.html"
    context_object_name = "taskmasters"

    def get_queryset(self):
        return TaskMaster.objects.all().order_by("gibun_code", "work_order", "op")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["total_count"] = self.object_list.count()
        context["navbar_template"] = "manning/navbar/navbar_back_master.html"
        return context


class TaskMasterDeleteView(SimpleLoginRequiredMixin, DeleteView):
    model = TaskMaster
    success_url = reverse_lazy("paste_data")  # 기본값

    def delete(self, request, *args, **kwargs):
        self.object = self.get_object()
        self.object.delete()
        messages.success(request, "항목이 삭제되었습니다.")

        # 돌아갈 페이지 유동적 처리
        next_page = request.POST.get("next")
        if next_page == "master_data_list":
            return redirect("master_data_list")
        return redirect(self.success_url)


class TaskMasterDeleteAllView(SimpleLoginRequiredMixin, View):
    def post(self, request):
        count = TaskMaster.objects.count()
        if count > 0:
            TaskMaster.objects.all().delete()
            messages.warning(request, f"총 {count}개의 데이터가 모두 삭제되었습니다.")
        else:
            messages.info(request, "삭제할 데이터가 없습니다.")

        if request.POST.get("next") == "master_data_list":
            return redirect("master_data_list")
        return redirect("paste_data")


class ReorderItemView(SimpleLoginRequiredMixin, View):
    def get(self, request, item_id, direction):
        # 1. 이동할 대상 아이템과 세션 찾기
        target_item = get_object_or_404(WorkItem, pk=item_id)
        session = target_item.session  # ✅ 세션 정보를 여기서 가져옵니다.

        # 2. 같은 기번(그룹) 내의 아이템들만 가져오기
        siblings = list(
            WorkItem.objects.filter(
                session=session, gibun_input=target_item.gibun_input
            )
        )

        # 3. 화면과 똑같은 순서로 정렬 (ordering -> id 순)
        siblings.sort(key=lambda x: (int(x.ordering or 0), x.id))

        # 4. 내 위치 찾기
        try:
            current_idx = siblings.index(target_item)
        except ValueError:
            # 리스트에 없으면 그냥 관리 페이지로 복귀
            return redirect("manage_items", session_id=session.id)

        # 5. 위치 바꾸기 (Swap)
        if direction == "up" and current_idx > 0:
            siblings[current_idx], siblings[current_idx - 1] = (
                siblings[current_idx - 1],
                siblings[current_idx],
            )

        elif direction == "down" and current_idx < len(siblings) - 1:
            siblings[current_idx], siblings[current_idx + 1] = (
                siblings[current_idx + 1],
                siblings[current_idx],
            )

        # 6. 순서 재저장 (10, 20, 30... 방식으로 깔끔하게 정리)
        with transaction.atomic():
            for i, item in enumerate(siblings):
                new_ordering = (i + 1) * 10
                if item.ordering != new_ordering:
                    item.ordering = new_ordering
                    item.save(update_fields=["ordering"])

        # ✅ [핵심 해결책]
        # 작업이 끝나면 'index'(홈페이지)가 아니라 'manage_items'(통합 관리)로 가야 합니다.
        # 이때 session_id를 반드시 같이 넘겨줘야 에러 없이 이동합니다.
        return redirect("manage_items", session_id=session.id)


class ReorderItemsView(SimpleLoginRequiredMixin, View):
    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)

        try:
            data = json.loads(request.body or "{}")
            gibun = (data.get("gibun") or "").strip()
            ordered_ids = data.get("ordered_ids") or []

            if not gibun or not isinstance(ordered_ids, list):
                return JsonResponse(
                    {"status": "error", "message": "잘못된 요청입니다."},
                    status=400,
                )

            try:
                ordered_ids_int = [int(x) for x in ordered_ids]
            except (TypeError, ValueError):
                return JsonResponse(
                    {"status": "error", "message": "ID 형식이 올바르지 않습니다."},
                    status=400,
                )

            items = list(
                WorkItem.objects.filter(
                    session=session, gibun_input=gibun, id__in=ordered_ids_int
                )
            )
            if len(items) != len(ordered_ids_int):
                return JsonResponse(
                    {"status": "error", "message": "항목을 찾을 수 없습니다."},
                    status=400,
                )

            item_map = {item.id: item for item in items}

            with transaction.atomic():
                for idx, item_id in enumerate(ordered_ids_int):
                    item = item_map.get(item_id)
                    if not item:
                        continue
                    new_ordering = (idx + 1) * 10
                    if item.ordering != new_ordering:
                        item.ordering = new_ordering
                        item.save(update_fields=["ordering"])

            return JsonResponse({"status": "success"})

        except json.JSONDecodeError:
            return JsonResponse(
                {"status": "error", "message": "잘못된 JSON 형식입니다."},
                status=400,
            )
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)


class ReorderGibunView(SimpleLoginRequiredMixin, View):
    def get(self, request, session_id, gibun_name, direction):
        session = get_object_or_404(WorkSession, id=session_id)

        # 1. 현재 세션의 모든 기번 우선순위 객체를 순서대로 가져옴
        priorities = list(
            GibunPriority.objects.filter(session=session).order_by("order")
        )

        # 2. 이동할 대상 객체 찾기
        # (URL에서 한글이 넘어올 수 있으므로 정확히 매칭)
        target_gp = next((gp for gp in priorities if gp.gibun == gibun_name), None)

        if not target_gp:
            return redirect("manage_items", session_id=session.id)

        # 3. 리스트 내 인덱스 찾기
        try:
            current_idx = priorities.index(target_gp)
        except ValueError:
            return redirect("manage_items", session_id=session.id)

        # 4. 순서 바꾸기 (Swap)
        if direction == "up" and current_idx > 0:
            priorities[current_idx], priorities[current_idx - 1] = (
                priorities[current_idx - 1],
                priorities[current_idx],
            )

        elif direction == "down" and current_idx < len(priorities) - 1:
            priorities[current_idx], priorities[current_idx + 1] = (
                priorities[current_idx + 1],
                priorities[current_idx],
            )

        # 5. 재번호 매기기 (1, 2, 3... 순서로 DB 업데이트)
        with transaction.atomic():
            for i, gp in enumerate(priorities):
                new_order = i + 1
                if gp.order != new_order:
                    gp.order = new_order
                    gp.save(update_fields=["order"])

        # 6. 관리 페이지로 복귀
        return redirect("manage_items", session_id=session.id)
