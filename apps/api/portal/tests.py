import hashlib
import hmac
from io import BytesIO
import json
import os
import subprocess
import sys
import time
from datetime import timedelta
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless
from unittest.mock import patch
from PIL import Image
from allauth.account.models import EmailAddress
from allauth.mfa.models import Authenticator
from allauth.mfa.totp.internal.auth import TOTP, generate_totp_secret
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import close_old_connections, connection
from django.test import Client, SimpleTestCase, TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from storage.models import Activity, Customer, Tote
from . import billing, operations
from .audit import record
from .auth import MFAAdapter
from .models import Account, Acceptance, Checkout, Contract, CreditGrant, Delivery, LedgerEntry, Membership, Offering, Photo, Policy, ServiceArea, ServiceWindow, WebhookEvent
from .photos import upload_photo


class StripeObject(dict):
    __getattr__ = dict.__getitem__


def fixtures():
    User = get_user_model()
    # Most tests force a session; real login and MFA are tested separately.
    users = [User.objects.create_user(name, name+'@example.invalid') for name in ['alice', 'bob', 'steward']]
    admin = User.objects.create_superuser('admin', 'admin@example.invalid', None)
    for user in [*users, admin]:
        EmailAddress.objects.create(user=user, email=user.email, verified=True, primary=True)
    alice, bob, steward = users
    steward.is_staff = True
    steward.save()
    Membership.objects.create(user=steward, role='steward')
    for user in [alice, bob]:
        Customer.objects.create(user=user, name=user.username.title(), email=user.email, phone='555-0100', service_address='Fictional Example Address')
    area = ServiceArea.objects.create(name='Test area', postal_code='00000', active=True)
    offering = Offering.objects.create(name='TEST ONLY', version='1', state='active', capacity=20, price_cents=100, interval='month', storage_allowance=4, included_credits=2, credit_definition='TEST: one credit per visit', extra_delivery_cents=50, stripe_price_id='price_test', stripe_delivery_price_id='price_delivery_test', tax_mode='none')
    for user in [alice, bob]:
        account = user.customer.portal_account
        account.postal_code = area.postal_code
        account.save()
    policy = Policy.objects.create(version='TEST-ONLY', terms='TEST ONLY', cancellation='TEST ONLY', active=True)
    start = timezone.now()+timedelta(days=5)
    window = ServiceWindow.objects.create(area=area, starts_at=start, ends_at=start+timedelta(hours=2), capacity=2)
    item = Tote.objects.create(customer=alice.customer, status='registered', label='TEST-ALICE', admin_notes='PRIVATE-NOTE', location='PRIVATE-LOCATION')
    other = Tote.objects.create(customer=bob.customer, status='registered', label='TEST-BOB')
    return alice, bob, steward, admin, area, offering, policy, window, item, other


class FixtureMixin:
    def setUp(self):
        cache.clear()
        self.alice, self.bob, self.steward, self.admin, self.area, self.offering, self.policy, self.window, self.item, self.other = fixtures()
        self.account = self.alice.customer.portal_account
        self.client.force_login(self.alice, backend='django.contrib.auth.backends.ModelBackend')

    def activate(self, credits=2):
        contract = billing.enroll(self.alice, self.account.pk, self.offering.pk, self.policy.pk)
        contract.status = 'active'
        contract.payment_status = 'paid'
        contract.stripe_subscription_id = 'sub_test'
        contract.save()
        if credits:
            operations.issue_credits(self.account, credits, 'TEST visit', 'test-grant', timezone.now()+timedelta(days=30))
        return contract

    def book(self, key=None):
        return operations.book(self.alice, self.account.pk, 'pickup', self.window.pk, [self.item.pk], 'Fictional Example Address', '00000', key=key)

    def staff_login(self, user=None):
        user = user or self.admin
        TOTP.activate(user, generate_totp_secret())
        self.client.force_login(user, backend='django.contrib.auth.backends.ModelBackend')
        session = self.client.session
        session['account_authentication_methods'] = [{'method': 'mfa', 'at': time.time(), 'type': 'totp'}]
        session.save()


@override_settings(AXES_ENABLED=False, ACCOUNT_RATE_LIMITS={}, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', STORAGES={'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'}, 'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}})
class PortalTests(FixtureMixin, TestCase):
    def test_active_dashboard_and_steward_inventory_boundary(self):
        self.activate()
        self.assertContains(self.client.get('/'), 'Included credits available')
        delivery = self.book()
        delivery.assigned_to = self.steward
        delivery.save()
        self.staff_login(self.steward)
        self.assertEqual(self.client.get(f'/octagon/inventory/{self.item.pk}/').status_code, 200)
        self.assertEqual(self.client.get(f'/octagon/inventory/{self.other.pk}/').status_code, 404)
        self.assertEqual(self.client.get('/octagon/export/customers/').status_code, 403)

    def test_customer_pages_render_real_empty_states(self):
        for url in ['/', '/inventory/', '/inventory/new/', '/deliveries/', '/deliveries/new/', '/billing/', '/account/', '/help/', '/enroll/', '/accounts/login/', '/accounts/signup/', '/accounts/2fa/', '/accounts/sessions/']:
            response = self.client.get(url)
            self.assertIn(response.status_code, [200, 302], url)
            self.assertNotContains(response, 'PRIVATE-NOTE', status_code=response.status_code)
            self.assertNotContains(response, 'PRIVATE-LOCATION', status_code=response.status_code)
        self.assertContains(self.client.get('/billing/'), 'You have no subscription')

    def test_inventory_customer_fields_only(self):
        response = self.client.post('/inventory/new/', {'item_type': 'tote', 'nickname': 'Winter', 'category': 'General', 'description': 'Books', 'status': 'in_storage', 'customer': self.bob.customer.pk, 'oversized_approved': True})
        self.assertEqual(response.status_code, 302)
        item = Tote.objects.get(nickname='Winter')
        self.assertEqual(item.customer_id, self.alice.customer.pk)
        self.assertEqual(item.status, 'registered')
        self.assertFalse(item.oversized_approved)
        self.client.post(f'/inventory/{item.pk}/', {'nickname': 'Books', 'category': '', 'description': '', 'status': 'in_storage', 'location': 'HACK'})
        item.refresh_from_db()
        self.assertEqual(item.status, 'registered')
        self.assertEqual(item.location, '')

    def test_cross_account_direct_urls_and_posts(self):
        for path in [f'/inventory/{self.other.pk}/', f'/inventory/{self.other.pk}/photos/']:
            self.assertEqual(self.client.post(path, {'nickname': 'HACK'}).status_code, 404)
        self.other.refresh_from_db()
        self.assertEqual(self.other.nickname, '')
        self.assertTrue(Activity.objects.filter(outcome='denied', actor=self.alice).exists())

    def test_staff_roles_and_mfa_gate(self):
        self.assertEqual(self.client.get('/octagon/').status_code, 403)
        self.assertEqual(self.client.get('/admin/').status_code, 403)
        self.client.force_login(self.steward)
        self.assertIn('/2fa/', self.client.get('/octagon/').url)
        self.staff_login(self.steward)
        self.assertEqual(self.client.get('/octagon/').status_code, 200)
        self.assertEqual(self.client.get('/admin/').status_code, 403)
        self.assertEqual(self.client.get('/billing/').status_code, 403)

    def test_unassigned_steward_cannot_fulfill(self):
        self.activate()
        delivery = self.book()
        with self.assertRaises(PermissionDenied):
            operations.transition(self.steward, delivery.pk, 'confirmed')
        delivery.assigned_to = self.steward
        delivery.save()
        operations.transition(self.steward, delivery.pk, 'confirmed')
        with self.assertRaises(PermissionDenied):
            operations.transition(self.bob, delivery.pk, 'canceled')

    def test_enrollment_preserves_terms_and_does_not_activate(self):
        contract = billing.enroll(self.alice, self.account.pk, self.offering.pk, self.policy.pk)
        self.assertEqual(contract.status, 'pending')
        self.assertEqual(contract.payment_status, 'unpaid')
        self.assertEqual(Acceptance.objects.filter(account=self.account).count(), 1)
        billing.enroll(self.alice, self.account.pk, self.offering.pk, self.policy.pk)
        self.assertEqual(Contract.objects.filter(account=self.account).count(), 1)
        self.offering.price_cents = 900
        self.offering.save()
        contract.refresh_from_db()
        self.assertEqual(contract.terms['price_cents'], 100)
        self.client.get('/billing/?checkout=returned')
        self.assertEqual(operations.available_credits(self.account), 0)

    def test_enrollment_rejects_policy_area_and_capacity(self):
        self.area.active = False
        self.area.save()
        with self.assertRaises(ValidationError):
            billing.enroll(self.alice, self.account.pk, self.offering.pk, self.policy.pk)
        self.area.active = True
        self.area.save()
        self.offering.capacity = 0
        self.offering.save()
        with self.assertRaises(ValidationError):
            billing.enroll(self.alice, self.account.pk, self.offering.pk, self.policy.pk)
        self.offering.capacity = 2
        self.offering.save()
        with self.assertRaises(ValidationError):
            billing.enroll(self.alice, self.account.pk, self.offering.pk, 999)

    def test_no_credentials_has_explicit_failure(self):
        billing.enroll(self.alice, self.account.pk, self.offering.pk, self.policy.pk)
        with self.assertRaises(billing.ProviderUnavailable):
            billing.options()

    def test_credit_reserve_consume_and_lifecycle(self):
        self.activate()
        delivery = self.book()
        self.assertEqual(operations.available_credits(self.account), 1)
        self.assertEqual(delivery.reserved_credits, 1)
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, 'registered')
        with self.assertRaises(ValidationError):
            operations.transition(self.admin, delivery.pk, 'completed')
        operations.transition(self.admin, delivery.pk, 'confirmed')
        operations.transition(self.admin, delivery.pk, 'in_progress')
        operations.transition(self.admin, delivery.pk, 'completed')
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, 'in_storage')
        self.assertEqual(self.item.history.count(), 2)
        self.assertEqual(LedgerEntry.objects.filter(kind='consume').count(), 1)

    def test_cancel_releases_credit_and_capacity(self):
        self.activate()
        delivery = self.book()
        operations.transition(self.alice, delivery.pk, 'canceled')
        self.assertEqual(operations.available_credits(self.account), 2)
        self.book()

    def test_unable_to_complete_releases_credit(self):
        self.activate()
        delivery = self.book()
        operations.transition(self.admin, delivery.pk, 'confirmed')
        operations.transition(self.admin, delivery.pk, 'in_progress')
        with self.assertRaises(ValidationError):
            operations.transition(self.admin, delivery.pk, 'unable_to_complete')
        operations.transition(self.admin, delivery.pk, 'unable_to_complete', 'Customer unavailable')
        self.assertEqual(operations.available_credits(self.account), 2)

    def test_cross_owner_and_conflicting_inventory(self):
        self.activate()
        with self.assertRaises(ValidationError):
            operations.book(self.alice, self.account.pk, 'pickup', self.window.pk, [self.other.pk], 'Example', '00000')
        self.book()
        with self.assertRaises(ValidationError):
            self.book()

    def test_capacity_lead_time_blackout_and_cutoff(self):
        self.activate()
        for field, value in [('capacity', 0), ('blackout', True), ('lead_hours', 1000)]:
            old = getattr(self.window, field)
            setattr(self.window, field, value)
            self.window.save()
            with self.assertRaises(ValidationError):
                self.book()
            setattr(self.window, field, old)
            self.window.save()
        delivery = self.book()
        self.window.cancellation_hours = 1000
        self.window.save()
        with self.assertRaises(ValidationError):
            operations.transition(self.alice, delivery.pk, 'canceled')

    def test_exchange_and_oversized_validation(self):
        self.activate()
        with self.assertRaises(ValidationError):
            operations.book(self.alice, self.account.pk, 'exchange', self.window.pk, [self.item.pk], 'Example', '00000')
        self.item.item_type = 'oversized'
        self.item.save()
        with self.assertRaises(ValidationError):
            self.book()

    def test_storage_allowance_is_server_enforced(self):
        self.activate()
        self.item.storage_units = 5
        self.item.save()
        with self.assertRaises(ValidationError):
            self.book()

    def test_awaiting_payment_reservation_expires(self):
        self.activate(credits=0)
        delivery = self.book()
        self.assertEqual(delivery.status, 'awaiting_payment')
        self.assertEqual(delivery.extra_cents, 50)
        with self.assertRaises(ValidationError):
            operations.transition(self.admin, delivery.pk, 'confirmed')
        delivery.reservation_expires = timezone.now()-timedelta(seconds=1)
        delivery.save()
        operations.expire_reservations()
        delivery.refresh_from_db()
        self.assertEqual(delivery.status, 'canceled')

    def test_expired_credit_cannot_be_released_as_fresh_credit(self):
        self.activate()
        delivery = self.book()
        CreditGrant.objects.filter(account=self.account).update(expires_at=timezone.now()-timedelta(seconds=1))
        operations.transition(self.alice, delivery.pk, 'canceled')
        operations.expire_reservations()
        self.assertEqual(operations.available_credits(self.account), 0)

    def test_private_photo_validation_and_deletion(self):
        image = BytesIO()
        Image.new('RGB', (32, 32), 'blue').save(image, 'PNG')
        photo = upload_photo(self.alice, self.account.pk, self.item.pk, SimpleUploadedFile('../../evil.php', image.getvalue(), content_type='text/plain'))
        self.assertTrue(bytes(photo.content).startswith(b'\xff\xd8'))
        self.assertFalse(Image.open(BytesIO(bytes(photo.content))).getexif())
        url = f'/photos/{photo.key}/'
        self.assertEqual(self.client.get(url).status_code, 200)
        self.client.force_login(self.bob)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.post(url+'remove/').status_code, 404)
        self.client.force_login(self.alice)
        self.assertEqual(self.client.post(url+'remove/').status_code, 302)
        photo.refresh_from_db()
        self.assertEqual(bytes(photo.content), b'')
        self.assertEqual(self.client.get(url).status_code, 404)
        with self.assertRaises(ValidationError):
            upload_photo(self.alice, self.account.pk, self.item.pk, SimpleUploadedFile('bad.jpg', b'<?php malicious ?>'))

    def test_photo_limits(self):
        image = BytesIO()
        Image.new('RGB', (4, 4)).save(image, 'PNG')
        with override_settings(PHOTO_LIMIT=1):
            upload_photo(self.alice, self.account.pk, self.item.pk, SimpleUploadedFile('one.png', image.getvalue()))
            with self.assertRaises(ValidationError):
                upload_photo(self.alice, self.account.pk, self.item.pk, SimpleUploadedFile('two.png', image.getvalue()))
        with override_settings(PHOTO_MAX_BYTES=2), self.assertRaises(ValidationError):
            upload_photo(self.alice, self.account.pk, self.item.pk, SimpleUploadedFile('big.png', image.getvalue()))

    def test_audit_redaction_and_append_only(self):
        event = record(self.alice, self.account, 'Test', account=self.account, after={'password': 'NEVER-LOG', 'nested': {'token': 'SECRET'}, 'status': 'active'})
        self.assertNotIn('NEVER-LOG', json.dumps(event.after))
        self.assertNotIn('SECRET', json.dumps(event.after))
        self.assertEqual(event.after['status'], 'active')
        with self.assertRaises(ValidationError):
            event.save()
        with self.assertRaises(ValidationError):
            event.delete()

    def test_mutation_rolls_back_if_audit_fails(self):
        self.activate()
        with patch('portal.operations.record', side_effect=RuntimeError('audit unavailable')):
            with self.assertRaises(RuntimeError):
                self.book()
        self.assertEqual(Delivery.objects.count(), 0)
        self.assertEqual(operations.available_credits(self.account), 2)

    def test_csrf_required(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.alice)
        self.assertEqual(client.post('/inventory/new/', {}).status_code, 403)

    def test_support_and_profile_audit(self):
        self.client.post('/help/', {'subject': 'Callback', 'message': 'Please call', 'callback': True})
        self.assertEqual(self.account.support_requests.count(), 1)
        self.client.post('/account/', {'name': 'Alice', 'phone': '555', 'service_address': 'New', 'postal_code': '00000', 'marketing_consent': True})
        self.account.refresh_from_db()
        self.assertTrue(self.account.marketing_consent)
        self.assertTrue(Activity.objects.filter(action='Profile, address and preferences updated', account_id=self.account.pk).exists())

    def test_admin_pages(self):
        self.staff_login()
        for path in ['/admin/', '/admin/storage/tote/', '/admin/portal/offering/', '/admin/portal/servicewindow/', '/admin/portal/contract/', '/admin/storage/activity/']:
            self.assertEqual(self.client.get(path).status_code, 200, path)
        event = Activity.objects.first()
        self.assertEqual(self.client.post(f'/admin/storage/activity/{event.pk}/change/', {'action': 'tampered'}).status_code, 403)

    def test_no_customer_role_escalation(self):
        self.client.post('/account/', {'name': 'Alice', 'phone': '555', 'service_address': 'New', 'postal_code': '00000', 'role': 'administrator', 'is_staff': True})
        self.alice.refresh_from_db()
        self.assertFalse(self.alice.is_staff)
        self.assertFalse(Membership.objects.filter(user=self.alice).exists())


@override_settings(STRIPE_SECRET_KEY='sk_test_fixture', STRIPE_WEBHOOK_SECRET='whsec_fixture', AXES_ENABLED=False, STORAGES={'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}})
class BillingTests(FixtureMixin, TestCase):
    def test_no_credentials_has_explicit_failure(self):
        with override_settings(STRIPE_SECRET_KEY=''), self.assertRaises(billing.ProviderUnavailable):
            billing.options()

    def setup_provider(self, credits=0):
        contract = self.activate(credits)
        self.account.stripe_customer_id = 'cus_test'
        self.account.save()
        return contract

    def test_checkout_is_hosted_and_reused_without_duplicate_subscription(self):
        contract = billing.enroll(self.alice, self.account.pk, self.offering.pk, self.policy.pk)
        price = {'active': True, 'currency': 'usd', 'unit_amount': 100, 'recurring': {'interval': 'month', 'interval_count': 1}}
        session = StripeObject(id='cs_created', url='https://checkout.stripe.com/test', expires_at=int((timezone.now()+timedelta(hours=1)).timestamp()))
        with patch('stripe.Price.retrieve', return_value=price), patch('stripe.Customer.create', return_value=StripeObject(id='cus_test')), patch('stripe.checkout.Session.create', return_value=session) as create:
            first = billing.checkout(self.alice, self.account.pk)
            second = billing.checkout(self.alice, self.account.pk)
            self.assertEqual(first.pk, second.pk)
            self.assertEqual(create.call_count, 1)
            self.assertEqual(create.call_args.kwargs['customer'], 'cus_test')
            self.assertEqual(create.call_args.kwargs['mode'], 'subscription')
        contract.refresh_from_db()
        self.assertEqual(contract.status, 'pending')
        self.assertEqual(operations.available_credits(self.account), 0)

    def test_existing_provider_subscription_blocks_second_checkout(self):
        self.setup_provider()
        Contract.objects.filter(account=self.account).update(status='incomplete')
        with self.assertRaises(ValidationError):
            billing.checkout(self.alice, self.account.pk)

    def test_mismatched_price_cannot_charge_customer(self):
        billing.enroll(self.alice, self.account.pk, self.offering.pk, self.policy.pk)
        with patch('stripe.Price.retrieve', return_value={'active': True, 'currency': 'usd', 'unit_amount': 900}), self.assertRaises(ValidationError):
            billing.checkout(self.alice, self.account.pk)

    def send_event(self, event):
        payload = json.dumps(event).encode()
        stamp = int(time.time())
        signature = hmac.new(b'whsec_fixture', str(stamp).encode()+b'.'+payload, hashlib.sha256).hexdigest()
        return self.client.post('/stripe/webhook/', payload, content_type='application/json', HTTP_STRIPE_SIGNATURE=f't={stamp},v1={signature}')

    def invoice_event(self):
        return {'id': 'evt_invoice', 'type': 'invoice.paid', 'created': int(time.time()), 'data': {'object': {'id': 'in_test', 'customer': 'cus_test'}}}

    def provider_subscription(self):
        return StripeObject(id='sub_test', customer='cus_test', status='active', latest_invoice='in_test', current_period_end=int((timezone.now()+timedelta(days=30)).timestamp()), items={'data': []})

    def provider_invoice(self, status='paid'):
        end = int((timezone.now()+timedelta(days=30)).timestamp())
        return StripeObject(id='in_test', customer='cus_test', status=status, total=100, currency='usd', created=int(time.time()), subscription='sub_test', billing_reason='subscription_cycle', lines={'data': [{'period': {'end': end}}]})

    def test_signature_rejected(self):
        self.assertEqual(self.client.post('/stripe/webhook/', '{}', content_type='application/json').status_code, 400)

    def test_paid_invoice_verified_idempotent_and_snapshot_credits(self):
        contract = self.setup_provider()
        with patch('stripe.Invoice.retrieve', return_value=self.provider_invoice()), patch('stripe.Subscription.retrieve', return_value=self.provider_subscription()):
            self.assertEqual(self.send_event(self.invoice_event()).status_code, 200)
            self.assertEqual(self.send_event(self.invoice_event()).status_code, 200)
        self.assertEqual(WebhookEvent.objects.filter(provider_id='evt_invoice').count(), 1)
        self.assertEqual(operations.available_credits(self.account), 2)
        self.assertEqual(CreditGrant.objects.filter(account=self.account).count(), 1)
        self.assertTrue(Activity.objects.filter(provider_event_id='evt_invoice').exists())

    def test_out_of_order_failure_uses_current_invoice(self):
        self.setup_provider()
        event = self.invoice_event()
        event['type'] = 'invoice.payment_failed'
        with patch('stripe.Invoice.retrieve', return_value=self.provider_invoice('paid')), patch('stripe.Subscription.retrieve', return_value=self.provider_subscription()):
            billing.process_event(event)
        self.account.contract.refresh_from_db()
        self.assertEqual(self.account.contract.payment_status, 'paid')

    def test_real_failure_blocks_entitlements(self):
        self.setup_provider()
        with patch('stripe.Invoice.retrieve', return_value=self.provider_invoice('open')), patch('stripe.Subscription.retrieve', return_value=self.provider_subscription()):
            billing.process_event(self.invoice_event())
        self.account.contract.refresh_from_db()
        self.assertEqual(self.account.contract.payment_status, 'action_required')
        self.assertEqual(operations.available_credits(self.account), 0)
        with self.assertRaises(ValidationError):
            self.book()

    def test_unknown_provider_customer_cannot_link_account(self):
        self.setup_provider()
        event = self.invoice_event()
        event['data']['object']['customer'] = 'cus_foreign'
        billing.process_event(event)
        self.assertEqual(WebhookEvent.objects.get().outcome, 'unlinked')
        self.assertEqual(operations.available_credits(self.account), 0)

    def test_cancellation_keeps_stored_property(self):
        self.setup_provider()
        self.item.status = 'in_storage'
        self.item.save()
        with patch('stripe.Subscription.modify') as cancel:
            response = self.client.post('/billing/cancel/', {'confirm': 'yes', 'subscription_id': 'sub_foreign'})
            self.assertEqual(response.status_code, 302)
            self.assertEqual(cancel.call_args.args[0], 'sub_test')
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, 'in_storage')
        self.assertEqual(self.account.closure_status, 'open')

    def test_expired_checkout_releases_capacity(self):
        contract = self.setup_provider()
        delivery = self.book()
        attempt = Checkout.objects.create(account=self.account, contract=contract, delivery=delivery, stripe_session_id='cs_test', state='open')
        event = {'id': 'evt_expire', 'type': 'checkout.session.expired', 'created': int(time.time()), 'data': {'object': {'id': 'cs_test', 'customer': 'cus_test'}}}
        with patch('stripe.checkout.Session.retrieve', return_value=StripeObject(id='cs_test', customer='cus_test', status='expired', payment_status='unpaid')):
            billing.process_event(event)
        delivery.refresh_from_db()
        self.assertEqual(delivery.status, 'canceled')

    def test_paid_delivery_is_credit_not_auto_confirmation(self):
        contract = self.setup_provider()
        delivery = self.book()
        Checkout.objects.create(account=self.account, contract=contract, delivery=delivery, stripe_session_id='cs_test', state='open')
        event = {'id': 'evt_delivery', 'type': 'checkout.session.completed', 'created': int(time.time()), 'data': {'object': {'id': 'cs_test', 'customer': 'cus_test'}}}
        with patch('stripe.checkout.Session.retrieve', return_value=StripeObject(id='cs_test', customer='cus_test', status='complete', payment_status='paid', payment_intent='pi_test')):
            billing.process_event(event)
            billing.process_event(event)
        delivery.refresh_from_db()
        self.assertEqual(delivery.status, 'requested')
        self.assertEqual(delivery.reserved_credits, 1)
        self.assertEqual(operations.available_credits(self.account), 0)

    def test_refund_before_checkout_does_not_issue_credits(self):
        contract = self.setup_provider()
        delivery = self.book()
        Checkout.objects.create(account=self.account, contract=contract, delivery=delivery, stripe_session_id='cs_refund', state='open')
        session = StripeObject(id='cs_refund', customer='cus_test', status='complete', payment_status='paid', payment_intent={'id': 'pi_refund', 'latest_charge': {'refunded': True}})
        event = {'id': 'evt_refunded_first', 'type': 'checkout.session.completed', 'created': int(time.time()), 'data': {'object': {'id': 'cs_refund', 'customer': 'cus_test'}}}
        with patch('stripe.checkout.Session.retrieve', return_value=session):
            billing.process_event(event)
        self.assertEqual(operations.available_credits(self.account), 0)
        delivery.refresh_from_db()
        self.assertEqual(delivery.status, 'canceled')

    def test_provider_failure_leaves_event_retryable(self):
        import stripe
        self.setup_provider()
        with patch('stripe.Invoice.retrieve', side_effect=stripe.APIConnectionError('test failure')):
            self.assertEqual(self.send_event(self.invoice_event()).status_code, 503)
        self.assertFalse(WebhookEvent.objects.filter(provider_id='evt_invoice').exists())

    def test_refund_blocks_new_bookings_until_audited_review(self):
        contract = self.setup_provider()
        delivery = self.book()
        operations.issue_credits(self.account, 1, 'Visit', 'checkout:cs_paid', timezone.now()+timedelta(days=30))
        Checkout.objects.create(account=self.account, contract=contract, delivery=delivery, stripe_session_id='cs_paid', stripe_payment_id='pi_paid', state='paid')
        event = {'id': 'evt_refund', 'type': 'charge.refunded', 'created': int(time.time()), 'data': {'object': {'id': 'ch_paid', 'customer': 'cus_test'}}}
        with patch('stripe.Charge.retrieve', return_value=StripeObject(id='ch_paid', customer='cus_test', payment_intent='pi_paid', refunded=True, amount_refunded=50)):
            billing.process_event(event)
        self.account.refresh_from_db()
        self.assertTrue(self.account.billing_review_required)
        self.assertEqual(operations.available_credits(self.account), 0)
        with self.assertRaises(ValidationError):
            self.book()


@override_settings(AXES_ENABLED=False, ACCOUNT_RATE_LIMITS={}, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', STORAGES={'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}})
class AuthenticationTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_signup_requires_verification_and_cannot_create_staff(self):
        response = self.client.post('/accounts/signup/', {'username': 'newcustomer', 'email': 'new@example.invalid', 'password1': 'Long-test-password-89', 'password2': 'Long-test-password-89', 'is_staff': True, 'role': 'administrator'})
        self.assertEqual(response.status_code, 302)
        user = get_user_model().objects.get(username='newcustomer')
        self.assertFalse(user.is_staff)
        self.assertFalse(EmailAddress.objects.get(user=user).verified)
        self.assertEqual(Account.objects.filter(customer__user=user).count(), 1)
        self.assertTrue(mail.outbox)
        self.assertNotIn('_auth_user_id', self.client.session)
        self.assertTrue(Activity.objects.filter(action='Account registered', actor=user).exists())

    def test_unverified_session_is_blocked(self):
        user = get_user_model().objects.create_user('unverified', 'new@example.invalid')
        self.client.force_login(user)
        self.assertEqual(self.client.get('/inventory/').status_code, 302)
        self.assertIn('/email/', self.client.get('/inventory/').url)

    def test_mfa_encryption_and_staff_last_factor_protection(self):
        user = get_user_model().objects.create_superuser('staff', 'staff@example.invalid', None)
        secret = generate_totp_secret()
        auth = TOTP.activate(user, secret).instance
        self.assertNotIn(secret, json.dumps(auth.data))
        self.assertEqual(MFAAdapter().decrypt(auth.data['secret']), secret)
        self.assertFalse(MFAAdapter().can_delete_authenticator(auth))

    def test_password_reset_email(self):
        user = get_user_model().objects.create_user('recover', 'recover@example.invalid', 'Long-test-password-12')
        EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=True)
        response = self.client.post('/accounts/password/reset/', {'email': user.email})
        self.assertEqual(response.status_code, 302)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('/accounts/password/reset/key/', mail.outbox[0].body)

    def test_staff_requires_real_mfa_challenge(self):
        from allauth.mfa.totp.internal.auth import hotp_value, format_hotp_value
        user = get_user_model().objects.create_superuser('mfa_staff', 'mfa@example.invalid', 'Long-test-password-23')
        EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=True)
        secret = generate_totp_secret()
        TOTP.activate(user, secret)
        response = self.client.post('/accounts/login/', {'login': user.username, 'password': 'Long-test-password-23'})
        self.assertEqual(response.status_code, 302)
        self.assertNotIn('_auth_user_id', self.client.session)
        code = format_hotp_value(hotp_value(secret, int(time.time())//30))
        response = self.client.post('/accounts/2fa/authenticate/', {'code': code})
        self.assertEqual(response.status_code, 302)
        self.assertEqual(self.client.get('/octagon/').status_code, 200)
        self.assertTrue(Activity.objects.filter(actor=user, action='MFA challenge completed').exists())

    @override_settings(AXES_ENABLED=True, AXES_FAILURE_LIMIT=3)
    def test_username_and_email_share_login_lockout(self):
        user = get_user_model().objects.create_user('limited', 'limited@example.invalid', 'Long-test-password-78')
        EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=True)
        for identity in [user.username, user.email, user.username, user.email]:
            response = self.client.post('/accounts/login/', {'login': identity, 'password': 'wrong'})
        self.assertEqual(response.status_code, 429)
        self.assertTrue(Activity.objects.filter(actor=user, action='Authentication denied').exists())


class ProductionSettingsTests(SimpleTestCase):
    def environment(self):
        env = os.environ.copy()
        env.update(DEBUG='false', USE_SQLITE='true', SECRET_KEY='test-only-'+('x'*64), POSTGRES_PASSWORD='test-only', ALLOWED_HOSTS='portal.example.invalid', CSRF_TRUSTED_ORIGINS='https://portal.example.invalid', EMAIL_HOST='smtp.example.invalid', DEFAULT_FROM_EMAIL='portal@example.com', EMAIL_BACKEND='django.core.mail.backends.smtp.EmailBackend', MFA_ENCRYPTION_KEY='MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=', PUBLIC_BASE_URL='https://portal.example.invalid', STRIPE_SECRET_KEY='sk_test_fixture', STRIPE_WEBHOOK_SECRET='whsec_fixture')
        return env

    def test_production_defaults_and_missing_secrets(self):
        result = subprocess.run([sys.executable, '-c', 'from config import settings as s; assert s.SESSION_COOKIE_SECURE and s.CSRF_COOKIE_SECURE and s.SECURE_SSL_REDIRECT; assert "postgresql" in s.DATABASES["default"]["ENGINE"]'], env=self.environment(), capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        for key in ['SECRET_KEY', 'POSTGRES_PASSWORD', 'MFA_ENCRYPTION_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'PUBLIC_BASE_URL']:
            env = self.environment()
            env[key] = ''
            result = subprocess.run([sys.executable, '-c', 'import config.settings'], env=env, capture_output=True, timeout=10)
            self.assertNotEqual(result.returncode, 0, key)


@skipUnless(connection.vendor == 'postgresql', 'PostgreSQL row-lock test runs in CI')
class ReservationConcurrencyTests(TransactionTestCase):
    def test_same_credit_and_capacity_cannot_be_double_spent(self):
        alice, bob, steward, admin, area, offering, policy, window, item, other = fixtures()
        account = alice.customer.portal_account
        contract = billing.enroll(alice, account.pk, offering.pk, policy.pk)
        contract.status = 'active'
        contract.payment_status = 'paid'
        contract.save()
        operations.issue_credits(account, 1, 'Visit', 'concurrent', timezone.now()+timedelta(days=30))
        window.capacity = 1
        window.save()
        barrier = Barrier(2)
        def submit():
            close_old_connections()
            try:
                actor = get_user_model().objects.get(pk=alice.pk)
                barrier.wait(timeout=10)
                try:
                    operations.book(actor, account.pk, 'pickup', window.pk, [item.pk], 'Example', '00000')
                    return 'booked'
                except ValidationError:
                    return 'conflict'
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(submit) for _ in range(2)]
            self.assertCountEqual([future.result(timeout=30) for future in futures], ['booked', 'conflict'])
        self.assertEqual(Delivery.objects.count(), 1)
        self.assertEqual(operations.available_credits(account), 0)
