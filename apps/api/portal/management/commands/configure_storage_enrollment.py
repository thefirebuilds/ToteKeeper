import json
from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from portal.agreement import VERSION, TERMS, PACKING, PACKING_VERSION, CATALOG
from portal.models import Offering, Policy
from portal.billing import validate_price, options
import stripe


class Command(BaseCommand):
    help = 'Validate existing Stripe prices, then publish versioned enrollment records. Does not create prices or change existing contracts.'

    def add_arguments(self, parser):
        parser.add_argument('--catalog', required=True, help='Reviewed JSON price mappings and capacity; contains no credentials.')
        parser.add_argument('--publish', action='store_true', help='Publish validated policies and offerings; without this, validate only.')

    def handle(self, *args, **opts):
        try:
            catalog = json.loads(Path(opts['catalog']).read_text(encoding='utf-8-sig'))
            expected = {f'{plan}_{interval}' for plan in CATALOG for interval in ['month', 'year']}
            if set(catalog) != expected:
                raise ValueError('Supply exactly small, medium and large month/year mappings.')
            offers = []
            for key, mapping in catalog.items():
                plan, interval = key.rsplit('_', 1)
                name, units, monthly, setup, annual = CATALOG[plan]
                if type(mapping['capacity']) is not int or mapping['capacity'] < 1 or mapping['tax_mode'] not in ['none', 'automatic']:
                    raise ValueError('Each offering needs positive capacity and reviewed none/automatic tax mode.')
                terms = dict(name=name, version=f'{VERSION}-{interval}', agreement_version=VERSION,
                             interval=interval, price_cents=monthly if interval == 'month' else annual,
                             setup_fee_cents=setup if interval == 'month' else 0,
                             currency='usd', storage_allowance=units, service_model='annual_cycle',
                             included_credits=2, credits_per_visit=1, credit_valid_days=365, carry_over=False,
                             credit_definition='One packed collection and one packed return per continuous 12-month service year, with associated empty handling.',
                             extra_delivery_cents=5000, stripe_price_id=mapping['stripe_price_id'],
                             stripe_setup_price_id=mapping.get('stripe_setup_price_id', '') if interval == 'month' else '',
                             stripe_delivery_price_id=mapping['stripe_delivery_price_id'],
                             tax_mode=mapping['tax_mode'], capacity=mapping['capacity'],
                             recurring_details='Only the displayed subscription recurs. Monthly setup is charged once; annual setup is waived. No automatic plan changes.')
                validate_price(terms)
                validate_price(terms, delivery=True)
                if terms['setup_fee_cents']:
                    price = stripe.Price.retrieve(terms['stripe_setup_price_id'], **options())
                    if not price.get('active') or price.get('recurring') or price.get('currency') != 'usd' or price.get('unit_amount') != setup:
                        raise ValueError('Monthly setup price must be active, nonrecurring USD at the approved amount.')
                offers.append(terms)
        except (KeyError, ValueError, OSError) as error:
            raise CommandError(str(error)) from error
        if not opts['publish']:
            self.stdout.write('All six offerings validated. No database or provider changes made.')
            return
        with transaction.atomic():
            policy, _ = Policy.objects.get_or_create(version=VERSION, defaults={
                'terms': TERMS, 'cancellation': TERMS.split('8. Cancellation, nonrenewal, and final return', 1)[1].split('9. Storage conditions', 1)[0],
                'packing_version': PACKING_VERSION, 'packing_terms': PACKING})
            if policy.terms != TERMS or policy.packing_terms != PACKING or policy.packing_version != PACKING_VERSION or policy.cancellation != TERMS.split('8. Cancellation, nonrenewal, and final return', 1)[1].split('9. Storage conditions', 1)[0]:
                raise CommandError('This version already contains different text. Publish a new document version instead.')
            published_ids = []
            for fields in offers:
                offering, created = Offering.objects.get_or_create(name=fields['name'], version=fields['version'], defaults=fields)
                if not created and any(getattr(offering, key) != value for key, value in fields.items() if key != 'capacity'):
                    raise CommandError('An offering version differs. Existing commercial terms were not overwritten.')
                offering.capacity = fields['capacity']
                offering.state = 'active'
                offering.full_clean()
                offering.save()
                published_ids.append(offering.pk)
            # Close only new enrollments in old offers, retaining all contract snapshots.
            Offering.objects.filter(state='active').exclude(pk__in=published_ids).update(state='archived')
            Policy.objects.exclude(pk=policy.pk).update(active=False)
            policy.active = True
            policy.full_clean()
            policy.save()
        self.stdout.write(f'Published agreement {VERSION}, packing policy and six reviewed offerings. Set STORAGE_AGREEMENT_FINALIZED=true to open enrollment. Existing contracts were not changed.')
