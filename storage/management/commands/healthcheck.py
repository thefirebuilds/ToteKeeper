from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.conf import settings
from http.client import HTTPConnection


class Command(BaseCommand):
    help = 'Check database availability without logging personal information.'

    def handle(self, *args, **options):
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT 1')
            client = HTTPConnection('127.0.0.1', 8000, timeout=5)
            try:
                client.request('GET', '/health/', headers={'Host': settings.ALLOWED_HOSTS[0], 'X-Forwarded-Proto': 'https'})
                if client.getresponse().status != 200:
                    raise ValueError('HTTP health check failed')
            finally:
                client.close()
        except Exception:
            raise CommandError('Application or database unavailable') from None
