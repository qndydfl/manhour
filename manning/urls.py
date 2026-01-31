from django.urls import path
from . import views

urlpatterns = [
    # 로그인
    path("login/", views.SimpleLoginView.as_view(), name="login"),
    path("logout/", views.SimpleLogoutView.as_view(), name="logout"),
    path("", views.IndexView.as_view(), name="index"),
    path("sessions/", views.SessionListView.as_view(), name="session_list"),
    path("history/", views.HistoryView.as_view(), name="history"),
    # 세션 관련
    path("create/", views.CreateSessionView.as_view(), name="create_session"),
    path("session/<int:session_id>/", views.ResultView.as_view(), name="result_view"),
    path(
        "session/<int:session_id>/edit/",
        views.EditSessionView.as_view(),
        name="edit_session",
    ),
    path(
        "session/<int:session_id>/finish/",
        views.FinishSessionView.as_view(),
        name="finish_session",
    ),
    # 데이터 관리
    path(
        "session/<int:session_id>/manage/",
        views.ManageItemsView.as_view(),
        name="manage_items",
    ),
    path(
        "session/<int:session_id>/paste/",
        views.PasteInputView.as_view(),
        name="paste_data",
    ),
    # ✅ UploadDataView와 파라미터명 통일(views를 session_id로 바꾸는 걸 추천)
    path(
        "session/<int:session_id>/upload/",
        views.UploadDataView.as_view(),
        name="upload_data",
    ),
    # 개별 아이템 및 기능
    path(
        "item/<int:item_id>/move/<str:direction>/",
        views.ReorderItemView.as_view(),
        name="reorder_item",
    ),
    path(
        "reorder-gibun/<int:session_id>/<str:gibun_name>/<str:direction>/",
        views.ReorderGibunView.as_view(),
        name="reorder_gibun",
    ),
    path(
        "session/<int:session_id>/limits/",
        views.UpdateLimitsView.as_view(),
        name="update_limits",
    ),
    path(
        "session/<int:session_id>/save_manual/",
        views.SaveManualInputView.as_view(),
        name="save_manual_input",
    ),
    # 조회
    path(
        "session/<int:session_id>/summary/",
        views.AssignedSummaryView.as_view(),
        name="assigned_summary",
    ),
    path(
        "session/<int:session_id>/schedule/",
        views.PersonalScheduleView.as_view(),
        name="personal_schedule",
    ),
    # 리셋
    path(
        "session/<int:session_id>/worker/<int:worker_id>/manual_reset/",
        views.ResetWorkerManualInputView.as_view(),
        name="reset_worker_manual_input",
    ),
    path(
        "session/<int:session_id>/manual_reset/",
        views.ResetManualInputView.as_view(),
        name="reset_manual_input",
    ),
    # 기타 기능
    path(
        "taskmaster/delete/<int:pk>/",
        views.DeleteTaskMasterView.as_view(),
        name="delete_taskmaster",
    ),
    path(
        "taskmaster/delete_all/",
            views.TaskMasterDeleteAllView.as_view(),
        name="delete_all_taskmasters",
    ),
    path("paste_data/", views.PasteDataView.as_view(), name="paste_data"),
    path(
        "session/<int:session_id>/worker/<int:worker_id>/indirect/",
        views.WorkerIndirectView.as_view(),
        name="worker_indirect",
    ),
    path("history/clear/", views.clear_history, name="clear_history"),
    path(
        "session/<int:session_id>/manage/add_direct/",
        views.AddItemsDirectView.as_view(),
        name="add_items_direct",
    ),
    path(
        "session/<int:session_id>/add_single/",
        views.AddSingleItemView.as_view(),
        name="add_single_item",
    ),
    path(
        "session/<int:session_id>/reset/",
        views.ResetSessionView.as_view(),
        name="reset_session",
    ),
    path("reset_all/", views.ResetAllSessionsView.as_view(), name="reset_all_sessions"),
    path("api/check_gibun/", views.CheckGibunView.as_view(), name="check_gibun"),
    # ✅ SaveDirectInputView가 없으면 일단 제거
    # path('session/<int:session_id>/direct/save/', views.SaveDirectInputView.as_view(), name='save_direct_input'),
    path("master-data/", views.MasterDataListView.as_view(), name="master_data_list"),
    path(
        "master-data/delete/<int:pk>/",
        views.TaskMasterDeleteView.as_view(),
        name="delete_taskmaster",
    ),
    path(
        "master-data/delete-all/",
        views.TaskMasterDeleteAllView.as_view(),
        name="delete_all_taskmasters",
    ),
]
