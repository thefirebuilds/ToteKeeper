from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from portal.models import Offering, Policy, ServiceArea, ServiceWindow


class Command(BaseCommand):
    help = 'Fail closed when launch configuration or approved commercial records are incomplete.'

    def handle(self, *args, **options):
        issues = []
        if settings.DEBUG:
            issues.append('DEBUG must be false for launch.')
        for key in ['PUBLIC_BASE_URL', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PORTAL_CONFIGURATION', 'BUSINESS_PHONE', 'BUSINESS_EMAIL', 'BUSINESS_HOURS']:
            if not getattr(settings, key):
                issues.append(f'{key} must be supplied.')
        if not Policy.objects.filter(active=True).exists():
            issues.append('Publish approved versioned service terms and cancellation policy.')
        offerings = Offering.objects.filter(state='active', effective_from__lte=timezone.now()).exclude(effective_until__lte=timezone.now())
        if not offerings.exists():
            issues.append('Publish at least one approved offering.')
        for offering in offerings:
            if offering.tax_mode == 'unreviewed' or not offering.stripe_price_id or not offering.credit_definition or not offering.capacity:
                issues.append(f'Offering {offering.pk} needs tax review, provider mapping, a credit definition and capacity.')
            if offering.extra_delivery_cents and not offering.stripe_delivery_price_id:
                issues.append(f'Offering {offering.pk} needs an additional delivery price mapping.')
        if not ServiceArea.objects.filter(active=True).exists() or not ServiceWindow.objects.filter(area__active=True, blackout=False, starts_at__gt=timezone.now()).exists():
            issues.append('Configure approved service areas and future available windows.')
        if issues:
            raise CommandError('\n'.join(issues))
        self.stdout.write('Configuration checks passed. Live provider, MFA/passkey and deployment acceptance checks are still required.')
