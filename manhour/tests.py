from django.test import TestCase

from manning.models import WorkSession as ManningWorkSession

from .models import (
    AppSetting,
    DefaultWorkerDirectory,
    TaskMaster,
    WorkSession,
    Workplace,
)
from .workplaces import (
    ensure_default_workplaces,
    get_workplace_choices,
    normalize_workplace,
    rename_workplace_code,
)


class WorkplaceSyncTests(TestCase):
    def test_rename_workplace_code_updates_related_site_values(self):
        workplace = Workplace.objects.create(code="ICN-1그룹", label="ICN-1그룹")
        WorkSession.objects.create(name="주간", site="ICN-1그룹")
        TaskMaster.objects.create(
            gibun_code="HL1001",
            work_order="1000",
            op="0010",
            description="테스트",
            default_mh=1.0,
            site="ICN-1그룹",
        )
        DefaultWorkerDirectory.objects.create(site="ICN-1그룹", name="홍길동")
        ManningWorkSession.objects.create(name="Manning", site="ICN-1그룹")

        workplace.code = "ICN-A"
        workplace.label = "인천 A그룹"
        workplace.save(update_fields=["code", "label"])
        rename_workplace_code("ICN-1그룹", "ICN-A")

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

        self.assertIn(("ICN-1그룹", "ICN-1그룹"), choices)
        self.assertEqual(normalize_workplace("ICN-1그룹"), "ICN-1그룹")

    def test_normalize_workplace_accepts_database_label(self):
        Workplace.objects.create(code="ICN-A", label="인천 A그룹")

        self.assertEqual(normalize_workplace("인천 A그룹"), "ICN-A")
