import uuid
from django.db import transaction
from django.shortcuts import redirect
from django.http import HttpResponseForbidden
from allauth.account.authentication import get_authentication_records
from allauth.account.models import EmailAddress
from allauth.mfa.models import Authenticator
from .audit import correlation, record
from .permissions import role


class AccessAuditMiddleware:
    """Atomic application writes and audit; denied actions are recorded after rollback."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = correlation.set(uuid.uuid4())
        try:
            # Inquiry intake owns its transactions: persist a delivery receipt before
            # external mail, including failures. Existing account flows remain atomic.
            if request.path in ['/api/inquiries/', '/api/inquiries/csrf/']:
                response = self.get_response(request)
                response['Cache-Control'] = 'no-store'
                response['X-Request-ID'] = str(correlation.get())
                return response
            response = self.guard(request)
            if response is None:
                with transaction.atomic():
                    response = self.get_response(request)
                    if request.method not in ['GET', 'HEAD', 'OPTIONS']:
                        if response.status_code >= 400:
                            transaction.set_rollback(True)
                        elif request.user.is_authenticated:
                            record(request.user, request.user, 'HTTP mutation', after={'route': getattr(request.resolver_match, 'view_name', 'unknown')})
            if response.status_code in [401, 403, 404] and request.user.is_authenticated:
                record(request.user, request.user, 'Access denied', outcome='denied', after={'route': getattr(request.resolver_match, 'view_name', 'unknown')})
            response['X-Request-ID'] = str(correlation.get())
            response['Cache-Control'] = 'no-store' if request.user.is_authenticated else response.get('Cache-Control', 'no-store')
            return response
        finally:
            correlation.reset(token)

    def guard(self, request):
        if not request.user.is_authenticated:
            if request.path.startswith('/admin/'):
                return redirect('account_login')
            return None
        current = role(request.user)
        if request.path.startswith('/admin/') and current != 'administrator':
            return HttpResponseForbidden('Administrator access required.')
        if current in ['administrator', 'steward'] and not request.path.startswith(('/accounts/', '/static/', '/health/')):
            if not EmailAddress.objects.filter(user=request.user, verified=True).exists():
                return redirect('account_email')
            if not Authenticator.objects.filter(user=request.user, type__in=['totp', 'webauthn']).exists():
                return redirect('mfa_index')
            if not any(item.get('method') in ['mfa', 'webauthn'] for item in get_authentication_records(request)):
                return redirect('mfa_reauthenticate')
        if current == 'customer' and not request.path.startswith(('/accounts/', '/static/', '/health/')):
            if not EmailAddress.objects.filter(user=request.user, verified=True).exists():
                return redirect('account_email')
        return None
