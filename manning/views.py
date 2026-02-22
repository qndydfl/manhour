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
    FeaturedVideo,
)
from .forms import (
    KanbiAssignmentForm,
    ManageItemForm,
    WorkItemForm,
    WorkerIndirectForm,
    TaskMasterForm,
)
from .services import run_auto_assign, refresh_worker_totals, run_sync_schedule
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.decorators.csrf import csrf_exempt


# -----------------------------------------------------------
# 공용 헬퍼 함수
# -----------------------------------------------------------
KANBI_WO = "간비"
DIRECT_WO = "DIRECT"

WORKPLACE_SESSION_KEY = "workplace"
WORKPLACE_LABEL_SESSION_KEY = "workplace_label"

TASKMASTER_RETENTION_HOURS = 12
HISTORY_VISIBILITY_HOURS = 24


def normalize_workplace(workplace: str | None) -> str:
    valid = {choice[0] for choice in WorkSession.SITE_CHOICES}
    if workplace in valid:
        return workplace
    return ""


def set_workplace_in_session(request, workplace: str | None) -> str:
    normalized = normalize_workplace(workplace)
    if not normalized:
        request.session.pop(WORKPLACE_SESSION_KEY, None)
        request.session.pop(WORKPLACE_LABEL_SESSION_KEY, None)
        return ""
    request.session[WORKPLACE_SESSION_KEY] = normalized
    request.session[WORKPLACE_LABEL_SESSION_KEY] = dict(WorkSession.SITE_CHOICES).get(
        normalized, normalized
    )
    return normalized


def get_current_workplace(request) -> str:
    current = request.session.get(WORKPLACE_SESSION_KEY)
    normalized = normalize_workplace(current)
    if not normalized:
        return ""
    return set_workplace_in_session(request, normalized)


def get_session_or_404(request, session_id: int, **kwargs):
    workplace = get_current_workplace(request)
    return get_object_or_404(
        WorkSession,
        id=session_id,
        site=workplace,
        **kwargs,
    )


def get_item_or_404(request, item_id: int, **kwargs):
    workplace = get_current_workplace(request)
    return get_object_or_404(
        WorkItem,
        id=item_id,
        session__site=workplace,
        **kwargs,
    )


def purge_expired_taskmasters():
    cutoff = timezone.now() - timedelta(hours=TASKMASTER_RETENTION_HOURS)
    TaskMaster.objects.filter(created_at__lt=cutoff).delete()


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
        if not get_current_workplace(request):
            messages.error(request, "근무지를 선택해주세요.")
            return redirect("login")
        return super().dispatch(request, *args, **kwargs)


class SimpleLoginView(View):
    def get(self, request):
        if request.session.get("is_authenticated"):
            return redirect("index")
        request.session.pop(WORKPLACE_SESSION_KEY, None)
        request.session.pop(WORKPLACE_LABEL_SESSION_KEY, None)
        current_workplace = ""
        return render(
            request,
            "manning/login.html",
            {
                "workplace_options": WorkSession.SITE_CHOICES,
                "current_workplace": current_workplace,
            },
        )

    def post(self, request):
        password = request.POST.get("password")
        workplace = request.POST.get("workplace") or ""

        if not workplace:
            messages.error(request, "근무지를 선택해주세요.")
            return render(
                request,
                "manning/login.html",
                {
                    "workplace_options": WorkSession.SITE_CHOICES,
                    "current_workplace": "",
                },
            )

        if password == settings.SIMPLE_PASSWORD_ADMIN:
            request.session["is_authenticated"] = True
            request.session["user_role"] = "admin"
            set_workplace_in_session(request, workplace)
            return redirect("index")

        elif password == settings.SIMPLE_PASSWORD_USER:
            request.session["is_authenticated"] = True
            request.session["user_role"] = "user"
            set_workplace_in_session(request, workplace)
            return redirect("index")

        else:
            messages.error(request, "비밀번호가 올바르지 않습니다.")
            return render(
                request,
                "manning/login.html",
                {
                    "workplace_options": WorkSession.SITE_CHOICES,
                    "current_workplace": workplace,
                },
            )


class SimpleLogoutView(View):
    def get(self, request):
        request.session.flush()
        return redirect("login")


class ChangeWorkplaceView(SimpleLoginRequiredMixin, View):
    def post(self, request):
        workplace = request.POST.get("workplace")
        set_workplace_in_session(request, workplace)
        next_url = request.POST.get("next") or request.META.get("HTTP_REFERER")
        return redirect(next_url or "index")


class IndexView(SimpleLoginRequiredMixin, TemplateView):
    template_name = "manning/index.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        workplace = get_current_workplace(self.request)

        # 활성 세션 통계
        active_qs = WorkSession.objects.filter(is_active=True, site=workplace)
        active_count = active_qs.count()

        history_cutoff = timezone.now() - timedelta(hours=HISTORY_VISIBILITY_HOURS)
        history_count = WorkSession.objects.filter(
            is_active=False, site=workplace, created_at__gte=history_cutoff
        ).count()

        video_qs = FeaturedVideo.objects.filter(is_active=True)
        if workplace:
            video_qs = video_qs.filter(Q(site=workplace) | Q(site=""))

        index_videos = list(video_qs.filter(kind=FeaturedVideo.VideoKind.VIDEO))
        index_shorts = list(video_qs.filter(kind=FeaturedVideo.VideoKind.SHORTS))

        context.update(
            {
                "today": timezone.localdate(),
                "active_count": active_count,
                "day_count": active_qs.filter(shift_type="DAY").count(),
                "night_count": active_qs.filter(shift_type="NIGHT").count(),
                "history_count": history_count,
                "index_videos": index_videos,
                "index_shorts": index_shorts,
            }
        )
        return context


class SettingsView(SimpleLoginRequiredMixin, TemplateView):
    template_name = "manning/settings.html"


class SessionListView(SimpleLoginRequiredMixin, ListView):
    model = WorkSession
    template_name = "manning/session_list.html"
    context_object_name = "active_sessions"

    def get_queryset(self):
        workplace = get_current_workplace(self.request)
        return (
            WorkSession.objects.filter(is_active=True, site=workplace)
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
            },
        )

    def post(self, request):
        session_name = request.POST.get("session_name", "").strip()
        worker_names = request.POST.get("worker_names", "")
        gibun_input = request.POST.get("gibun_input", "")
        shift_type = request.POST.get("shift_type", "DAY")
        workplace = get_current_workplace(request)

        if not session_name:
            session_name = "Session (이름 없음)"

        final_name = session_name
        cnt = 1
        while WorkSession.objects.filter(
            name=final_name, is_active=True, site=workplace
        ).exists():
            cnt += 1
            final_name = f"{session_name} ({cnt})"

        with transaction.atomic():
            session = WorkSession.objects.create(
                name=final_name,
                shift_type=shift_type,
                is_active=True,
                site=workplace,
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

                    masters = TaskMaster.objects.filter(
                        gibun_code=gibun, site=workplace
                    )
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
        session = get_session_or_404(request, session_id)
        worker_names = "\n".join([w.name for w in session.worker_set.all()])
        return render(
            request,
            "manning/edit_session.html",
            {
                "session": session,
                "worker_names_str": worker_names,
            },
        )

    def post(self, request, session_id):
        session = get_session_or_404(request, session_id)

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

        adjusted_mh_map = request.session.get(f"adjusted_mh_map_{session.id}", {})
        run_auto_assign(session.id, adjusted_mh_map)
        run_sync_schedule(session.id)
        refresh_worker_totals(session)

        messages.success(request, "세션 정보가 수정되었습니다!")
        return redirect(f"{reverse('result_view', args=[session.id])}?reassigned=1")


class EditAllView(SimpleLoginRequiredMixin, View):
    def post(self, request, session_id):
        session = get_session_or_404(request, session_id)

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

    def get_queryset(self):
        workplace = get_current_workplace(self.request)
        return super().get_queryset().filter(site=workplace)

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
        # 조정값 복원
        adjusted_mh_map = self.request.session.get(f"adjusted_mh_map_{session.id}", {})
        adjusted_mh_list = self.request.session.get(f"adjusted_mh_{session.id}")
        for idx, item in enumerate(items):
            assigns = item.assignments.all()
            if assigns:
                names = list(set([a.worker.name for a in assigns if a.worker]))
                names.sort()
                item.assigned_names_str = ", ".join(names)
            else:
                item.assigned_names_str = ""
            # 조정값이 있으면 그 값, 없으면 원래값
            adj_raw = None
            if adjusted_mh_map and str(item.pk) in adjusted_mh_map:
                adj_raw = adjusted_mh_map[str(item.pk)]
            elif (
                adjusted_mh_list
                and idx < len(adjusted_mh_list)
                and adjusted_mh_list[idx].strip()
            ):
                adj_raw = adjusted_mh_list[idx]

            if adj_raw is not None:
                try:
                    item.adjusted_mh = float(adj_raw)
                except Exception:
                    item.adjusted_mh = item.work_mh
            else:
                item.adjusted_mh = item.work_mh

        wo_total = sum(1 for item in items if item.work_order != KANBI_WO)

        context.update(
            {
                "workers": session.worker_set.all(),
                "items": items,
                "filter_worker": filter_worker or "",
                "wo_total": wo_total,
            }
        )
        return context

    def post(self, request, session_id):
        # 결과 화면에서 '자동 배정' 버튼 눌렀을 때
        adjusted_mh_map = request.session.get(f"adjusted_mh_map_{session_id}", {})
        run_auto_assign(session_id, adjusted_mh_map)
        run_sync_schedule(session_id)
        messages.success(request, "자동 배정 및 동기화가 완료되었습니다! 🤖")
        return redirect("result_view", session_id=session_id)


class EditItemView(SimpleLoginRequiredMixin, View):
    def get(self, request, item_id):
        item = get_item_or_404(request, item_id)
        all_workers = item.session.worker_set.all().order_by("name")
        assigned_worker_ids = item.assignments.values_list("worker_id", flat=True)

        context = {
            "item": item,
            "all_workers": all_workers,
            "assigned_ids": assigned_worker_ids,
        }
        return render(request, "manning/edit_item.html", context)

    def post(self, request, item_id):
        item = get_item_or_404(request, item_id)

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
        session = get_session_or_404(request, session_id)

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
                assigns = form.instance.assignments.filter(is_fixed=True)
                if assigns.exists():
                    text_parts = []
                    for a in assigns:
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

        # --- 조정 % 및 조정값 복원 (세션에서) ---
        last_mh_percent = request.session.get(f"mh_percent_{session.id}", 0)
        last_adjusted_mh_map = request.session.get(f"adjusted_mh_map_{session.id}", {})
        last_adjusted_custom_ids = request.session.get(
            f"adjusted_mh_custom_ids_{session.id}", []
        )
        last_adjusted_mh = request.session.get(f"adjusted_mh_{session.id}")
        if last_adjusted_mh_map and isinstance(last_adjusted_mh_map, dict):
            for form in formset.forms:
                if form.instance.pk and str(form.instance.pk) in last_adjusted_mh_map:
                    form.initial["adjusted_mh"] = last_adjusted_mh_map[
                        str(form.instance.pk)
                    ]
        elif (
            last_adjusted_mh
            and isinstance(last_adjusted_mh, list)
            and len(last_adjusted_mh) == len(formset.forms)
        ):
            for idx, form in enumerate(formset.forms):
                form.initial["adjusted_mh"] = last_adjusted_mh[idx]

        return render(
            request,
            "manning/manage_items.html",
            {
                "session": session,
                "formset": formset,
                "gibun_priorities": gibun_priorities,
                "worker_names_str": worker_names_str,
                "non_common_count": WorkItem.objects.filter(session=session)
                .exclude(gibun_input="COMMON")
                .count(),
                "lastMhPercent": last_mh_percent,
                "lastAdjustedCustomIds": last_adjusted_custom_ids,
            },
        )

    def post(self, request, session_id):
        session = get_session_or_404(request, session_id)

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

        # 조정 M/H 값이 넘어오면 work_mh에 반영
        mh_adjusted_list = request.POST.getlist("adjusted_mh")
        mh_percent = request.POST.get("mh_percent", "0")
        custom_ids_raw = request.POST.get("adjusted_mh_custom_ids", "")

        ItemFormSet = modelformset_factory(
            WorkItem, form=WorkItemForm, extra=0, can_delete=True
        )
        qs = WorkItem.objects.filter(session=session)
        formset = ItemFormSet(request.POST, queryset=qs)

        # 세션에 저장 (ID 기준 맵 + 리스트)
        adjusted_mh_map = {}
        if mh_adjusted_list and len(mh_adjusted_list) == len(formset.forms):
            for idx, form in enumerate(formset.forms):
                if not form.instance.pk:
                    continue
                raw_val = mh_adjusted_list[idx]
                if raw_val.strip() != "":
                    adjusted_mh_map[str(form.instance.pk)] = raw_val
        request.session[f"mh_percent_{session.id}"] = mh_percent
        request.session[f"adjusted_mh_{session.id}"] = mh_adjusted_list
        request.session[f"adjusted_mh_map_{session.id}"] = adjusted_mh_map
        request.session[f"adjusted_mh_custom_ids_{session.id}"] = [
            s for s in (custom_ids_raw.split(",") if custom_ids_raw else []) if s
        ]

        # 조정값은 work_mh에 저장하지 않고 화면에만 반영
        # (조정값을 실제 저장하려면 아래 코드 사용)
        # if mh_adjusted_list and len(mh_adjusted_list) == len(formset.forms):
        #     for idx, form in enumerate(formset.forms):
        #         try:
        #             adj_val = mh_adjusted_list[idx]
        #             if adj_val.strip() != "":
        #                 form.data = form.data.copy()
        #                 form.data[form.add_prefix("work_mh")] = adj_val
        #         except Exception:
        #             continue

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
            before_names = set(
                Worker.objects.filter(session=session).values_list("name", flat=True)
            )

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
                    limit_val = 9.0

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

            added_names = valid_names - before_names
            force_full_reassign = bool(added_names)
            if force_full_reassign:
                WorkItem.objects.filter(session=session).update(is_manual=False)
            # (1) 삭제 처리
            formset.save(commit=False)
            for obj in formset.deleted_objects:
                obj.delete()

            # (2) 수정/추가 처리
            for idx, form in enumerate(formset.forms):
                if form in formset.deleted_forms:
                    continue
                if not form.is_valid():
                    print(f"❌ 폼 에러 (ID: {form.instance.id}): {form.errors}")
                    continue

                instance = form.save(commit=False)
                instance.session = session

                # 간비 항목은 개인 시간표 수동 입력을 유지해야 하므로
                # 통합 관리 저장 시 배정 로직에서 제외합니다.
                if instance.work_order == KANBI_WO:
                    instance.save()
                    continue

                worker_name_input = (
                    form.cleaned_data.get("assigned_text") or ""
                ).strip()
                if force_full_reassign:
                    worker_name_input = ""
                current_assigns = instance.assignments.filter(is_fixed=True)
                current_names_set = set(a.worker.name for a in current_assigns)

                raw_inputs = [
                    n.strip()
                    for n in re.split(r"[\n\s,]+", worker_name_input)
                    if n.strip()
                ]
                clean_names_list = []
                for item in raw_inputs:
                    if ":" in item:
                        clean_names_list.append(item.split(":")[0].strip())
                    else:
                        clean_names_list.append(item)

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
                    instance.is_manual = True
                else:
                    instance.is_manual = False

                instance.save()

                if new_names_set:
                    instance.assignments.all().delete()
                    # 조정값 우선 적용 (ID 기준)
                    adj_mh_val = None
                    if instance.pk and str(instance.pk) in adjusted_mh_map:
                        try:
                            adj_mh_val = float(adjusted_mh_map[str(instance.pk)])
                        except Exception:
                            adj_mh_val = None
                    elif mh_adjusted_list and idx < len(mh_adjusted_list):
                        try:
                            adj_mh_val = (
                                float(mh_adjusted_list[idx])
                                if mh_adjusted_list[idx].strip()
                                else None
                            )
                        except Exception:
                            adj_mh_val = None
                    total_mh = (
                        adj_mh_val
                        if adj_mh_val is not None
                        else float(instance.work_mh or 0.0)
                    )

                    workers_all = list(Worker.objects.filter(session=session))
                    name_to_worker = {w.name: w for w in workers_all}
                    selected_workers = [
                        name_to_worker[n] for n in ordered_names if n in name_to_worker
                    ]

                    if selected_workers:
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
                else:
                    if current_names_set:
                        instance.assignments.all().delete()

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
        run_auto_assign(session.id, adjusted_mh_map)
        run_sync_schedule(session.id)

        return redirect(f"{reverse('result_view', args=[session.id])}?reassigned=1")


# @method_decorator(csrf_exempt, name="dispatch")
class PasteDataView(SimpleLoginRequiredMixin, View):
    def get(self, request):
        return render(request, "manning/paste_data.html")

    def post(self, request):
        try:
            workplace = get_current_workplace(request)
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
                        site=workplace,
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
        session = get_session_or_404(request, session_id)

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
        session = get_session_or_404(request, session_id)
        session.is_active = False
        session.save()

        messages.success(
            request,
            f"✅ {session.name} 작업이 완료되었습니다. 기록 보관소로 이동합니다.",
        )
        return redirect("index")


class DeleteSessionView(SimpleLoginRequiredMixin, View):
    def post(self, request, session_id):
        session = get_session_or_404(request, session_id, is_active=True)
        session_name = session.name
        session.delete()
        messages.success(request, f"세션 '{session_name}'이(가) 삭제되었습니다.")
        return redirect("session_list")


class HistoryView(SimpleLoginRequiredMixin, ListView):
    model = WorkSession
    template_name = "manning/history.html"
    context_object_name = "history_list"

    def get_queryset(self):
        workplace = get_current_workplace(self.request)
        cutoff = timezone.now() - timedelta(hours=HISTORY_VISIBILITY_HOURS)
        qs = WorkSession.objects.filter(
            is_active=False, site=workplace, created_at__gte=cutoff
        ).order_by("-created_at")
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
        return context


@require_POST
def clear_history(request):
    workplace = get_current_workplace(request)
    WorkSession.objects.filter(is_active=False, site=workplace).delete()
    return redirect("history")


@require_POST
def delete_history_session(request, session_id):
    if request.session.get("user_role") != "admin" and not request.user.is_superuser:
        messages.error(request, "관리자 권한이 필요합니다.")
        return redirect("history")

    session = get_session_or_404(request, session_id, is_active=False)
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

            session = get_session_or_404(request, session_id)

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
        session = get_session_or_404(request, session_id)
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
        session = get_session_or_404(request, session_id)
        if not session.worker_set.filter(id=worker_id).exists():
            return JsonResponse(
                {"status": "error", "message": "작업자를 찾을 수 없습니다."},
                status=404,
            )

        deleted_count = _reset_manual_for_workers(session, [worker_id])
        return JsonResponse({"status": "success", "deleted": deleted_count}, status=200)


class PasteInputView(SimpleLoginRequiredMixin, View):
    def get(self, request, session_id):
        session = get_session_or_404(request, session_id)
        workplace = get_current_workplace(request)
        taskmasters = TaskMaster.objects.filter(site=workplace).order_by("gibun_code")
        return render(
            request,
            "manning/paste_data.html",
            {
                "session": session,
                "taskmasters": taskmasters,
            },
        )

    def post(self, request, session_id):
        session = get_session_or_404(request, session_id)
        raw_data = request.POST.get("excel_data", "")
        workplace = get_current_workplace(request)

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
                        site=workplace,
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
        session = get_session_or_404(request, session_id)
        workplace = get_current_workplace(request)

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
                        site=workplace,
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


class ExistingItemsView(SimpleLoginRequiredMixin, View):
    def get(self, request, session_id):
        session = get_session_or_404(request, session_id)
        items = (
            WorkItem.objects.filter(session=session)
            .order_by("ordering", "id")
            .values(
                "id",
                "gibun_input",
                "work_order",
                "op",
                "description",
                "work_mh",
            )
        )
        payload = [
            {
                "id": item["id"],
                "gibun": item["gibun_input"],
                "work_order": item["work_order"],
                "op": item["op"],
                "description": item["description"],
                "work_mh": float(item["work_mh"] or 0.0),
            }
            for item in items
        ]
        return JsonResponse({"status": "success", "items": payload})


class DuplicateItemsView(SimpleLoginRequiredMixin, View):
    def post(self, request, session_id):
        session = get_session_or_404(request, session_id)
        try:
            data = json.loads(request.body or "{}")
            item_ids = data.get("item_ids", [])
            if not isinstance(item_ids, list) or not item_ids:
                return JsonResponse(
                    {
                        "status": "error",
                        "message": "복제할 항목을 선택해주세요.",
                    },
                    status=400,
                )

            items = list(
                WorkItem.objects.filter(session=session, id__in=item_ids)
                .select_related("task_master")
                .order_by("ordering", "id")
            )
            if not items:
                return JsonResponse(
                    {
                        "status": "error",
                        "message": "복제할 항목을 찾을 수 없습니다.",
                    },
                    status=404,
                )

            last_ordering = (
                WorkItem.objects.filter(session=session).aggregate(Max("ordering"))[
                    "ordering__max"
                ]
                or 0
            )

            new_items = []
            for item in items:
                last_ordering += 10
                new_items.append(
                    WorkItem(
                        session=session,
                        task_master=item.task_master,
                        model_type=item.model_type,
                        gibun_input=item.gibun_input,
                        work_order=item.work_order,
                        op=item.op,
                        description=item.description,
                        work_mh=item.work_mh,
                        ordering=last_ordering,
                        is_manual=item.is_manual,
                    )
                )

            WorkItem.objects.bulk_create(new_items)
            return JsonResponse({"status": "success", "count": len(new_items)})

        except json.JSONDecodeError:
            return JsonResponse(
                {"status": "error", "message": "잘못된 JSON 형식입니다."},
                status=400,
            )
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)


class MasterItemsView(SimpleLoginRequiredMixin, View):
    def get(self, request, session_id):
        workplace = get_current_workplace(request)
        items = (
            TaskMaster.objects.filter(site=workplace)
            .order_by("gibun_code", "work_order", "op")
            .values(
                "id",
                "gibun_code",
                "work_order",
                "op",
                "description",
                "default_mh",
            )
        )
        payload = [
            {
                "id": item["id"],
                "gibun": item["gibun_code"],
                "work_order": item["work_order"],
                "op": item["op"],
                "description": item["description"],
                "work_mh": float(item["default_mh"] or 0.0),
            }
            for item in items
        ]
        return JsonResponse({"status": "success", "items": payload})


class DuplicateMasterItemsView(SimpleLoginRequiredMixin, View):
    def post(self, request, session_id):
        session = get_session_or_404(request, session_id)
        try:
            data = json.loads(request.body or "{}")
            item_ids = data.get("item_ids", [])
            if not isinstance(item_ids, list) or not item_ids:
                return JsonResponse(
                    {
                        "status": "error",
                        "message": "추가할 항목을 선택해주세요.",
                    },
                    status=400,
                )

            masters = list(
                TaskMaster.objects.filter(id__in=item_ids).order_by(
                    "gibun_code", "work_order", "op"
                )
            )
            if not masters:
                return JsonResponse(
                    {
                        "status": "error",
                        "message": "추가할 항목을 찾을 수 없습니다.",
                    },
                    status=404,
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
            new_items = []

            for master in masters:
                last_item_ordering += 10
                gibun = (master.gibun_code or "").strip().upper()

                if gibun and gibun not in existing_gibuns and gibun not in added_gibuns:
                    last_order += 1
                    new_priorities.append(
                        GibunPriority(session=session, gibun=gibun, order=last_order)
                    )
                    added_gibuns.add(gibun)

                new_items.append(
                    WorkItem(
                        session=session,
                        task_master=master,
                        model_type=gibun,
                        gibun_input=gibun,
                        work_order=master.work_order,
                        op=master.op,
                        description=master.description,
                        work_mh=master.default_mh or 0.0,
                        ordering=last_item_ordering,
                    )
                )

            with transaction.atomic():
                if new_priorities:
                    GibunPriority.objects.bulk_create(new_priorities)
                WorkItem.objects.bulk_create(new_items)

            return JsonResponse({"status": "success", "count": len(new_items)})

        except json.JSONDecodeError:
            return JsonResponse(
                {"status": "error", "message": "잘못된 JSON 형식입니다."},
                status=400,
            )
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)


class AssignedSummaryView(SimpleLoginRequiredMixin, View):
    def get(self, request, session_id):
        session = get_session_or_404(request, session_id)

        common_schedule = []

        workers = session.worker_set.all().order_by("name")
        workers_schedule = []

        for w in workers:
            assigns = Assignment.objects.filter(
                work_item__session=session, worker=w
            ).select_related("work_item")

            total_mh = 0.0
            direct_mh = 0.0
            kanbi_mh = 0.0
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
                            mh_val = dur / 60.0
                            if wo_raw == KANBI_WO:
                                code_val = (a.code or "").strip()
                                if code_val not in ("", "0"):
                                    total_mh += mh_val
                                    kanbi_mh += mh_val
                            else:
                                total_mh += mh_val
                                direct_mh += mh_val
                else:
                    mh_val = float(a.allocated_mh or 0.0)
                    total_mh += mh_val
                    direct_mh += mh_val

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

            total_limit = 12.0
            direct_limit = float(w.limit_mh or 0.0)
            direct_ratio = min(
                (direct_mh / total_limit) * 100 if total_limit else 0, 100
            )
            remaining_ratio = max(0.0, 100 - direct_ratio)
            kanbi_ratio = min(
                (kanbi_mh / total_limit) * 100 if total_limit else 0,
                remaining_ratio,
            )
            is_overload = direct_limit > 0 and direct_mh > direct_limit

            workers_schedule.append(
                {
                    "worker": w,
                    "worker_name": w.name,
                    "is_night": session.shift_type == "NIGHT",
                    "total_limit": round(total_limit, 1),
                    "direct_limit": round(direct_limit, 1),
                    "total_mh": round(total_mh, 1),
                    "direct_mh": round(direct_mh, 1),
                    "kanbi_mh": round(kanbi_mh, 1),
                    "direct_ratio": round(direct_ratio, 1),
                    "kanbi_ratio": round(kanbi_ratio, 1),
                    "total_ratio": round(
                        (total_mh / total_limit) * 100 if total_limit else 0, 1
                    ),
                    "is_overload": is_overload,
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
            },
        )


class PersonalScheduleView(SimpleLoginRequiredMixin, DetailView):
    model = WorkSession
    template_name = "manning/personal_schedule.html"
    context_object_name = "session"
    pk_url_kwarg = "session_id"

    def get_queryset(self):
        workplace = get_current_workplace(self.request)
        return super().get_queryset().filter(site=workplace)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        worker_id = self.request.GET.get("worker_id")

        gibun_priorities = GibunPriority.objects.filter(session=self.object)
        prio_map = {gp.gibun: gp.order for gp in gibun_priorities}

        if not worker_id:
            return context

        session = self.object
        worker = get_object_or_404(Worker, id=worker_id, session=session)

        assignments = (
            Assignment.objects.filter(work_item__session=session, worker=worker)
            .select_related("work_item", "worker")
            .order_by("id")
        )

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
                        mh_val = dur / 60.0
                        if wo_raw == KANBI_WO:
                            code_val = (a.code or "").strip()
                            if code_val not in ("", "0"):
                                total_mh += mh_val
                        else:
                            total_mh += mh_val
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
                        {"id": wi.id, "code": desc_disp, "start": s_hhmm, "end": e_hhmm}
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

        # 입력 순서를 유지하기 위해 정렬하지 않습니다.

        context.update(
            {
                "worker": worker,
                "schedule": final_schedule,
                "worker_name": worker.name,
                "worker_id": int(worker_id),
                "total_mh": round(total_mh, 1),
                "task_count": task_count,
                "manual_data_json": manual_edit_list,
            }
        )

        return context


class DeleteTaskMasterView(SimpleLoginRequiredMixin, View):
    def get(self, request, pk=None, session_id=None, **kwargs):
        return redirect("master_data_list")

    def post(self, request, pk=None, session_id=None, **kwargs):
        target_pk = pk or session_id
        try:
            workplace = get_current_workplace(request)
            task = get_object_or_404(TaskMaster, pk=target_pk, site=workplace)
            task.delete()
            messages.success(request, f"데이터 '{task.work_order}'가 삭제되었습니다.")
        except Exception as e:
            messages.error(request, f"삭제 중 오류가 발생했습니다: {e}")

        next_url = request.POST.get("next") or "master_data_list"
        return redirect(next_url)


class LegacyUploadRedirectView(SimpleLoginRequiredMixin, View):
    def get(self, request, session_id, *args, **kwargs):
        return redirect("manage_items", session_id=session_id)

    def post(self, request, session_id, *args, **kwargs):
        return redirect("manage_items", session_id=session_id)


class WorkerIndirectView(SimpleLoginRequiredMixin, View):
    def _get_kanbi_item(self, session):
        return get_or_create_common_item(session, KANBI_WO)

    def get(self, request, session_id, worker_id):
        session = get_session_or_404(request, session_id)
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
        session = get_session_or_404(request, session_id)
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
        session = get_session_or_404(request, session_id)

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
            adjusted_mh_map = request.session.get(f"adjusted_mh_map_{session.id}", {})
            run_auto_assign(session.id, adjusted_mh_map)
            messages.success(request, f"추가 완료: {gibun} - {wo}")

        else:
            messages.error(request, "기번과 Work Order는 필수 입력값입니다.")

        return redirect("manage_items", session_id=session_id)


class ResetSessionView(SimpleLoginRequiredMixin, View):
    def post(self, request, session_id):
        if request.session.get("user_role") != "admin":
            messages.error(request, "관리자 권한이 필요합니다.")
            return redirect("index")

        session = get_session_or_404(request, session_id)
        session.is_active = False
        session.save()
        messages.success(request, f"'{session.name}' 세션이 종료되었습니다.")
        return redirect("index")


class ResetAllSessionsView(SimpleLoginRequiredMixin, View):
    def post(self, request):
        workplace = get_current_workplace(request)
        qs = WorkSession.objects.filter(is_active=True, site=workplace)
        session_count = qs.count()
        if session_count > 0:
            qs.delete()
            messages.success(request, f"총 {session_count}개의 세션이 삭제되었습니다.")
        return redirect("index")


class CheckGibunView(View):
    def get(self, request):
        gibun = request.GET.get("gibun", "").strip().upper()

        if not gibun:
            return JsonResponse({"exists": False})

        workplace = get_current_workplace(request)
        exists = TaskMaster.objects.filter(gibun_code=gibun, site=workplace).exists()

        return JsonResponse({"exists": exists})


class MasterDataListView(SimpleLoginRequiredMixin, ListView):
    model = TaskMaster
    template_name = "manning/master_data_list.html"
    context_object_name = "taskmasters"

    def get_queryset(self):
        purge_expired_taskmasters()
        workplace = get_current_workplace(self.request)
        return TaskMaster.objects.filter(site=workplace).order_by(
            "gibun_code", "work_order", "op"
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["total_count"] = self.object_list.count()
        return context


class MasterDataBulkEditView(SimpleLoginRequiredMixin, View):
    template_name = "manning/master_data_edit.html"

    def get_queryset(self, request):
        workplace = get_current_workplace(request)
        return TaskMaster.objects.filter(site=workplace).order_by(
            "gibun_code", "work_order", "op"
        )

    def get(self, request):
        TaskMasterFormSet = modelformset_factory(
            TaskMaster, form=TaskMasterForm, extra=0
        )
        queryset = self.get_queryset(request)
        formset = TaskMasterFormSet(queryset=queryset)
        context = {
            "formset": formset,
            "total_count": queryset.count(),
        }
        return render(request, self.template_name, context)

    def post(self, request):
        TaskMasterFormSet = modelformset_factory(
            TaskMaster, form=TaskMasterForm, extra=0
        )
        queryset = self.get_queryset(request)
        formset = TaskMasterFormSet(request.POST, queryset=queryset)
        if formset.is_valid():
            formset.save()
            messages.success(request, "마스터 데이터가 업데이트되었습니다.")
            return redirect("master_data_list")

        context = {
            "formset": formset,
            "total_count": queryset.count(),
        }
        return render(request, self.template_name, context)


class TaskMasterDeleteView(SimpleLoginRequiredMixin, DeleteView):
    model = TaskMaster
    success_url = reverse_lazy("paste_data")  # 기본값

    def get_queryset(self):
        workplace = get_current_workplace(self.request)
        return super().get_queryset().filter(site=workplace)

    def form_valid(self, form):
        self.object = self.get_object()
        self.object.delete()
        messages.success(self.request, "항목이 삭제되었습니다.")

        # 돌아갈 페이지 유동적 처리
        next_page = self.request.POST.get("next")
        if next_page == "master_data_list":
            return redirect("master_data_list")
        if next_page == "master_data_edit":
            return redirect("master_data_edit")
        return redirect(self.success_url)


class TaskMasterDeleteAllView(SimpleLoginRequiredMixin, View):
    def post(self, request):
        workplace = get_current_workplace(request)
        count = TaskMaster.objects.filter(site=workplace).count()
        if count > 0:
            TaskMaster.objects.filter(site=workplace).delete()
            messages.warning(request, f"총 {count}개의 데이터가 모두 삭제되었습니다.")
        else:
            messages.info(request, "삭제할 데이터가 없습니다.")

        next_page = request.POST.get("next")
        if next_page == "master_data_list":
            return redirect("master_data_list")
        if next_page == "master_data_edit":
            return redirect("master_data_edit")
        return redirect("paste_data")


class ReorderItemView(SimpleLoginRequiredMixin, View):
    def get(self, request, item_id, direction):
        # 1. 이동할 대상 아이템과 세션 찾기
        target_item = get_item_or_404(request, item_id)
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
        session = get_session_or_404(request, session_id)

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
        session = get_session_or_404(request, session_id)

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


def custom_404(request, exception):
    return render(request, "manning/404_page/404.html", status=404)


def video_page(request):
    return render(request, "manning/video_page.html")
