from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, transaction
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from .models import Activity, Customer, Plan, ServiceRequest, Subscription, Tote
from .services import bulk_move, create_request, save_tote, transition_request
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless
from django.db import close_old_connections, connection
from django.test import SimpleTestCase, TransactionTestCase
import os
import subprocess
import sys


@override_settings(STORAGES={'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'}, 'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}})
class PortalTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_superuser('operator', 'operator@example.invalid', 'long-testing-password-12')
        self.alice = User.objects.create_user('alice', 'alice@example.invalid', 'long-testing-password-12')
        self.bob = User.objects.create_user('bob', 'bob@example.invalid', 'long-testing-password-12')
        self.a = Customer.objects.create(user=self.alice, name='Alice Example', email=self.alice.email, service_address='1 Example Lane', admin_notes='PRIVATE-NOTE')
        self.b = Customer.objects.create(user=self.bob, name='Bob Example', email=self.bob.email, service_address='2 Example Lane')
        self.tote = Tote.objects.create(customer=self.a, label='TEST-A', location='PRIVATE-LOCATION')
        self.other = Tote.objects.create(customer=self.b, label='TEST-B')
        self.tomorrow = timezone.localdate() + timedelta(days=1)
        self.appointment = timezone.now() + timedelta(days=2)
        self.client.force_login(self.alice)

    def service(self, tote=None, kind='collection'):
        return create_request(self.alice, self.a.pk, [(tote or self.tote).pk], kind, self.tomorrow, 'Afternoon')

    def test_customer_pages_and_private_data(self):
        for path in ['/', '/totes/', f'/totes/{self.tote.pk}/', '/requests/', '/requests/new/', '/profile/']:
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200, path)
            self.assertNotContains(response, 'PRIVATE-NOTE')
            self.assertNotContains(response, 'PRIVATE-LOCATION')
            self.assertNotContains(response, 'TEST-B')

    def test_direct_url_and_post_isolation(self):
        service = create_request(self.bob, self.b.pk, [self.other.pk], 'collection', self.tomorrow, 'AM')
        for path in [f'/totes/{self.other.pk}/', f'/requests/{service.pk}/']:
            self.assertEqual(self.client.get(path).status_code, 404)
        self.assertEqual(self.client.post(f'/totes/{self.other.pk}/', {'nickname': 'stolen'}).status_code, 404)
        self.assertEqual(self.client.post(f'/requests/{service.pk}/cancel/').status_code, 404)
        self.other.refresh_from_db()
        self.assertEqual(self.other.nickname, '')

    def test_admin_only_operations(self):
        for path in ['/operations/', '/operations/export/customers/', '/operations/export/totes/']:
            self.assertEqual(self.client.get(path).status_code, 403)
        self.client.force_login(self.admin)
        for path in ['/operations/', '/operations/export/customers/', '/operations/export/totes/', '/admin/storage/tote/', '/admin/storage/customer/']:
            self.assertEqual(self.client.get(path).status_code, 200, path)

    def test_customer_cannot_inject_operational_fields(self):
        response = self.client.post(f'/totes/{self.tote.pk}/', {'nickname': 'Winter', 'description': 'Lights', 'customer': self.b.pk, 'status': 'in_storage', 'admin_notes': 'injected'})
        self.assertEqual(response.status_code, 302)
        self.tote.refresh_from_db()
        self.assertEqual(self.tote.nickname, 'Winter')
        self.assertEqual(self.tote.customer, self.a)
        self.assertEqual(self.tote.status, 'with_customer')
        self.assertEqual(self.tote.admin_notes, '')

    def test_request_form_rejects_foreign_tote(self):
        response = self.client.post('/requests/new/', {'kind': 'collection', 'totes': [self.other.pk], 'preferred_date': self.tomorrow, 'preferred_window': 'AM'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(ServiceRequest.objects.count(), 0)

    def test_request_validation(self):
        for ids, kind, day in [([], 'collection', self.tomorrow), ([self.other.pk], 'collection', self.tomorrow), ([self.tote.pk], 'return', self.tomorrow), ([self.tote.pk], 'invalid', self.tomorrow), ([self.tote.pk], 'collection', self.tomorrow-timedelta(days=2))]:
            with self.assertRaises(ValidationError):
                create_request(self.alice, self.a.pk, ids, kind, day, 'AM')
        with self.assertRaises(PermissionDenied):
            create_request(self.alice, self.b.pk, [self.other.pk], 'collection', self.tomorrow, 'AM')

    def test_conflicting_requests_and_cancellation(self):
        service = self.service()
        with self.assertRaises(ValidationError):
            self.service()
        transition_request(self.alice, service.pk, 'canceled')
        self.service()

    def test_full_collection_and_return_lifecycle(self):
        service = self.service()
        self.assertIsNone(service.appointment)
        with self.assertRaises(ValidationError):
            transition_request(self.admin, service.pk, 'completed')
        with self.assertRaises(ValidationError):
            transition_request(self.admin, service.pk, 'confirmed')
        with self.assertRaises(PermissionDenied):
            transition_request(self.alice, service.pk, 'confirmed', self.appointment)
        transition_request(self.admin, service.pk, 'confirmed', self.appointment)
        self.tote.refresh_from_db()
        self.assertEqual(self.tote.status, 'pickup_scheduled')
        with self.assertRaises(PermissionDenied):
            transition_request(self.alice, service.pk, 'canceled')
        bulk_move(self.admin, [self.tote.pk], 'in_transit')
        with self.assertRaises(ValidationError):
            transition_request(self.admin, service.pk, 'canceled')
        transition_request(self.admin, service.pk, 'completed')
        self.tote.refresh_from_db()
        self.assertEqual(self.tote.status, 'in_storage')
        returning = self.service(kind='return')
        transition_request(self.admin, returning.pk, 'confirmed', self.appointment)
        transition_request(self.admin, returning.pk, 'completed')
        self.tote.refresh_from_db()
        self.assertEqual(self.tote.status, 'with_customer')
        self.assertEqual(self.tote.location, '')
        self.assertEqual(self.tote.history.count(), 5)
        self.assertTrue(Activity.objects.filter(record_type='servicerequest', action='Request completed').exists())

    def test_confirmed_cancel_restores_status(self):
        service = self.service()
        transition_request(self.admin, service.pk, 'confirmed', self.appointment)
        transition_request(self.admin, service.pk, 'canceled')
        self.tote.refresh_from_db()
        self.assertEqual(self.tote.status, 'with_customer')

    def test_assignment_and_duplicates(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Tote.objects.create(label=self.tote.label)
        self.service()
        self.tote.customer = self.b
        with self.assertRaises(ValidationError):
            save_tote(self.admin, self.tote)
        with self.assertRaises(PermissionDenied):
            save_tote(self.alice, self.other)
        self.b.status = 'suspended'
        self.b.save()
        new = Tote(customer=self.b)
        with self.assertRaises(ValidationError):
            save_tote(self.admin, new)

    def test_history_and_bulk_atomicity(self):
        self.tote.nickname = 'Snow'
        save_tote(self.admin, self.tote)
        self.tote.location = 'RACK-2'
        save_tote(self.admin, self.tote)
        self.assertEqual(self.tote.history.count(), 1)
        self.service()
        with self.assertRaises(ValidationError):
            bulk_move(self.admin, [self.other.pk, self.tote.pk], 'retired')
        self.other.refresh_from_db()
        self.assertEqual(self.other.status, 'with_customer')

    def test_subscription_preserves_agreed_price(self):
        plan = Plan.objects.first()
        subscription = Subscription.objects.create(customer=self.a, plan=plan, start_date=timezone.localdate(), renewal_date=self.tomorrow, agreed_annual_price='149.00')
        plan.annual_price = '999.00'
        plan.save()
        subscription.refresh_from_db()
        self.assertEqual(subscription.agreed_annual_price, Decimal('149.00'))

    def test_profile_sync_and_address_snapshot(self):
        service = self.service()
        self.client.post('/profile/', {'name': 'New name', 'email': 'new@example.invalid', 'phone': '555', 'service_address': 'New address', 'status': 'suspended'})
        self.alice.refresh_from_db()
        self.a.refresh_from_db()
        service.refresh_from_db()
        self.assertEqual(self.alice.email, 'new@example.invalid')
        self.assertEqual(self.a.status, 'active')
        self.assertEqual(service.address_snapshot, '1 Example Lane')

    def test_csrf_and_login_required(self):
        client = Client(enforce_csrf_checks=True)
        self.assertEqual(client.get('/totes/').status_code, 302)
        client.force_login(self.alice)
        self.assertEqual(client.post(f'/totes/{self.tote.pk}/', {'nickname': 'x'}).status_code, 403)
        self.assertEqual(self.client.get('/requests/999/cancel/').status_code, 405)

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_password_reset(self):
        response = self.client.post('/accounts/password_reset/', {'email': self.alice.email})
        self.assertEqual(response.status_code, 302)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('/accounts/reset/', mail.outbox[0].body)

    def test_login_rate_limit(self):
        client = Client()
        for _ in range(6):
            response = client.post('/accounts/login/', {'username': 'alice', 'password': 'wrong'})
        self.assertEqual(response.status_code, 429)
        response = client.post('/accounts/login/', {'username': 'alice', 'password': 'long-testing-password-12'})
        self.assertEqual(response.status_code, 429)

    def test_admin_request_screen(self):
        service = self.service()
        self.client.force_login(self.admin)
        self.assertEqual(self.client.get(f'/operations/requests/{service.pk}/').status_code, 200)
        self.assertEqual(self.client.get(f'/admin/storage/servicerequest/{service.pk}/change/').status_code, 200)

    def test_csv_formula_escaping(self):
        self.a.name = '=SUM(1,2)'
        self.a.save()
        self.client.force_login(self.admin)
        self.assertIn("'=SUM", self.client.get('/operations/export/customers/').content.decode())

    def test_suspended_customer_denied(self):
        self.a.status = 'suspended'
        self.a.save()
        self.assertEqual(self.client.get('/').status_code, 404)
        with self.assertRaises(ValidationError):
            self.service()

    def test_health(self):
        self.assertEqual(self.client.get('/health/').json(), {'status': 'ok'})


@skipUnless(connection.vendor == 'postgresql', 'Requires PostgreSQL row locks; exercised in CI')
class ConcurrencyTests(TransactionTestCase):
    def test_simultaneous_requests_reserve_tote_once(self):
        user = get_user_model().objects.create_user('concurrent')
        customer = Customer.objects.create(user=user, name='Concurrent Example', email='test@example.invalid', service_address='Example')
        tote = Tote.objects.create(customer=customer)
        barrier = Barrier(2)

        def submit():
            close_old_connections()
            try:
                actor = get_user_model().objects.get(pk=user.pk)
                barrier.wait(timeout=10)
                try:
                    create_request(actor, customer.pk, [tote.pk], 'collection', timezone.localdate() + timedelta(days=1), 'AM')
                    return 'created'
                except ValidationError:
                    return 'conflict'
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(submit) for _ in range(2)]
            results = [future.result(timeout=30) for future in futures]
        self.assertCountEqual(results, ['created', 'conflict'])
        self.assertEqual(ServiceRequest.objects.count(), 1)


class ProductionSettingsTests(SimpleTestCase):
    def production_env(self):
        env = os.environ.copy()
        env.update(DEBUG='false', USE_SQLITE='true', SECRET_KEY='test-only-' + 'x' * 64, POSTGRES_PASSWORD='test-only', ALLOWED_HOSTS='portal.example.invalid', CSRF_TRUSTED_ORIGINS='https://portal.example.invalid', EMAIL_HOST='smtp.example.invalid', DEFAULT_FROM_EMAIL='portal@example.com', EMAIL_BACKEND='django.core.mail.backends.smtp.EmailBackend')
        return env

    def test_safe_production_defaults(self):
        code = 'from config import settings as s; assert not s.DEBUG; assert s.SESSION_COOKIE_SECURE and s.CSRF_COOKIE_SECURE and s.SECURE_SSL_REDIRECT; assert s.DATABASES["default"]["ENGINE"] == "django.db.backends.postgresql"'
        result = subprocess.run([sys.executable, '-c', code], env=self.production_env(), capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_secrets_and_unsafe_hosts_fail_closed(self):
        for key, value in [('SECRET_KEY', ''), ('POSTGRES_PASSWORD', ''), ('ALLOWED_HOSTS', '*'), ('CSRF_TRUSTED_ORIGINS', 'http://example.com'), ('EMAIL_HOST', '')]:
            env = self.production_env()
            env[key] = value
            result = subprocess.run([sys.executable, '-c', 'import config.settings'], env=env, capture_output=True, text=True, timeout=10)
            self.assertNotEqual(result.returncode, 0, key)
            self.assertIn('ImproperlyConfigured', result.stderr)
