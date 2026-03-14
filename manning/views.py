import json

from django.contrib import messages
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.views import View
from django.http import Http404

from .forms import SessionAreaForm, WorkSessionCreateForm
from django.db.models import Case, IntegerField, Sum, When

from manhour.models import Assignment as ManhourAssignment
from manhour.models import DefaultWorkerDirectory
from manhour.models import WorkSession as ManhourWorkSession
from manhour.models import Worker as ManhourWorker
from manhour.workplaces import get_workplace_label, normalize_workplace

from .models import (
    Manning,
    SessionArea,
    WorkSession,
    WorkerDirectory,
    AreaTemplate,
    AreaTemplateItem,
)


WORKPLACE_SESSION_KEY = "workplace"


def _get_current_workplace(request):
    current = request.session.get(WORKPLACE_SESSION_KEY)
    return normalize_workplace(current)


def ensure_default_areas(session):
    if session.areas.exists():
        return False
    template_key = getattr(session, "template_type", "") or "standard"
    SessionArea.objects.bulk_create(
        [
            SessionArea(session=session, name=name, position=position)
            for position, name in _get_area_template_items(template_key)
        ]
    )
    return True


def _find_matching_manhour_session(manning_session, workplace=""):
    qs = ManhourWorkSession.objects.all()
    if workplace:
        qs = qs.filter(site=workplace)

    aircraft_reg = (manning_session.aircraft_reg or "").strip()
    if aircraft_reg:
        gibun_match = (
            qs.filter(gibunpriority__gibun=aircraft_reg, is_active=True)
            .order_by("-created_at")
            .first()
        )
        if gibun_match:
            return gibun_match

    if aircraft_reg:
        qs = qs.filter(name__icontains=aircraft_reg)
    if manning_session.work_package_name:
        qs = qs.filter(name__icontains=manning_session.work_package_name)
    return qs.order_by("-created_at").first()


def _get_default_worker_directory(workplace):
    if not workplace:
        return []
    return list(
        DefaultWorkerDirectory.objects.filter(site=workplace)
        .values_list("name", flat=True)
        .order_by("name", "id")
    )


def _get_worker_directory(workplace):
    if not workplace:
        return []

    existing = WorkerDirectory.objects.filter(site=workplace).order_by("name")
    if existing.exists():
        return list(existing.values_list("name", flat=True))
    return []


def _get_area_templates():
    templates = list(
        AreaTemplate.objects.filter(is_active=True)
        .prefetch_related("items")
        .order_by("sort_order", "id")
    )
    if templates:
        return templates
    return []


def _get_area_template_choices():
    db_templates = _get_area_templates()
    if db_templates:
        return [
            {"key": template.key, "label": template.label} for template in db_templates
        ]
    return []


def _get_area_template_items(template_key):
    if not template_key:
        return []

    db_templates = _get_area_templates()
    if db_templates:
        for template in db_templates:
            if template.key.lower() == template_key.lower():
                return [(item.position, item.name) for item in template.items.all()]
        return []
    return []


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
        active_sessions = list(
            WorkSession.objects.filter(is_active=True).order_by(
                # "shift_type",
                "-created_at",
            )
        )
        for session in active_sessions:
            session.site_label = get_workplace_label(session.site)
        used_shifts = sorted({session.shift_type for session in active_sessions})
        return render(
            request,
            "manning/manning_list.html",
            {
                "active_sessions": active_sessions,
                "manhour_data_available": True,
                "used_shifts": used_shifts,
                "workplace": workplace,
            },
        )


class CreateSessionView(ManningSessionRequiredMixin, View):
    http_method_names = ["get", "post"]

    def get(self, request):
        active_shift_combos = list(
            WorkSession.objects.filter(is_active=True)
            .values("aircraft_reg", "block_check", "shift_type")
            .order_by("id")
        )
        form = WorkSessionCreateForm()
        templates = _get_area_template_choices()
        if not templates:
            messages.error(request, "템플릿이 없습니다. 먼저 템플릿을 등록해주세요.")
        return render(
            request,
            "manning/manning_create_session.html",
            {
                "form": form,
                "templates": templates,
                "active_shift_combos": active_shift_combos,
            },
        )

    def post(self, request, *args, **kwargs):
        workplace = _get_current_workplace(request)
        if not workplace:
            messages.error(request, "근무지를 선택해주세요.")
            return redirect("manhour:login")

        form = WorkSessionCreateForm(request.POST)

        if form.is_valid():
            area_template = (request.POST.get("area_template") or "").strip()
            aircraft_reg = (form.cleaned_data.get("aircraft_reg") or "").strip()
            block_check = (form.cleaned_data.get("block_check") or "").strip()
            shift_type = (form.cleaned_data.get("shift_type") or "").strip()

            if (
                aircraft_reg
                and block_check
                and shift_type
                and WorkSession.objects.filter(
                    is_active=True,
                    aircraft_reg=aircraft_reg,
                    block_check=block_check,
                    shift_type=shift_type,
                ).exists()
            ):
                messages.error(
                    request,
                    "같은 기번/A-Check/Shift로 이미 활성 세션이 있습니다.",
                )
                active_shift_combos = list(
                    WorkSession.objects.filter(is_active=True)
                    .values("aircraft_reg", "block_check", "shift_type")
                    .order_by("id")
                )
                return render(
                    request,
                    "manning/manning_create_session.html",
                    {
                        "form": form,
                        "templates": _get_area_template_choices(),
                        "active_shift_combos": active_shift_combos,
                    },
                )

            if not area_template:
                messages.error(request, "구역 템플릿 선택은 필수입니다.")
                return render(
                    request, "manning/manning_create_session.html", {"form": form}
                )

            selected_areas = _get_area_template_items(area_template)
            if not selected_areas:
                messages.error(request, "선택한 템플릿에 구역이 없습니다.")
                active_shift_combos = list(
                    WorkSession.objects.filter(is_active=True)
                    .values("aircraft_reg", "block_check", "shift_type")
                    .order_by("id")
                )
                return render(
                    request,
                    "manning/manning_create_session.html",
                    {
                        "form": form,
                        "templates": _get_area_template_choices(),
                        "active_shift_combos": active_shift_combos,
                    },
                )

            try:
                with transaction.atomic():
                    session = form.save(commit=False)
                    session.site = workplace

                    if not session.name:
                        session.name = (
                            session.work_package_name or "Maintenance Session"
                        )

                    session.is_active = True
                    session.save()

                    manhour_session = _find_matching_manhour_session(
                        session,
                        workplace=workplace,
                    )
                    if manhour_session:
                        session.manhour_session = manhour_session
                        session.save(update_fields=["manhour_session"])

                    # Reset worker directory for a fresh session start.
                    WorkerDirectory.objects.filter(site=workplace).delete()

                    template_label = next(
                        (
                            choice["label"]
                            for choice in _get_area_template_choices()
                            if choice["key"].lower() == area_template.lower()
                        ),
                        area_template or "standard",
                    )

                    from .models import SessionArea

                    SessionArea.objects.bulk_create(
                        [
                            SessionArea(session=session, name=name, position=position)
                            for position, name in selected_areas
                        ]
                    )

                messages.success(
                    request, f"새 세션과 '{template_label}' 구역이 생성되었습니다."
                )
                return redirect("manning:manning_dashboard", session_id=session.id)

            except Exception as e:
                messages.error(request, f"오류가 발생했습니다: {str(e)}")
                return redirect("manning:manning_list")

        messages.error(request, "입력값을 확인해주세요.")
        active_shift_combos = list(
            WorkSession.objects.filter(is_active=True)
            .values("aircraft_reg", "block_check", "shift_type")
            .order_by("id")
        )
        return render(
            request,
            "manning/manning_create_session.html",
            {
                "form": form,
                "templates": _get_area_template_choices(),
                "active_shift_combos": active_shift_combos,
            },
        )


class UpdateSessionView(ManningSessionRequiredMixin, View):
    http_method_names = ["get", "post"]

    def get(self, request, session_id):
        workplace = _get_current_workplace(request)
        session = get_object_or_404(WorkSession, id=session_id)
        if session.site != workplace:
            messages.error(request, "해당 근무지의 세션만 수정할 수 있습니다.")
            return redirect("manning:manning_list")
        form = WorkSessionCreateForm(instance=session)
        return render(
            request,
            "manning/manning_edit_session.html",
            {
                "form": form,
                "session": session,
                "templates": _get_area_template_choices(),
            },
        )

    def post(self, request, session_id):
        workplace = _get_current_workplace(request)
        session = get_object_or_404(WorkSession, id=session_id)
        if session.site != workplace:
            messages.error(request, "해당 근무지의 세션만 수정할 수 있습니다.")
            return redirect("manning:manning_list")

        form = WorkSessionCreateForm(request.POST, instance=session)
        if not form.is_valid():
            messages.error(request, "입력값을 확인해주세요.")
            return render(
                request,
                "manning/manning_edit_session.html",
                {
                    "form": form,
                    "session": session,
                    "templates": _get_area_template_choices(),
                },
            )

        updated = form.save(commit=False)
        if not updated.name:
            updated.name = updated.work_package_name or "Maintenance Session"
        updated.save()
        matched = _find_matching_manhour_session(updated, workplace=workplace)
        if matched:
            updated.manhour_session = matched
            updated.save(update_fields=["manhour_session"])
        elif updated.manhour_session_id:
            updated.manhour_session = None
            updated.save(update_fields=["manhour_session"])
        messages.success(request, "세션 정보가 수정되었습니다.")
        return redirect("manning:manning_list")


class TemplateEditorView(ManningSessionRequiredMixin, View):
    def get(self, request):
        templates = AreaTemplate.objects.prefetch_related("items").order_by(
            "sort_order",
            "id",
        )
        return render(
            request,
            "manning/template_editor.html",
            {
                "templates": templates,
                "positions": SessionArea.POSITION_CHOICES,
            },
        )

    def post(self, request):
        template_ids = request.POST.getlist("template_id")
        template_keys = request.POST.getlist("template_key")
        template_labels = request.POST.getlist("template_label")
        template_orders = request.POST.getlist("template_order")
        template_items = request.POST.getlist("template_items")
        template_left_items = request.POST.getlist("template_left_items")
        template_none_items = request.POST.getlist("template_none_items")
        template_right_items = request.POST.getlist("template_right_items")
        delete_ids = set(request.POST.getlist("template_delete"))

        new_keys = request.POST.getlist("new_template_key")
        new_labels = request.POST.getlist("new_template_label")
        new_orders = request.POST.getlist("new_template_order")
        new_items = request.POST.getlist("new_template_items")
        new_left_items = request.POST.getlist("new_template_left_items")
        new_none_items = request.POST.getlist("new_template_none_items")
        new_right_items = request.POST.getlist("new_template_right_items")

        normalized_existing_keys = []
        for idx, raw_id in enumerate(template_ids):
            if raw_id in delete_ids:
                continue
            key = (template_keys[idx] or "").strip()
            if key:
                normalized_existing_keys.append(key.lower())

        normalized_new_keys = [
            (key or "").strip().lower() for key in new_keys if (key or "").strip()
        ]

        all_keys = normalized_existing_keys + normalized_new_keys
        if len(all_keys) != len(set(all_keys)):
            messages.error(request, "템플릿 key가 중복되었습니다. 중복을 제거해주세요.")
            return redirect("manning:template_editor")

        def _parse_column_items(position, raw_text, start_order=0):
            lines = [line.strip() for line in (raw_text or "").splitlines()]
            parsed = []
            order = start_order
            for line in lines:
                if not line:
                    continue
                parsed.append((position, line, order))
                order += 1
            return parsed, order

        def parse_items(raw_text=None, left_text=None, none_text=None, right_text=None):
            parsed = []
            order = 0

            if left_text is not None or none_text is not None or right_text is not None:
                chunk, order = _parse_column_items("LEFT", left_text, order)
                parsed.extend(chunk)
                chunk, order = _parse_column_items("NONE", none_text, order)
                parsed.extend(chunk)
                chunk, order = _parse_column_items("RIGHT", right_text, order)
                parsed.extend(chunk)
                return parsed

            # fallback: legacy "POSITION,이름" format
            lines = [line.strip() for line in (raw_text or "").splitlines()]
            for idx, line in enumerate(lines):
                if not line:
                    continue
                parts = [part.strip() for part in line.replace("|", ",").split(",")]
                if len(parts) < 2:
                    continue
                position = parts[0].upper()
                name = ",".join(parts[1:]).strip()
                if position not in dict(SessionArea.POSITION_CHOICES):
                    continue
                if not name:
                    continue
                parsed.append((position, name, idx))
            return parsed

        try:
            with transaction.atomic():
                for idx, raw_id in enumerate(template_ids):
                    if raw_id in delete_ids:
                        AreaTemplate.objects.filter(id=raw_id).delete()
                        continue

                    key = (template_keys[idx] or "").strip()
                    label = (template_labels[idx] or "").strip() or key
                    try:
                        order = int(template_orders[idx])
                    except (TypeError, ValueError, IndexError):
                        order = 0
                    if not key:
                        continue

                    template = AreaTemplate.objects.filter(id=raw_id).first()
                    if not template:
                        continue

                    template.key = key
                    template.label = label
                    template.sort_order = order
                    template.is_active = True
                    template.save()

                    AreaTemplateItem.objects.filter(template=template).delete()
                    for position, name, order_idx in parse_items(
                        raw_text=(
                            template_items[idx] if idx < len(template_items) else ""
                        ),
                        left_text=(
                            template_left_items[idx]
                            if idx < len(template_left_items)
                            else None
                        ),
                        none_text=(
                            template_none_items[idx]
                            if idx < len(template_none_items)
                            else None
                        ),
                        right_text=(
                            template_right_items[idx]
                            if idx < len(template_right_items)
                            else None
                        ),
                    ):
                        AreaTemplateItem.objects.create(
                            template=template,
                            position=position,
                            name=name,
                            sort_order=order_idx,
                        )

                for idx, raw_key in enumerate(new_keys):
                    key = (raw_key or "").strip()
                    if not key:
                        continue
                    label = (new_labels[idx] or "").strip() or key
                    try:
                        order = int(new_orders[idx])
                    except (TypeError, ValueError, IndexError):
                        order = 0

                    template, _ = AreaTemplate.objects.update_or_create(
                        key=key,
                        defaults={
                            "label": label,
                            "sort_order": order,
                            "is_active": True,
                        },
                    )
                    AreaTemplateItem.objects.filter(template=template).delete()
                    for position, name, order_idx in parse_items(
                        raw_text=new_items[idx] if idx < len(new_items) else "",
                        left_text=(
                            new_left_items[idx] if idx < len(new_left_items) else None
                        ),
                        none_text=(
                            new_none_items[idx] if idx < len(new_none_items) else None
                        ),
                        right_text=(
                            new_right_items[idx] if idx < len(new_right_items) else None
                        ),
                    ):
                        AreaTemplateItem.objects.create(
                            template=template,
                            position=position,
                            name=name,
                            sort_order=order_idx,
                        )

            messages.success(request, "템플릿이 저장되었습니다.")
            return redirect("manning:create_session")
        except Exception as exc:
            messages.error(request, f"템플릿 저장 중 오류가 발생했습니다: {exc}")
            return redirect("manning:template_editor")


class DeleteSessionView(ManningSessionRequiredMixin, View):
    http_method_names = ["post"]

    def post(self, request, session_id):
        session = get_object_or_404(WorkSession, id=session_id)
        if session.manhour_session_id:
            session.manhour_session.delete()
        session_site = session.site or _get_current_workplace(request)
        session.delete()
        if session_site:
            WorkerDirectory.objects.filter(site=session_site).delete()
        messages.success(request, "세션이 삭제되었습니다.")
        return redirect("manning:manning_list")


class ManningDashboardView(ManningSessionRequiredMixin, View):
    def get(self, request, session_id):
        workplace = _get_current_workplace(request)
        session = get_object_or_404(WorkSession, id=session_id)
        created_defaults = ensure_default_areas(session)
        if created_defaults:
            messages.success(request, "표준 구역이 자동 생성되었습니다.")
        show_empty_assignments = request.GET.get("no_assignments") == "1"
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
            .order_by("position_order", "ordering", "id")
        )
        target_workplace = session.site or workplace
        manhour_session = session.manhour_session or _find_matching_manhour_session(
            session,
            workplace=target_workplace,
        )
        manhour_hours = {}
        has_assignments = False
        if manhour_session:
            has_assignments = ManhourAssignment.objects.filter(
                work_item__session=manhour_session
            ).exists()
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
        is_same_site = (session.site or workplace) == workplace
        return render(
            request,
            "manning/manning_dashboard.html",
            {
                "session": session,
                "session_areas": session_areas,
                "all_workers": all_workers,
                "is_same_site": is_same_site,
                "show_empty_assignments": show_empty_assignments,
                "has_assignments": has_assignments,
            },
        )


class AssignmentRedirectView(ManningSessionRequiredMixin, View):
    def get(self, request, session_id):
        workplace = _get_current_workplace(request)
        manning_session = get_object_or_404(WorkSession, id=session_id)
        target_workplace = manning_session.site or workplace
        target = manning_session.manhour_session
        if not target:
            target = _find_matching_manhour_session(
                manning_session,
                workplace=target_workplace,
            )
            if target:
                manning_session.manhour_session = target
                manning_session.save(update_fields=["manhour_session"])
        if not target:
            messages.error(
                request,
                "manhour 세션을 찾지 못했습니다. 이름에 기번/작업패키지를 포함하세요.",
            )
            return redirect("manning:manning_dashboard", session_id=session_id)
        if not ManhourAssignment.objects.filter(work_item__session=target).exists():
            messages.warning(request, "작업 배정/시간 입력 데이터가 없습니다.")
            target_url = reverse("manning:manning_dashboard", args=[session_id])
            return redirect(f"{target_url}?no_assignments=1")
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

    def post(self, request, *args, **kwargs):
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
            .order_by("position_order", "ordering", "id")
        )
        worker_names = _get_worker_directory(workplace)
        default_worker_names = _get_default_worker_directory(workplace)
        return render(
            request,
            "manning/manning_dashboard_edit.html",
            {
                "session": session,
                "session_areas": session_areas,
                "worker_names": list(worker_names),
                "default_worker_names": list(default_worker_names),
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
        area_orders = request.POST.getlist("area_order")
        delete_ids = set(request.POST.getlist("area_delete"))

        new_names = request.POST.getlist("new_area_name")
        new_positions = request.POST.getlist("new_area_position")
        new_workers = request.POST.getlist("new_area_workers")
        new_orders = request.POST.getlist("new_area_order")

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
                if idx < len(area_orders):
                    try:
                        area.ordering = int(area_orders[idx])
                    except (TypeError, ValueError):
                        pass
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
                        Manning.objects.create(
                            area=area,
                            worker_name=name,
                            hours=0,
                        )

            for idx, new_name in enumerate(new_names):
                if not new_name.strip():
                    continue
                position = (
                    new_positions[idx]
                    if idx < len(new_positions)
                    else SessionArea.POSITION_LEFT
                )
                ordering = 0
                if idx < len(new_orders):
                    try:
                        ordering = int(new_orders[idx])
                    except (TypeError, ValueError):
                        ordering = 0
                area = SessionArea.objects.create(
                    session=session,
                    name=new_name.strip(),
                    position=position,
                    ordering=ordering,
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
        return redirect("manning:manning_dashboard", session_id=session.id)


class WorkerDirectoryUpdateView(ManningSessionRequiredMixin, View):
    http_method_names = ["post"]

    def post(self, request, *args, **kwargs):
        workplace = _get_current_workplace(request)
        if not workplace:
            return JsonResponse(
                {"status": "error", "message": "No workplace"}, status=400
            )

        try:
            payload = json.loads(request.body.decode("utf-8"))
        except json.JSONDecodeError:
            return JsonResponse(
                {"status": "error", "message": "Invalid payload"}, status=400
            )

        raw_names = payload.get("worker_names")
        if not isinstance(raw_names, list):
            return JsonResponse(
                {"status": "error", "message": "Invalid worker list"},
                status=400,
            )

        cleaned = []
        seen = set()
        for raw in raw_names:
            name = (raw or "").strip()
            if not name:
                continue
            if name in seen:
                continue
            cleaned.append(name)
            seen.add(name)

        with transaction.atomic():
            existing = set(
                WorkerDirectory.objects.filter(site=workplace).values_list(
                    "name", flat=True
                )
            )
            desired = set(cleaned)

            WorkerDirectory.objects.filter(site=workplace).exclude(
                name__in=desired
            ).delete()

            WorkerDirectory.objects.bulk_create(
                [
                    WorkerDirectory(site=workplace, name=name)
                    for name in cleaned
                    if name not in existing
                ],
                ignore_conflicts=True,
            )

        return JsonResponse({"status": "success", "worker_names": cleaned})


class Custom404View(View):
    def get(self, request, exception=None):
        return render(request, "manhour/404_page/404.html", status=404)


custom_404 = Custom404View.as_view()
