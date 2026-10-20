from importlib import import_module
from django.apps import apps
from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from .models import ServiceArea, Contract
from .service_areas import normalize_zip, enrollment_available
from .tests import FixtureMixin
from . import billing


class ZipServiceAreaTests(TestCase):
    def test_seeded_whole_zips_and_zip_plus_four(self):
        self.assertTrue(enrollment_available('78610'))
        self.assertTrue(enrollment_available('78666-1234'))
        self.assertTrue(enrollment_available(' 78704 '))
        self.assertFalse(enrollment_available('90210'))
        self.assertFalse(enrollment_available('00000'))
        self.assertFalse(enrollment_available('7861'))
        self.assertEqual(normalize_zip('78610-1234'), '78610')
        for invalid in ['786101234', '78610-extra', '78610 OR 1=1', 'abcde']:
            with self.assertRaises(ValidationError):
                normalize_zip(invalid)

    def test_admin_controls_are_authoritative_and_existing_service_is_separate(self):
        area = ServiceArea.objects.get(postal_code='78610')
        area.auto_enrollment = False
        area.save()
        self.assertFalse(enrollment_available('78610'))
        self.assertTrue(area.active)
        area.active, area.auto_enrollment = False, True
        area.save()
        self.assertFalse(enrollment_available('78610'))

    def test_seed_preserves_existing_names_inactive_decisions_and_other_areas(self):
        migration = import_module('portal.migrations.0007_zip_auto_enrollment')
        area = ServiceArea.objects.get(postal_code='78610')
        area.name, area.active = 'Owner label', False
        area.save()
        other = ServiceArea.objects.create(postal_code='90210', name='Other', active=False)
        from django.db import connection
        from types import SimpleNamespace
        migration.seed_approved_zips(apps, SimpleNamespace(connection=connection))
        area.refresh_from_db()
        other.refresh_from_db()
        self.assertEqual(area.name, 'Owner label')
        self.assertFalse(area.active)
        self.assertFalse(other.auto_enrollment)
        self.assertEqual(len(migration.INITIAL_ZIPS), 46)
        self.assertEqual(ServiceArea.objects.filter(postal_code__in=migration.INITIAL_ZIPS).count(), 46)


@override_settings(STORAGE_AGREEMENT_FINALIZED=True)
class ZipEnrollmentTests(FixtureMixin, TestCase):
    def test_whole_zip_enrollment_without_per_address_approval(self):
        self.account.postal_code = '78666-1234'
        self.account.save()
        # No county, side-of-river coordinate, or manual-address approval is needed.
        contract = billing.enroll(self.alice, self.account.pk, self.offering.pk, self.policy.pk, liability_acknowledged=True, accept=True, recurring_authorized=True, disputes_acknowledged=True)
        self.assertEqual(contract.status, 'pending')
        self.assertEqual(contract.payment_status, 'unpaid')

    def test_disabled_zip_blocks_enrollment_and_stale_checkout(self):
        self.account.postal_code = '78610'
        self.account.save()
        ServiceArea.objects.filter(postal_code='78610').update(auto_enrollment=False)
        with self.assertRaisesMessage(ValidationError, 'ZIP'):
            billing.enroll(self.alice, self.account.pk, self.offering.pk, self.policy.pk, liability_acknowledged=True, accept=True, recurring_authorized=True, disputes_acknowledged=True)
        self.assertFalse(Contract.objects.filter(account=self.account).exists())
        ServiceArea.objects.filter(postal_code='78610').update(auto_enrollment=True)
        billing.enroll(self.alice, self.account.pk, self.offering.pk, self.policy.pk, liability_acknowledged=True, accept=True, recurring_authorized=True, disputes_acknowledged=True)
        ServiceArea.objects.filter(postal_code='78610').update(active=False)
        with self.assertRaisesMessage(ValidationError, 'ZIP'):
            billing.checkout(self.alice, self.account.pk)

    def test_capacity_and_draft_agreement_still_block(self):
        self.account.postal_code = '78704'
        self.account.save()
        self.offering.capacity = 0
        self.offering.save()
        with self.assertRaisesMessage(ValidationError, 'capacity'):
            billing.enroll(self.alice, self.account.pk, self.offering.pk, self.policy.pk, liability_acknowledged=True, accept=True, recurring_authorized=True, disputes_acknowledged=True)
        with override_settings(STORAGE_AGREEMENT_FINALIZED=False), self.assertRaisesMessage(ValidationError, 'draft'):
            billing.enroll(self.alice, self.account.pk, self.offering.pk, self.policy.pk, liability_acknowledged=True, accept=True, recurring_authorized=True, disputes_acknowledged=True)
