from django.views.generic import TemplateView

from manhour.views import SimpleLoginRequiredMixin


class CircuitBreakerOpenListView(SimpleLoginRequiredMixin, TemplateView):
    template_name = "bookmarks/cb_open_list.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["aircraft_models"] = [
            "A320", "A330", "A350", "A380", "B747", "B767", "B777", "OTHER",
        ]
        context["default_aircraft_model"] = ""
        return context
