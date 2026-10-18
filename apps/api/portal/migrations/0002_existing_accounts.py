from django.db import migrations


def backfill(apps, schema_editor):
    Account = apps.get_model('portal', 'Account')
    Customer = apps.get_model('storage', 'Customer')
    for customer in Customer.objects.all().iterator():
        Account.objects.get_or_create(customer=customer)


class Migration(migrations.Migration):
    dependencies = [('portal', '0001_initial')]
    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
