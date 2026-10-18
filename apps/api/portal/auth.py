from cryptography.fernet import Fernet
from django.conf import settings
from allauth.mfa.adapter import DefaultMFAAdapter
from allauth.account.adapter import DefaultAccountAdapter


class AccountAdapter(DefaultAccountAdapter):
    def get_login_redirect_url(self, request):
        return '/'


class MFAAdapter(DefaultMFAAdapter):
    def encrypt(self, text):
        return Fernet(settings.MFA_ENCRYPTION_KEY.encode()).encrypt(text.encode()).decode()

    def decrypt(self, encrypted_text):
        return Fernet(settings.MFA_ENCRYPTION_KEY.encode()).decrypt(encrypted_text.encode()).decode()

    def can_delete_authenticator(self, authenticator):
        from .permissions import role
        if role(authenticator.user) in ['administrator', 'steward'] and authenticator.type in ['totp', 'webauthn']:
            return authenticator.user.authenticator_set.filter(type__in=['totp', 'webauthn']).exclude(pk=authenticator.pk).exists()
        return super().can_delete_authenticator(authenticator)


def axes_username(request, credentials=None):
    """One lockout identity for username and email login, without storing raw input."""
    from django.contrib.auth import get_user_model
    from django.db.models import Q
    from hashlib import sha256
    credentials = credentials or {}
    raw = credentials.get('username') or credentials.get('email') or request.POST.get('login') or request.POST.get('username') or ''
    raw = str(raw).strip()
    user = get_user_model().objects.filter(Q(username__iexact=raw) | Q(email__iexact=raw)).first() if raw else None
    return f'user:{user.pk}' if user else 'unknown:' + sha256(raw.lower().encode()).hexdigest()
