from django.urls import path

from . import views

app_name = "bookmarks"

urlpatterns = [
    path("cb-templates/", views.CBTemplateView.as_view(), name="cb_templates"),
    path("cb-open-list/", views.CircuitBreakerOpenListView.as_view(), name="cb_open_list"),
]
