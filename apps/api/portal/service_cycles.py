"""Entitlements for new agreements; legacy ledger behavior is retained."""
from calendar import monthrange
from datetime import timedelta
from django.utils import timezone
from .models import CreditGrant, LedgerEntry, NotificationJob


def anniversary(start, years=1):
    year = start.year + years
    return start.replace(year=year, day=min(start.day, monthrange(year, start.month)[1]))


def final_return_deadline(contract):
    if not contract.paid_through:
        return None
    return max(filter(None, [contract.paid_through + timedelta(days=30), contract.final_return_extension_until]))


def grant_service_year(contract, paid_start, event_id=''):
    from .operations import issue_credits
    anchor = contract.service_started_at
    index = max(0, paid_start.year - anchor.year)
    if anniversary(anchor, index) > paid_start:
        index -= 1
    end = anniversary(anchor, index + 1)
    # A delayed historical invoice must not refresh today's allowance.
    for direction in ['pickup', 'return']:
        issue_credits(contract.account, 1, f'One included packed {direction} in service year {index + 1}',
                      f'service-year:{contract.pk}:{index}:{direction}', end,
                      event_id=event_id, direction=direction, starts_at=anniversary(anchor, index))


def grant_extra_cycle(contract, attempt, delivery, event_id=''):
    from .operations import issue_credits
    for direction in ['pickup', 'return']:
        issue_credits(contract.account, 1, 'One leg of the approved $50 return-and-recollection round trip',
                      f'checkout:{attempt.stripe_session_id}:{direction}', None,
                      event_id=event_id, direction=direction, service_address=delivery.address_snapshot)


def queue_renewal_reminders():
    from .models import Contract
    now = timezone.now()
    # Queue 31 days ahead, leaving a day for retries before the 30-day notice.
    for contract in Contract.objects.filter(status='active', cancel_at_period_end=False,
                                            renewal_at__gt=now, renewal_at__lte=now + timedelta(days=31)):
        if contract.terms.get('service_model') != 'annual_cycle' or contract.terms.get('interval') != 'year':
            continue
        NotificationJob.objects.get_or_create(key=f'annual-renewal:{contract.pk}:{int(contract.renewal_at.timestamp())}', defaults={
            'account': contract.account, 'subject': 'My Tote Keeper annual renewal reminder',
            'message': f'Your annual {contract.terms["name"]} subscription renews on {contract.renewal_at.date().isoformat()} for {contract.terms["currency"].upper()} {contract.terms["price_cents"]/100:.2f}, plus applicable taxes. Stop renewal before the next charge through Account > Billing > Cancel subscription or email blake@mytotekeeper.com. Review your retained agreement and invoices in your account.'})
