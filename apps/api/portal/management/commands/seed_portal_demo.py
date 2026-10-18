from datetime import timedelta
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from portal.audit import record
from portal.billing import snapshot
from portal.models import Account, Contract, Offering, Policy, ServiceArea, ServiceWindow
from portal.operations import issue_credits
from storage.models import Customer, Tote


class Command(BaseCommand):
    help = 'Explicit fictional, offline fixtures. Never represents a real payment or booking.'

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError('Development fixtures are prohibited in production.')
        area, _ = ServiceArea.objects.get_or_create(postal_code='00000', defaults={'name': 'DEVELOPMENT ONLY · fictional area', 'active': True})
        offering, _ = Offering.objects.get_or_create(name='DEVELOPMENT FIXTURE · not for sale', version='demo-1', defaults={'state': 'draft', 'price_cents': 100, 'interval': 'month', 'capacity': 2, 'storage_allowance': 4, 'included_credits': 2, 'credit_definition': 'DEVELOPMENT: one credit represents one pickup, return or exchange visit.', 'extra_delivery_cents': 100, 'credit_valid_days': 30, 'stripe_price_id': '', 'stripe_delivery_price_id': '', 'tax_mode': 'unreviewed'})
        Policy.objects.get_or_create(version='DEVELOPMENT-NOT-LEGAL-TERMS', defaults={'terms': 'DEVELOPMENT FIXTURE. Replace with operator-approved service terms before accepting real enrollments.', 'cancellation': 'DEVELOPMENT FIXTURE. No commercial cancellation/refund policy has been approved.', 'active': False})
        user, created = get_user_model().objects.get_or_create(username='portal_demo', defaults={'email': 'portal-demo@example.invalid'})
        if created:
            user.set_unusable_password()
            user.save()
        customer, _ = Customer.objects.get_or_create(user=user, defaults={'name': 'DEVELOPMENT · Morgan Example', 'email': user.email, 'phone': 'DEVELOPMENT ONLY', 'service_address': 'Fictional address — not serviceable in production'})
        account = Account.objects.get(customer=customer)
        account.postal_code = '00000'
        account.enrollment_status = 'DEVELOPMENT FIXTURE'
        account.save()
        Contract.objects.get_or_create(account=account, defaults={'offering': offering, 'terms': snapshot(offering), 'status': 'active', 'payment_status': 'paid'})
        issue_credits(account, 2, offering.credit_definition, 'development-fixture:' + str(account.pk), timezone.now()+timedelta(days=30))
        for suffix, status in [('A', 'registered'), ('B', 'in_storage')]:
            Tote.objects.get_or_create(label='DEV-PORTAL-' + suffix, defaults={'customer': customer, 'nickname': 'Fictional item ' + suffix, 'status': status})
        for index in [3, 5, 7]:
            start = (timezone.now()+timedelta(days=index)).replace(hour=16, minute=0, second=0, microsecond=0)
            ServiceWindow.objects.get_or_create(area=area, starts_at=start, defaults={'ends_at': start+timedelta(hours=2), 'capacity': 2})
        record(None, account, 'DEVELOPMENT fixtures seeded', account=account)
        self.stdout.write('DEVELOPMENT fixtures only. No provider IDs, real payments, verified email, MFA or default passwords were created. Use changepassword portal_demo, then verify the email through the real allauth flow.')
