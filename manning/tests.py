from django.test import TestCase
from django.urls import reverse

from manhour.models import WorkSession as ManhourWorkSession
from manhour.models import Workplace

from .models import Manning, SessionArea, WorkSession


class WorkplaceIsolationTests(TestCase):
    def setUp(self):
        Workplace.objects.create(code="SITE-A", label="Site A")
        Workplace.objects.create(code="SITE-B", label="Site B")
        self.site_a_session = WorkSession.objects.create(
            name="SESSION-SITE-A-ONLY",
            site="SITE-A",
        )
        self.site_b_session = WorkSession.objects.create(
            name="SESSION-SITE-B-ONLY",
            site="SITE-B",
        )

        browser_session = self.client.session
        browser_session["is_authenticated"] = True
        browser_session["user_role"] = "admin"
        browser_session["workplace"] = "SITE-A"
        browser_session.save()

    def test_list_only_contains_selected_workplace(self):
        response = self.client.get(reverse("manning:manning_list"))

        session_ids = [session.id for session in response.context["active_sessions"]]
        self.assertEqual(session_ids, [self.site_a_session.id])

    def test_dashboard_rejects_session_from_another_workplace(self):
        response = self.client.get(
            reverse("manning:manning_dashboard", args=[self.site_b_session.id])
        )

        self.assertEqual(response.status_code, 404)

    def test_area_update_rejects_area_from_another_workplace(self):
        area = SessionArea.objects.create(
            session=self.site_b_session,
            name="Other site area",
        )

        response = self.client.post(
            reverse("manning:update_area", args=[area.id]),
            {"name": "Changed", "position": SessionArea.POSITION_LEFT},
        )

        self.assertEqual(response.status_code, 404)
        area.refresh_from_db()
        self.assertEqual(area.name, "Other site area")

    def test_manning_update_rejects_row_from_another_workplace(self):
        area = SessionArea.objects.create(session=self.site_b_session, name="Area")
        row = Manning.objects.create(area=area, worker_name="Worker", hours=1)

        response = self.client.post(
            reverse("manning:update_manning_hours", args=[row.id]),
            {"hours": "9"},
        )

        self.assertEqual(response.status_code, 404)
        row.refresh_from_db()
        self.assertEqual(float(row.hours), 1.0)

    def test_deleting_manning_session_keeps_linked_manhour_session(self):
        manhour_session = ManhourWorkSession.objects.create(
            name="Linked",
            site="SITE-A",
        )
        self.site_a_session.manhour_session = manhour_session
        self.site_a_session.save(update_fields=["manhour_session"])

        response = self.client.post(
            reverse("manning:delete_session", args=[self.site_a_session.id])
        )

        self.assertEqual(response.status_code, 302)
        self.assertTrue(ManhourWorkSession.objects.filter(id=manhour_session.id).exists())
