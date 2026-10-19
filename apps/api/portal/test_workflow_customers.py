from io import StringIO
from unittest.mock import patch

from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from portal.models import Account, Contract, Delivery, NotificationJob
from portal.operations import available_credits
from storage.models import Customer, Subscription


@override_settings(DEBUG=True, STRIPE_SECRET_KEY='sk_test_fixture')
class WorkflowFixtureTests(TestCase):
    def seed(self, **kwargs):
        call_command('seed_workflow_customers', mailbox='operator@gmail.com', stdout=StringIO(), **kwargs)

    @patch('django.core.mail.send_mail', side_effect=AssertionError('Must not send email'))
    @patch('stripe.Customer.create', side_effect=AssertionError('Must not call Stripe'))
    def test_scenarios_are_consistent_and_rerun_preserves_progress(self, *mocks):
        self.seed()
        self.assertEqual(Customer.objects.count(), 8)
        self.assertEqual(Subscription.objects.count(), 8)
        self.assertEqual(NotificationJob.objects.count(), 0)
        for user in get_user_model().objects.all():
            self.assertTrue(user.check_password('password'))
            self.assertFalse(user.is_staff or user.is_superuser)
            self.assertTrue(EmailAddress.objects.get(user=user).verified)
            self.assertIsNone(user.customer.portal_account.stripe_customer_id)
        self.assertFalse(Contract.objects.exclude(stripe_subscription_id=None).exists())
        accounts = {a.customer.user.username: a for a in Account.objects.select_related('customer__user')}
        self.assertEqual(available_credits(accounts['blake6']), 0)
        self.assertEqual(available_credits(accounts['blake2']), 3)
        self.assertTrue(accounts['blake7'].contract.cancel_at_period_end)
        self.assertEqual(accounts['blake8'].contract.status, 'past_due')
        self.assertEqual(Delivery.objects.filter(status='in_progress').count(), 1)
        user = get_user_model().objects.get(username='blake1')
        user.set_password('changed-by-user')
        user.save()
        self.seed()
        user.refresh_from_db()
        self.assertTrue(user.check_password('changed-by-user'))
        self.assertEqual(Customer.objects.count(), 8)

    def test_existing_customer_is_not_overwritten(self):
        get_user_model().objects.create_user(username='blake4', password='original')
        with self.assertRaises(CommandError):
            self.seed()
        self.assertEqual(Customer.objects.count(), 0)

    @override_settings(DEBUG=False, STRIPE_SECRET_KEY='sk_test_fixture')
    def test_server_needs_explicit_opt_in(self):
        with self.assertRaises(CommandError):
            self.seed()
        self.seed(allow_sandbox_server=True)
        self.assertEqual(Customer.objects.count(), 8)

    @override_settings(STRIPE_SECRET_KEY='sk_live_forbidden')
    def test_live_provider_keys_are_rejected(self):
        with self.assertRaises(CommandError):
            self.seed(allow_sandbox_server=True)
        self.assertEqual(Customer.objects.count(), 0)
