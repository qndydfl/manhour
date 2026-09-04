import json
from datetime import date, datetime, timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from manning.models import WorkSession as ManningWorkSession

from .models import (
    DefaultWorkerDirectory,
    TaskMaster,
    WorkItem,
    WorkSession,
    Worker,
    Workplace,
)
from .workplaces import (
    ensure_default_workplaces,
    get_workplace_choices,
    normalize_workplace,
    rename_workplace_code,
)
from .workplace_config import get_default_workplace_choices
from .shift_rotation import get_operational_work_date, get_rotation_status


class WorkplaceSyncTests(TestCase):
    def test_operational_work_date_changes_at_eight_in_the_morning(self):
        before_eight = timezone.make_aware(datetime(2026, 9, 5, 7, 59))
        at_eight = timezone.make_aware(datetime(2026, 9, 5, 8, 0))

        self.assertEqual(
            get_operational_work_date(before_eight),
            date(2026, 9, 4),
        )
        self.assertEqual(
            get_operational_work_date(at_eight),
            date(2026, 9, 5),
        )

    def test_rotation_patterns_cover_day_night_and_post_night_each_date(self):
        anchor = date(2026, 9, 4)
        workplaces = [
            Workplace.objects.create(
                code="ROT-D",
                label="주간 시작조",
                rotation_anchor_date=anchor,
                rotation_pattern=Workplace.ROTATION_DAY_FIRST,
            ),
            Workplace.objects.create(
                code="ROT-N",
                label="야간 시작조",
                rotation_anchor_date=anchor,
                rotation_pattern=Workplace.ROTATION_NIGHT_FIRST,
            ),
            Workplace.objects.create(
                code="ROT-O",
                label="야퇴 시작조",
                rotation_anchor_date=anchor,
                rotation_pattern=Workplace.ROTATION_OFF_FIRST,
            ),
        ]

        for day_offset in range(15):
            target = anchor + timedelta(days=day_offset)
            statuses = {
                get_rotation_status(workplace, target) for workplace in workplaces
            }
            self.assertEqual(
                statuses,
                {
                    WorkSession.SCHEDULE_DAY,
                    WorkSession.SCHEDULE_NIGHT,
                    WorkSession.SCHEDULE_POST_NIGHT,
                },
            )

    def test_rename_workplace_code_updates_related_site_values(self):
        workplace = Workplace.objects.create(code="TEST-OLD", label="테스트 근무지")
        WorkSession.objects.create(name="주간", site="TEST-OLD")
        TaskMaster.objects.create(
            gibun_code="HL1001",
            work_order="1000",
            op="0010",
            description="테스트",
            default_mh=1.0,
            site="TEST-OLD",
        )
        DefaultWorkerDirectory.objects.create(site="TEST-OLD", name="홍길동")
        ManningWorkSession.objects.create(name="Manning", site="TEST-OLD")

        workplace.code = "ICN-A"
        workplace.label = "인천 A그룹"
        workplace.save(update_fields=["code", "label"])
        rename_workplace_code("TEST-OLD", "ICN-A")

        workplace.refresh_from_db()
        self.assertEqual(workplace.code, "ICN-A")
        self.assertEqual(workplace.label, "인천 A그룹")
        self.assertTrue(WorkSession.objects.filter(site="ICN-A").exists())
        self.assertTrue(TaskMaster.objects.filter(site="ICN-A").exists())
        self.assertTrue(DefaultWorkerDirectory.objects.filter(site="ICN-A").exists())
        self.assertTrue(ManningWorkSession.objects.filter(site="ICN-A").exists())

    def test_default_workplaces_are_created_when_empty(self):
        Workplace.objects.all().delete()

        ensure_default_workplaces()

        choices = get_workplace_choices(include_inactive=True)

        expected_code, expected_label = get_default_workplace_choices()[0]
        self.assertIn((expected_code, expected_label), choices)
        self.assertEqual(normalize_workplace(expected_code), expected_code)

    def test_normalize_workplace_accepts_database_label(self):
        Workplace.objects.create(code="ICN-A", label="인천 A그룹")

        self.assertEqual(normalize_workplace("인천 A그룹"), "ICN-A")


class AuthorizationAndScopeTests(TestCase):
    def setUp(self):
        Workplace.objects.create(code="SITE-A", label="Site A")
        Workplace.objects.create(code="SITE-B", label="Site B")
        self.site_a_session = WorkSession.objects.create(name="A", site="SITE-A")
        self.site_b_session = WorkSession.objects.create(name="B", site="SITE-B")

        browser_session = self.client.session
        browser_session["is_authenticated"] = True
        browser_session["user_role"] = "user"
        browser_session["workplace"] = "SITE-A"
        browser_session.save()

    def test_worker_limit_update_rejects_worker_from_another_session(self):
        other_worker = Worker.objects.create(
            session=self.site_b_session,
            name="Other worker",
            limit_mh=9,
        )

        response = self.client.post(
            reverse("manhour:update_limits", args=[self.site_a_session.id]),
            {f"limit_{other_worker.id}": "12"},
        )

        self.assertEqual(response.status_code, 404)
        other_worker.refresh_from_db()
        self.assertEqual(other_worker.limit_mh, 9)

    def test_regular_user_cannot_delete_all_active_sessions(self):
        response = self.client.post(reverse("manhour:reset_all_sessions"))

        self.assertEqual(response.status_code, 302)
        self.assertTrue(
            WorkSession.objects.filter(id=self.site_a_session.id).exists()
        )

    def test_regular_user_cannot_clear_history(self):
        self.site_a_session.is_active = False
        self.site_a_session.save(update_fields=["is_active"])

        response = self.client.post(reverse("manhour:clear_history"))

        self.assertEqual(response.status_code, 302)
        self.assertTrue(
            WorkSession.objects.filter(id=self.site_a_session.id).exists()
        )

    def test_finish_session_is_admin_only_and_redirects_to_history(self):
        finish_url = reverse(
            "manhour:finish_session", args=[self.site_a_session.id]
        )

        regular_list = self.client.get(reverse("manhour:session_list"))
        self.assertNotContains(regular_list, finish_url)

        denied_response = self.client.post(finish_url)
        self.assertRedirects(denied_response, reverse("manhour:index"))
        self.site_a_session.refresh_from_db()
        self.assertTrue(self.site_a_session.is_active)

        browser_session = self.client.session
        browser_session["user_role"] = "admin"
        browser_session.save()

        admin_list = self.client.get(reverse("manhour:session_list"))
        self.assertContains(admin_list, finish_url)
        self.assertContains(admin_list, "작업 완료")

        completed_response = self.client.post(finish_url)
        self.assertRedirects(completed_response, reverse("manhour:history"))
        self.site_a_session.refresh_from_db()
        self.assertFalse(self.site_a_session.is_active)
        self.assertIsNotNone(self.site_a_session.finished_at)

    def test_result_view_worker_status_is_always_visible(self):
        Worker.objects.create(
            session=self.site_a_session,
            name="Alice",
            used_mh=7.6,
            limit_mh=9.5,
        )

        response = self.client.get(
            reverse("manhour:result_view", args=[self.site_a_session.id])
        )

        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, '<details class="card')
        self.assertContains(response, "worker-status-panel")
        self.assertContains(response, "worker-used-mh")
        self.assertContains(response, "worker-limit-mh")

    def test_index_renders_mobile_workspace_accordions_and_hidden_sections(self):
        response = self.client.get(reverse("manhour:index"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content.count(b"data-mobile-workspace"), 3)
        self.assertEqual(response.content.count(b"portal-mobile-hidden-section"), 2)
        self.assertContains(response, "portal-workspace-mobile-title")
        self.assertContains(response, "portal-home-layout")
        self.assertContains(response, "portal-favorites-aside")

    def test_index_header_displays_today_rotation_status(self):
        workplace = Workplace.objects.get(code="SITE-A")
        workplace.rotation_anchor_date = timezone.localdate()
        workplace.rotation_pattern = Workplace.ROTATION_NIGHT_FIRST
        workplace.save(
            update_fields=["rotation_anchor_date", "rotation_pattern"]
        )

        response = self.client.get(reverse("manhour:index"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "portal-shift-badge--night")
        self.assertContains(response, "오늘 근무")
        self.assertContains(response, ">야간</strong>")

    def test_history_displays_saved_schedule_status_badge(self):
        session = WorkSession.objects.create(
            name="야간 완료 작업",
            site="SITE-A",
            is_active=False,
            shift_type=WorkSession.SHIFT_NIGHT,
            work_date=timezone.localdate(),
            schedule_status=WorkSession.SCHEDULE_NIGHT,
            finished_at=timezone.now(),
        )

        response = self.client.get(reverse("manhour:history"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, session.name)
        self.assertContains(response, "mh-history-shift-night")
        self.assertContains(response, session.work_date.strftime("%Y-%m-%d"))
        self.assertContains(response, "야간")
        self.assertContains(response, "생성")

    def test_edit_session_textarea_starts_with_first_worker_name(self):
        Worker.objects.create(session=self.site_a_session, name="김정비")

        response = self.client.get(
            reverse("manhour:edit_session", args=[self.site_a_session.id])
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, ">김정비</textarea>")
        self.assertContains(response, "editWorkerDuplicateWarning")
        self.assertContains(response, "worker_duplicate_warning")

    def test_create_and_edit_session_remove_case_insensitive_worker_duplicates(self):
        create_response = self.client.post(
            reverse("manhour:create_session"),
            {
                "session_name": "Duplicate workers",
                "worker_names": "Alice, alice, Bob",
                "shift_type": "DAY",
                "gibun_input": "",
            },
        )
        created_session = WorkSession.objects.get(name="Duplicate workers")

        self.assertEqual(create_response.status_code, 302)
        self.assertEqual(
            list(
                created_session.worker_set.order_by("id").values_list(
                    "name", flat=True
                )
            ),
            ["Alice", "Bob"],
        )

        edit_response = self.client.post(
            reverse("manhour:edit_session", args=[created_session.id]),
            {
                "session_name": created_session.name,
                "worker_names": "Charlie\ncharlie\nDelta",
            },
        )

        self.assertEqual(edit_response.status_code, 302)
        self.assertEqual(
            list(
                created_session.worker_set.order_by("id").values_list(
                    "name", flat=True
                )
            ),
            ["Charlie", "Delta"],
        )

    def test_create_session_renders_worker_duplicate_warning(self):
        response = self.client.get(reverse("manhour:create_session"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "createWorkerDuplicateWarning")
        self.assertContains(response, "worker_duplicate_warning")

    def test_create_session_uses_workplace_rotation_as_snapshot(self):
        workplace = Workplace.objects.get(code="SITE-A")
        workplace.rotation_anchor_date = get_operational_work_date()
        workplace.rotation_pattern = Workplace.ROTATION_DAY_FIRST
        workplace.save(
            update_fields=["rotation_anchor_date", "rotation_pattern"]
        )

        response = self.client.post(
            reverse("manhour:create_session"),
            {
                "session_name": "자동 교대",
                "worker_names": "Alice",
                "shift_type": "NIGHT",
                "gibun_input": "",
            },
        )

        self.assertEqual(response.status_code, 302)
        session = WorkSession.objects.get(name="자동 교대")
        self.assertEqual(session.shift_type, WorkSession.SHIFT_DAY)
        self.assertEqual(session.schedule_status, WorkSession.SCHEDULE_DAY)
        self.assertEqual(session.work_date, get_operational_work_date())

    def test_settings_textarea_starts_with_first_default_worker_name(self):
        browser_session = self.client.session
        browser_session["user_role"] = "admin"
        browser_session.save()
        DefaultWorkerDirectory.objects.create(site="SITE-A", name="박정비")

        response = self.client.get(reverse("manhour:settings"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, ">박정비</textarea>")

    def test_settings_can_apply_selected_rotation_from_today(self):
        browser_session = self.client.session
        browser_session["user_role"] = "admin"
        browser_session.save()
        workplace = Workplace.objects.get(code="SITE-A")

        response = self.client.post(
            reverse("manhour:settings"),
            {
                "action": "workplace_update",
                "workplace_id": workplace.id,
                "code": workplace.code,
                "label": workplace.label,
                "sort_order": workplace.sort_order,
                "is_active": "1",
                "rotation_anchor_date": "2020-01-01",
                "rotation_pattern": Workplace.ROTATION_OFF_FIRST,
                "rotation_anchor_mode": "today",
            },
        )

        self.assertEqual(response.status_code, 302)
        workplace.refresh_from_db()
        self.assertEqual(workplace.rotation_anchor_date, timezone.localdate())
        self.assertEqual(
            get_rotation_status(workplace, timezone.localdate()),
            WorkSession.SCHEDULE_POST_NIGHT,
        )

    def test_manage_items_renders_and_saves_horizontal_worker_limits(self):
        Worker.objects.create(session=self.site_a_session, name="Alice", limit_mh=8)
        Worker.objects.create(session=self.site_a_session, name="Bob", limit_mh=7.5)

        response = self.client.get(
            reverse("manhour:manage_items", args=[self.site_a_session.id])
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'class="assignment-console-body manage-items-body"')
        self.assertContains(response, ">Alice: 8, Bob: 7.5</textarea>")

        save_response = self.client.post(
            reverse("manhour:manage_items", args=[self.site_a_session.id]),
            {
                "form-TOTAL_FORMS": "0",
                "form-INITIAL_FORMS": "0",
                "form-MIN_NUM_FORMS": "0",
                "form-MAX_NUM_FORMS": "1000",
                "worker_names_str": "Alice: 6.5, Bob: 7, Charlie: 8",
                "mh_percent": "0",
            },
        )

        self.assertEqual(save_response.status_code, 302)
        self.assertEqual(
            list(
                self.site_a_session.worker_set.order_by("name").values_list(
                    "name", "limit_mh"
                )
            ),
            [("Alice", 6.5), ("Bob", 7.0), ("Charlie", 8.0)],
        )


class PasteItemsDuplicateConfirmationTests(TestCase):
    def setUp(self):
        Workplace.objects.create(code="SITE-A", label="Site A")
        self.work_session = WorkSession.objects.create(name="A", site="SITE-A")
        browser_session = self.client.session
        browser_session["is_authenticated"] = True
        browser_session["user_role"] = "user"
        browser_session["workplace"] = "SITE-A"
        browser_session.save()

        WorkItem.objects.create(
            session=self.work_session,
            gibun_input="HL1234",
            work_order="WO-100",
            op="10",
            description="기존 작업",
        )
        self.url = reverse("manhour:paste_items", args=[self.work_session.id])

    def _payload(self, gibun="HL1234"):
        return [
            {
                "gibun_code": gibun,
                "work_order": "WO-100",
                "op": "10",
                "description": "추가 작업",
                "default_mh": 1.5,
            }
        ]

    def test_same_gibun_wo_op_returns_confirmation_warning(self):
        response = self.client.post(
            self.url,
            data=json.dumps(self._payload()),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["status"], "duplicate_warning")
        self.assertEqual(response.json()["duplicates"], ["HL1234/WO-100/10"])
        self.assertEqual(WorkItem.objects.filter(session=self.work_session).count(), 1)

    def test_confirmed_duplicate_is_saved(self):
        response = self.client.post(
            self.url,
            data=json.dumps(self._payload()),
            content_type="application/json",
            HTTP_X_ALLOW_DUPLICATES="true",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "success")
        self.assertEqual(WorkItem.objects.filter(session=self.work_session).count(), 2)

    def test_same_wo_op_with_different_gibun_is_not_duplicate(self):
        response = self.client.post(
            self.url,
            data=json.dumps(self._payload(gibun="HL5678")),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            WorkItem.objects.filter(
                session=self.work_session,
                gibun_input="HL5678",
                work_order="WO-100",
                op="10",
            ).exists()
        )
