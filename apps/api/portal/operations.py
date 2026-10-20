from datetime import timedelta
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import Sum, Q
from django.utils import timezone
from storage.models import Tote, ToteHistory
from .audit import record
from .models import Account, CreditGrant, Delivery, DeliveryItem, LedgerEntry, NotificationJob, ServiceWindow
from .permissions import operational_access
from .scheduling import notice_hours
from .service_areas import normalize_zip

ACTIVE = ['requested', 'awaiting_payment', 'confirmed', 'in_progress']


def owned(actor, account):
    if not actor.is_active or account.customer.user_id != actor.pk:
        raise PermissionDenied


def totals(grant):
    result = grant.entries.aggregate(available=Sum('available_delta'), reserved=Sum('reserved_delta'))
    return (result['available'] or 0, result['reserved'] or 0)


def available_credits(account):
    return sum(totals(g)[0] for g in account.credit_grants.filter(Q(expires_at__gt=timezone.now()) | Q(expires_at=None)).filter(Q(starts_at__lte=timezone.now()) | Q(starts_at=None)))


def credit_summary(account):
    summary = {'included': 0, 'purchased': 0, 'adjusted': 0}
    for grant in account.credit_grants.filter(Q(expires_at__gt=timezone.now()) | Q(expires_at=None)).filter(Q(starts_at__lte=timezone.now()) | Q(starts_at=None)):
        category = 'included' if grant.source.startswith(('invoice:', 'service-year:', 'development-fixture:')) else 'purchased' if grant.source.startswith('checkout:') else 'adjusted'
        summary[category] += totals(grant)[0]
    return summary


@transaction.atomic
def issue_credits(account, quantity, definition, source, expires_at, actor=None, event_id='', direction='', service_address='', starts_at=None):
    grant, created = CreditGrant.objects.get_or_create(source=source, defaults={'account': account, 'quantity': quantity, 'definition': definition, 'expires_at': expires_at, 'direction': direction, 'service_address': service_address, 'starts_at': starts_at})
    if created:
        LedgerEntry.objects.create(grant=grant, kind='grant', available_delta=quantity, actor=actor, reason=source)
        record(actor, grant, 'Credits issued', account=account, after={'quantity': quantity}, event_id=event_id)
    return grant


def reserve(account, delivery, quantity, actor=None):
    remaining = quantity
    directions = set(delivery.items.values_list('direction', flat=True)) if account.contract.terms.get('service_model') == 'annual_cycle' else set()
    expiry_cutoff = delivery.window.starts_at if directions else timezone.now()
    for grant in account.credit_grants.select_for_update().filter(Q(expires_at__gt=expiry_cutoff) | Q(expires_at=None)).filter(Q(starts_at__lte=expiry_cutoff) | Q(starts_at=None)).order_by('expires_at', 'pk'):
        if directions and (grant.direction not in directions or grant.service_address and grant.service_address != delivery.address_snapshot):
            continue
        available, _ = totals(grant)
        taken = min(remaining, available)
        if taken > 0:
            LedgerEntry.objects.create(grant=grant, delivery=delivery, kind='reserve', available_delta=-taken, reserved_delta=taken, actor=actor, reason='Delivery reservation')
            remaining -= taken
            directions.discard(grant.direction)
        if remaining == 0:
            break
    if remaining:
        raise ValidationError('Delivery credits changed. Please review and try again.')
    delivery.reserved_credits = quantity
    delivery.save(update_fields=['reserved_credits'])
    record(actor, delivery, 'Credits reserved', account=account, after={'quantity': quantity})


def settle(delivery, consume, actor=None):
    for row in LedgerEntry.objects.filter(delivery=delivery).values('grant_id').annotate(reserved=Sum('reserved_delta')):
        amount = row['reserved']
        if amount > 0:
            grant = CreditGrant.objects.get(pk=row['grant_id'])
            expired = grant.expires_at is not None and grant.expires_at <= timezone.now()
            LedgerEntry.objects.create(grant=grant, delivery=delivery, kind='consume' if consume else 'release', reserved_delta=-amount, available_delta=0 if consume or expired else amount, actor=actor, reason='Service performed' if consume else 'Reservation released')
    delivery.reserved_credits = 0


@transaction.atomic
def book(actor, account_id, kind, window_id, item_ids, address, postal_code, instructions='', key=None):
    account = Account.objects.select_for_update().select_related('customer').get(pk=account_id)
    owned(actor, account)
    if key and Delivery.objects.filter(account=account, idempotency_key=key).exists():
        return Delivery.objects.get(account=account, idempotency_key=key)
    if account.customer.status != 'active':
        raise ValidationError('Your account is suspended. Contact ToteKeeper.')
    if account.billing_review_required and not (kind == 'return' and account.contract.terms.get('service_model') == 'annual_cycle'):
        raise ValidationError('A refund/billing adjustment needs staff review before new deliveries can be requested. Contact ToteKeeper.')
    contract = account.contract
    cycle_model = contract.terms.get('service_model') == 'annual_cycle'
    if cycle_model and contract.final_return_completed_at:
        raise ValidationError('Active storage ended with your final return. Contact us before starting a new order.')
    final_return = cycle_model and kind == 'return' and contract.cancellation_requested_at and not contract.final_return_completed_at
    from .service_cycles import final_return_deadline
    if not final_return and (contract.status not in ['active', 'trialing'] or contract.payment_status != 'paid'):
        raise ValidationError('An active paid subscription is required.')
    if kind not in ['pickup', 'return', 'exchange']:
        raise ValidationError('Choose pickup, return or exchange.')
    window = ServiceWindow.objects.select_for_update().select_related('area').get(pk=window_id)
    postal_code = normalize_zip(postal_code)
    if not window.area.active or window.area.postal_code != postal_code:
        raise ValidationError('That address is outside this service window’s approved area.')
    if final_return and (not final_return_deadline(contract) or window.starts_at > final_return_deadline(contract)):
        raise ValidationError('Contact us to arrange your final return or an operator-caused grace-period extension. No renewal is restarted automatically.')
    if final_return and Delivery.objects.filter(account=account, final_return=True, status__in=ACTIVE).exists():
        raise ValidationError('A final return is already pending.')
    if cycle_model and not final_return and contract.paid_through and window.starts_at > contract.paid_through:
        raise ValidationError('This appointment is outside your verified paid storage period. Choose a paid-period window or contact us.')
    if window.blackout or window.starts_at < timezone.now() + timedelta(hours=notice_hours(window)):
        raise ValidationError('This service window is unavailable or inside its lead time.')
    if Delivery.objects.filter(window=window, status__in=ACTIVE).count() >= window.capacity:
        raise ValidationError('This service window is full. Choose another window.')
    ids = set(item_ids)
    items = list(Tote.objects.select_for_update().filter(pk__in=ids).order_by('pk'))
    if not items or len(items) != len(ids) or any(t.customer_id != account.customer_id for t in items):
        raise ValidationError('Select inventory belonging to your account.')
    if DeliveryItem.objects.filter(tote__in=items, delivery__status__in=ACTIVE).exists() or any(t.request_items.filter(request__status__in=['requested', 'confirmed']).exists() for t in items):
        raise ValidationError('An item already has an active request.')
    if any(t.item_type == 'oversized' and not t.oversized_approved for t in items):
        raise ValidationError('Oversized items need staff approval before pickup.')
    directions = []
    for item in items:
        direction = 'return' if item.status == 'in_storage' else 'pickup' if item.status in ['registered', 'with_customer'] else None
        if direction is None or (kind != 'exchange' and direction != kind):
            raise ValidationError('Item status is inconsistent with the requested service.')
        directions.append(direction)
    if kind == 'exchange' and set(directions) != {'pickup', 'return'}:
        raise ValidationError('An exchange needs at least one pickup and one return item.')
    if final_return:
        stored_ids = set(Tote.objects.filter(customer=account.customer, status='in_storage').values_list('pk', flat=True))
        if ids != stored_ids:
            raise ValidationError('A final return must include all remaining stored belongings for this package. Request a regular partial return otherwise.')
    # Storage units are maintained by staff, never accepted from customer input.
    occupying = set(Tote.objects.filter(customer=account.customer, status__in=['in_storage', 'in_transit']).values_list('pk', flat=True))
    queued = set(DeliveryItem.objects.filter(delivery__account=account, delivery__status__in=ACTIVE, direction='pickup').values_list('tote_id', flat=True))
    resulting = (occupying | queued | {item.pk for item, direction in zip(items, directions) if direction == 'pickup'}) - {item.pk for item, direction in zip(items, directions) if direction == 'return'}
    if cycle_model:
        resulting |= set(Tote.objects.filter(customer=account.customer, status='with_customer').values_list('pk', flat=True))
        resulting |= {item.pk for item in items}
    units = Tote.objects.filter(pk__in=resulting).aggregate(total=Sum('storage_units'))['total'] or 0
    if units > contract.terms['storage_allowance'] and (not cycle_model or 'pickup' in directions):
        raise ValidationError('This visit would exceed your included storage units. Contact ToteKeeper to review an approved offering.')
    cost = contract.terms['credits_per_visit']
    if cycle_model:
        cost = len(set(directions))
        grants = account.credit_grants.filter(Q(expires_at__gt=window.starts_at) | Q(expires_at=None)).filter(Q(starts_at__lte=window.starts_at) | Q(starts_at=None))
        included = all(any(totals(g)[0] > 0 for g in grants.filter(direction=direction) if not g.service_address or g.service_address == address.strip()) for direction in set(directions))
        included = bool(final_return) or included
    else:
        included = available_credits(account) >= cost
    extra = 0 if included else contract.terms['extra_delivery_cents']
    if cycle_model and not included and kind != 'return':
        raise ValidationError('No included collection remains. Book an approved extra return-and-recollection round trip or contact us about your service cycle.')
    if not included and (not extra or not contract.terms.get('stripe_delivery_price_id')):
        raise ValidationError('No credits remain and additional delivery pricing is not configured. Contact ToteKeeper.')
    delivery = Delivery(final_return=bool(final_return), account=account, kind=kind, window=window, address_snapshot=address.strip(), postal_code=postal_code.strip().upper(), instructions=instructions, currency=contract.terms['currency'], extra_cents=extra, status='requested' if included else 'awaiting_payment', reservation_expires=None if included else timezone.now() + timedelta(minutes=30))
    if key:
        delivery.idempotency_key = key
    delivery.full_clean()
    delivery.save()
    DeliveryItem.objects.bulk_create([DeliveryItem(delivery=delivery, tote=item, direction=direction) for item, direction in zip(items, directions)])
    if included and not final_return:
        reserve(account, delivery, cost, actor)
    record(actor, delivery, 'Delivery requested', account=account, after={'kind': kind, 'status': delivery.status, 'credits': cost if included else 0, 'extra_cents': extra})
    NotificationJob.objects.create(account=account, key=f'delivery:{delivery.pk}:created', subject='ToteKeeper delivery request received', message='Your delivery request is saved. It is not a confirmed appointment. Sign in to review payment requirements and staff confirmation.')
    return delivery


@transaction.atomic
def transition(actor, delivery_id, target, reason=''):
    account_id = Delivery.objects.values_list('account_id', flat=True).get(pk=delivery_id)
    account = Account.objects.select_for_update().get(pk=account_id)
    delivery = Delivery.objects.select_for_update().select_related('window').get(pk=delivery_id)
    is_customer = account.customer.user_id == actor.pk
    authorized = operational_access(actor, delivery)
    if not authorized and not (is_customer and target == 'canceled'):
        raise PermissionDenied
    if not authorized and timezone.now() >= delivery.window.starts_at - timedelta(hours=delivery.window.cancellation_hours):
        raise ValidationError('The online cancellation cutoff has passed. Contact ToteKeeper.')
    allowed = {'requested': ['confirmed', 'canceled'], 'awaiting_payment': ['canceled'], 'confirmed': ['in_progress', 'canceled'], 'in_progress': ['completed', 'unable_to_complete']}
    if target not in allowed.get(delivery.status, []):
        raise ValidationError('Invalid delivery status transition.')
    if target == 'unable_to_complete' and not reason.strip():
        raise ValidationError('Record a reason when service cannot be completed.')
    if target == 'confirmed' and (delivery.reserved_credits <= 0 and not delivery.final_return or delivery.window.blackout):
        raise ValidationError('Payment/credits and an available reserved window are required.')
    before = delivery.status
    if target in ['completed', 'canceled', 'unable_to_complete']:
        settle(delivery, consume=target == 'completed', actor=actor)
    if target in ['in_progress', 'completed']:
        for item in delivery.items.select_related('tote'):
            tote = Tote.objects.select_for_update().get(pk=item.tote_id)
            tote.status = 'in_transit' if target == 'in_progress' else 'in_storage' if item.direction == 'pickup' else 'with_customer'
            if tote.status == 'with_customer':
                tote.location = ''
            tote.save(update_fields=['status', 'location'])
            ToteHistory.objects.create(tote=tote, actor=actor, status=tote.status, location=tote.location, customer_id_snapshot=tote.customer_id)
            record(actor, tote, 'Inventory movement', account=account, after={'status': tote.status})
    if target == 'completed' and delivery.final_return:
        account.contract.final_return_completed_at = timezone.now()
        account.contract.save(update_fields=['final_return_completed_at'])
    # Failed visits keep physical status explicit; staff must reconcile inventory separately.
    delivery.status = target
    delivery.save(update_fields=['status', 'reserved_credits'])
    record(actor, delivery, 'Delivery status changed', account=account, before={'status': before}, after={'status': target}, reason=reason)
    NotificationJob.objects.get_or_create(key=f'delivery:{delivery.pk}:{target}', defaults={'account': account, 'subject': 'ToteKeeper delivery update', 'message': f'Your delivery request is now {target.replace("_", " ")}. Sign in to review the details.'})
    return delivery


@transaction.atomic
def reschedule(actor, delivery_id, window_id):
    account_id = Delivery.objects.values_list('account_id', flat=True).get(pk=delivery_id)
    account = Account.objects.select_for_update().get(pk=account_id)
    owned(actor, account)
    delivery = Delivery.objects.select_for_update().select_related('window').get(pk=delivery_id)
    if delivery.status not in ['requested', 'confirmed'] or timezone.now() >= delivery.window.starts_at - timedelta(hours=delivery.window.cancellation_hours):
        raise ValidationError('This request cannot be rescheduled online. Contact ToteKeeper.')
    window = ServiceWindow.objects.select_for_update().select_related('area').get(pk=window_id)
    if not window.area.active or window.area.postal_code != delivery.postal_code or window.blackout or window.starts_at < timezone.now() + timedelta(hours=notice_hours(window)):
        raise ValidationError('The selected service window is unavailable.')
    if Delivery.objects.filter(window=window, status__in=ACTIVE).exclude(pk=delivery.pk).count() >= window.capacity:
        raise ValidationError('The selected service window is full.')
    if delivery.final_return:
        from .service_cycles import final_return_deadline
        if not final_return_deadline(account.contract) or window.starts_at > final_return_deadline(account.contract):
            raise ValidationError('Contact us to arrange an extension of your final-return grace period.')
    previous = delivery.window_id
    delivery.window = window
    delivery.status = 'requested'
    delivery.save(update_fields=['window', 'status'])
    record(actor, delivery, 'Delivery rescheduled; awaiting confirmation', account=account, before={'window_id': previous}, after={'window_id': window.pk})


@transaction.atomic
def expire_reservations():
    expired = Delivery.objects.filter(status='awaiting_payment', reservation_expires__lte=timezone.now()).order_by('account_id', 'pk').values_list('pk', 'account_id')
    for pk, account_id in list(expired):
        account = Account.objects.select_for_update().get(pk=account_id)
        delivery = Delivery.objects.select_for_update().get(pk=pk)
        if delivery.status != 'awaiting_payment':
            continue
        settle(delivery, False)
        delivery.status = 'canceled'
        delivery.save(update_fields=['status', 'reserved_credits'])
        record(None, delivery, 'Unpaid reservation expired', account=account)
    for account_id in Account.objects.order_by('pk').values_list('pk', flat=True):
        account = Account.objects.select_for_update().get(pk=account_id)
        for grant in account.credit_grants.filter(expires_at__lte=timezone.now()):
            balance, _ = totals(grant)
            if balance > 0:
                LedgerEntry.objects.create(grant=grant, kind='expire', available_delta=-balance, reason='Configured credit expiry')
                record(None, grant, 'Credits expired', account=account, after={'quantity': balance})
