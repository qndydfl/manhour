from django.test import TestCase, override_settings
from django.urls import reverse
from django.contrib.staticfiles import finders

from manhour.models import Workplace


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
        for asset in ("bookmarks/css/cb_open_list.css", "bookmarks/js/cb_open_list.js"):
            self.assertContains(response, asset)
            self.assertIsNotNone(finders.find(asset))
