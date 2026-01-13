from django import forms
from .models import WorkItem


class WorkItemForm(forms.ModelForm):
    # [추가] 배정된 사람 이름을 적는 칸 (필수가 아님 required=False)
    assigned_text = forms.CharField(required=False, widget=forms.TextInput(
        attrs={'class': 'form-control form-control-sm', 'placeholder': '예: 김철수, 이영희'}
    ))
    
    class Meta:
        model = WorkItem
        # 수정/추가할 항목들
        fields = ['gibun_input', 'work_order', 'op', 'description', 'work_mh']
        
        # 부트스트랩 디자인 입히기 (화면 예쁘게)
        widgets = {
            'gibun_input': forms.TextInput(attrs={'class': 'form-control form-control-sm', 'placeholder': '기번'}),
            'work_order': forms.TextInput(attrs={'class': 'form-control form-control-sm', 'placeholder': 'WO'}),
            'op': forms.TextInput(attrs={'class': 'form-control form-control-sm', 'placeholder': 'OP'}),
            'description': forms.Textarea(attrs={'class': 'form-control form-control-sm', 'rows': 1, 'placeholder': '설명'}),
            'work_mh': forms.NumberInput(attrs={'class': 'form-control form-control-sm', 'step': '0.1', 'style': 'width: 80px;'}),
        }