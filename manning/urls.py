from django.urls import path
from . import views
from .views import (
    HomeView, CreateSessionView, ResultView, EditItemView, 
    FinishSessionView, HistoryView, AssignedSummaryView, 
    PersonalScheduleView, SelectSessionView, EditSessionView,
    PasteDataView, ManageItemsView, UpdateLimitsView,
    UploadDataView, SaveManualInputView, DeleteTaskMasterView, DeleteAllTaskMastersView
)


# urlpatterns = [
#     path('', HomeView.as_view(), name='home'),
#     path('paste/', PasteDataView.as_view(), name='paste_data'),
#     path('new/', CreateSessionView.as_view(), name='create_session'),
#     path('result/<int:session_id>/', ResultView.as_view(), name='result_view'),
#     path('edit/<int:item_id>/', EditItemView.as_view(), name='edit_item'),
#     path('edit_session/<int:session_id>/', EditSessionView.as_view(), name='edit_session'),
#     path('manage_items/<int:pk>/', ManageItemsView.as_view(), name='manage_items'),
#     path('update_limits/<int:pk>/', UpdateLimitsView.as_view(), name='update_limits'),
#     path('finish_session/<int:session_id>/', FinishSessionView.as_view(), name='finish_session'),
#     path('history/', HistoryView.as_view(), name='history'),
#     path('select_session/<str:name>/', SelectSessionView.as_view(), name='select_session'),
#     path('edit_all/<int:session_id>/', views.EditAllView.as_view(), name='edit_all'),
#     # ★ 저장용 URL 추가
#     path('session/<int:session_id>/save-manual/', SaveManualInputView.as_view(), name='save_manual_input'),
#     path('session/<int:pk>/upload/', UploadDataView.as_view(), name='upload_data'),
#     path('session/<int:pk>/paste-input/', views.PasteInputView.as_view(), name='paste_input'),
#     path('undo_delete/', views.UndoDeleteView.as_view(), name='undo_delete'),
#     path('session/<int:session_id>/assigned-summary/', AssignedSummaryView.as_view(), name='assigned_summary'),
#     path('session/<int:session_id>/assigned/<int:worker_id>/', views.AssignedDetailView.as_view(), name='assigned_detail'),
#     path('session/<int:session_id>/personal-schedule/', PersonalScheduleView.as_view(), name='personal_schedule'),
#     path('taskmaster/<int:pk>/delete/', DeleteTaskMasterView.as_view(), name='delete_taskmaster'),
#     path('taskmaster/delete_all/', DeleteAllTaskMastersView.as_view(), name='delete_all_taskmasters'),
# ]

urlpatterns = [
    path('', views.HomeView.as_view(), name='home'),
    path('history/', views.HistoryView.as_view(), name='history'),
    
    # 세션 관련
    path('create/', views.CreateSessionView.as_view(), name='create_session'),
    path('select/<str:name>/', views.SelectSessionView.as_view(), name='select_session'), # slot_name -> name
    path('session/<int:session_id>/', views.ResultView.as_view(), name='result_view'),
    path('session/<int:session_id>/edit/', views.EditSessionView.as_view(), name='edit_session'),
    path('session/<int:session_id>/finish/', views.FinishSessionView.as_view(), name='finish_session'),
    
    # 데이터 관리
    path('session/<int:session_id>/edit_all/', views.EditAllView.as_view(), name='edit_all'),
    path('session/<int:session_id>/manage/', views.ManageItemsView.as_view(), name='manage_items'),
    path('session/<int:session_id>/paste/', views.PasteInputView.as_view(), name='paste_input'),
    path('session/<int:pk>/upload/', views.UploadDataView.as_view(), name='upload_data'),
    
    # 개별 아이템 및 기능
    path('item/<int:item_id>/edit/', views.EditItemView.as_view(), name='edit_item'),
    path('session/<int:session_id>/limits/', views.UpdateLimitsView.as_view(), name='update_limits'),
    path('session/<int:pk>/save_manual/', views.SaveManualInputView.as_view(), name='save_manual_input'),
    
    # 조회
    path('session/<int:session_id>/summary/', views.AssignedSummaryView.as_view(), name='assigned_summary'),
    path('session/<int:session_id>/schedule/', views.PersonalScheduleView.as_view(), name='personal_schedule'),
    
    # 기타 기능 (삭제, 복원 등)
    path('taskmaster/delete/<int:pk>/', views.DeleteTaskMasterView.as_view(), name='delete_taskmaster'),
    path('taskmaster/delete_all/', views.DeleteAllTaskMastersView.as_view(), name='delete_all_taskmasters'),
    path('paste_data/', views.PasteDataView.as_view(), name='paste_data'), 
    path('session/<int:session_id>/worker/<int:worker_id>/indirect/', views.WorkerIndirectView.as_view(), name='worker_indirect'),
]