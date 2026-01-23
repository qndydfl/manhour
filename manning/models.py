from django.db import models

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
    """작업자"""
    session = models.ForeignKey(WorkSession, on_delete=models.CASCADE)
    name = models.CharField(max_length=50)
    limit_mh = models.FloatField(default=9.0)
    used_mh = models.FloatField(default=0.0)   # 현재 배정된 총량

class GibunPriority(models.Model):
    """기번 우선순위 (1순위, 2순위...)"""
    session = models.ForeignKey(WorkSession, on_delete=models.CASCADE)
    gibun = models.CharField(max_length=50)
    order = models.PositiveIntegerField(default=999)

class WorkItem(models.Model):
    """실제 작업 항목"""
    model_type = models.CharField(max_length=50, blank=True, null=True, verbose_name="기종")
    session = models.ForeignKey(WorkSession, on_delete=models.CASCADE)
    gibun_input = models.CharField(max_length=50, blank=True, null=True)
    work_order = models.CharField(max_length=100)
    op = models.CharField(max_length=50, blank=True)
    description = models.TextField()
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
    """배정 결과 (누가, 언제, 무엇을)"""
    work_item = models.ForeignKey(WorkItem, related_name='assignments', on_delete=models.CASCADE)
    worker = models.ForeignKey(Worker, related_name='assignments', on_delete=models.CASCADE)
    allocated_mh = models.FloatField(default=0.0)
    
    # 시간표 표시용 (분 단위, 08:00=480 ~ 익일 08:00=1920)
    start_min = models.IntegerField(null=True, blank=True)
    end_min = models.IntegerField(null=True, blank=True)
    is_fixed = models.BooleanField(default=False)
    
    # 간비일 때만 쓰는 코드 (식사, 교육 등)
    code = models.CharField(max_length=50, null=True, blank=True)

    class Meta:
        # [데이터 무결성] 한 작업자가 동시에 두 가지 작업을 할 수 없도록 제약 조건 추가 고려
        # (단, 시스템 유연성을 위해 Warning만 주는 방식이라면 제외)
        indexes = [
            models.Index(fields=['worker', 'start_min']),
        ]

    def get_time_range_display(self):
        """시간 표시 로직을 모델 메서드로 이동 (utils 함수 활용)"""
        from manning.utils import format_min_to_time
        if self.start_min is not None and self.end_min is not None:
            return f"{format_min_to_time(self.start_min)} ~ {format_min_to_time(self.end_min)}"
        return "-"