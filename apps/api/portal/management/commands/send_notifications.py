from django.core.mail import send_mail
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from portal.audit import record
from portal.models import NotificationJob


class Command(BaseCommand):
    help = 'Send transactional notification outbox. Failed jobs remain for retry/review.'

    def handle(self, *args, **options):
        for pk in list(NotificationJob.objects.filter(sent_at=None, attempts__lt=10).values_list('pk', flat=True)[:100]):
            with transaction.atomic():
                job = NotificationJob.objects.select_for_update().select_related('account__customer').get(pk=pk)
                if job.sent_at:
                    continue
                job.attempts += 1
                try:
                    sent = send_mail(job.subject, job.message, None, [job.account.customer.email], fail_silently=False)
                    if sent != 1:
                        raise RuntimeError('The email provider did not accept the notification.')
                except Exception:
                    job.save(update_fields=['attempts'])
                    record(None, job, 'Notification delivery failed; queued for retry', account=job.account, outcome='failure')
                    continue
                job.sent_at = timezone.now()
                job.save(update_fields=['sent_at', 'attempts'])
                record(None, job, 'Transactional notification sent', account=job.account)
        self.stdout.write('Notification batch processed; inspect pending jobs for failures.')
