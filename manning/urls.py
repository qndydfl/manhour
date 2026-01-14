from django.urls import path
from . import views


urlpatterns = [
    path('', views.HomeView.as_view(), name='home'),
    path('paste/', views.PasteDataView.as_view(), name='paste_data'),
    path('new/', views.CreateSessionView.as_view(), name='create_session'),
    path('result/<int:session_id>/', views.ResultView.as_view(), name='result_view'),
    path('edit/<int:item_id>/', views.EditItemView.as_view(), name='edit_item'),
    path('edit_session/<int:session_id>/', views.EditSessionView.as_view(), name='edit_session'),
    path('manage_items/<int:session_id>/', views.ManageItemsView.as_view(), name='manage_items'),
    path('update_limits/<int:session_id>/', views.UpdateWorkerLimitsView.as_view(), name='update_limits'),
    path('finish_session/<int:session_id>/', views.FinishSessionView.as_view(), name='finish_session'),
    path('history/', views.HistoryView.as_view(), name='history'),
    path('session/<int:session_id>/manual-input/', views.ManualInputView.as_view(), name='manual_input'),
    path('select_session/<str:name>/', views.SelectSessionView.as_view(), name='select_session'),
    path('edit_all/<int:session_id>/', views.EditAllView.as_view(), name='edit_all'),
    # ★ 저장용 URL 추가
    path('session/<int:session_id>/save-manual/', views.SaveManualInputView.as_view(), name='save_manual_input'),
    path('session/<int:pk>/upload/', views.UploadDataView.as_view(), name='upload_data'),
    path('session/<int:pk>/paste-input/', views.PasteInputView.as_view(), name='paste_input'),
    path('undo_delete/', views.UndoDeleteView.as_view(), name='undo_delete'),
    path('session/<int:session_id>/assigned-summary/', views.AssignedSummaryView.as_view(), name='assigned_summary'),
    path('session/<int:session_id>/assigned/<int:worker_id>/', views.AssignedDetailView.as_view(), name='assigned_detail'),
]