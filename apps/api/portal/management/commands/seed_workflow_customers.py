"""Explicit, fictional customer fixtures; never contact payment or email providers."""
from datetime import timedelta
from decimal import Decimal

from allauth.account.models import EmailAddress
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from storage.models import Customer, Plan, Subscription, Tote
from portal.audit import record
from portal.billing import snapshot
from portal.models import Address, Contract, Delivery, DeliveryItem, LedgerEntry, Offering, ServiceArea, ServiceWindow
from portal.operations import issue_credits, reserve, settle


SCENARIOS = [
    ('Small', 2, 12500, 'New customer; ready to book pickup', None),
    ('Medium', 4, 22500, 'Pickup requested', 'requested'),
    ('Big', 10, 39900, 'Pickup confirmed', 'confirmed'),
    ('Small', 2, 12500, 'Stored inventory; ready to request return', 'completed'),
    ('Medium', 4, 22500, 'Return in progress', 'in_progress'),
    ('Big', 10, 39900, 'Included visit credits exhausted', 'exhausted'),
    ('Medium', 4, 22500, 'Cancellation scheduled; inventory still stored', 'canceling'),
    ('Small', 2, 12500, 'Past-due payment; new bookings blocked', 'past_due'),
]


class Command(BaseCommand):
    help = 'Create blake1..blake8 fictional workflow customers without Stripe calls or emails.'

    def add_arguments(self, parser):
        parser.add_argument('--mailbox', required=True, help='Operator Gmail mailbox; customers use distinct +aliases.')
        parser.add_argument('--allow-sandbox-server', action='store_true')

    @transaction.atomic
    def handle(self, *args, **options):
        key = settings.STRIPE_SECRET_KEY
        if key and not key.startswith(('sk_test_', 'rk_test_')):
            raise CommandError('Fixtures require sandbox Stripe credentials, never live credentials.')
        if not settings.DEBUG and not (options.get('allow_sandbox_server') and key):
            raise CommandError('Non-development servers require --allow-sandbox-server and sandbox Stripe credentials.')
        mailbox = options['mailbox'].strip().lower()
        if mailbox.count('@') != 1 or mailbox.split('@')[1] != 'gmail.com' or '+' in mailbox.split('@')[0]:
            raise CommandError('Supply the operator base Gmail address, without a +alias.')
        User = get_user_model()
        usernames = [f'blake{i}' for i in range(1, 9)]
        # Never repurpose an existing account or reset progress/passwords on rerun.
        existing = User.objects.filter(username__in=usernames)
        for user in existing:
            if not Customer.objects.filter(user=user, admin_notes='workflow-fixture-v1').exists() or user.is_staff or user.is_superuser:
                raise CommandError(f'{user.username} already exists outside these fixtures; nothing changed.')
        area, _ = ServiceArea.objects.get_or_create(postal_code='00000', defaults={'name': 'TEST ONLY - fictional workflow area', 'active': True})
        if not area.active:
            raise CommandError('Fixture service area 00000 is inactive; nothing changed.')
        now = timezone.now()
        window = None
        for i, (tier, units, cents, scenario, stage) in enumerate(SCENARIOS, 1):
            username = f'blake{i}'
            if User.objects.filter(username=username).exists():
                self.stdout.write(f'{username}: already exists; preserved')
                continue
            email = mailbox.replace('@', f'+totekeeper-{username}@')
            if User.objects.filter(email__iexact=email).exists() or EmailAddress.objects.filter(email__iexact=email).exists():
                raise CommandError(f'Email alias for {username} is already assigned; transaction rolled back.')
            user = User.objects.create_user(username=username, email=email, password='password')
            # These synthetic accounts belong to the operator's supplied mailbox.
            # Seed verified fixture state without changing authentication middleware.
            EmailAddress.objects.create(user=user, email=email, primary=True, verified=True)
            customer = Customer.objects.create(user=user, name=f'TEST Blake {i} - {tier}', email=email,
                phone='202-555-0100', service_address=f'{i} Fictional Test Lane, Test City, 00000',
                visible_notes=f'TEST ONLY: {scenario}. No real subscription or charges.', admin_notes='workflow-fixture-v1')
            account = customer.portal_account
            account.postal_code = '00000'
            account.enrollment_status = 'active'
            account.service_email = False
            account.save()
            Address.objects.create(account=account, label='TEST address', address=customer.service_address, postal_code='00000')
            offering, _ = Offering.objects.get_or_create(name=f'TEST ONLY - {tier}', version='workflow-v1', defaults={
                'state': 'draft', 'price_cents': cents, 'interval': 'year', 'storage_allowance': units,
                'included_credits': units, 'credit_definition': 'One credit per pickup/return visit (fictional test allocation)',
                'tax_mode': 'none', 'recurring_details': 'Fictional fixture. No provider subscription; not for sale.'})
            contract = Contract.objects.create(account=account, offering=offering,
                terms={**snapshot(offering), 'development_fixture': True}, status='active', payment_status='paid',
                renewal_at=now + timedelta(days=365), cancel_at_period_end=stage == 'canceling')
            plan, _ = Plan.objects.get_or_create(name=f'TEST ONLY - {tier} workflow-v1', defaults={
                'tote_allowance': units, 'annual_price': Decimal(cents) / 100, 'is_draft': True})
            legacy = Subscription.objects.create(customer=customer, plan=plan, start_date=now.date(),
                renewal_date=(now + timedelta(days=365)).date(), agreed_annual_price=Decimal(cents) / 100,
                status='active', payment_status='paid')
            grant = issue_credits(account, units, offering.credit_definition,
                f'development-fixture:workflow-v1:{username}', now + timedelta(days=365))
            stored = stage in ('completed', 'in_progress', 'exhausted', 'canceling', 'past_due')
            totes = [Tote.objects.create(customer=customer, label=f'TEST-BLAKE{i}-{j}',
                nickname=f'TEST {"XL" if j == 2 and units >= 4 else "Standard"} tote {j}',
                storage_units=2 if j == 2 and units >= 4 else 1,
                status='in_storage' if stored else 'registered',
                description='Fictional seasonal belongings for workflow testing.',
                location='TEST shelf A' if stored else '', admin_notes='workflow-fixture-v1') for j in range(1, min(units, 3) + 1)]
            if stage in ('requested', 'confirmed', 'completed', 'in_progress', 'exhausted'):
                if window is None:
                    window = ServiceWindow.objects.create(area=area, starts_at=now + timedelta(days=5),
                        ends_at=now + timedelta(days=5, hours=2), capacity=20)
                    for days in (7, 10, 14):
                        ServiceWindow.objects.create(area=area, starts_at=now + timedelta(days=days),
                            ends_at=now + timedelta(days=days, hours=2), capacity=20)
                completed = stage in ('completed', 'exhausted')
                if completed:
                    past = ServiceWindow.objects.create(area=area, starts_at=now - timedelta(days=7),
                        ends_at=now - timedelta(days=7) + timedelta(hours=2), capacity=20)
                delivery = Delivery.objects.create(account=account, kind='return' if stage == 'in_progress' else 'pickup',
                    window=past if completed else window, status='completed' if completed else stage,
                    address_snapshot=customer.service_address, postal_code='00000', currency='usd', instructions='TEST ONLY')
                for tote in totes:
                    DeliveryItem.objects.create(delivery=delivery, tote=tote, direction=delivery.kind)
                    if stage == 'in_progress':
                        tote.status = 'in_transit'
                        tote.save(update_fields=['status'])
                reserve(account, delivery, 1)
                if completed:
                    settle(delivery, consume=True)
                    delivery.save(update_fields=['reserved_credits'])
                    if stage == 'exhausted':
                        LedgerEntry.objects.create(grant=grant, kind='adjust', available_delta=-(units - 1),
                            reason='TEST ONLY: synthetic prior usage balance for exhausted-credit scenario')
            if stage == 'past_due':
                contract.status, contract.payment_status = 'past_due', 'failed'
                contract.save(update_fields=['status', 'payment_status'])
                legacy.payment_status = 'overdue'
                legacy.save(update_fields=['payment_status'])
            record(None, account, 'Fictional workflow customer seeded; operator-owned email preverified', account=account,
                after={'fixture_version': 'workflow-v1', 'scenario': scenario, 'provider_linked': False})
            self.stdout.write(f'{username}: {tier} ${cents / 100:.0f}/year; {scenario}')
