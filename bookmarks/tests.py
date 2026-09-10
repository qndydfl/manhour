from django.test import TestCase, override_settings
from django.urls import reverse
from django.contrib.staticfiles import finders

from manhour.models import Workplace
from .models import CBTemplate


@override_settings(STORAGES={
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
})
class CircuitBreakerOpenListTests(TestCase):
    def test_login_required(self):
        self.assertRedirects(
            self.client.get(reverse("bookmarks:cb_open_list")),
            reverse("manhour:login"),
        )

    def test_legacy_url_redirects(self):
        self.assertRedirects(
            self.client.get(reverse("manhour:cb_open_list")),
            reverse("bookmarks:cb_open_list"),
            fetch_redirect_response=False,
        )

    def test_workspace_renders_with_app_assets(self):
        Workplace.objects.create(code="SITE-A", label="Site A")
        session = self.client.session
        session["is_authenticated"] = True
        session["workplace"] = "SITE-A"
        session["user_role"] = "user"
        session.save()
        response = self.client.get(reverse("bookmarks:cb_open_list"))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "bookmarks/cb_open_list.html")
        self.assertTemplateUsed(response, "manhour/base/result_base.html")
        self.assertContains(response, "cbOpenListPasteSource")
        self.assertContains(response, "cbOpenListDeleteRow")
        self.assertContains(response, "cbOpenTemplatePicker")
        self.assertContains(response, reverse("bookmarks:cb_templates"))
        self.assertContains(response, 'data-col-width-input="panel-loc"')
        self.assertContains(response, 'data-col-width-input="cb-loc"')
        self.assertContains(response, 'data-col-width-input="fin"')
        for asset in ("css/bookmarks/cb_open_list.css", "js/bookmarks/cb_open_list.js"):
            self.assertContains(response, asset)
            self.assertIsNotNone(finders.find(asset))


@override_settings(STORAGES={
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
})
class CBTemplateTests(TestCase):
    def setUp(self):
        Workplace.objects.create(code="SITE-A", label="Site A")
        session = self.client.session
        session.update({"is_authenticated": True, "workplace": "SITE-A", "user_role": "admin"})
        session.save()
        self.url = reverse("bookmarks:cb_templates")
        self.aircraft_url = reverse("bookmarks:cb_aircraft_models")
        self.payload = {"aircraft_model": "B777", "name": "Engine", "rows": [
            {"panel_loc": "P110", "cb_loc": "P 23", "fin": "", "description": "L ENG T/R CTRL"},
        ]}

    def test_manage_page_renders(self):
        response = self.client.get(reverse("bookmarks:cb_template_manage"))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "bookmarks/cb_template_manage.html")
        self.assertContains(response, reverse("bookmarks:cb_templates"))
        self.assertIsNotNone(finders.find("js/bookmarks/cb_template_manage.js"))

    def test_create_list_multiple_and_duplicate(self):
        self.assertEqual(self.client.post(self.url, self.payload, content_type="application/json").status_code, 201)
        self.assertEqual(self.client.post(self.url, self.payload, content_type="application/json").status_code, 409)
        self.payload["name"] = "Engine 2"
        self.assertEqual(self.client.post(self.url, self.payload, content_type="application/json").status_code, 201)
        data = self.client.get(self.url, {"aircraft_model": "B777"}).json()
        self.assertEqual(len(data["templates"]), 2)
        self.assertEqual(data["templates"][0]["rows"][0]["panel_loc"], "P110")
        self.assertNotIn("cockpit", data["templates"][0]["rows"][0])

    def test_filter_site_and_model(self):
        CBTemplate.objects.create(site="SITE-B", **self.payload)
        CBTemplate.objects.create(site="SITE-A", **{**self.payload, "aircraft_model": "A350"})
        self.assertEqual(self.client.get(self.url, {"aircraft_model": "B777"}).json()["templates"], [])

    def test_invalid_rows_do_not_save(self):
        self.payload["rows"].append({"panel_loc": "P110"})
        self.assertEqual(self.client.post(self.url, self.payload, content_type="application/json").status_code, 400)
        self.assertFalse(CBTemplate.objects.exists())

    def test_update_existing_template(self):
        created = self.client.post(self.url, self.payload, content_type="application/json").json()
        self.payload.update({
            "id": created["id"],
            "original_aircraft_model": "B777",
            "aircraft_model": "B747",
            "name": "Engine updated",
        })
        response = self.client.post(self.url, self.payload, content_type="application/json")
        self.assertEqual(response.status_code, 200)
        template = CBTemplate.objects.get(pk=created["id"])
        self.assertEqual(template.name, "Engine updated")
        self.assertEqual(template.aircraft_model, "B747")
        self.assertEqual(CBTemplate.objects.count(), 1)

    def test_aircraft_model_create_rename_and_delete(self):
        models = self.client.get(self.aircraft_url).json()["aircraft_models"]
        self.assertIn("A320", models)
        response = self.client.post(
            self.aircraft_url, {"action": "create", "code": "a321"}, content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        response = self.client.post(
            self.aircraft_url,
            {"action": "rename", "old_code": "A321", "new_code": "A321NEO"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        response = self.client.post(
            self.aircraft_url, {"action": "delete", "old_code": "A321NEO"}, content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("A321NEO", self.client.get(self.aircraft_url).json()["aircraft_models"])

    def test_aircraft_model_changes_require_admin(self):
        session = self.client.session
        session["user_role"] = "user"
        session.save()
        response = self.client.post(
            self.aircraft_url, {"action": "create", "code": "A321"}, content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)

    def test_login_and_csrf_required(self):
        from django.test import Client
        self.assertEqual(Client().post(self.url, self.payload, content_type="application/json").status_code, 302)
        csrf_client = Client(enforce_csrf_checks=True)
        csrf_client.cookies = self.client.cookies
        self.assertEqual(csrf_client.post(self.url, self.payload, content_type="application/json").status_code, 403)
