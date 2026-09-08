import json

from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.views import View
from django.views.generic import TemplateView

from manhour.views import SimpleLoginRequiredMixin, get_current_workplace
from .models import CBTemplate

AIRCRAFT_MODELS = ["A320", "A330", "A350", "A380", "B747", "B767", "B777", "OTHER"]


class CircuitBreakerOpenListView(SimpleLoginRequiredMixin, TemplateView):
    template_name = "bookmarks/cb_open_list.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["aircraft_models"] = AIRCRAFT_MODELS
        context["default_aircraft_model"] = ""
        return context


class CBTemplateView(SimpleLoginRequiredMixin, View):
    def get(self, request):
        templates = CBTemplate.objects.filter(
            site=get_current_workplace(request),
            aircraft_model=request.GET.get("aircraft_model", ""),
        )
        return JsonResponse({"templates": list(templates.values("id", "name", "rows"))})

    def post(self, request):
        try:
            data = json.loads(request.body)
            if not isinstance(data, dict):
                raise ValueError
            model = data.get("aircraft_model")
            name = data.get("name")
            rows = data.get("rows")
            template_id = data.get("id")
            if template_id is not None and (type(template_id) is not int or template_id < 1):
                raise ValueError
            if model not in AIRCRAFT_MODELS or not isinstance(name, str) or not 1 <= len(name.strip()) <= 100:
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
                        pk=template_id, site=get_current_workplace(request), aircraft_model=model,
                    ).first()
                    if template is None:
                        return JsonResponse({"error": "수정할 템플릿을 찾을 수 없습니다."}, status=404)
                    template.name = name.strip()
                    template.rows = clean_rows
                    template.save(update_fields=["name", "rows"])
        except IntegrityError:
            return JsonResponse({"error": "이 기종에 같은 이름의 템플릿이 있습니다. 다른 이름으로 저장해 주세요."}, status=409)
        return JsonResponse({"id": template.pk, "name": template.name}, status=200 if template_id else 201)
