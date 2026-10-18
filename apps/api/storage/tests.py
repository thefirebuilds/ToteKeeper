"""Regression checks for preserved manual records and inventory identifiers."""
from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from .models import Customer, Plan, Subscription, Tote


class LegacyDataTests(TestCase):
    def test_agreed_manual_price_is_preserved(self):
        user = get_user_model().objects.create_user('legacy')
        customer = Customer.objects.create(user=user, name='Example', email='example@example.invalid', service_address='Example')
        plan = Plan.objects.first()
        sub = Subscription.objects.create(customer=customer, plan=plan, start_date=timezone.localdate(), renewal_date=timezone.localdate()+timedelta(days=365), agreed_annual_price='149.00')
        plan.annual_price = 999
        plan.save()
        sub.refresh_from_db()
        self.assertEqual(sub.agreed_annual_price, Decimal('149.00'))
        self.assertFalse(hasattr(customer.portal_account, 'contract'))

    def test_tote_labels_remain_unique(self):
        Tote.objects.create(label='UNIQUE')
        with self.assertRaises(IntegrityError), transaction.atomic():
            Tote.objects.create(label='UNIQUE')
