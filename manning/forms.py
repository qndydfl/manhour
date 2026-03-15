import re
from django import forms
from .models import WorkSession, SessionArea


class WorkSessionCreateForm(forms.ModelForm):
    work_package_name = forms.ChoiceField(
        choices=[
            ("", "선택해 주세요"),
            ("A-Check", "A-Check"),
            ("Engine-Change", "Engine-Change"),
        ],
        required=True,
        widget=forms.Select(
            attrs={
                "class": "form-select rounded-3",
                "required": "true",
            }
        ),
    )

    class Meta:
        model = WorkSession
        fields = [
            "work_package_name",
            "aircraft_reg",
            "block_check",
            "shift_type",
        ]
        widgets = {
            "aircraft_reg": forms.TextInput(
                attrs={
                    "class": "form-control rounded-3",
                    "placeholder": "예: 1234",
                    "inputmode": "numeric",
                    "pattern": "HL\d{4}",
                    "required": "true",
                }
            ),
            "block_check": forms.Select(attrs={"class": "form-select rounded-3"}),
            "shift_type": forms.Select(attrs={"class": "form-select rounded-3"}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # 1. 안내 문구 정의
        default_choice = [("", "--- 선택해 주세요 ---")]

        # 2. block_check 처리
        if "block_check" in self.fields:
            # 기존 선택지에서 빈 값('')이 있는 항목은 모두 제거하고 실제 데이터만 추출
            real_choices = [
                c for c in self.fields["block_check"].choices if c[0] and c[0] != ""
            ]
            # 안내 문구를 맨 앞에 붙임
            self.fields["block_check"].choices = default_choice + real_choices
            self.fields["block_check"].required = True
            # 생성 화면에서만 안내 문구가 먼저 보이게 함
            if not (self.instance and self.instance.pk):
                self.initial["block_check"] = ""

        # 3. shift_type 처리
        if "shift_type" in self.fields:
            real_choices = [
                c for c in self.fields["shift_type"].choices if c[0] and c[0] != ""
            ]
            self.fields["shift_type"].choices = default_choice + real_choices
            self.fields["shift_type"].required = True
            if not (self.instance and self.instance.pk):
                self.initial["shift_type"] = ""

    def clean_aircraft_reg(self):
        raw = (self.cleaned_data.get("aircraft_reg") or "").strip().upper()
        digits = re.sub(r"\D", "", raw)
        if len(digits) != 4:
            raise forms.ValidationError("항공기 기번은 숫자 4자리를 입력하세요.")
        return f"HL{digits}"


class SessionAreaForm(forms.ModelForm):
    class Meta:
        model = SessionArea
        fields = ["name", "position"]
        widgets = {
            "name": forms.TextInput(
                attrs={"class": "form-control", "placeholder": "구역 이름"}
            ),
            "position": forms.Select(attrs={"class": "form-select"}),
        }
