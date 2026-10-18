from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from portal.audit import record
from portal.models import Membership


class Command(BaseCommand):
    help = 'Explicit, audited staff provisioning. Never bypasses email verification or MFA.'

    def add_arguments(self, parser):
        parser.add_argument('username')
        parser.add_argument('--role', choices=['steward', 'administrator', 'revoke'], required=True)
        parser.add_argument('--reason', required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        if not options['reason'].strip():
            raise CommandError('A reason is required.')
        user = get_user_model().objects.filter(username=options['username']).first()
        if not user:
            raise CommandError('Create the staff user with createsuperuser or Django admin first.')
        previous = Membership.objects.filter(user=user).values_list('role', flat=True).first()
        target = options['role']
        if target == 'revoke':
            Membership.objects.filter(user=user).delete()
            user.is_staff = False
            user.is_superuser = False
        else:
            Membership.objects.update_or_create(user=user, defaults={'role': target})
            user.is_staff = True
            if target == 'steward':
                user.is_superuser = False
        user.save(update_fields=['is_staff', 'is_superuser'])
        record(None, user, 'Staff role provisioned', before={'role': previous}, after={'role': target}, reason=options['reason'])
        self.stdout.write('Role updated. Verified email and an MFA-authenticated session are required for the console.')
