from contextvars import ContextVar
import uuid
from storage.models import Activity

correlation = ContextVar('correlation', default=None)
SENSITIVE = ('password', 'token', 'secret', 'cookie', 'recovery', 'email', 'address', 'phone', 'content', 'message', 'instructions', 'description', 'notes', 'name')


def redact(value):
    if isinstance(value, dict):
        return {key: '[redacted]' if any(word in key.lower() for word in SENSITIVE) else redact(item) for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


def record(actor, target, action, *, account=None, outcome='success', before=None, after=None, reason='', event_id=''):
    authenticated = actor is not None and actor.is_authenticated
    if account is None and authenticated:
        from .models import Account
        from django.conf import settings
        owner_id = target.pk if target._meta.label_lower == settings.AUTH_USER_MODEL.lower() else actor.pk
        account = Account.objects.filter(customer__user_id=owner_id).values_list('pk', flat=True).first()
    return Activity.objects.create(
        actor=actor if authenticated else None,
        actor_type='provider' if event_id else ('staff' if authenticated and (actor.is_staff or actor.is_superuser) else 'customer' if authenticated else 'system'),
        account_id=getattr(account, 'pk', account), record_type=target._meta.model_name,
        record_id=target.pk, action=action[:200], outcome=outcome,
        before=redact(before or {}), after=redact(after or {}), reason=reason,
        correlation_id=correlation.get() or uuid.uuid4(), provider_event_id=event_id,
    )
