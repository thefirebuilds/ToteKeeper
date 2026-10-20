from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from portal.audit import record
from portal.models import Account
from portal.permissions import role
from portal.service_cycles import final_return_deadline


class Command(BaseCommand):
    help = 'Record a no-charge final-return extension for operator delay after a timely customer request.'

    def add_arguments(self, parser):
        parser.add_argument('--account', type=int, required=True)
        parser.add_argument('--actor', required=True)
        parser.add_argument('--until', required=True, help='Timezone-aware ISO timestamp through replacement appointment.')
        parser.add_argument('--request', type=int, required=True, help='Account support request documenting timely final-return request.')
        parser.add_argument('--reason', required=True, help='Operator-caused delay and replacement arrangement.')

    @transaction.atomic
    def handle(self, *args, **opts):
        actor = get_user_model().objects.filter(username=opts['actor'], is_active=True).first()
        until = parse_datetime(opts['until'])
        if actor is None or role(actor) != 'administrator' or not opts['reason'].strip() or not until or timezone.is_naive(until):
            raise CommandError('An active administrator, reason and timezone-aware replacement date are required.')
        account = Account.objects.select_for_update().get(pk=opts['account'])
        contract = account.contract
        deadline = final_return_deadline(contract)
        request = account.support_requests.filter(pk=opts['request']).first()
        if contract.terms.get('service_model') != 'annual_cycle' or not contract.cancellation_requested_at or contract.final_return_completed_at or not deadline or not request or request.created_at > deadline or until <= deadline:
            raise CommandError('A timely request and a later replacement date for an unfinished final return are required.')
        contract.final_return_extension_until = until
        contract.save(update_fields=['final_return_extension_until'])
        record(actor, contract, 'No-charge final-return extension recorded', account=account,
               after={'until': until.isoformat(), 'support_request': request.pk}, reason=opts['reason'])
        self.stdout.write('Final-return grace period extended without a charge or subscription renewal.')
