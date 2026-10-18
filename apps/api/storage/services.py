"""All operational writes share transactions and lock customers before their totes."""
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone
from .models import Activity, Customer, RequestItem, ServiceRequest, Tote, ToteHistory


def audit(actor, record, action, details=None):
    Activity.objects.create(actor=actor, record_type=record._meta.model_name, record_id=record.pk, action=action, details=details or {})


def staff(actor):
    if not actor.is_active or not actor.is_staff:
        raise PermissionDenied


def movement(actor, tote):
    ToteHistory.objects.create(tote=tote, actor=actor, status=tote.status, location=tote.location, customer_id_snapshot=tote.customer_id)
    audit(actor, tote, 'Tote movement or assignment', {'status': tote.status, 'location': tote.location, 'customer_id': tote.customer_id})


@transaction.atomic
def save_tote(actor, tote):
    staff(actor)
    if tote.customer_id:
        Customer.objects.select_for_update().get(pk=tote.customer_id)
    old = Tote.objects.select_for_update().get(pk=tote.pk) if tote.pk else None
    tote.full_clean()
    tote.save()
    if old is None or (old.status, old.location, old.customer_id) != (tote.status, tote.location, tote.customer_id):
        movement(actor, tote)
    else:
        audit(actor, tote, 'Tote details updated')


@transaction.atomic
def create_request(actor, customer_id, tote_ids, kind, preferred_date, preferred_window, instructions=''):
    customer = Customer.objects.select_for_update().get(pk=customer_id)
    if not actor.is_active or (not actor.is_staff and customer.user_id != actor.pk):
        raise PermissionDenied
    if customer.status != 'active':
        raise ValidationError('This account is not active. Please contact the operator.')
    if kind not in ['collection', 'return']:
        raise ValidationError('Choose collection or return delivery.')
    if preferred_date < timezone.localdate():
        raise ValidationError('Preferred date cannot be in the past.')
    ids = set(tote_ids)
    totes = list(Tote.objects.select_for_update().filter(pk__in=ids).order_by('pk'))
    if not ids or len(totes) != len(ids) or any(t.customer_id != customer.pk for t in totes):
        raise ValidationError('Choose at least one tote belonging to this customer.')
    expected = Tote.Status.WITH_CUSTOMER if kind == 'collection' else Tote.Status.STORAGE
    if any(t.status != expected for t in totes):
        raise ValidationError('Collection requires totes with the customer; returns require totes in storage.')
    if RequestItem.objects.filter(tote_id__in=ids, request__status__in=['requested', 'confirmed']).exists():
        raise ValidationError('A selected tote already has an active request.')
    service = ServiceRequest(customer=customer, kind=kind, preferred_date=preferred_date, preferred_window=preferred_window, instructions=instructions, address_snapshot=customer.service_address)
    service.full_clean()
    service.save()
    RequestItem.objects.bulk_create([RequestItem(request=service, tote=t) for t in totes])
    audit(actor, service, 'Request created')
    return service


@transaction.atomic
def transition_request(actor, request_id, target, appointment=None):
    # Match lock order used by creation and assignment, including concurrent requests.
    customer_id = ServiceRequest.objects.values_list('customer_id', flat=True).get(pk=request_id)
    customer = Customer.objects.select_for_update().get(pk=customer_id)
    service = ServiceRequest.objects.select_for_update().get(pk=request_id)
    if not actor.is_active or (not actor.is_staff and customer.user_id != actor.pk):
        raise PermissionDenied
    if not actor.is_staff and not (target == 'canceled' and service.status == 'requested'):
        raise PermissionDenied
    allowed = {'requested': {'confirmed', 'canceled'}, 'confirmed': {'completed', 'canceled'}}
    if target not in allowed.get(service.status, set()):
        raise ValidationError('This request cannot make that status transition.')
    totes = list(Tote.objects.select_for_update().filter(request_items__request=service).order_by('pk'))
    if not totes or any(t.customer_id != customer.pk for t in totes):
        raise ValidationError('Request ownership is inconsistent.')
    initial = Tote.Status.WITH_CUSTOMER if service.kind == 'collection' else Tote.Status.STORAGE
    scheduled = Tote.Status.PICKUP if service.kind == 'collection' else Tote.Status.RETURN
    if target == 'confirmed':
        if appointment is None or appointment <= timezone.now():
            raise ValidationError('Choose a future confirmed appointment (America/Chicago).')
        if any(t.status != initial for t in totes):
            raise ValidationError('A tote is no longer eligible for this request.')
        service.appointment = appointment
        next_status = scheduled
    elif target == 'completed':
        if any(t.status not in [scheduled, Tote.Status.TRANSIT] for t in totes):
            raise ValidationError('Totes must be scheduled or in transit to complete this request.')
        next_status = Tote.Status.STORAGE if service.kind == 'collection' else Tote.Status.WITH_CUSTOMER
    else:
        if any(t.status == Tote.Status.TRANSIT for t in totes):
            raise ValidationError('Resolve in-transit totes before canceling.')
        next_status = initial
    for tote in totes:
        if tote.status != next_status:
            tote.status = next_status
            if next_status == Tote.Status.WITH_CUSTOMER:
                tote.location = ''
            tote.save(update_fields=['status', 'location'])
            movement(actor, tote)
    service.status = target
    service.save(update_fields=['status', 'appointment'])
    audit(actor, service, f'Request {target}')
    return service


@transaction.atomic
def bulk_move(actor, tote_ids, target):
    staff(actor)
    if target not in [Tote.Status.TRANSIT, Tote.Status.STORAGE, Tote.Status.WITH_CUSTOMER, Tote.Status.RETIRED]:
        raise ValidationError('Unsupported bulk movement.')
    ids = set(tote_ids)
    owners = Tote.objects.filter(pk__in=ids).exclude(customer=None).values_list('customer_id', flat=True)
    list(Customer.objects.select_for_update().filter(pk__in=owners).order_by('pk'))
    totes = list(Tote.objects.select_for_update().filter(pk__in=ids).order_by('pk'))
    if not totes or len(totes) != len(ids):
        raise ValidationError('Select existing totes.')
    for tote in totes:
        active = tote.request_items.filter(request__status__in=['requested', 'confirmed'])
        if active.exists():
            if target != Tote.Status.TRANSIT or tote.status not in [Tote.Status.PICKUP, Tote.Status.RETURN] or not active.filter(request__status='confirmed').exists():
                raise ValidationError('Use the request completion/cancellation workflow for active requests.')
        else:
            transitions = {
                Tote.Status.WITH_CUSTOMER: {Tote.Status.TRANSIT, Tote.Status.RETIRED},
                Tote.Status.STORAGE: {Tote.Status.TRANSIT, Tote.Status.RETIRED},
                Tote.Status.TRANSIT: {Tote.Status.WITH_CUSTOMER, Tote.Status.STORAGE},
                Tote.Status.RETIRED: set(),
            }
            if target != tote.status and target not in transitions.get(tote.status, set()):
                raise ValidationError('Invalid movement. Move totes through transit; reactivate retired totes individually.')
        if not tote.customer_id and target not in [Tote.Status.RETIRED, Tote.Status.WITH_CUSTOMER]:
            raise ValidationError('Assign a customer before moving this tote.')
        tote.status = target
        if target == Tote.Status.WITH_CUSTOMER:
            tote.location = ''
        tote.save(update_fields=['status', 'location'])
        movement(actor, tote)
