from django import forms

from .models import WorkSession, SessionArea


class WorkSessionCreateForm(forms.ModelForm):
    class Meta:
        model = WorkSession
        fields = [
            "work_package_name",
            "aircraft_reg",
            "block_check",
            "shift_type",
        ]
        widgets = {
            "work_package_name": forms.TextInput(
                attrs={
                    "class": "form-control rounded-3",
                    "placeholder": "예: C-Check / Engine Change",
                }
            ),
            "aircraft_reg": forms.TextInput(
                attrs={
                    "class": "form-control rounded-3",
                    "placeholder": "예: HL1234",
                }
            ),
            "block_check": forms.Select(attrs={"class": "form-select rounded-3"}),
            "shift_type": forms.Select(attrs={"class": "form-select rounded-3"}),
        }


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
