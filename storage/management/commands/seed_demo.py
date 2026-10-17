from datetime import timedelta
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from storage.models import Customer, Plan, Subscription, Tote
from storage.services import movement


class Command(BaseCommand):
    help = 'Seed fictional local data without default passwords.'

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError('Demo data is only allowed with DEBUG=true.')
        for index, name in enumerate(['Morgan Example', 'Taylor Example'], start=1):
            user, created = get_user_model().objects.get_or_create(username=f'demo{index}', defaults={'email': f'demo{index}@example.invalid'})
            if created:
                user.set_unusable_password()
                user.save()
            customer, _ = Customer.objects.get_or_create(user=user, defaults={'name': name, 'email': user.email, 'phone': '555-0100', 'service_address': f'{index} Example Lane\nFictional City, IL 00000', 'admin_notes': 'Fictional seed customer'})
            plan = Plan.objects.get(name='Seasonal · 4 totes')
            Subscription.objects.get_or_create(customer=customer, defaults={'plan': plan, 'start_date': timezone.localdate(), 'renewal_date': timezone.localdate() + timedelta(days=365), 'agreed_annual_price': plan.annual_price})
            for suffix, status in [('A', Tote.Status.WITH_CUSTOMER), ('B', Tote.Status.STORAGE)]:
                tote, created = Tote.objects.get_or_create(label=f'DEMO-{index}-{suffix}', defaults={'customer': customer, 'nickname': 'Winter decorations' if suffix == 'A' else 'Autumn tableware', 'category': 'Seasonal', 'status': status, 'location': 'DEMO-A01' if suffix == 'B' else ''})
                if created:
                    movement(None, tote)
        self.stdout.write(self.style.SUCCESS('Fictional data ready. Use changepassword demo1 to enable a demo login.'))
