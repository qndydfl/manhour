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
        for asset in ("css/bookmarks/cb_open_list.css", "js/bookmarks/cb_open_list.js"):
            self.assertContains(response, asset)
            self.assertIsNotNone(finders.find(asset))


class CBTemplateTests(TestCase):
    def setUp(self):
        Workplace.objects.create(code="SITE-A", label="Site A")
        session = self.client.session
        session.update({"is_authenticated": True, "workplace": "SITE-A", "user_role": "user"})
        session.save()
        self.url = reverse("bookmarks:cb_templates")
        self.payload = {"aircraft_model": "B777", "name": "Engine", "rows": [
            {"panel_loc": "P110", "cb_loc": "P 23", "fin": "", "description": "L ENG T/R CTRL"},
        ]}

    def test_create_list_multiple_and_duplicate(self):
        self.assertEqual(self.client.post(self.url, self.payload, content_type="application/json").status_code, 201)
        self.assertEqual(self.client.post(self.url, self.payload, content_type="application/json").status_code, 409)
        self.payload["name"] = "Engine 2"
        self.assertEqual(self.client.post(self.url, self.payload, content_type="application/json").status_code, 201)
        data = self.client.get(self.url, {"aircraft_model": "B777"}).json()
        self.assertEqual(len(data["templates"]), 2)
        self.assertEqual(data["templates"][0]["rows"], self.payload["rows"])

    def test_filter_site_and_model(self):
        CBTemplate.objects.create(site="SITE-B", **self.payload)
        CBTemplate.objects.create(site="SITE-A", **{**self.payload, "aircraft_model": "A350"})
        self.assertEqual(self.client.get(self.url, {"aircraft_model": "B777"}).json()["templates"], [])

    def test_invalid_rows_do_not_save(self):
        self.payload["rows"].append({"panel_loc": "P110"})
        self.assertEqual(self.client.post(self.url, self.payload, content_type="application/json").status_code, 400)
        self.assertFalse(CBTemplate.objects.exists())

    def test_login_and_csrf_required(self):
        from django.test import Client
        self.assertEqual(Client().post(self.url, self.payload, content_type="application/json").status_code, 302)
        csrf_client = Client(enforce_csrf_checks=True)
        csrf_client.cookies = self.client.cookies
        self.assertEqual(csrf_client.post(self.url, self.payload, content_type="application/json").status_code, 403)
