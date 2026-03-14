from django.urls import path

from . import views

app_name = "manning"

urlpatterns = [
    path("", views.ManningListView.as_view(), name="manning_list"),
    path("session/create/", views.CreateSessionView.as_view(), name="create_session"),
    path(
        "session/<int:session_id>/",
        views.ManningDashboardView.as_view(),
        name="manning_dashboard",
    ),
    path(
        "session/<int:session_id>/assignment/",
        views.AssignmentRedirectView.as_view(),
        name="assignment_view",
    ),
    path(
        "session/<int:session_id>/delete/",
        views.DeleteSessionView.as_view(),
        name="delete_session",
    ),
    path(
        "session/<int:session_id>/update/",
        views.UpdateSessionView.as_view(),
        name="update_session",
    ),
    path(
        "session/<int:session_id>/populate-areas/",
        views.PopulateAreasView.as_view(),
        name="populate_areas",
    ),
    path(
        "session/<int:session_id>/area/add/",
        views.AddAreaView.as_view(),
        name="add_area",
    ),
    path(
        "session/<int:session_id>/area/bulk-edit/",
        views.AreaBulkEditView.as_view(),
        name="area_bulk_edit",
    ),
    path(
        "session/<int:session_id>/edit/",
        views.AreaBulkEditView.as_view(),
        name="manning_dashboard_edit",
    ),
    path(
        "area/<int:area_id>/update/",
        views.UpdateAreaView.as_view(),
        name="update_area",
    ),
    path(
        "area/<int:area_id>/delete/",
        views.DeleteAreaView.as_view(),
        name="delete_area",
    ),
    path("manning/batch/", views.BatchManningView.as_view(), name="batch_manning"),
    path(
        "manning/<int:manning_id>/update-hours/",
        views.UpdateManningHoursView.as_view(),
        name="update_manning_hours",
    ),
    path(
        "workers/update/",
        views.WorkerDirectoryUpdateView.as_view(),
        name="update_worker_directory",
    ),
    path(
        "templates/edit/",
        views.TemplateEditorView.as_view(),
        name="template_editor",
    ),
]
