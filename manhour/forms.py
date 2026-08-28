import re

from django import forms
from .models import WorkItem, TaskMaster


class WorkItemForm(forms.ModelForm):
    # [추가] 배정된 사람 이름을 적는 칸 (필수가 아님 required=False)
    assigned_text = forms.CharField(
        required=False,
        widget=forms.Textarea(
            attrs={
                "class": "table-input fw-bold text-dark bg-transparent js-assigned-text",
                "placeholder": "이름 입력",
                "rows": 1,  # 기본 1줄
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
            "gibun_code": forms.TextInput(attrs={
                "class": "form-control js-gibun-code",
                "maxlength": "6",   # 화면상 HL1234까지 보일 수 있으므로
                "inputmode": "numeric",
                # "placeholder": "예: 1234",
            }),
            "work_order": forms.TextInput(attrs={
                "class": "form-control js-work-order",
                "maxlength": "10",
                "inputmode": "numeric",
                # "placeholder": "최대 10자리 숫자",
            }),
            "op": forms.TextInput(attrs={
                "class": "form-control js-op-code",
                "maxlength": "4",
                "inputmode": "numeric",
                # "placeholder": "예: 0010",
            }),
            "description": forms.TextInput(attrs={
                "class": "form-control",
            }),
            "default_mh": forms.TextInput(attrs={
                "class": "form-control text-center",
            }),
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
