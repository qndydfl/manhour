from django.db import models


class CBAircraftModel(models.Model):
    code = models.CharField(
        max_length=20,
        unique=True,
        verbose_name="기종",
    )

    image = models.ImageField(
        upload_to="images/bookmarks/aircraft/",
        blank=True,
        null=True,
        verbose_name="기종 이미지",
    )

    class Meta:
        ordering = ["code"]
        verbose_name = "C/B Aircraft Model"
        verbose_name_plural = "C/B Aircraft Models"

    def __str__(self):
        return self.code


class CBTemplate(models.Model):
    aircraft_model = models.CharField(
        max_length=20,
        verbose_name="기종",
    )

    name = models.CharField(
        max_length=100,
        verbose_name="템플릿 이름",
    )

    rows = models.JSONField(
        default=list,
        verbose_name="기본 데이터",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = [
            "aircraft_model",
            "name",
        ]

        constraints = [
            models.UniqueConstraint(
                fields=[
                    "aircraft_model",
                    "name",
                ],
                name="unique_cb_template_per_aircraft",
            )
        ]

    def __str__(self):
        return f"{self.aircraft_model} · {self.name}"
