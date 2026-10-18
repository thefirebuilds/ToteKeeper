from functools import wraps
from django.core.exceptions import PermissionDenied
from django.contrib.auth.decorators import login_required
from .models import Membership


def role(user):
    if not user.is_authenticated or not user.is_active:
        return 'anonymous'
    if user.is_superuser:
        return 'administrator'
    return Membership.objects.filter(user=user).values_list('role', flat=True).first() or 'customer'


def require_role(*allowed):
    def decorate(view):
        @login_required
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            if role(request.user) not in allowed:
                raise PermissionDenied
            return view(request, *args, **kwargs)
        return wrapped
    return decorate


def operational_access(user, delivery=None):
    current = role(user)
    return current == 'administrator' or (current == 'steward' and delivery is not None and delivery.assigned_to_id == user.pk)
