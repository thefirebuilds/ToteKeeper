"""Regression checks for preserved manual records and inventory identifiers."""
from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from .models import Customer, Plan, Subscription, Tote


class LegacyDataTests(TestCase):
    def test_new_legacy_requests_need_72_hour_notice(self):
        from django.core.exceptions import ValidationError
        from unittest.mock import patch
        from .services import create_request
        from portal.scheduling import earliest_requested_date
        user = get_user_model().objects.create_user('notice-test')
        customer = Customer.objects.create(user=user, name='TEST', email='test@example.invalid', service_address='TEST')
        tote = Tote.objects.create(customer=customer, status='with_customer', label='TEST-NOTICE')
        now = timezone.now()
        with patch('django.utils.timezone.now', return_value=now):
            with self.assertRaisesMessage(ValidationError, '72 hours'):
                create_request(user, customer.pk, [tote.pk], 'collection', timezone.localdate()+timedelta(days=2), 'Evening')
            request = create_request(user, customer.pk, [tote.pk], 'collection', earliest_requested_date(), 'Evening')
            self.assertEqual(request.status, 'requested')

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
