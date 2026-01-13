from django.db import models


# 1. 기번 마스터 (기번을 치면 자동으로 나오는 정보들)
class TaskMaster(models.Model):
    gibun_code = models.CharField(max_length=50, verbose_name="기번") 
    work_order = models.CharField(max_length=100)
    op = models.CharField(max_length=50)
    description = models.TextField()
    default_mh = models.FloatField(default=0.0)

    def __str__(self):
        return f"{self.gibun_code} - {self.description}"

# 2. 작업 세션 (구글 시트의 'Section A', 'Section B' 같은 시트 하나)
class WorkSession(models.Model):
    name = models.CharField(max_length=100, verbose_name="세션 이름") # 예: Section A
    created_at = models.DateTimeField(auto_now_add=True) # 만든 날짜

    # [추가] True면 사용 중(방 참), False면 종료됨(방 비움, 기록보관)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name

# 3. 작업자 명단 (사람 정보)
class Worker(models.Model):
    # 어느 세션(Section)에 속한 사람인지 연결고리
    session = models.ForeignKey(WorkSession, on_delete=models.CASCADE) 
    name = models.CharField(max_length=50) # 이름
    limit_mh = models.FloatField(default=9.0) # 최대 근무 시간 (한도)
    used_mh = models.FloatField(default=0.0)  # 지금까지 배정받은 시간

    def __str__(self):
        return self.name

# 4. 해야 할 일 (작업 리스트)
class WorkItem(models.Model):
    session = models.ForeignKey(WorkSession, on_delete=models.CASCADE) # 어느 세션의 일인지
    
    model_type = models.CharField(max_length=50, blank=True, null=True, verbose_name="기종")
    
    # 기번을 입력하면 TaskMaster 정보를 가져오기 위해 연결 (없어도 됨 = null=True)
    task_master = models.ForeignKey(TaskMaster, on_delete=models.SET_NULL, null=True, blank=True)
    
    # 실제 화면에 보일 내용들
    gibun_input = models.CharField(max_length=50, blank=True) # 입력한 기번
    work_order = models.CharField(max_length=100)
    op = models.CharField(max_length=50)
    description = models.TextField()
    work_mh = models.FloatField(default=0.0) # 이 작업에 필요한 총 시간

    # [추가] 수동 배정 여부 (True면 자동 배정 로봇이 건드리지 않음)
    is_manual = models.BooleanField(default=False)

    def __str__(self):
        return self.description
    

# 5. 배정 결과 (누가, 어떤 일을, 얼만큼 했나)
class Assignment(models.Model):
    # 어떤 일(WorkItem)에 대한 배정인지
    work_item = models.ForeignKey(WorkItem, related_name='assignments', on_delete=models.CASCADE)
    # 누가(Worker) 했는지
    worker = models.ForeignKey(Worker, related_name='assignments', on_delete=models.CASCADE)
    # 몇 시간(allocated_mh)을 가져갔는지
    allocated_mh = models.FloatField(default=0.0)

    def __str__(self):
        return f"{self.worker.name} -> {self.allocated_mh}시간"
    
