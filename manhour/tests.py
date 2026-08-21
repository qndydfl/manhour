import json

from django.test import TestCase
from django.urls import reverse

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


class WorkplaceSyncTests(TestCase):
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
