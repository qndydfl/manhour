import json

from django.contrib import messages
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views import View
from django.http import Http404

from .forms import SessionAreaForm, WorkSessionCreateForm
from django.db.models import Case, IntegerField, Sum, When

from manhour.models import Assignment as ManhourAssignment
from manhour.models import WorkSession as ManhourWorkSession
from manhour.models import Worker as ManhourWorker

from .models import Manning, SessionArea, WorkSession


DEFAULT_AREAS = [
    ("LEFT", "Section Leader"),
    ("LEFT", "ENG1"),
    ("LEFT", "ENG2"),
    ("LEFT", "LEFT WING"),
    ("LEFT", "LANDING GEAR"),
    ("RIGHT", "Section Leader"),
    ("RIGHT", "ENG3"),
    ("RIGHT", "ENG4"),
    ("RIGHT", "RIGHT WING"),
    ("RIGHT", "APU/CGO/GEN"),
    ("NONE", "COORDINATOR"),
    ("NONE", "OP & CABIN"),
    ("NONE", "T.P"),
    ("NONE", "SE"),
]

WORKPLACE_SESSION_KEY = "workplace"


def _get_current_workplace(request):
    current = request.session.get(WORKPLACE_SESSION_KEY)
    valid = {choice[0] for choice in WorkSession.SITE_CHOICES}
    if current in valid:
        return current
    return ""


def ensure_default_areas(session):
    if session.areas.exists():
        return False
    SessionArea.objects.bulk_create(
        [
            SessionArea(session=session, name=name, position=position)
            for position, name in DEFAULT_AREAS
        ]
    )
    return True


def _find_matching_manhour_session(manning_session, workplace=""):
    qs = ManhourWorkSession.objects.all()
    if workplace:
        qs = qs.filter(site=workplace)
    if manning_session.aircraft_reg:
        qs = qs.filter(name__icontains=manning_session.aircraft_reg)
    if manning_session.work_package_name:
        qs = qs.filter(name__icontains=manning_session.work_package_name)
    return qs.order_by("-created_at").first()


class ManningSessionRequiredMixin:
    def dispatch(self, request, *args, **kwargs):
        if not request.session.get("is_authenticated"):
            raise Http404
        workplace = _get_current_workplace(request)
        if not workplace:
            messages.error(request, "근무지를 선택해주세요.")
            return redirect("manhour:login")
        return super().dispatch(request, *args, **kwargs)


class ManningListView(ManningSessionRequiredMixin, View):
    def get(self, request):
        workplace = _get_current_workplace(request)
        active_sessions = WorkSession.objects.filter(is_active=True).order_by(
            "shift_type",
            "-created_at",
        )
        used_shifts = list(
            active_sessions.values_list("shift_type", flat=True).distinct()
        )
        return render(
            request,
            "manning/manning_list.html",
            {
                "active_sessions": active_sessions,
                "manhour_data_available": True,
                "used_shifts": used_shifts,
            },
        )


class CreateSessionView(ManningSessionRequiredMixin, View):
    http_method_names = ["post"]

    def post(self, request):
        workplace = _get_current_workplace(request)
        if not workplace:
            messages.error(request, "근무지를 선택해주세요.")
            return redirect("manhour:login")
        form = WorkSessionCreateForm(request.POST)
        if form.is_valid():
            session = form.save(commit=False)
            raw_block_check = (request.POST.get("block_check") or "").strip()
            raw_shift_type = (request.POST.get("shift_type") or "").strip()
            if raw_block_check and raw_shift_type:
                session.site = workplace
            if not session.name:
                session.name = session.work_package_name or "Maintenance Session"
            session.is_active = True
            session.save()
            messages.success(request, "새 세션이 생성되었습니다.")
            return redirect("manning:manning_list")

        messages.error(request, "세션 생성에 실패했습니다. 입력값을 확인해주세요.")
        active_sessions = WorkSession.objects.filter(is_active=True).order_by(
            "shift_type",
            "-created_at",
        )
        used_shifts = list(
            active_sessions.values_list("shift_type", flat=True).distinct()
        )
        return render(
            request,
            "manning/manning_list.html",
            {
                "active_sessions": active_sessions,
                "manhour_data_available": True,
                "used_shifts": used_shifts,
                "form_errors": form.errors,
            },
        )


class DeleteSessionView(ManningSessionRequiredMixin, View):
    http_method_names = ["post"]

    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        session.delete()
        messages.success(request, "세션이 삭제되었습니다.")
        return redirect("manning:manning_list")


class ManningDashboardView(ManningSessionRequiredMixin, View):
    def get(self, request, session_id):
        workplace = _get_current_workplace(request)
        session = get_object_or_404(WorkSession, id=session_id)
        created_defaults = ensure_default_areas(session)
        if created_defaults:
            messages.success(request, "표준 구역이 자동 생성되었습니다.")
        session_areas = (
            session.areas.all()
            .prefetch_related("manning_set")
            .annotate(
                position_order=Case(
                    When(position=SessionArea.POSITION_LEFT, then=0),
                    When(position=SessionArea.POSITION_RIGHT, then=1),
                    default=2,
                    output_field=IntegerField(),
                )
            )
            .order_by("position_order", "id")
        )
        target_workplace = session.site or workplace
        manhour_session = _find_matching_manhour_session(
            session,
            workplace=target_workplace,
        )
        manhour_hours = {}
        if manhour_session:
            manhour_hours = {
                row["worker__name"]: float(row["total"] or 0)
                for row in ManhourAssignment.objects.filter(
                    work_item__session=manhour_session
                )
                .values("worker__name")
                .annotate(total=Sum("allocated_mh"))
            }

        for area in session_areas:
            for manning in area.manning_set.all():
                manning.display_hours = manhour_hours.get(manning.worker_name)
        worker_names = (
            ManhourWorker.objects.filter(session__site=target_workplace)
            .values_list("name", flat=True)
            .distinct()
            .order_by("name")
        )
        all_workers = [{"name": name} for name in worker_names]
        return render(
            request,
            "manning/manning_dashboard.html",
            {
                "session": session,
                "session_areas": session_areas,
                "all_workers": all_workers,
                "is_same_site": session.site == workplace,
            },
        )


class AssignmentRedirectView(ManningSessionRequiredMixin, View):
    def get(self, request, session_id):
        workplace = _get_current_workplace(request)
        manning_session = get_object_or_404(WorkSession, id=session_id)
        target_workplace = manning_session.site or workplace
        target = _find_matching_manhour_session(
            manning_session,
            workplace=target_workplace,
        )
        if not target:
            messages.error(
                request,
                "manhour 세션을 찾지 못했습니다. 이름에 기번/작업패키지를 포함하세요.",
            )
            return redirect("manning:manning_dashboard", session_id=session_id)
        return redirect("manhour:result_view", session_id=target.id)


class PopulateAreasView(ManningSessionRequiredMixin, View):
    http_method_names = ["post"]

    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        created_defaults = ensure_default_areas(session)
        if created_defaults:
            messages.success(request, "표준 구역이 생성되었습니다.")
        return redirect("manning:manning_dashboard", session_id=session.id)


class AddAreaView(ManningSessionRequiredMixin, View):
    http_method_names = ["post"]

    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        form = SessionAreaForm(request.POST)
        if form.is_valid():
            area = form.save(commit=False)
            area.session = session
            area.save()
            messages.success(request, "새 구역이 추가되었습니다.")
        else:
            messages.error(request, "구역 추가에 실패했습니다. 입력값을 확인해주세요.")
        return redirect("manning:manning_dashboard", session_id=session.id)


class UpdateAreaView(ManningSessionRequiredMixin, View):
    http_method_names = ["post"]

    def post(self, request, area_id):
        area = get_object_or_404(
            SessionArea,
            id=area_id,
        )
        form = SessionAreaForm(request.POST, instance=area)
        if form.is_valid():
            form.save()
            if request.headers.get("x-requested-with") == "XMLHttpRequest":
                return JsonResponse({"status": "success"})
            messages.success(request, "구역 정보가 수정되었습니다.")
        else:
            if request.headers.get("x-requested-with") == "XMLHttpRequest":
                return JsonResponse(
                    {"status": "error", "errors": form.errors}, status=400
                )
            messages.error(request, "구역 정보 수정에 실패했습니다.")
        return redirect("manning:manning_dashboard", session_id=area.session_id)


class DeleteAreaView(ManningSessionRequiredMixin, View):
    http_method_names = ["post"]

    def post(self, request, area_id):
        area = get_object_or_404(
            SessionArea,
            id=area_id,
        )
        session_id = area.session_id
        area.delete()
        messages.success(request, "구역이 삭제되었습니다.")
        return redirect("manning:manning_dashboard", session_id=session_id)


class BatchManningView(ManningSessionRequiredMixin, View):
    http_method_names = ["post"]

    def post(self, request):
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except json.JSONDecodeError:
            return JsonResponse(
                {"status": "error", "message": "Invalid payload"}, status=400
            )

        area_id = payload.get("area_id")
        worker_names = payload.get("worker_names") or []
        if not area_id or not isinstance(worker_names, list):
            return JsonResponse(
                {"status": "error", "message": "Invalid data"}, status=400
            )

        area = get_object_or_404(
            SessionArea,
            id=area_id,
        )
        cleaned = [name.strip() for name in worker_names if name and name.strip()]

        if not cleaned:
            return JsonResponse(
                {"status": "error", "message": "No workers"}, status=400
            )

        existing = {manning.worker_name: manning for manning in area.manning_set.all()}
        for name in cleaned:
            if name in existing:
                continue
            Manning.objects.create(area=area, worker_name=name, hours=0)

        return JsonResponse({"status": "success"})


class UpdateManningHoursView(ManningSessionRequiredMixin, View):
    http_method_names = ["post"]

    def post(self, request, manning_id):
        manning = get_object_or_404(
            Manning,
            id=manning_id,
        )
        raw_hours = (request.POST.get("hours") or "").strip()
        try:
            hours_value = float(raw_hours)
        except (TypeError, ValueError):
            return JsonResponse(
                {"status": "error", "message": "Invalid hours"}, status=400
            )
        manning.hours = hours_value
        manning.save(update_fields=["hours"])
        return JsonResponse({"status": "success"})


class AreaBulkEditView(ManningSessionRequiredMixin, View):
    def get(self, request, session_id):
        workplace = _get_current_workplace(request)
        session = get_object_or_404(WorkSession, id=session_id)
        session_areas = (
            session.areas.all()
            .prefetch_related("manning_set")
            .annotate(
                position_order=Case(
                    When(position=SessionArea.POSITION_LEFT, then=0),
                    When(position=SessionArea.POSITION_RIGHT, then=1),
                    When(position=SessionArea.POSITION_NONE, then=2),
                    default=3,
                    output_field=IntegerField(),
                )
            )
            .order_by("position_order", "id")
        )
        target_workplace = session.site or workplace
        worker_names = (
            ManhourWorker.objects.filter(session__site=target_workplace)
            .values_list("name", flat=True)
            .distinct()
            .order_by("name")
        )
        return render(
            request,
            "manning/manning_dashboard_edit.html",
            {
                "session": session,
                "session_areas": session_areas,
                "worker_names": list(worker_names),
                "errors": [],
            },
        )

    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        errors = []
        area_ids = request.POST.getlist("area_id")
        area_names = request.POST.getlist("area_name")
        area_positions = request.POST.getlist("area_position")
        area_workers = request.POST.getlist("area_workers")
        delete_ids = set(request.POST.getlist("area_delete"))

        new_names = request.POST.getlist("new_area_name")
        new_positions = request.POST.getlist("new_area_position")
        new_workers = request.POST.getlist("new_area_workers")

        with transaction.atomic():
            for idx, area_id in enumerate(area_ids):
                area = get_object_or_404(SessionArea, id=area_id, session=session)
                if str(area_id) in delete_ids:
                    area.delete()
                    continue

                area.name = (area_names[idx] or "").strip()
                area.position = (
                    area_positions[idx] if idx < len(area_positions) else area.position
                )
                if not area.name:
                    errors.append("구역 이름은 비워둘 수 없습니다.")
                else:
                    area.save()

                names = []
                if idx < len(area_workers):
                    names = [
                        name.strip()
                        for name in area_workers[idx].split(",")
                        if name.strip()
                    ]

                existing = {
                    manning.worker_name: manning for manning in area.manning_set.all()
                }
                desired = set(names)
                for name, manning_obj in existing.items():
                    if name not in desired:
                        manning_obj.delete()
                for name in names:
                    if name not in existing:
                        Manning.objects.create(area=area, worker_name=name, hours=0)

            for idx, new_name in enumerate(new_names):
                if not new_name.strip():
                    continue
                position = (
                    new_positions[idx]
                    if idx < len(new_positions)
                    else SessionArea.POSITION_LEFT
                )
                area = SessionArea.objects.create(
                    session=session,
                    name=new_name.strip(),
                    position=position,
                )
                workers_text = new_workers[idx] if idx < len(new_workers) else ""
                worker_list = [
                    name.strip() for name in workers_text.split(",") if name.strip()
                ]
                for name in worker_list:
                    Manning.objects.create(area=area, worker_name=name, hours=0)

        if errors:
            messages.error(request, "수정 중 일부 문제가 발생했습니다.")
        else:
            messages.success(request, "구역 정보가 저장되었습니다.")
        return redirect("manning:area_bulk_edit", session_id=session.id)


class Custom404View(View):
    def get(self, request, exception=None):
        return render(request, "manning/404_page/404.html", status=404)


custom_404 = Custom404View.as_view()
