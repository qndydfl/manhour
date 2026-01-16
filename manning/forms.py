from django import forms
from .models import WorkItem, Worker


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


class WorkerForm(forms.Form):
    worker_names = forms.CharField(widget=forms.Textarea)


class PasteDataForm(forms.Form):
    excel_data = forms.CharField(widget=forms.Textarea)


class EditAllForm(forms.ModelForm):
    class Meta:
        model = WorkItem
        fields = '__all__'


class DirectWorkItemForm(forms.ModelForm):
    class Meta:
        model = WorkItem
        fields = ['gibun_input', 'model_type', 'work_order', 'op', 'description', 'work_mh']
        widgets = {
            'gibun_input': forms.TextInput(attrs={'class': 'form-control', 'placeholder': '기번'}),
            'model_type': forms.TextInput(attrs={'class': 'form-control', 'placeholder': '기종'}),
            'work_order': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'WO'}),
            'op': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'OP'}),
            'description': forms.TextInput(attrs={'class': 'form-control', 'placeholder': '작업 내용'}),
            'work_mh': forms.NumberInput(attrs={'class': 'form-control', 'step': '0.1'}),
        }


class IndirectWorkItemForm(forms.ModelForm):
    class Meta:
        model = WorkItem
        fields = ['description', 'work_mh']


class WorkerIndirectForm(forms.ModelForm):
    start_time = forms.CharField(
        required=False, 
        widget=forms.TextInput(attrs={
            'class': 'form-control form-control-sm text-center', 
            'placeholder': '0900', 
            'maxlength': '4'
        })
    )
    end_time = forms.CharField(
        required=False, 
        widget=forms.TextInput(attrs={
            'class': 'form-control form-control-sm text-center', 
            'placeholder': '1200', 
            'maxlength': '4'
        })
    )

    class Meta:
        model = WorkItem
        fields = ['description', 'work_mh']
        widgets = {
            'description': forms.TextInput(attrs={
                'class': 'form-control form-control-sm', 
                'placeholder': '간비 내용'
            }),
            'work_mh': forms.NumberInput(attrs={
                'class': 'form-control form-control-sm text-center', 
                'step': '0.1'
            })
        }


class ManageItemForm(forms.ModelForm):
    # [수정] 드롭다운 대신 '텍스트 입력창'으로 변경
    assigned_worker_name = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            'class': 'form-control form-control-sm text-center fw-bold text-primary', 
            'style': 'font-size: 0.85rem; background-color: #f8f9fa;',
            'placeholder': '이름 입력'
        })
    )

    class Meta:
        model = WorkItem
        fields = ['gibun_input', 'work_order', 'op', 'description', 'work_mh']
        
        widgets = {
            'gibun_input': forms.TextInput(attrs={'class': 'form-control form-control-sm text-center'}),
            'work_order': forms.TextInput(attrs={'class': 'form-control form-control-sm'}),
            'op': forms.TextInput(attrs={'class': 'form-control form-control-sm text-center'}),
            'description': forms.TextInput(attrs={'class': 'form-control form-control-sm'}),
            'work_mh': forms.NumberInput(attrs={'class': 'form-control form-control-sm text-center', 'step': '0.1'}),
        }