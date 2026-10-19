import uuid
from datetime import timedelta
from django import forms
from django.db.models import Count, Q
from django.utils import timezone
from storage.models import Tote
from .models import Address, Offering, ServiceWindow, SupportRequest
from .liability import ACKNOWLEDGMENT
from .scheduling import notice_hours


def available_windows(postal_code, exclude_delivery=None):
    active = Q(delivery__status__in=['requested', 'awaiting_payment', 'confirmed', 'in_progress'])
    if exclude_delivery:
        active &= ~Q(delivery__pk=exclude_delivery)
    queryset = ServiceWindow.objects.filter(area__postal_code=postal_code, area__active=True, blackout=False, starts_at__gt=timezone.now()).annotate(used=Count('delivery', filter=active)).order_by('starts_at')
    ids = [window.pk for window in queryset if window.used < window.capacity and window.starts_at >= timezone.now()+timedelta(hours=notice_hours(window))]
    return ServiceWindow.objects.filter(pk__in=ids).select_related('area').order_by('starts_at')


class ProfileForm(forms.Form):
    name = forms.CharField(max_length=160)
    phone = forms.CharField(max_length=40)
    service_address = forms.CharField(max_length=1000, widget=forms.Textarea(attrs={'rows': 3}))
    postal_code = forms.CharField(max_length=16)
    delivery_instructions = forms.CharField(max_length=2000, required=False, widget=forms.Textarea(attrs={'rows': 3}))
    service_email = forms.BooleanField(required=False, label='Send optional service reminders (required account/payment messages remain enabled)')
    marketing_consent = forms.BooleanField(required=False, label='Send occasional marketing messages (optional)')

    def clean_postal_code(self):
        return self.cleaned_data['postal_code'].strip().upper()


class EnrollmentForm(forms.Form):
    offering = forms.ModelChoiceField(queryset=Offering.objects.none())
    policy_id = forms.IntegerField(widget=forms.HiddenInput)
    accept = forms.BooleanField(label='I accept the displayed service terms and cancellation policy.')
    liability_acknowledged = forms.BooleanField(label=ACKNOWLEDGMENT)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['offering'].queryset = Offering.objects.filter(state='active', effective_from__lte=timezone.now()).exclude(effective_until__lte=timezone.now())


class InventoryForm(forms.ModelForm):
    class Meta:
        model = Tote
        fields = ['item_type', 'nickname', 'category', 'description']


class PhotoForm(forms.Form):
    photo = forms.FileField(help_text='JPEG, PNG or WebP; up to 5 MB. Maximum 8 active photos per item. Location metadata is removed.')


class DeliveryForm(forms.Form):
    kind = forms.ChoiceField(choices=[('pickup', 'Pickup'), ('return', 'Return'), ('exchange', 'Exchange')])
    inventory = forms.ModelMultipleChoiceField(queryset=Tote.objects.none(), widget=forms.CheckboxSelectMultiple)
    window = forms.ModelChoiceField(queryset=ServiceWindow.objects.none())
    address = forms.CharField(max_length=1000, widget=forms.Textarea(attrs={'rows': 3}))
    postal_code = forms.CharField(max_length=16)
    instructions = forms.CharField(max_length=2000, required=False, widget=forms.Textarea(attrs={'rows': 3}))
    key = forms.UUIDField(widget=forms.HiddenInput, initial=uuid.uuid4)
    acknowledge = forms.BooleanField(label='I have reviewed the credit usage or extra charge shown above. This is a request, not a confirmed appointment.')

    def __init__(self, *args, account, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['inventory'].queryset = Tote.objects.filter(customer=account.customer, status__in=['registered', 'with_customer', 'in_storage']).exclude(delivery_items__delivery__status__in=['requested', 'awaiting_payment', 'confirmed', 'in_progress']).distinct()
        self.fields['window'].queryset = available_windows(account.postal_code)
        self.fields['window'].help_text = 'Only currently available windows are listed. If none are available, contact ToteKeeper.'


class RescheduleForm(forms.Form):
    window = forms.ModelChoiceField(queryset=ServiceWindow.objects.none())

    def __init__(self, *args, delivery, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['window'].queryset = available_windows(delivery.postal_code, delivery.pk)


class AddressForm(forms.ModelForm):
    class Meta:
        model = Address
        fields = ['label', 'address', 'postal_code', 'instructions']


class SupportForm(forms.ModelForm):
    class Meta:
        model = SupportRequest
        fields = ['subject', 'message', 'callback']
