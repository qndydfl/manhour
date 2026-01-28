from django.db import models
from django.db.models import Q


class TaskMaster(models.Model):
    """기본 데이터 (엑셀 붙여넣기 원본)"""
    gibun_code = models.CharField(max_length=50, verbose_name="기번")
    work_order = models.CharField(max_length=100)
    op = models.CharField(max_length=50)
    description = models.TextField()
    default_mh = models.FloatField(default=0.0)

    def __str__(self):
        return f"{self.gibun_code} - {self.work_order}"

class WorkSession(models.Model):
    SHIFT_DAY = 'DAY'
    SHIFT_NIGHT = 'NIGHT'
    SHIFT_CHOICES = [
        (SHIFT_DAY, '주간 (08:00 ~ 20:00)'),
        (SHIFT_NIGHT, '야간 (20:00 ~ 익일 08:00)'),
    ]
    
    name = models.CharField(max_length=100, verbose_name="세션 이름")
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    
    # [추가] 근무 타입 (기본값: 주간)
    shift_type = models.CharField(
        max_length=10, 
        choices=SHIFT_CHOICES, 
        default=SHIFT_DAY, 
        verbose_name="근무 형태"
    )

    @property
    def is_night_shift(self):
        return self.shift_type == self.SHIFT_NIGHT

    def __str__(self):
        return f"{self.name} ({self.get_shift_type_display()})"


class Worker(models.Model):
    session = models.ForeignKey(WorkSession, on_delete=models.CASCADE)
    name = models.CharField(max_length=50)
    limit_mh = models.FloatField(default=9.0)
    used_mh = models.FloatField(default=0.0)

    class Meta:
        unique_together = ('session', 'name')  # 같은 세션 내 이름 중복 방지(강추)

    def __str__(self):
        return f"{self.name} ({self.session.name})"


class GibunPriority(models.Model):
    session = models.ForeignKey(WorkSession, on_delete=models.CASCADE)
    gibun = models.CharField(max_length=50)
    order = models.PositiveIntegerField(default=999)

    class Meta:
        unique_together = ('session', 'gibun')
        indexes = [
            models.Index(fields=['session', 'order']),
        ]

    def __str__(self):
        return f"{self.session.name} / {self.gibun} = {self.order}"



class WorkItem(models.Model):
    """실제 작업 항목"""
    model_type = models.CharField(max_length=50, blank=True, null=True, verbose_name="기종")
    session = models.ForeignKey(WorkSession, on_delete=models.CASCADE)
    gibun_input = models.CharField(max_length=50, blank=True, null=True)
    work_order = models.CharField(max_length=100, blank=True, default="")
    op = models.CharField(max_length=50, blank=True, default="")
    description = models.TextField(blank=True, default="")
    work_mh = models.FloatField(default=0.0)
    is_manual = models.BooleanField(default=False)

    # [신규 추가] 작업 순서 (사용자가 변경 가능)
    ordering = models.PositiveIntegerField(default=0)

    # TaskMaster와 연결 (선택 사항)
    task_master = models.ForeignKey('TaskMaster', on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        # 기본 정렬: 기번 -> 순서 -> ID
        ordering = ['gibun_input', 'ordering', 'id']

    def __str__(self):
        return f"{self.work_order} ({self.description})"


class Assignment(models.Model):
    work_item = models.ForeignKey(WorkItem, related_name='assignments', on_delete=models.CASCADE)
    worker = models.ForeignKey(Worker, related_name='assignments', on_delete=models.CASCADE)
    allocated_mh = models.FloatField(default=0.0)
    start_min = models.IntegerField(null=True, blank=True)
    end_min = models.IntegerField(null=True, blank=True)
    is_fixed = models.BooleanField(default=False)
    code = models.CharField(max_length=50, null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['work_item', 'worker'],
                condition=Q(start_min__isnull=True, end_min__isnull=True),
                name='uniq_assignment_only_when_no_time'
            )
        ]