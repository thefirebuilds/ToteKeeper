"""Public inquiry intake: bounded input, durable deduplication and server-side mail."""
import ipaddress
import json
import re
import time

from django import forms
from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.mail import EmailMessage
from django.core.validators import validate_email
from django.db import transaction
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.crypto import salted_hmac
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from .audit import record
from .models import Inquiry

PLAN_CHOICES = [(key, key) for key in ['undecided', 'small', 'medium', 'big', 'bulky']]
SOURCE_CHOICES = [(key, key) for key in ['header', 'hero', 'pricing-small', 'pricing-medium', 'pricing-big', 'final', 'help-decide', 'summer', 'bulky', 'service-area', 'tote-mix', 'legacy-enroll']]
CONTEXT_CHOICES = [(key, key) for key in ['general', 'summer', 'bulky', 'service-area']]


class InquiryForm(forms.Form):
    request_key = forms.UUIDField()
    name = forms.CharField(min_length=1, max_length=100)
    email = forms.EmailField(max_length=254)
    zip_code = forms.RegexField(r'^\d{5}(?:-\d{4})?$', max_length=10, error_messages={'invalid': 'Enter a 5-digit ZIP code, optionally followed by -1234.'})
    plan = forms.ChoiceField(choices=PLAN_CHOICES)
    description = forms.CharField(min_length=1, max_length=1000)
    phone = forms.CharField(max_length=30, required=False)
    reply_method = forms.ChoiceField(choices=[('email', 'Email'), ('phone', 'Phone'), ('text', 'Text')])
    source = forms.ChoiceField(choices=SOURCE_CHOICES)
    context = forms.ChoiceField(choices=CONTEXT_CHOICES)
    website = forms.CharField(required=False, max_length=200)

    def clean_name(self):
        value = self.cleaned_data['name']
        if any(ord(char) < 32 for char in value):
            raise ValidationError('Enter your name on one line.')
        return value

    def clean_description(self):
        value = self.cleaned_data['description']
        if any(ord(char) < 32 and char not in '\r\n\t' for char in value):
            raise ValidationError('Remove unsupported control characters.')
        return value

    def clean_phone(self):
        value = self.cleaned_data['phone']
        if value and (not re.fullmatch(r'[+()\d .-]+', value) or not 7 <= len(re.sub(r'\D', '', value)) <= 15):
            raise ValidationError('Enter a phone number with 7 to 15 digits.')
        return value

    def clean_website(self):
        if self.cleaned_data['website']:
            raise ValidationError('Unable to accept this request.')
        return ''

    def clean(self):
        data = super().clean()
        if data.get('reply_method') in ['phone', 'text'] and not data.get('phone'):
            self.add_error('phone', 'Add a phone number or choose an email reply.')
        return data


def _mail_ready():
    try:
        validate_email(settings.INQUIRY_TO_EMAIL)
        validate_email(settings.DEFAULT_FROM_EMAIL)
    except ValidationError:
        return False
    if settings.DEFAULT_FROM_EMAIL.endswith('.invalid') or settings.INQUIRY_TO_EMAIL.endswith('.invalid'):
        return False
    if settings.EMAIL_BACKEND == 'config.gmail.GmailAPIBackend':
        return all([settings.GMAIL_CLIENT_ID, settings.GMAIL_CLIENT_SECRET, settings.GMAIL_REFRESH_TOKEN])
    if settings.EMAIL_BACKEND == 'django.core.mail.backends.smtp.EmailBackend':
        return bool(settings.EMAIL_HOST)
    # Capturing mail is allowed only in explicit development/test environments.
    return settings.DEBUG and settings.EMAIL_BACKEND == 'django.core.mail.backends.locmem.EmailBackend'


def _quota(namespace, value, limit, seconds):
    digest = salted_hmac('inquiry-rate', value).hexdigest()
    bucket = int(time.time()) // seconds
    # Atomic cache.add slots work with the existing shared database cache.
    for slot in range(limit):
        if cache.add(f'inquiry:{namespace}:{digest}:{bucket}:{slot}', 1, timeout=seconds * 2):
            return True
    return False


def _reference(inquiry):
    return f'TK-{inquiry.reference}'


def _existing(inquiry, fingerprint):
    reference = _reference(inquiry)
    if inquiry.fingerprint != fingerprint:
        return JsonResponse({'error': 'This request changed. Please try submitting the updated form again.'}, status=409)
    if inquiry.delivery_status == 'sent':
        return JsonResponse({'reference': reference}, status=200)
    return JsonResponse({'error': 'We could not confirm delivery. Please contact Blake directly and mention your reference; avoid sending a second copy.', 'reference': reference}, status=503)


@require_GET
@ensure_csrf_cookie
def csrf(request):
    return JsonResponse({'csrfToken': get_token(request)})


@require_POST
def submit(request):
    if request.content_type != 'application/json':
        return JsonResponse({'error': 'Submit this request using the inquiry form.'}, status=415)
    try:
        if int(request.META.get('CONTENT_LENGTH') or 0) > 8192 or len(request.body) > 8192:
            return JsonResponse({'error': 'Your request is too long. Please shorten the description.'}, status=413)
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        return JsonResponse({'error': 'Unable to read this request. Please try again.'}, status=400)
    if not isinstance(data, dict) or any(key not in InquiryForm.base_fields or not isinstance(value, str) for key, value in data.items()):
        return JsonResponse({'error': 'Invalid inquiry fields.'}, status=400)
    form = InquiryForm(data)
    if not form.is_valid():
        errors = {key: [str(error) for error in values] for key, values in form.errors.items()}
        return JsonResponse({'error': 'Please check the highlighted fields.', 'fields': errors}, status=400)
    values = form.cleaned_data.copy()
    key = values.pop('request_key')
    values.pop('website')
    values['email'] = values['email'].lower()
    fingerprint = salted_hmac('inquiry-payload', json.dumps(values, sort_keys=True)).hexdigest()
    existing = Inquiry.objects.filter(request_key=key).first()
    if existing:
        return _existing(existing, fingerprint)
    address = request.META.get('REMOTE_ADDR', '')
    if settings.INQUIRY_TRUST_PROXY_HEADER:
        # Enable only behind the supplied Caddy config, which overwrites this header.
        address = request.META.get('HTTP_X_TOTEKEEPER_CLIENT_IP', address)
    try:
        address = str(ipaddress.ip_address(address))
    except ValueError:
        address = 'unknown'
    retry_after = 0
    if not _quota('ip', address, 5, 900):
        retry_after = 900
    elif not _quota('email', values['email'], 3, 3600):
        retry_after = 3600
    if retry_after:
        response = JsonResponse({'error': 'Too many requests. Please try later or contact Blake directly.'}, status=429)
        response['Retry-After'] = str(retry_after)
        return response
    if not _mail_ready():
        return JsonResponse({'error': 'Online inquiries are temporarily unavailable. Please email or call Blake directly.'}, status=503)
    # Commit the receipt before calling the provider, so a lost response cannot resend.
    with transaction.atomic():
        inquiry, created = Inquiry.objects.get_or_create(request_key=key, defaults={**values, 'fingerprint': fingerprint})
        if not created:
            return _existing(inquiry, fingerprint)
        record(None, inquiry, 'Inquiry received', after={'delivery_status': 'sending'})
    reference = _reference(inquiry)
    body = '\n'.join([
        f'Reference: {reference}', f'Received (UTC): {inquiry.created_at.isoformat()}',
        f'Source CTA: {inquiry.source}', f'Context: {inquiry.context}',
        f'Name: {inquiry.name}', f'Email: {inquiry.email}', f'ZIP: {inquiry.zip_code}',
        f'Plan interest: {inquiry.plan}', f'Phone: {inquiry.phone or "Not supplied"}',
        f'Preferred reply: {inquiry.reply_method}', '', 'What they would like to store:', inquiry.description,
        '', 'Review storage needs, pricing and scheduling. Geographic eligibility uses the approved whole-ZIP list.',
        'This inquiry creates no account, subscription, payment, appointment or marketing enrollment.',
    ])
    message = EmailMessage(subject=f'My Tote Keeper storage inquiry {reference}', body=body,
                           from_email=settings.DEFAULT_FROM_EMAIL, to=[settings.INQUIRY_TO_EMAIL],
                           reply_to=[inquiry.email], headers={'Message-ID': f'<{inquiry.reference}@inquiry.totekeeper>'})
    try:
        if message.send(fail_silently=False) != 1:
            raise RuntimeError('Provider did not accept the inquiry.')
    except Exception:
        # No provider response, submitted values, OAuth secrets or email bodies in logs.
        with transaction.atomic():
            Inquiry.objects.filter(pk=inquiry.pk).update(delivery_status='failed')
            record(None, inquiry, 'Inquiry delivery needs review', outcome='failed')
        return _existing(inquiry, fingerprint)
    with transaction.atomic():
        Inquiry.objects.filter(pk=inquiry.pk).update(delivery_status='sent', delivered_at=timezone.now())
        record(None, inquiry, 'Inquiry accepted by email provider', after={'delivery_status': 'sent'})
    return JsonResponse({'reference': reference}, status=201)
