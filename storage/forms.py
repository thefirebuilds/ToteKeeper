from django import forms
from django.utils import timezone
from .models import Customer, ServiceRequest, Tote


class ToteForm(forms.ModelForm):
    class Meta:
        model = Tote
        fields = ['nickname', 'description']


class ProfileForm(forms.ModelForm):
    class Meta:
        model = Customer
        fields = ['name', 'email', 'phone', 'service_address']


class RequestForm(forms.Form):
    kind = forms.ChoiceField(choices=ServiceRequest._meta.get_field('kind').choices)
    totes = forms.ModelMultipleChoiceField(queryset=Tote.objects.none(), widget=forms.CheckboxSelectMultiple, help_text='Select some or all eligible totes. Collection: with customer. Return: in storage.')
    preferred_date = forms.DateField(widget=forms.DateInput(attrs={'type': 'date'}))
    preferred_window = forms.CharField(max_length=100, help_text='For example: afternoon, 1–5 PM')
    instructions = forms.CharField(max_length=3000, required=False, widget=forms.Textarea)

    def __init__(self, *args, customer, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['totes'].queryset = customer.totes.filter(status__in=[Tote.Status.WITH_CUSTOMER, Tote.Status.STORAGE]).exclude(request_items__request__status__in=['requested', 'confirmed'])
        self.fields['preferred_date'].widget.attrs['min'] = timezone.localdate().isoformat()


class AppointmentForm(forms.Form):
    appointment = forms.DateTimeField(widget=forms.DateTimeInput(attrs={'type': 'datetime-local'}), help_text='America/Chicago time; separate from the customer’s preferred date.')
