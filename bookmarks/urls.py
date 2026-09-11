from django.urls import path

from . import views

app_name = "bookmarks"

urlpatterns = [
    path(
        "cb-templates/manage/",
        views.CBTemplateManageView.as_view(),
        name="cb_template_manage",
    ),
    path(
        "cb-aircraft-models/",
        views.CBAircraftModelView.as_view(),
        name="cb_aircraft_models",
    ),
    path("cb-templates/", views.CBTemplateView.as_view(), name="cb_templates"),
    path(
        "cb-open-list/", views.CircuitBreakerOpenListView.as_view(), name="cb_open_list"
    ),
]
