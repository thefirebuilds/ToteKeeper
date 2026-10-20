from datetime import timedelta
from io import StringIO
from unittest.mock import patch
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from . import billing, operations
from .agreement import ACKNOWLEDGMENTS, VERSION, TERMS, PACKING, PACKING_VERSION
from .forms import EnrollmentForm
from .models import Acceptance, Contract, NotificationJob, Offering, Policy
from .service_cycles import grant_service_year, anniversary, queue_renewal_reminders
from .tests import FixtureMixin, StripeObject


@override_settings(STORAGE_AGREEMENT_FINALIZED=True, STRIPE_SECRET_KEY='sk_test_fixture', AXES_ENABLED=False,
                   EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
                   STORAGES={'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}})
class AgreementBillingTests(FixtureMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.policy = Policy.objects.create(version=VERSION, terms=TERMS, cancellation=TERMS.split('8. Cancellation, nonrenewal, and final return', 1)[1].split('9. Storage conditions', 1)[0],
                                            packing_version=PACKING_VERSION, packing_terms=PACKING, active=True)
        self.offering = Offering.objects.create(name='Small', version=VERSION, agreement_version=VERSION,
            service_model='annual_cycle', price_cents=1495, setup_fee_cents=2500,
            stripe_price_id='price_month', stripe_setup_price_id='price_setup', stripe_delivery_price_id='price_trip',
            state='active', interval='month', capacity=10, storage_allowance=2, included_credits=2,
            credit_definition='One packed collection and return per service year', extra_delivery_cents=5000, tax_mode='none')

    def enroll(self, **changes):
        consents = {key: True for key in ACKNOWLEDGMENTS}
        consents.update(changes)
        return billing.enroll(self.alice, self.account.pk, self.offering.pk, self.policy.pk, **consents)

    def paid_contract(self):
        contract = self.enroll()
        contract.status, contract.payment_status = 'active', 'paid'
        contract.service_started_at = timezone.now()
        contract.paid_through = timezone.now() + timedelta(days=30)
        contract.save()
        grant_service_year(contract, contract.service_started_at)
        return contract

    def test_every_acknowledgment_required_in_form_and_service(self):
        data = dict(offering=self.offering.pk, policy_id=self.policy.pk, **{key: True for key in ACKNOWLEDGMENTS})
        for key in ACKNOWLEDGMENTS:
            with self.subTest(key=key):
                form = EnrollmentForm({**data, key: False})
                self.assertFalse(form.is_valid())
                self.assertIn(key, form.errors)
                with self.assertRaises(ValidationError):
                    self.enroll(**{key: False})
                self.assertFalse(Contract.objects.exists())
                self.assertNotIn('checked', EnrollmentForm()[key].as_widget())

    def test_real_enrollment_shows_four_controls_prices_and_download_before_acceptance(self):
        response = self.client.get('/enroll/')
        self.assertContains(response, 'USD 14.95 / month')
        self.assertContains(response, 'USD 25.00')
        self.assertContains(response, 'USD 39.95')  # first payment including setup
        self.assertContains(response, VERSION)
        for key in ACKNOWLEDGMENTS:
            self.assertNotIn('checked', response.context['form'][key].as_widget())
        download = self.client.get(f'/enroll/documents/{self.policy.pk}/')
        self.assertEqual(download.status_code, 200)
        self.assertIn(PACKING, download.content.decode())
        data = dict(offering=self.offering.pk, policy_id=self.policy.pk, **{key: True for key in ACKNOWLEDGMENTS})
        self.assertEqual(self.client.post('/enroll/', data).status_code, 302)
        self.assertEqual(Acceptance.objects.filter(account=self.account).count(), 1)

    def test_public_plan_hint_selects_active_annual_offer_without_acceptance(self):
        annual = Offering.objects.create(name='Small', version=VERSION+'-year', price_cents=12500,
            interval='year', storage_allowance=2, capacity=10, state='active', credit_definition='One annual cycle')
        response = self.client.get('/enroll/?plan=small&billing=year')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context['form'].initial['offering'], annual.pk)
        self.assertFalse(Acceptance.objects.filter(account=self.account).exists())
        self.assertFalse(Contract.objects.filter(account=self.account).exists())

    def test_acceptance_retains_order_packing_actor_and_all_four_controls(self):
        contract = self.enroll()
        acceptance = Acceptance.objects.get(contract=contract)
        self.assertEqual(acceptance.accepted_by, self.alice)
        self.assertEqual(acceptance.acknowledgments, ACKNOWLEDGMENTS)
        self.assertEqual(acceptance.packing_snapshot, PACKING)
        self.assertEqual(acceptance.order_snapshot['setup_fee_cents'], 2500)
        self.assertEqual(acceptance.order_snapshot['price_cents'], 1495)
        self.enroll()
        self.assertEqual(Acceptance.objects.filter(contract=contract).count(), 1)
        with self.assertRaises(ValidationError):
            acceptance.save()
        response = self.client.get(f'/billing/agreements/{acceptance.pk}/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('no-store', response['Cache-Control'])
        self.assertIn(TERMS, response.content.decode())
        self.client.force_login(self.bob, backend='django.contrib.auth.backends.ModelBackend')
        self.assertEqual(self.client.get(f'/billing/agreements/{acceptance.pk}/').status_code, 404)

    def checkout(self, setup_amount=2500):
        def price(key, **kwargs):
            return {'active': True, 'currency': 'usd', 'unit_amount': 1495 if key == 'price_month' else setup_amount,
                    'recurring': {'interval': 'month', 'interval_count': 1} if key == 'price_month' else None}
        session = StripeObject(id='cs_setup', url='https://checkout.stripe.com/test', expires_at=int((timezone.now()+timedelta(hours=1)).timestamp()))
        with patch('stripe.Price.retrieve', side_effect=price), patch('stripe.Customer.create', return_value=StripeObject(id='cus_test')), patch('stripe.checkout.Session.create', return_value=session) as create:
            result = billing.checkout(self.alice, self.account.pk)
            return result, create.call_args.kwargs

    def test_monthly_checkout_charges_setup_once_and_is_idempotent(self):
        self.enroll()
        first, arguments = self.checkout()
        self.assertEqual(arguments['line_items'], [{'price': 'price_month', 'quantity': 1}, {'price': 'price_setup', 'quantity': 1}])
        with patch('stripe.checkout.Session.create') as create:
            self.assertEqual(billing.checkout(self.alice, self.account.pk).pk, first.pk)
            create.assert_not_called()

    def test_wrong_setup_price_and_missing_acceptance_cannot_charge(self):
        contract = self.enroll()
        with patch('stripe.checkout.Session.create') as create, self.assertRaisesMessage(ValidationError, 'setup pricing'):
            self.checkout(setup_amount=1)
        create.assert_not_called()
        Acceptance.objects.filter(contract=contract).update(acknowledgments={})
        with self.assertRaisesMessage(ValidationError, 'separate liability acknowledgment'):
            billing.checkout(self.alice, self.account.pk)

    def test_annual_checkout_has_no_setup(self):
        self.offering.interval, self.offering.price_cents = 'year', 12500
        self.offering.setup_fee_cents, self.offering.stripe_setup_price_id = 0, ''
        self.offering.save()
        self.enroll()
        with patch('stripe.Price.retrieve', return_value={'active': True, 'currency': 'usd', 'unit_amount': 12500, 'recurring': {'interval': 'year', 'interval_count': 1}}), patch('stripe.Customer.create', return_value=StripeObject(id='cus_test')), patch('stripe.checkout.Session.create', return_value=StripeObject(id='cs_year', url='https://checkout.stripe.com/test', expires_at=int((timezone.now()+timedelta(hours=1)).timestamp()))) as create:
            billing.checkout(self.alice, self.account.pk)
        self.assertEqual(len(create.call_args.kwargs['line_items']), 1)

    def test_monthly_payments_do_not_refresh_visits_until_service_anniversary(self):
        contract = self.paid_contract()
        grant_service_year(contract, contract.service_started_at + timedelta(days=30))
        grant_service_year(contract, contract.service_started_at + timedelta(days=60))
        self.assertEqual(self.account.credit_grants.count(), 2)
        grant_service_year(contract, anniversary(contract.service_started_at))
        self.assertEqual(self.account.credit_grants.count(), 4)

    def test_collection_does_not_consume_return_and_partial_return_consumes_visit(self):
        self.paid_contract()
        delivery = self.book()
        operations.transition(self.admin, delivery.pk, 'confirmed')
        operations.transition(self.admin, delivery.pk, 'in_progress')
        operations.transition(self.admin, delivery.pk, 'completed')
        returned = operations.book(self.alice, self.account.pk, 'return', self.window.pk, [self.item.pk], 'Fictional Example Address', '00000')
        self.assertEqual(returned.extra_cents, 0)
        operations.transition(self.alice, returned.pk, 'canceled')
        self.assertEqual(operations.available_credits(self.account), 1)

    def test_extra_round_trip_funds_both_legs_at_same_address(self):
        contract = self.paid_contract()
        from .models import Checkout
        from .service_cycles import grant_extra_cycle
        delivery = self.book()
        attempt = Checkout.objects.create(account=self.account, contract=contract, delivery=delivery, stripe_session_id='cs_extra')
        grant_extra_cycle(contract, attempt, delivery)
        self.assertEqual(self.account.credit_grants.filter(source__startswith='checkout:cs_extra:').count(), 2)
        self.assertEqual(set(self.account.credit_grants.filter(source__startswith='checkout:cs_extra:').values_list('service_address', flat=True)), {'Fictional Example Address'})

    def test_final_return_remains_free_after_paid_term_and_exhausted_visits(self):
        contract = self.paid_contract()
        self.account.credit_grants.update(expires_at=timezone.now() - timedelta(days=1))
        contract.status = 'canceled'
        contract.paid_through = timezone.now() - timedelta(days=1)
        contract.cancellation_requested_at = timezone.now() - timedelta(days=5)
        contract.save()
        self.item.status = 'in_storage'
        self.item.save()
        delivery = operations.book(self.alice, self.account.pk, 'return', self.window.pk, [self.item.pk], 'Fictional Example Address', '00000')
        self.assertTrue(delivery.final_return)
        self.assertEqual(delivery.extra_cents, 0)
        operations.transition(self.admin, delivery.pk, 'confirmed')
        operations.transition(self.admin, delivery.pk, 'in_progress')
        operations.transition(self.admin, delivery.pk, 'completed')
        contract.refresh_from_db()
        self.assertIsNotNone(contract.final_return_completed_at)

    def test_annual_reminder_is_queued_once_with_price_and_cancellation_method(self):
        contract = self.paid_contract()
        contract.terms['interval'] = 'year'
        contract.terms['price_cents'] = 12500
        contract.renewal_at = timezone.now() + timedelta(days=30, hours=12)
        contract.save()
        queue_renewal_reminders()
        queue_renewal_reminders()
        jobs = NotificationJob.objects.filter(key__startswith='annual-renewal:')
        self.assertEqual(jobs.count(), 1)
        self.assertIn('125.00', jobs.get().message)
        self.assertIn('Cancel subscription', jobs.get().message)

    def test_offer_and_policy_changes_require_new_version_after_acceptance(self):
        self.enroll()
        self.offering.setup_fee_cents = 100
        with self.assertRaises(ValidationError):
            self.offering.full_clean()
        self.policy.packing_terms = 'Changed'
        with self.assertRaises(ValidationError):
            self.policy.full_clean()

    def test_verified_monthly_invoices_confirm_order_without_refreshing_visits(self):
        contract = self.enroll()
        self.account.stripe_customer_id = 'cus_new'
        self.account.save()
        contract.stripe_subscription_id = 'sub_new'
        contract.save()
        start = int(timezone.now().timestamp())
        for index in [0, 1]:
            period_start = start + index * 30 * 86400
            period_end = period_start + 30 * 86400
            subscription = StripeObject(id='sub_new', customer='cus_new', status='active', start_date=start,
                latest_invoice=f'in_{index}', current_period_end=period_end,
                items={'data': [{'price': {'id': 'price_month'}, 'quantity': 1}]})
            invoice = StripeObject(id=f'in_{index}', customer='cus_new', status='paid', total=3995 if not index else 1495,
                currency='usd', created=period_start, subscription='sub_new', billing_reason='subscription_create' if not index else 'subscription_cycle',
                lines={'data': [{'period': {'start': period_start, 'end': period_end}}]})
            event = {'id': f'evt_new_{index}', 'type': 'invoice.paid', 'created': period_start,
                     'data': {'object': {'id': invoice.id, 'customer': 'cus_new'}}}
            with patch('stripe.Invoice.retrieve', return_value=invoice), patch('stripe.Subscription.retrieve', return_value=subscription):
                billing.process_event(event)
                billing.process_event(event)
        contract.refresh_from_db()
        self.assertEqual(contract.payment_status, 'paid')
        self.assertEqual(self.account.credit_grants.count(), 2)
        self.assertEqual(NotificationJob.objects.filter(key=f'order-confirmed:{contract.pk}').count(), 1)
        self.assertEqual(int(contract.paid_through.timestamp()), period_end)

    def test_future_year_grants_do_not_become_spendable_early(self):
        contract = self.paid_contract()
        for grant in self.account.credit_grants.all():
            operations.LedgerEntry.objects.create(grant=grant, kind='consume', available_delta=-1, reason='Prior year visit')
        grant_service_year(contract, anniversary(contract.service_started_at))
        self.assertEqual(operations.available_credits(self.account), 0)

    def test_profile_changes_require_reviewing_updated_order(self):
        self.enroll()
        self.alice.customer.service_address = 'Changed service address'
        self.alice.customer.save()
        with self.assertRaisesMessage(ValidationError, 'address changed'):
            billing.checkout(self.alice, self.account.pk)
        self.enroll()
        self.assertEqual(Acceptance.objects.filter(account=self.account).count(), 2)

    def test_publisher_validates_prices_without_provisioning_or_overwriting_contracts(self):
        import json
        import tempfile
        from pathlib import Path
        from .agreement import CATALOG
        contract = self.paid_contract()
        original_terms = dict(contract.terms)
        mapping, prices = {}, {}
        for plan, (name, units, monthly, setup, annual) in CATALOG.items():
            for interval in ['month', 'year']:
                key = f'{plan}_{interval}'
                mapping[key] = {'capacity': 5, 'tax_mode': 'none', 'stripe_price_id': key, 'stripe_delivery_price_id': 'trip'}
                prices[key] = {'active': True, 'currency': 'usd', 'unit_amount': monthly if interval == 'month' else annual, 'recurring': {'interval': interval, 'interval_count': 1}}
                if interval == 'month':
                    mapping[key]['stripe_setup_price_id'] = f'{plan}_setup'
                    prices[f'{plan}_setup'] = {'active': True, 'currency': 'usd', 'unit_amount': setup}
        prices['trip'] = {'active': True, 'currency': 'usd', 'unit_amount': 5000}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'catalog.json'
            path.write_text(json.dumps(mapping))
            with patch('stripe.Price.retrieve', side_effect=lambda key, **kwargs: prices[key]), patch('stripe.Price.create') as create:
                call_command('configure_storage_enrollment', catalog=str(path), stdout=StringIO())
                self.assertEqual(Offering.objects.filter(service_model='annual_cycle').count(), 1)
                call_command('configure_storage_enrollment', catalog=str(path), publish=True, stdout=StringIO())
                call_command('configure_storage_enrollment', catalog=str(path), publish=True, stdout=StringIO())
                create.assert_not_called()
        self.assertEqual(Offering.objects.filter(state='active').count(), 6)
        contract.refresh_from_db()
        self.assertEqual(contract.terms, original_terms)

    def test_empty_handoff_record_requires_staff_and_is_not_repeatable(self):
        contract = self.paid_contract()
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            call_command('record_package_handling', account=self.account.pk, actor=self.alice.username,
                         kind='initial-empty-delivery', reason='Handoff record', stdout=StringIO())
        call_command('record_package_handling', account=self.account.pk, actor=self.admin.username,
                     kind='initial-empty-delivery', reason='Handoff record', stdout=StringIO())
        contract.refresh_from_db()
        self.assertIsNotNone(contract.initial_empty_delivered_at)
        with self.assertRaises(CommandError):
            call_command('record_package_handling', account=self.account.pk, actor=self.admin.username,
                         kind='initial-empty-delivery', reason='Duplicate', stdout=StringIO())
