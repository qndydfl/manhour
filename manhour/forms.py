import re

from django import forms
from .models import WorkItem, Assignment, TaskMaster


class WorkItemForm(forms.ModelForm):
    # [추가] 배정된 사람 이름을 적는 칸 (필수가 아님 required=False)
    assigned_text = forms.CharField(
        required=False,
        widget=forms.Textarea(
            attrs={
                "class": "table-input fw-bold text-dark bg-transparent js-assigned-text",
                "placeholder": "이름 입력",
                "rows": 1,  # 기본 1줄
                "style": "resize: vertical; min-height: 2.4rem;",
            }
        ),
    )

    class Meta:
        model = WorkItem
        # 수정/추가할 항목들
        fields = [
            "gibun_input",
            "work_order",
            "op",
            "description",
            "work_mh",
        ]

        # 부트스트랩 디자인 입히기 (화면 예쁘게)
        widgets = {
            "gibun_input": forms.TextInput(
                attrs={"class": "form-control form-control-sm", "placeholder": "기번"}
            ),
            "work_order": forms.TextInput(
                attrs={"class": "form-control form-control-sm", "placeholder": "WO"}
            ),
            "op": forms.TextInput(
                attrs={"class": "form-control form-control-sm", "placeholder": "OP"}
            ),
            "description": forms.Textarea(
                attrs={
                    "class": "form-control form-control-sm",
                    "rows": 1,
                    "placeholder": "설명",
                }
            ),
            "work_mh": forms.NumberInput(
                attrs={
                    "class": "form-control form-control-sm",
                    "step": "0.1",
                    "style": "width: 80px;",
                }
            ),
        }


class WorkerForm(forms.Form):
    worker_names = forms.CharField(widget=forms.Textarea)


class PasteDataForm(forms.Form):
    excel_data = forms.CharField(widget=forms.Textarea)


class TaskMasterForm(forms.ModelForm):
    class Meta:
        model = TaskMaster
        fields = [
            "gibun_code",
            "work_order",
            "op",
            "description",
            "default_mh",
        ]
        widgets = {
            "gibun_code": forms.TextInput(
                attrs={
                    "class": "form-control form-control-sm js-gibun-code",
                    "autocomplete": "off",
                }
            ),
            "work_order": forms.TextInput(
                attrs={
                    "class": "form-control form-control-sm js-numeric-only",
                    "inputmode": "numeric",
                    "pattern": "\\d*",
                    "autocomplete": "off",
                }
            ),
            "op": forms.TextInput(
                attrs={
                    "class": "form-control form-control-sm js-numeric-only",
                    "inputmode": "numeric",
                    "pattern": "\\d*",
                    "autocomplete": "off",
                }
            ),
            "description": forms.Textarea(
                attrs={"class": "form-control form-control-sm", "rows": 1}
            ),
            "default_mh": forms.NumberInput(
                attrs={
                    "class": "form-control form-control-sm js-decimal-only",
                    "step": "0.1",
                    "inputmode": "decimal",
                }
            ),
        }

    def clean_gibun_code(self):
        value = (self.cleaned_data.get("gibun_code") or "").strip().upper()
        if value.isdigit():
            value = f"HL{value}"
        return value

    def clean_work_order(self):
        value = (self.cleaned_data.get("work_order") or "").strip()
        if value and not value.isdigit():
            raise forms.ValidationError("Work Order는 숫자만 입력할 수 있습니다.")
        return value

    def clean_op(self):
        value = (self.cleaned_data.get("op") or "").strip()
        if value and not value.isdigit():
            raise forms.ValidationError("OP는 숫자만 입력할 수 있습니다.")
        return value

    def clean_default_mh(self):
        raw_key = self.add_prefix("default_mh")
        raw_value = (self.data.get(raw_key) or "").strip()
        if raw_value and not re.match(r"^\d+(\.\d+)?$", raw_value):
            raise forms.ValidationError("기준 M/H는 숫자만 입력할 수 있습니다.")
        return self.cleaned_data.get("default_mh")


class EditAllForm(forms.ModelForm):
    class Meta:
        model = WorkItem
        fields = "__all__"


class DirectWorkItemForm(forms.ModelForm):
    class Meta:
        model = WorkItem
        fields = [
            "gibun_input",
            "model_type",
            "work_order",
            "op",
            "description",
            "work_mh",
        ]
        widgets = {
            "gibun_input": forms.TextInput(
                attrs={"class": "form-control", "placeholder": "기번"}
            ),
            "model_type": forms.TextInput(
                attrs={"class": "form-control", "placeholder": "기종"}
            ),
            "work_order": forms.TextInput(
                attrs={"class": "form-control", "placeholder": "WO"}
            ),
            "op": forms.TextInput(attrs={"class": "form-control", "placeholder": "OP"}),
            "description": forms.TextInput(
                attrs={"class": "form-control", "placeholder": "작업 내용"}
            ),
            "work_mh": forms.NumberInput(
                attrs={"class": "form-control", "step": "0.1"}
            ),
        }


class IndirectWorkItemForm(forms.ModelForm):
    class Meta:
        model = WorkItem
        fields = ["description", "work_mh"]


class WorkerIndirectForm(forms.ModelForm):
    start_time = forms.CharField(
        required=False,
        widget=forms.TextInput(
            attrs={
                "class": "form-control form-control-sm text-center",
                "placeholder": "0900",
                "maxlength": "4",
            }
        ),
    )
    end_time = forms.CharField(
        required=False,
        widget=forms.TextInput(
            attrs={
                "class": "form-control form-control-sm text-center",
                "placeholder": "1200",
                "maxlength": "4",
            }
        ),
    )

    class Meta:
        model = WorkItem
        fields = ["description", "work_mh"]
        widgets = {
            "description": forms.TextInput(
                attrs={
                    "class": "form-control form-control-sm",
                    "placeholder": "간비 내용",
                }
            ),
            "work_mh": forms.NumberInput(
                attrs={
                    "class": "form-control form-control-sm text-center",
                    "step": "0.1",
                }
            ),
        }


class ManageItemForm(forms.ModelForm):
    # DB 모델에는 없지만 폼에서만 사용하는 가상 필드 (이름 입력용)
    assigned_worker_name = forms.CharField(
        required=False,
        widget=forms.TextInput(
            attrs={
                "class": "form-control form-control-sm border-0 bg-transparent",  # CSS 클래스 매칭
                "placeholder": "이름 입력",
                "style": "width: 100%;",
            }
        ),
    )

    class Meta:
        model = WorkItem
        # HTML 테이블의 컬럼과 일치하는 필드들
        fields = [
            "gibun_input",
            "work_order",
            "op",
            "description",
            "work_mh",
            "ordering",
        ]
        widgets = {
            "gibun_input": forms.TextInput(attrs={"class": "form-control"}),
            "work_order": forms.TextInput(attrs={"class": "form-control"}),
            "op": forms.TextInput(attrs={"class": "form-control"}),
            "description": forms.Textarea(
                attrs={"class": "form-control", "rows": 1}
            ),  # 한 줄 높이 제한
            "work_mh": forms.NumberInput(
                attrs={"class": "form-control", "step": "0.1"}
            ),
            "ordering": forms.NumberInput(
                attrs={
                    "class": "form-control form-control-sm text-center fw-bold bg-light",  # 약간 회색 배경에 굵은 글씨
                    "style": "width: 100%;",
                    "min": "0",
                }
            ),
        }


class KanbiAssignmentForm(forms.ModelForm):
    start_time = forms.CharField(
        required=False,
        widget=forms.TextInput(
            attrs={
                "class": "form-control form-control-sm text-center",
                "placeholder": "0900",
                "maxlength": "4",
            }
        ),
    )
    end_time = forms.CharField(
        required=False,
        widget=forms.TextInput(
            attrs={
                "class": "form-control form-control-sm text-center",
                "placeholder": "1200",
                "maxlength": "4",
            }
        ),
    )

    class Meta:
        model = Assignment
        fields = ["code"]  # code만 모델 필드로 저장 (시간은 start/end로 입력 받아 변환)
        widgets = {
            "code": forms.TextInput(
                attrs={
                    "class": "form-control form-control-sm",
                    "placeholder": "식사, 교육, 휴식 등",
                }
            )
        }

    def clean(self):
        cleaned = super().clean()
        s = (cleaned.get("start_time") or "").strip()
        e = (cleaned.get("end_time") or "").strip()
        code = (cleaned.get("code") or "").strip()

        # 완전 빈줄이면 허용(뷰에서 skip 처리)
        if not s and not e and not code:
            return cleaned

        # 시간 둘 중 하나만 있으면 에러
        if (s and not e) or (e and not s):
            raise forms.ValidationError("시작/종료 시간은 둘 다 입력하세요.")

        # HHMM 형식 체크
        def _is_hhmm(x):
            return x.isdigit() and len(x) == 4

        if s and not _is_hhmm(s):
            raise forms.ValidationError(
                "시작 시간은 4자리 숫자(HHMM)로 입력하세요. 예: 0900"
            )
        if e and not _is_hhmm(e):
            raise forms.ValidationError(
                "종료 시간은 4자리 숫자(HHMM)로 입력하세요. 예: 1200"
            )

        return cleaned
