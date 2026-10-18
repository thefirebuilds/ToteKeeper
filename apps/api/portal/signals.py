from django.dispatch import receiver
from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from allauth.account import signals as account_signals
from allauth.mfa import signals as mfa_signals
from .audit import record
from .models import Account
from storage.models import Customer
from django.db.models.signals import post_save


@receiver(account_signals.user_signed_up)
def signup(sender, request, user, **kwargs):
    customer = Customer.objects.create(user=user, name='', email=user.email, service_address='')
    account = customer.portal_account
    record(user, account, 'Account registered', account=account)


@receiver(post_save, sender=Customer)
def customer_account(sender, instance, created, **kwargs):
    if created:
        account = Account.objects.create(customer=instance)
        record(None, account, 'Customer account initialized', account=account)


@receiver(account_signals.email_confirmed)
def verified(sender, request, email_address, **kwargs):
    record(email_address.user, email_address.user, 'Email verified')


@receiver(account_signals.email_changed)
def email_changed(sender, request, user, to_email_address, **kwargs):
    Customer.objects.filter(user=user).update(email=to_email_address.email)
    record(user, user, 'Verified email changed')


@receiver(user_logged_in)
def login(sender, request, user, **kwargs):
    record(user, user, 'Signed in')


@receiver(user_logged_out)
def logout(sender, request, user, **kwargs):
    if user:
        record(user, user, 'Signed out')


@receiver(user_login_failed)
def login_failed(sender, credentials, request, **kwargs):
    from django.contrib.auth import get_user_model
    from .auth import axes_username
    identity = axes_username(request, credentials)
    user = get_user_model().objects.filter(pk=int(identity.split(':')[1])).first() if identity.startswith('user:') else None
    if user:
        record(user, user, 'Authentication denied', outcome='denied')


@receiver(mfa_signals.authentication_failed)
def mfa_failed(sender, request=None, user=None, **kwargs):
    if user:
        record(user, user, 'MFA challenge denied', outcome='denied')


@receiver(mfa_signals.authenticator_used)
def mfa_used(sender, request=None, user=None, **kwargs):
    if user:
        record(user, user, 'MFA challenge completed')


def security_event(sender, request=None, user=None, action='Security settings changed', authenticator=None, **kwargs):
    if user:
        record(user, user, action, after={'factor_type': authenticator.type} if authenticator else {})


for signal, action in [(account_signals.password_changed, 'Password changed'), (account_signals.password_reset, 'Password recovered'), (account_signals.password_set, 'Password set'), (mfa_signals.authenticator_added, 'MFA factor added'), (mfa_signals.authenticator_removed, 'MFA factor removed'), (mfa_signals.authenticator_reset, 'MFA recovery settings regenerated')]:
    def handler(sender, action=action, **kwargs):
        return security_event(sender, action=action, **kwargs)
    signal.connect(handler, weak=False)
