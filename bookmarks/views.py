import json

from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.http import Http404
from django.views import View
from django.views.generic import TemplateView

from manhour.views import SimpleLoginRequiredMixin, get_current_workplace
from .models import CBAircraftModel, CBTemplate
from .cb_merges import clean_template_merges

AIRCRAFT_MODELS = ["A320", "A330", "A350", "A380", "B747", "B777", "OTHER"]


def get_aircraft_models():
    if not CBAircraftModel.objects.exists():
        CBAircraftModel.objects.bulk_create(
            [CBAircraftModel(code=code) for code in AIRCRAFT_MODELS],
            ignore_conflicts=True,
        )

    return list(
        CBAircraftModel.objects.order_by("code").values_list(
            "code",
            flat=True,
        )
    )


def clean_aircraft_code(value):
    if not isinstance(value, str):
        raise ValueError
    code = value.strip().upper()
    if not 1 <= len(code) <= 20:
        raise ValueError
    return code


class CircuitBreakerOpenListView(SimpleLoginRequiredMixin, TemplateView):
    template_name = "bookmarks/cb_open_list.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["aircraft_models"] = get_aircraft_models()
        context["default_aircraft_model"] = ""
        context["can_manage_cb"] = (
            self.request.session.get("user_role") == "admin"
            or self.request.user.is_superuser
        )
        return context


class CBHomeView(SimpleLoginRequiredMixin, TemplateView):
    template_name = "bookmarks/cb_home.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["aircraft_models"] = get_aircraft_models()
        return context


class CBSavedDocumentsView(SimpleLoginRequiredMixin, TemplateView):
    template_name = "bookmarks/cb_saved_documents.html"


class CBTemplateLibraryView(
    SimpleLoginRequiredMixin,
    TemplateView,
):
    template_name = "bookmarks/cb_template_library.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        site = get_current_workplace(self.request)
        get_aircraft_models()
        aircraft_models = list(CBAircraftModel.objects.all().order_by("code"))

        templates = list(
            CBTemplate.objects.filter(site=site)
            .order_by(
                "aircraft_model",
                "-created_at",
                "-id",
            )
            .values(
                "id",
                "aircraft_model",
                "name",
                "created_at",
            )
        )

        aircraft_groups = []

        for aircraft in aircraft_models:

            model_templates = [
                item for item in templates if item["aircraft_model"] == aircraft.code
            ]

            aircraft_groups.append(
                {
                    "aircraft_model": aircraft.code,
                    "image": (aircraft.image.url if aircraft.image else ""),
                    "template_count": len(model_templates),
                    "templates": model_templates,
                }
            )

        context["aircraft_groups"] = aircraft_groups

        return context


class CBTemplateAircraftListView(SimpleLoginRequiredMixin, TemplateView):
    template_name = "bookmarks/cb_template_aircraft_list.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        aircraft_model = self.kwargs["aircraft_model"].strip().upper()
        get_aircraft_models()
        aircraft = CBAircraftModel.objects.filter(code=aircraft_model).first()
        if aircraft is None:
            raise Http404("등록되지 않은 기종입니다.")
        context["aircraft_model"] = aircraft_model
        context["aircraft_image"] = aircraft.image.url if aircraft.image else ""
        context["templates"] = CBTemplate.objects.filter(
            site=get_current_workplace(self.request),
            aircraft_model=aircraft_model,
        ).order_by("-updated_at", "name")
        return context


class CBTemplateManageView(SimpleLoginRequiredMixin, TemplateView):
    template_name = "bookmarks/cb_template_manage.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        aircraft_models = get_aircraft_models()
        requested_model = self.request.GET.get("aircraft_model", "").strip().upper()
        selected_model = (
            requested_model
            if requested_model in aircraft_models
            else aircraft_models[0]
        )
        requested_template_id = self.request.GET.get("template_id", "")
        selected_template_id = ""
        selected_template = None
        if requested_template_id.isdigit():
            selected_template = CBTemplate.objects.filter(
                pk=int(requested_template_id),
                site=get_current_workplace(self.request),
                aircraft_model=selected_model,
            ).first()
            if selected_template:
                selected_template_id = requested_template_id
        context["aircraft_models"] = aircraft_models
        context["selected_aircraft_model"] = selected_model
        context["selected_template_id"] = selected_template_id
        context["template_manage_mode"] = True
        context["managed_template_data"] = {
            "id": selected_template.pk if selected_template else None,
            "aircraft_model": selected_model,
            "name": selected_template.name if selected_template else "",
            "rows": selected_template.rows if selected_template else [],
        }
        return context


class CBAircraftModelView(
    SimpleLoginRequiredMixin,
    View,
):
    def get(self, request):
        return JsonResponse({"aircraft_models": get_aircraft_models()})

    def post(self, request):
        if request.session.get("user_role") != "admin":
            return JsonResponse(
                {"error": "관리자만 기종을 " "변경할 수 있습니다."},
                status=403,
            )

        try:
            data = json.loads(request.body)

            action = data.get("action")

            if action == "create":

                code = clean_aircraft_code(data.get("code"))

                _, created = CBAircraftModel.objects.get_or_create(code=code)

                if not created:
                    return JsonResponse(
                        {"error": "이미 등록된 " "기종입니다."},
                        status=409,
                    )

                return JsonResponse(
                    {"code": code},
                    status=201,
                )

            old_code = clean_aircraft_code(data.get("old_code"))

            aircraft = CBAircraftModel.objects.filter(code=old_code).first()

            if aircraft is None:
                return JsonResponse(
                    {"error": "기종을 찾을 수 " "없습니다."},
                    status=404,
                )

            if action == "rename":

                new_code = clean_aircraft_code(data.get("new_code"))

                if (
                    CBAircraftModel.objects.filter(code=new_code)
                    .exclude(pk=aircraft.pk)
                    .exists()
                ):
                    return JsonResponse(
                        {"error": "이미 등록된 " "기종입니다."},
                        status=409,
                    )

                with transaction.atomic():

                    CBTemplate.objects.filter(aircraft_model=old_code).update(
                        aircraft_model=new_code
                    )

                    aircraft.code = new_code

                    aircraft.save(update_fields=["code"])

                return JsonResponse({"code": new_code})

            if action == "delete":

                related_template_count = CBTemplate.objects.filter(
                    aircraft_model=old_code
                ).count()

                if related_template_count:
                    return JsonResponse(
                        {
                            "error": f"{old_code} 기종을 사용하는 "
                            f"템플릿이 "
                            f"{related_template_count}개 있습니다. "
                            "관련 템플릿을 먼저 "
                            "정리해 주세요."
                        },
                        status=409,
                    )

                if CBAircraftModel.objects.count() <= 1:
                    return JsonResponse(
                        {"error": "기종은 최소 한 개 이상 " "남아 있어야 합니다."},
                        status=409,
                    )

                aircraft.delete()

                return JsonResponse({"deleted": True})

            raise ValueError

        except IntegrityError:

            return JsonResponse(
                {"error": "기종 정보를 변경할 수 없습니다."},
                status=409,
            )

        except (
            ValueError,
            TypeError,
            UnicodeDecodeError,
        ):

            return JsonResponse(
                {"error": "기종은 1~20자의 문자로 " "입력해 주세요."},
                status=400,
            )


class CBTemplateView(SimpleLoginRequiredMixin, View):
    def delete(self, request):
        try:
            data = json.loads(request.body)
            if (
                not isinstance(data, dict)
                or type(data.get("id")) is not int
                or data["id"] < 1
            ):
                raise ValueError
            model = clean_aircraft_code(data.get("aircraft_model"))
        except (ValueError, TypeError, UnicodeDecodeError):
            return JsonResponse({"error": "삭제할 템플릿을 선택해 주세요."}, status=400)
        template = CBTemplate.objects.filter(
            pk=data["id"],
            site=get_current_workplace(request),
            aircraft_model=model,
        ).first()
        if template is None:
            return JsonResponse(
                {"error": "삭제할 템플릿을 찾을 수 없습니다."}, status=404
            )
        name = template.name
        template.delete()
        return JsonResponse({"name": name})

    def get(self, request):
        templates = CBTemplate.objects.filter(
            site=get_current_workplace(request),
            aircraft_model=request.GET.get("aircraft_model", ""),
        )
        return JsonResponse(
            {
                "templates": list(
                    templates.values("id", "aircraft_model", "name", "rows")
                )
            }
        )

    def post(self, request):
        try:
            data = json.loads(request.body)
            if not isinstance(data, dict):
                raise ValueError
            model = clean_aircraft_code(data.get("aircraft_model"))
            name = data.get("name")
            rows = data.get("rows")
            template_id = data.get("id")
            original_model = clean_aircraft_code(
                data.get("original_aircraft_model", model)
            )
            if template_id is not None and (
                type(template_id) is not int or template_id < 1
            ):
                raise ValueError
            site = get_current_workplace(request)
            get_aircraft_models()
            if not CBAircraftModel.objects.filter(code=model).exists():
                raise ValueError
            if not isinstance(name, str) or not 1 <= len(name.strip()) <= 100:
                raise ValueError
            if not isinstance(rows, list) or not 1 <= len(rows) <= 1000:
                raise ValueError
            if not all(isinstance(row, dict) for row in rows):
                raise ValueError
            merge_rows, _covered = clean_template_merges(rows)
            clean_rows = []
            for row_index, row in enumerate(rows):
                if not isinstance(row, dict):
                    raise ValueError
                cleaned = {}
                for field in ("panel_loc", "cb_loc", "fin", "description", "warning"):
                    value = row.get(field, "")
                    if not isinstance(value, str) or len(value) > 2000:
                        raise ValueError
                    cleaned[field] = value.strip()
                for field in ("cockpit", "ee", "etc"):
                    if field in row:
                        value = row[field]
                        if not isinstance(value, str) or value.strip().upper() not in (
                            "",
                            "V",
                        ):
                            raise ValueError
                        cleaned[field] = value.strip().upper()
                if merge_rows[row_index]:
                    cleaned["_merges"] = merge_rows[row_index]
                clean_rows.append(cleaned)
            if not any(
                row.get(field, "")
                for row in clean_rows
                for field in (
                    "cockpit",
                    "ee",
                    "etc",
                    "panel_loc",
                    "cb_loc",
                    "fin",
                    "description",
                    "warning",
                )
            ):
                raise ValueError
        except (ValueError, TypeError, UnicodeDecodeError):
            return JsonResponse(
                {
                    "error": "기종·템플릿 이름과 셀 데이터를 확인해 주세요. 템플릿에는 데이터가 하나 이상 있어야 하며 최대 1,000행까지 저장할 수 있습니다."
                },
                status=400,
            )
        try:
            with transaction.atomic():
                if template_id is None:
                    template = CBTemplate.objects.create(
                        site=get_current_workplace(request),
                        aircraft_model=model,
                        name=name.strip(),
                        rows=clean_rows,
                    )
                else:
                    template = (
                        CBTemplate.objects.select_for_update()
                        .filter(
                            pk=template_id,
                            site=get_current_workplace(request),
                            aircraft_model=original_model,
                        )
                        .first()
                    )
                    if template is None:
                        return JsonResponse(
                            {"error": "수정할 템플릿을 찾을 수 없습니다."}, status=404
                        )
                    template.name = name.strip()
                    template.aircraft_model = model
                    template.rows = clean_rows
                    template.save(update_fields=["aircraft_model", "name", "rows"])
        except IntegrityError:
            return JsonResponse(
                {
                    "error": "이 기종에 같은 이름의 템플릿이 있습니다. 다른 이름으로 저장해 주세요."
                },
                status=409,
            )
        return JsonResponse(
            {"id": template.pk, "name": template.name},
            status=200 if template_id else 201,
        )
