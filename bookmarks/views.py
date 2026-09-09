import json

from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.views import View
from django.views.generic import TemplateView

from manhour.views import SimpleLoginRequiredMixin, get_current_workplace
from .models import CBAircraftModel, CBTemplate

AIRCRAFT_MODELS = ["A320", "A330", "A350", "A380", "B747", "B777", "OTHER"]


def get_aircraft_models(request):
    site = get_current_workplace(request)
    if not CBAircraftModel.objects.filter(site=site).exists():
        CBAircraftModel.objects.bulk_create(
            [CBAircraftModel(site=site, code=code) for code in AIRCRAFT_MODELS],
            ignore_conflicts=True,
        )
    return list(CBAircraftModel.objects.filter(site=site).values_list("code", flat=True))


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
        context["aircraft_models"] = get_aircraft_models(self.request)
        context["default_aircraft_model"] = ""
        return context


class CBTemplateManageView(SimpleLoginRequiredMixin, TemplateView):
    template_name = "bookmarks/cb_template_manage.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["aircraft_models"] = get_aircraft_models(self.request)
        return context


class CBAircraftModelView(SimpleLoginRequiredMixin, View):
    def get(self, request):
        return JsonResponse({"aircraft_models": get_aircraft_models(request)})

    def post(self, request):
        if request.session.get("user_role") != "admin":
            return JsonResponse({"error": "관리자만 기종을 변경할 수 있습니다."}, status=403)
        try:
            data = json.loads(request.body)
            action = data.get("action")
            site = get_current_workplace(request)
            if action == "create":
                code = clean_aircraft_code(data.get("code"))
                _, created = CBAircraftModel.objects.get_or_create(site=site, code=code)
                if not created:
                    return JsonResponse({"error": "이미 등록된 기종입니다."}, status=409)
                return JsonResponse({"code": code}, status=201)
            old_code = clean_aircraft_code(data.get("old_code"))
            aircraft = CBAircraftModel.objects.filter(site=site, code=old_code).first()
            if aircraft is None:
                return JsonResponse({"error": "기종을 찾을 수 없습니다."}, status=404)
            if action == "rename":
                new_code = clean_aircraft_code(data.get("new_code"))
                if CBAircraftModel.objects.filter(site=site, code=new_code).exclude(pk=aircraft.pk).exists():
                    return JsonResponse({"error": "이미 등록된 기종입니다."}, status=409)
                with transaction.atomic():
                    CBTemplate.objects.filter(site=site, aircraft_model=old_code).update(aircraft_model=new_code)
                    aircraft.code = new_code
                    aircraft.save(update_fields=["code"])
                return JsonResponse({"code": new_code})
            if action == "delete":
                if CBAircraftModel.objects.filter(site=site).count() <= 1:
                    return JsonResponse({"error": "기종은 최소 한 개 이상 남아 있어야 합니다."}, status=409)
                with transaction.atomic():
                    deleted_templates, _ = CBTemplate.objects.filter(site=site, aircraft_model=old_code).delete()
                    aircraft.delete()
                return JsonResponse({"deleted_templates": deleted_templates})
            raise ValueError
        except IntegrityError:
            return JsonResponse({"error": "변경할 기종에 같은 이름의 템플릿이 있어 수정할 수 없습니다."}, status=409)
        except (ValueError, TypeError, UnicodeDecodeError):
            return JsonResponse({"error": "기종은 1~20자의 문자로 입력해 주세요."}, status=400)


class CBTemplateView(SimpleLoginRequiredMixin, View):
    def get(self, request):
        templates = CBTemplate.objects.filter(
            site=get_current_workplace(request),
            aircraft_model=request.GET.get("aircraft_model", ""),
        )
        return JsonResponse({"templates": list(templates.values("id", "aircraft_model", "name", "rows"))})

    def post(self, request):
        try:
            data = json.loads(request.body)
            if not isinstance(data, dict):
                raise ValueError
            model = clean_aircraft_code(data.get("aircraft_model"))
            name = data.get("name")
            rows = data.get("rows")
            template_id = data.get("id")
            original_model = clean_aircraft_code(data.get("original_aircraft_model", model))
            if template_id is not None and (type(template_id) is not int or template_id < 1):
                raise ValueError
            site = get_current_workplace(request)
            get_aircraft_models(request)
            if not CBAircraftModel.objects.filter(site=site, code=model).exists():
                raise ValueError
            if not isinstance(name, str) or not 1 <= len(name.strip()) <= 100:
                raise ValueError
            if not isinstance(rows, list) or not 1 <= len(rows) <= 1000:
                raise ValueError
            clean_rows = []
            for row in rows:
                if not isinstance(row, dict):
                    raise ValueError
                cleaned = {}
                for field in ("panel_loc", "cb_loc", "fin", "description"):
                    value = row.get(field, "")
                    if not isinstance(value, str) or len(value) > 2000:
                        raise ValueError
                    cleaned[field] = value.strip()
                if not cleaned["panel_loc"] or not cleaned["cb_loc"] or not cleaned["description"]:
                    raise ValueError
                clean_rows.append(cleaned)
        except (ValueError, TypeError, UnicodeDecodeError):
            return JsonResponse({"error": "기종·템플릿 이름과 PANEL, C/B LOC', DESCRIPTION을 확인해 주세요. 최대 1,000행까지 저장할 수 있습니다."}, status=400)
        try:
            with transaction.atomic():
                if template_id is None:
                    template = CBTemplate.objects.create(
                        site=get_current_workplace(request), aircraft_model=model,
                        name=name.strip(), rows=clean_rows,
                    )
                else:
                    template = CBTemplate.objects.select_for_update().filter(
                        pk=template_id, site=get_current_workplace(request), aircraft_model=original_model,
                    ).first()
                    if template is None:
                        return JsonResponse({"error": "수정할 템플릿을 찾을 수 없습니다."}, status=404)
                    template.name = name.strip()
                    template.aircraft_model = model
                    template.rows = clean_rows
                    template.save(update_fields=["aircraft_model", "name", "rows"])
        except IntegrityError:
            return JsonResponse({"error": "이 기종에 같은 이름의 템플릿이 있습니다. 다른 이름으로 저장해 주세요."}, status=409)
        return JsonResponse({"id": template.pk, "name": template.name}, status=200 if template_id else 201)
