from django.core.management.base import BaseCommand
from portal.operations import expire_reservations


class Command(BaseCommand):
    help = 'Release expired unpaid delivery reservations and expire unused credits.'

    def handle(self, *args, **options):
        expire_reservations()
        self.stdout.write('Reservation and credit expiry processed.')
