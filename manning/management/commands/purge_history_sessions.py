from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from manning.models import WorkSession


class Command(BaseCommand):
    help = "Delete inactive WorkSession records older than a cutoff."

    def add_arguments(self, parser):
        parser.add_argument(
            "--hours",
            type=int,
            default=48,
            help="Delete sessions older than this many hours (default: 48).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show how many rows would be deleted without deleting them.",
        )

    def handle(self, *args, **options):
        hours = options["hours"]
        dry_run = options["dry_run"]

        if hours <= 0:
            self.stderr.write(self.style.ERROR("--hours must be a positive integer."))
            return

        cutoff = timezone.now() - timedelta(hours=hours)
        qs = WorkSession.objects.filter(is_active=False, created_at__lt=cutoff)
        count = qs.count()

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"[DRY RUN] {count} inactive sessions older than {hours} hours."
                )
            )
            return

        qs.delete()
        self.stdout.write(
            self.style.SUCCESS(
                f"Deleted {count} inactive sessions older than {hours} hours."
            )
        )
