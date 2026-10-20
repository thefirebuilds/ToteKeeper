import time
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import close_old_connections


class Command(BaseCommand):
    help = 'Single MVP maintenance worker: expiry, notification outbox, provider reconciliation.'

    def add_arguments(self, parser):
        parser.add_argument('--once', action='store_true')

    def handle(self, *args, **options):
        tick = 0
        while True:
            close_old_connections()
            from portal.service_cycles import queue_renewal_reminders
            try:
                queue_renewal_reminders()
            except Exception:
                self.stderr.write('Renewal reminder scheduling failed; inspect and retry before the notice deadline.')
            for command in ['expire_reservations', 'send_notifications'] + (['reconcile_stripe'] if settings.STRIPE_SECRET_KEY and tick % 10 == 0 else []):
                try:
                    call_command(command, verbosity=0)
                except Exception:
                    self.stderr.write('A maintenance operation failed; it will be retried. Inspect job/provider state without logging personal data.')
            tick += 1
            if options['once']:
                return
            time.sleep(30)
