from django.db import models


class WorkSession(models.Model):
    SITE_ICN_1 = "ICN-1그룹"
    SITE_ICN_2 = "ICN-2그룹"
    SITE_ICN_3 = "ICN-3그룹"
    SITE_GMP_1 = "GMP-1그룹"
    SITE_GMP_2 = "GMP-2그룹"
    SITE_GMP_3 = "GMP-3그룹"
    SITE_CHOICES = [
        (SITE_ICN_1, "ICN-1그룹"),
        (SITE_ICN_2, "ICN-2그룹"),
        (SITE_ICN_3, "ICN-3그룹"),
        (SITE_GMP_1, "GMP-1그룹"),
        (SITE_GMP_2, "GMP-2그룹"),
        (SITE_GMP_3, "GMP-3그룹"),
    ]

    BLOCK_CHECK_1A = "1A"
    BLOCK_CHECK_2A = "2A"
    BLOCK_CHECK_3A = "3A"
    BLOCK_CHECK_4A = "4A"
    BLOCK_CHECK_CHOICES = [
        (BLOCK_CHECK_1A, "1A Block Check"),
        (BLOCK_CHECK_2A, "2A Block Check"),
        (BLOCK_CHECK_3A, "3A Block Check"),
        (BLOCK_CHECK_4A, "4A Block Check"),
    ]

    SHIFT_1 = "1"
    SHIFT_2 = "2"
    SHIFT_3 = "3"
    SHIFT_4 = "4"
    SHIFT_CHOICES = [
        (SHIFT_1, "1_Shift"),
        (SHIFT_2, "2_Shift"),
        (SHIFT_3, "3_Shift"),
        (SHIFT_4, "4_Shift"),
    ]

    name = models.CharField(max_length=100, verbose_name="세션 이름")
    work_package_name = models.CharField(max_length=150, default="")
    aircraft_reg = models.CharField(max_length=50, default="")
    block_check = models.CharField(
        choices=BLOCK_CHECK_CHOICES,
        default=BLOCK_CHECK_1A,
        max_length=10,
    )
    shift_type = models.CharField(
        choices=SHIFT_CHOICES,
        default=SHIFT_1,
        max_length=10,
        verbose_name="근무 형태",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    site = models.CharField(
        max_length=20,
        choices=SITE_CHOICES,
        verbose_name="근무지",
        blank=True,
        default="",
    )

    def __str__(self):
        label = self.work_package_name or self.name
        return f"{label} ({self.aircraft_reg})"


class SessionArea(models.Model):
    POSITION_LEFT = "LEFT"
    POSITION_RIGHT = "RIGHT"
    POSITION_NONE = "NONE"
    POSITION_CHOICES = [
        (POSITION_LEFT, "LEFT SIDE"),
        (POSITION_RIGHT, "RIGHT SIDE"),
        (POSITION_NONE, "N/A"),
    ]

    session = models.ForeignKey(
        WorkSession,
        on_delete=models.CASCADE,
        related_name="areas",
    )
    name = models.CharField(max_length=100)
    position = models.CharField(
        max_length=10,
        choices=POSITION_CHOICES,
        default=POSITION_LEFT,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self):
        return f"{self.session_id} - {self.name}"


class Manning(models.Model):
    area = models.ForeignKey(
        SessionArea,
        on_delete=models.CASCADE,
        related_name="manning_set",
    )
    worker_name = models.CharField(max_length=50)
    hours = models.DecimalField(max_digits=5, decimal_places=1, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("area", "worker_name")
        ordering = ["worker_name", "id"]

    def __str__(self):
        return f"{self.worker_name} @ {self.area.name}"
