from django.test import TestCase
from django.urls import reverse

from manhour.models import WorkSession as ManhourWorkSession
from manhour.models import Workplace

from .models import (
    AreaTemplate,
    AreaTemplateItem,
    Manning,
    SessionArea,
    WorkSession,
)


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


class AreaTemplateSelectionTests(TestCase):
    def setUp(self):
        Workplace.objects.create(code="SITE-A", label="Site A")
        browser_session = self.client.session
        browser_session["is_authenticated"] = True
        browser_session["user_role"] = "admin"
        browser_session["workplace"] = "SITE-A"
        browser_session.save()

        self.area_template = AreaTemplate.objects.create(
            key="기본-구성",
            label="기본 구성",
        )
        AreaTemplateItem.objects.create(
            template=self.area_template,
            name="LEFT WING",
            position=SessionArea.POSITION_LEFT,
        )

    def test_create_page_uses_database_id_for_template_control(self):
        response = self.client.get(reverse("manning:create_session"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, f'id="tpl_{self.area_template.id}"')
        self.assertContains(response, f'for="tpl_{self.area_template.id}"')

    def test_missing_selection_keeps_template_options_visible(self):
        response = self.client.post(
            reverse("manning:create_session"),
            {
                "work_package_name": "A-Check",
                "aircraft_reg": "HL1234",
                "block_check": WorkSession.BLOCK_CHECK_1A,
                "shift_type": WorkSession.SHIFT_1,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "구역 템플릿 선택은 필수입니다.")
        self.assertContains(response, f'id="tpl_{self.area_template.id}"')

    def test_selected_template_creates_its_areas(self):
        response = self.client.post(
            reverse("manning:create_session"),
            {
                "work_package_name": "A-Check",
                "aircraft_reg": "HL1234",
                "block_check": WorkSession.BLOCK_CHECK_1A,
                "shift_type": WorkSession.SHIFT_1,
                "area_template": self.area_template.key,
            },
        )

        created_session = WorkSession.objects.get(aircraft_reg="HL1234")
        self.assertRedirects(
            response,
            reverse("manning:manning_dashboard", args=[created_session.id]),
        )
        self.assertTrue(
            created_session.areas.filter(
                name="LEFT WING",
                position=SessionArea.POSITION_LEFT,
            ).exists()
        )
