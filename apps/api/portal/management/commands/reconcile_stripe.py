from datetime import timedelta
import stripe
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from portal.billing import options, process_event


class Command(BaseCommand):
    help = 'Replay recent Stripe events from the authenticated API; processing is idempotent.'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=7)

    def handle(self, *args, **opts):
        if not 1 <= opts['days'] <= 30:
            raise CommandError('Choose a lookback between 1 and 30 days.')
        events = stripe.Event.list(created={'gte': int((timezone.now()-timedelta(days=opts['days'])).timestamp())}, limit=100, **options())
        for event in events.auto_paging_iter():
            process_event(event)
        self.stdout.write('Provider event reconciliation complete.')
