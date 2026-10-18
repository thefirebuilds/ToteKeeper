from django.db import migrations


def seed(apps, schema_editor):
    Plan = apps.get_model('storage', 'Plan')
    for count, price in [(1, 149), (4, 299), (10, 599)]:
        Plan.objects.get_or_create(name=f'Seasonal · {count} tote' + ('s' if count != 1 else ''), defaults={'tote_allowance': count, 'annual_price': price, 'is_draft': True})


class Migration(migrations.Migration):
    dependencies = [('storage', '0001_initial')]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
