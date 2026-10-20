"""ZIP-based enrollment eligibility; database flags remain authoritative."""
import re
from django.core.exceptions import ValidationError
from .models import ServiceArea


def normalize_zip(value):
    value = str(value).strip()
    if not re.fullmatch(r'[0-9]{5}(?:-[0-9]{4})?', value):
        raise ValidationError('Enter a five-digit ZIP code, optionally followed by -1234.')
    return value[:5]


def enrollment_available(postal_code):
    try:
        postal_code = normalize_zip(postal_code)
    except ValidationError:
        return False
    return ServiceArea.objects.filter(postal_code=postal_code, active=True, auto_enrollment=True).exists()
