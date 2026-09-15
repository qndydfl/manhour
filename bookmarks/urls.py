from django.urls import path

from . import views

app_name = "bookmarks"

urlpatterns = [
    path("", views.CBHomeView.as_view(), name="cb_home"),
    path(
        "cb-open-list/saved/",
        views.CBSavedDocumentsView.as_view(),
        name="cb_saved_documents",
    ),
    path(
        "cb-templates/manage/",
        views.CBTemplateManageView.as_view(),
        name="cb_template_manage",
    ),
    path(
        "cb-templates/library/",
        views.CBTemplateLibraryView.as_view(),
        name="cb_template_library",
    ),
    path(
        "aircraft/<str:aircraft_model>/",
        views.CBAircraftHomeView.as_view(),
        name="cb_aircraft_home",
    ),
    path(
        "cb-templates/library/<str:aircraft_model>/",
        views.RedirectView.as_view(
            pattern_name="bookmarks:cb_aircraft_home",
            permanent=False,
        ),
        name="cb_template_aircraft_list",
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
