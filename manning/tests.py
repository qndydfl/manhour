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
    WorkPackage,
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

    def test_mobile_list_renders_collapsible_session_summary(self):
        self.site_a_session.aircraft_reg = "HL1234"
        self.site_a_session.work_package_name = "A-Check"
        self.site_a_session.save(update_fields=["aircraft_reg", "work_package_name"])

        response = self.client.get(reverse("manning:manning_list"))

        self.assertContains(response, "data-mobile-fold")
        self.assertContains(response, 'data-mobile-fold-title="HL1234 · A-Check"')

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
        work_package, _created = WorkPackage.objects.get_or_create(name="A-Check")
        work_package.area_templates.add(self.area_template)

    def test_create_page_uses_database_id_for_template_control(self):
        response = self.client.get(reverse("manning:create_session"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, f'id="tpl_{self.area_template.id}"')
        self.assertContains(response, f'for="tpl_{self.area_template.id}"')
        self.assertContains(response, 'data-work-packages="A-Check"')
        self.assertContains(response, 'data-mobile-fold-title="02 · 기본 구성 템플릿"')

    def test_admin_created_work_package_appears_in_create_form(self):
        WorkPackage.objects.create(name="C-Check", sort_order=10)

        response = self.client.get(reverse("manning:create_session"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '<option value="C-Check">C-Check</option>')

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

    def test_template_not_connected_to_package_is_rejected(self):
        other_template = AreaTemplate.objects.create(
            key="engine-change-only",
            label="Engine Change Only",
        )
        AreaTemplateItem.objects.create(
            template=other_template,
            name="ENGINE",
            position=SessionArea.POSITION_NONE,
        )

        response = self.client.post(
            reverse("manning:create_session"),
            {
                "work_package_name": "A-Check",
                "aircraft_reg": "HL5678",
                "block_check": WorkSession.BLOCK_CHECK_1A,
                "shift_type": WorkSession.SHIFT_1,
                "area_template": other_template.key,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(
            response,
            "선택한 Work Package에서 사용할 수 없는 템플릿입니다.",
        )
        self.assertFalse(WorkSession.objects.filter(aircraft_reg="HL5678").exists())

    def test_engine_change_does_not_require_visible_block_check(self):
        engine_template = AreaTemplate.objects.create(
            key="ENG CHANGE",
            label="ENG CHANGE",
        )
        AreaTemplateItem.objects.create(
            template=engine_template,
            name="ENGINE",
            position=SessionArea.POSITION_NONE,
        )
        engine_package, _created = WorkPackage.objects.get_or_create(
            name="Engine-Change",
        )
        engine_package.area_templates.add(engine_template)

        response = self.client.post(
            reverse("manning:create_session"),
            {
                "work_package_name": "Engine-Change",
                "aircraft_reg": "HL9876",
                "shift_type": WorkSession.SHIFT_1,
                "area_template": engine_template.key,
            },
        )

        created_session = WorkSession.objects.get(aircraft_reg="HL9876")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(created_session.block_check, WorkSession.BLOCK_CHECK_1A)
