import uuid
from datetime import timedelta
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from portal.audit import record
from portal.models import Account, CreditGrant, LedgerEntry
from portal.operations import available_credits, totals
from portal.permissions import role


class Command(BaseCommand):
    help = 'Audited privileged credit adjustment. Does not create a cash refund or change billing.'

    def add_arguments(self, parser):
        parser.add_argument('account_id', type=int)
        parser.add_argument('quantity', type=int)
        parser.add_argument('--actor', required=True, help='Provisioned administrator username')
        parser.add_argument('--reason', required=True)
        parser.add_argument('--valid-days', type=int, required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        actor = get_user_model().objects.filter(username=options['actor']).first()
        if not actor or role(actor) != 'administrator':
            raise CommandError('An active administrator actor is required.')
        quantity = options['quantity']
        if not quantity or not options['reason'].strip() or not 1 <= options['valid_days'] <= 3650:
            raise CommandError('Nonzero quantity, reason and valid-days (1–3650) are required.')
        account = Account.objects.select_for_update().get(pk=options['account_id'])
        before = available_credits(account)
        if quantity > 0:
            grant = CreditGrant.objects.create(account=account, quantity=quantity, expires_at=timezone.now()+timedelta(days=options['valid_days']), source='adjustment:'+str(uuid.uuid4()), definition=account.contract.terms['credit_definition'])
            LedgerEntry.objects.create(grant=grant, kind='adjust', available_delta=quantity, actor=actor, reason=options['reason'])
        else:
            remaining = -quantity
            if before < remaining:
                raise CommandError('Cannot remove more credits than the available balance. Reserved/spent credits require fulfillment review.')
            for grant in account.credit_grants.filter(expires_at__gt=timezone.now()).order_by('expires_at', 'pk'):
                amount = min(remaining, totals(grant)[0])
                if amount > 0:
                    LedgerEntry.objects.create(grant=grant, kind='adjust', available_delta=-amount, actor=actor, reason=options['reason'])
                    remaining -= amount
                if not remaining:
                    break
        record(actor, account, 'Privileged credit adjustment', account=account, before={'available': before}, after={'available': available_credits(account)}, reason=options['reason'])
        self.stdout.write('Credit adjustment recorded. No provider payment/refund was performed.')
