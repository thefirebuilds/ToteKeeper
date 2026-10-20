from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from portal.audit import record
from portal.models import Account
from portal.permissions import role


class Command(BaseCommand):
    help = 'Record a completed included empty-tote handoff for the owner-coordinated workflow. Never creates a charge.'

    def add_arguments(self, parser):
        parser.add_argument('--account', type=int, required=True)
        parser.add_argument('--actor', required=True, help='Active administrator username responsible for the record.')
        parser.add_argument('--kind', required=True, choices=['initial-empty-delivery', 'empty-collection', 'empty-redelivery', 'final-empty-collection'])
        parser.add_argument('--reason', required=True, help='Handoff reference, tote identifiers and relevant exterior/tag information.')

    @transaction.atomic
    def handle(self, *args, **opts):
        actor = get_user_model().objects.filter(username=opts['actor'], is_active=True).first()
        if actor is None or role(actor) != 'administrator' or not opts['reason'].strip():
            raise CommandError('An active administrator and handoff reference are required.')
        account = Account.objects.select_for_update().get(pk=opts['account'])
        contract = account.contract
        if contract.terms.get('service_model') != 'annual_cycle':
            raise CommandError('This command is for new agreement service cycles only.')
        if opts['kind'] == 'initial-empty-delivery':
            if contract.initial_empty_delivered_at:
                raise CommandError('Initial delivery was already recorded. Do not rewrite the historical handoff.')
            if contract.payment_status != 'paid' or contract.cancellation_requested_at:
                raise CommandError('Initial delivery requires a paid order that is not cancelling.')
            contract.initial_empty_delivered_at = timezone.now()
            contract.save(update_fields=['initial_empty_delivered_at'])
        record(actor, contract, 'Included empty-tote handoff completed', account=account,
               after={'kind': opts['kind'], 'performed_at': timezone.now().isoformat()}, reason=opts['reason'])
        self.stdout.write('Included handoff recorded. No payment or visit allowance was charged.')
