"""Stripe hosted flows. Browser callbacks are informational; only verified events entitle."""
from datetime import datetime, timedelta, timezone as utc
import uuid
import stripe
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone
from .audit import record
from .models import Account, Acceptance, Checkout, Contract, Delivery, Invoice, NotificationJob, Offering, Policy, ServiceArea, SupportRequest, WebhookEvent
from .operations import issue_credits, owned, reserve, settle
from .liability import ACKNOWLEDGMENT
from .service_areas import enrollment_available
from .agreement import ACKNOWLEDGMENTS, VERSION
from .service_cycles import grant_service_year, anniversary, final_return_deadline

stripe.default_http_client = stripe.RequestsClient(timeout=10)
stripe.max_network_retries = 1


class ProviderUnavailable(Exception):
    pass


def options(key=None):
    if not settings.STRIPE_SECRET_KEY:
        raise ProviderUnavailable('Payments are not configured. Your progress is saved; no payment has been taken.')
    if settings.DEBUG and settings.STRIPE_SECRET_KEY.startswith('sk_live_'):
        raise ProviderUnavailable('Live Stripe keys are blocked in development. Use a sandbox/test key.')
    result = {'api_key': settings.STRIPE_SECRET_KEY, 'stripe_version': settings.STRIPE_API_VERSION}
    if key:
        result['idempotency_key'] = str(key)
    return result


def date(timestamp):
    return datetime.fromtimestamp(timestamp, tz=utc.utc) if timestamp else None


def snapshot(offering):
    fields = ['setup_fee_cents', 'stripe_setup_price_id', 'agreement_version', 'service_model', 'name', 'version', 'price_cents', 'currency', 'interval', 'storage_allowance', 'included_credits', 'credit_definition', 'credits_per_visit', 'credit_valid_days', 'carry_over', 'extra_delivery_cents', 'stripe_price_id', 'stripe_delivery_price_id', 'tax_mode', 'recurring_details']
    return {field: getattr(offering, field) for field in fields}


def reserved_contracts(offering):
    return Contract.objects.filter(offering=offering).exclude(status__in=['canceled', 'expired']).filter(~Q(status='pending') | Q(created_at__gte=timezone.now()-timedelta(hours=1)) | Q(checkout__state='open', checkout__expires_at__gt=timezone.now())).distinct()


@transaction.atomic
def enroll(actor, account_id, offering_id, policy_id, liability_acknowledged=False, *, accept=False, recurring_authorized=False, disputes_acknowledged=False):
    if not settings.STORAGE_AGREEMENT_FINALIZED:
        raise ValidationError('The storage agreement is still a draft. Enrollment is unavailable.')
    if liability_acknowledged is not True:
        raise ValidationError('Review and acknowledge the per-tote liability limit before accepting the agreement.')
    if not all(value is True for value in [accept, recurring_authorized, disputes_acknowledged]):
        raise ValidationError('Review and acknowledge the agreement, recurring charges and dispute terms separately.')
    account = Account.objects.select_for_update().select_related('customer').get(pk=account_id)
    owned(actor, account)
    if not account.customer.name or not account.customer.service_address or not account.customer.phone:
        raise ValidationError('Complete your name, phone and service address first.')
    if not enrollment_available(account.postal_code):
        raise ValidationError('This ZIP is not enabled for automatic enrollment. Contact ToteKeeper about service availability.')
    offering = Offering.objects.select_for_update().get(pk=offering_id)
    if offering.state != 'active' or offering.effective_from > timezone.now() or (offering.effective_until and offering.effective_until <= timezone.now()):
        raise ValidationError('This offering is no longer available.')
    policy = Policy.objects.filter(active=True, published_at__lte=timezone.now()).order_by('-published_at', '-pk').first()
    if not policy or policy.pk != policy_id:
        raise ValidationError('The policy changed. Please review the current version.')
    if not policy.packing_version or not policy.packing_terms:
        raise ValidationError('A versioned packing policy must be published before enrollment.')
    if offering.agreement_version and offering.agreement_version != policy.version:
        raise ValidationError('This offering requires a different agreement. Review the available plans.')
    accepted_terms = policy.terms + '\n\nSeparate liability acknowledgment:\n' + ACKNOWLEDGMENT + '\n\n' + '\n'.join(ACKNOWLEDGMENTS.values())
    current = Contract.objects.filter(account=account).first()
    if current:
        if current.offering_id == offering.pk and current.status == 'pending':
            acceptance, created = save_acceptance(actor, account, current, policy, accepted_terms)
            if created:
                record(actor, acceptance, 'Updated policies accepted before checkout', account=account, after={'policy_version': policy.version})
            return current
        raise ValidationError('Your account already has an enrollment/subscription. Contact us to change it; a second subscription was not created.')
    used = reserved_contracts(offering).count()
    if used >= offering.capacity:
        raise ValidationError('This offering is at capacity.')
    if not offering.stripe_price_id or offering.tax_mode == 'unreviewed':
        raise ValidationError('Payment pricing or tax review is not configured for this offering.')
    contract = Contract.objects.create(account=account, offering=offering, terms=snapshot(offering))
    save_acceptance(actor, account, contract, policy, accepted_terms)
    account.enrollment_status = 'checkout'
    account.save(update_fields=['enrollment_status'])
    record(actor, contract, 'Offering and policies accepted', account=account, after={'offering_id': offering.pk, 'policy_version': policy.version})
    return contract


def save_acceptance(actor, account, contract, policy, accepted_terms):
    order = dict(contract.terms, service_address=account.customer.service_address, postal_code=account.postal_code,
                 start_date=timezone.localdate().isoformat(),
                 start_condition='Planned start date; service begins only after successful initial payment and written order confirmation.',
                 cancellation_method='Account > Billing > Cancel subscription, or email blake@mytotekeeper.com',
                 taxes='Applicable taxes are disclosed by hosted checkout before payment.')
    acceptance, created = Acceptance.objects.get_or_create(
        account=account, contract=contract, policy=policy, terms_snapshot=accepted_terms,
        packing_version=policy.packing_version, packing_snapshot=policy.packing_terms,
        acknowledgments=ACKNOWLEDGMENTS, order_snapshot=order,
        defaults={'accepted_by': actor, 'cancellation_snapshot': policy.cancellation})
    if created:
        NotificationJob.objects.get_or_create(key=f'acceptance:{acceptance.pk}', defaults={
            'account': account, 'subject': 'My Tote Keeper agreement and order review receipt',
            'message': f'Your acceptance of agreement {policy.version} and packing policy {policy.packing_version} is recorded. No payment or order activation is confirmed by this receipt. Download your retained documents from your signed-in billing page. Your order begins only after verified initial payment and written order confirmation.'})
    return acceptance, created


def ensure_customer(account):
    if not account.stripe_customer_id:
        customer = stripe.Customer.create(email=account.customer.email, metadata={'octagon_account': str(account.pk)}, **options(f'account:{settings.PUBLIC_BASE_URL}:{account.pk}'))
        account.stripe_customer_id = customer.id
        account.save(update_fields=['stripe_customer_id'])
    return account.stripe_customer_id


def validate_price(terms, delivery=False):
    price_id = terms['stripe_delivery_price_id'] if delivery else terms['stripe_price_id']
    price = stripe.Price.retrieve(price_id, **options())
    amount = terms['extra_delivery_cents'] if delivery else terms['price_cents']
    recurring = price.get('recurring')
    if not price.get('active') or price.get('currency') != terms['currency'] or price.get('unit_amount') != amount:
        raise ValidationError('Provider pricing differs from your accepted offering. Checkout is blocked for review.')
    if delivery and recurring or not delivery and (not recurring or recurring.get('interval') != terms['interval'] or recurring.get('interval_count') != 1):
        raise ValidationError('Provider billing interval differs from the accepted offering.')
    return price_id


@transaction.atomic
def checkout(actor, account_id, delivery_id=None):
    if not delivery_id and not settings.STORAGE_AGREEMENT_FINALIZED:
        raise ValidationError('The storage agreement is still a draft. New subscription checkout is unavailable.')
    account = Account.objects.select_for_update().select_related('customer').get(pk=account_id)
    owned(actor, account)
    if account.customer.status != 'active':
        raise ValidationError('New checkout is unavailable while this account is suspended. Billing management and cancellation remain available.')
    if not delivery_id and not enrollment_available(account.postal_code):
        raise ValidationError('This ZIP is not enabled for automatic enrollment. No subscription checkout was created.')
    contract = account.contract
    acceptance = contract.acceptances.order_by('-accepted_at').first()
    if not delivery_id and (not acceptance or acceptance.acknowledgments != ACKNOWLEDGMENTS or not acceptance.packing_snapshot):
        raise ValidationError('Review and accept the agreement with the separate liability acknowledgment before checkout.')
    if not delivery_id and acceptance and (acceptance.order_snapshot.get('service_address') != account.customer.service_address or acceptance.order_snapshot.get('postal_code') != account.postal_code):
        raise ValidationError('Your service address changed. Review and accept the updated order before checkout.')
    delivery = None
    if delivery_id:
        delivery = Delivery.objects.select_for_update().get(pk=delivery_id, account=account)
        if delivery.status != 'awaiting_payment' or delivery.reservation_expires <= timezone.now():
            raise ValidationError('This delivery payment reservation is no longer available.')
    elif contract.status not in ['pending', 'incomplete']:
        raise ValidationError('This subscription is not awaiting checkout.')
    elif contract.stripe_subscription_id:
        raise ValidationError('A provider subscription already exists. Resolve its invoice in the billing portal; a duplicate subscription was not created.')
    if not delivery:
        offering = Offering.objects.select_for_update().get(pk=contract.offering_id)
        used = reserved_contracts(offering).exclude(pk=contract.pk).count()
        if offering.state != 'active' or used >= offering.capacity:
            raise ValidationError('Enrollment capacity is no longer available. Contact ToteKeeper.')
    previous = Checkout.objects.filter(account=account, delivery=delivery, contract=contract).order_by('-pk').first()
    if previous and previous.state in ['creating', 'open'] and previous.expires_at and previous.expires_at > timezone.now():
        return previous
    if previous and not delivery and previous.stripe_session_id:
        prior = stripe.checkout.Session.retrieve(previous.stripe_session_id, **options())
        if prior.get('subscription') or prior.get('status') != 'expired':
            raise ValidationError('The previous checkout is still being resolved. Review your existing invoice in the billing portal; a duplicate subscription was not created.')
    # Deterministic across DB rollbacks/network retries; expired attempts use a new key.
    generation = Checkout.objects.filter(account=account, delivery=delivery, contract=contract).count()
    key = uuid.uuid5(uuid.NAMESPACE_URL, f'octagon:{settings.PUBLIC_BASE_URL}:{account.pk}:{contract.pk}:{delivery.pk if delivery else "subscription"}:{generation}')
    price_id = validate_price(contract.terms, delivery=delivery is not None)
    line_items = [{'price': price_id, 'quantity': 1}]
    if not delivery and contract.terms.get('setup_fee_cents', 0):
        setup_id = contract.terms.get('stripe_setup_price_id')
        if not setup_id:
            raise ValidationError('The one-time setup fee is not configured.')
        setup = stripe.Price.retrieve(setup_id, **options())
        if not setup.get('active') or setup.get('recurring') or setup.get('currency') != contract.terms['currency'] or setup.get('unit_amount') != contract.terms['setup_fee_cents']:
            raise ValidationError('Provider setup pricing differs from your accepted offering.')
        line_items.append({'price': setup_id, 'quantity': 1})
    customer_id = ensure_customer(account)
    attempt = Checkout.objects.create(key=key, account=account, contract=contract, delivery=delivery)
    expiry = delivery.reservation_expires if delivery else timezone.now() + timedelta(hours=1)
    # Stripe requires at least 30 minutes. Delivery checkout expiry is set by Stripe;
    # an earlier local hold still expires and late payment becomes a credit, never a booking.
    expiry = max(expiry, timezone.now() + timedelta(minutes=31))
    session = stripe.checkout.Session.create(
        customer=customer_id, mode='payment' if delivery else 'subscription',
        line_items=line_items,
        success_url=settings.PUBLIC_BASE_URL + '/billing/?checkout=returned',
        cancel_url=settings.PUBLIC_BASE_URL + '/billing/?checkout=abandoned',
        expires_at=int(expiry.timestamp()), automatic_tax={'enabled': contract.terms['tax_mode'] == 'automatic'},
        metadata={'octagon_checkout': str(attempt.key)}, **options(key),
    )
    attempt.stripe_session_id = session.id
    attempt.url = session.url
    attempt.expires_at = date(session.expires_at)
    attempt.state = 'open'
    attempt.save()
    record(actor, attempt, 'Hosted checkout created', account=account)
    return attempt


def portal_url(actor, account):
    owned(actor, account)
    if not account.stripe_customer_id:
        raise ValidationError('No billing account exists yet.')
    arguments = {'customer': account.stripe_customer_id, 'return_url': settings.PUBLIC_BASE_URL + '/billing/'}
    if settings.STRIPE_PORTAL_CONFIGURATION:
        arguments['configuration'] = settings.STRIPE_PORTAL_CONFIGURATION
    session = stripe.billing_portal.Session.create(**arguments, **options())
    record(actor, account, 'Hosted billing portal opened', account=account)
    return session.url


def preview(account):
    if not account.stripe_customer_id or not hasattr(account, 'contract') or not account.contract.stripe_subscription_id:
        return None
    return stripe.Invoice.create_preview(customer=account.stripe_customer_id, subscription=account.contract.stripe_subscription_id, **options())


@transaction.atomic
def cancel_subscription(actor, account_id):
    account = Account.objects.select_for_update().get(pk=account_id)
    owned(actor, account)
    contract = account.contract
    if not contract.stripe_subscription_id:
        raise ValidationError('No provider subscription exists. No cancellation has been submitted.')
    stripe.Subscription.modify(contract.stripe_subscription_id, cancel_at_period_end=True, **options(f'cancel-{contract.stripe_subscription_id}-{contract.last_provider_at}'))
    contract.cancellation_requested_at = contract.cancellation_requested_at or timezone.now()
    contract.save(update_fields=['cancellation_requested_at'])
    NotificationJob.objects.get_or_create(key=f'cancel-request:{contract.pk}', defaults={'account': account, 'subject': 'My Tote Keeper nonrenewal request received', 'message': 'Your request to stop renewal has been submitted. Your billing page shows provider confirmation when processed. No cancellation penalty applies. Arrange your free final return through your account or contact blake@mytotekeeper.com. No automatic refund of the paid term is issued.'})
    record(actor, contract, 'Cancellation requested from provider', account=account)
    if contract.terms.get('setup_fee_cents') and not contract.initial_empty_delivered_at:
        SupportRequest.objects.get_or_create(account=account, subject='Pre-delivery setup fee refund review', defaults={'message': 'Cancellation was requested before recorded initial empty-tote delivery. Review provider payment and handoff records, then refund the paid setup fee and applicable tax when due under the agreement. Do not mark this request as a completed refund.'})
    # Verified webhook/reconciliation updates the effective date, not this response.


def apply_subscription(account, subscription, event_id):
    contract = Contract.objects.select_for_update().get(account=account)
    if subscription.get('customer') != account.stripe_customer_id or (contract.stripe_subscription_id and contract.stripe_subscription_id != subscription['id']):
        raise ValidationError('Provider ownership mismatch.')
    contract.stripe_subscription_id = subscription['id']
    contract.status = subscription['status']
    items = subscription.get('items', {}).get('data', [])
    if (items or contract.terms.get('service_model') == 'annual_cycle') and (len(items) != 1 or items[0].get('price', {}).get('id') != contract.terms['stripe_price_id'] or items[0].get('quantity', 1) != 1):
        contract.status = 'offering_review_required'
    contract.renewal_at = date(subscription.get('current_period_end') or (items[0].get('current_period_end') if items else None))
    contract.cancel_at_period_end = subscription.get('cancel_at_period_end', False)
    contract.canceled_at = date(subscription.get('canceled_at'))
    if contract.cancel_at_period_end or contract.status == 'canceled':
        contract.cancellation_requested_at = contract.cancellation_requested_at or contract.canceled_at or timezone.now()
        if contract.terms.get('service_model') == 'annual_cycle':
            NotificationJob.objects.get_or_create(key=f'cancel-confirmed:{contract.pk}:{int(contract.renewal_at.timestamp()) if contract.renewal_at else 0}', defaults={'account': account, 'subject': 'My Tote Keeper nonrenewal confirmed', 'message': f'The payment provider confirms that your subscription is not set to renew. Last paid storage period ends {contract.paid_through or contract.renewal_at}. Arrange your free final return under your accepted agreement; contact blake@mytotekeeper.com for assistance.'})
            if contract.terms.get('setup_fee_cents') and not contract.initial_empty_delivered_at:
                SupportRequest.objects.get_or_create(account=account, subject='Pre-delivery setup fee refund review', defaults={'message': 'Review paid setup fee and applicable tax refund due after cancellation before initial empty-tote delivery. Verify handoff/payment records before resolving.'})
    contract.last_provider_at += 1
    contract.save()
    record(None, contract, 'Subscription reconciled', account=account, after={'status': contract.status, 'cancel_at_period_end': contract.cancel_at_period_end}, event_id=event_id)


@transaction.atomic
def process_event(event):
    if WebhookEvent.objects.filter(provider_id=event['id']).exists():
        return
    event_type = event['type']
    obj = event['data']['object']
    account = Account.objects.select_for_update().filter(stripe_customer_id=obj.get('customer')).first()
    if account is None:
        # Unknown IDs cannot create/link accounts through client-controlled metadata.
        WebhookEvent.objects.get_or_create(provider_id=event['id'], defaults={'event_type': event_type, 'provider_created': event['created'], 'outcome': 'unlinked'})
        return
    if WebhookEvent.objects.filter(provider_id=event['id']).exists():
        return
    if event_type.startswith('checkout.session.'):
        attempt = Checkout.objects.select_for_update().filter(stripe_session_id=obj['id'], account=account).first()
        if attempt:
            session = stripe.checkout.Session.retrieve(obj['id'], expand=['payment_intent.latest_charge'], **options())
            if session.customer != account.stripe_customer_id:
                raise ValidationError('Checkout ownership mismatch.')
            if session.get('payment_status') == 'paid' and session.get('status') == 'complete':
                if attempt.state != 'paid':
                    attempt.state = 'paid'
                    payment = session.get('payment_intent')
                    attempt.stripe_payment_id = payment.get('id', '') if isinstance(payment, dict) else payment or ''
                    if attempt.delivery_id:
                        delivery = Delivery.objects.select_for_update().get(pk=attempt.delivery_id)
                        contract = account.contract
                        quantity = contract.terms['credits_per_visit']
                        refunded = isinstance(payment, dict) and isinstance(payment.get('latest_charge'), dict) and payment['latest_charge'].get('refunded')
                        if refunded:
                            attempt.state = 'refunded'
                            if delivery.status == 'awaiting_payment':
                                delivery.status = 'canceled'
                                delivery.save(update_fields=['status'])
                        else:
                            if contract.terms.get('service_model') == 'annual_cycle':
                                from .service_cycles import grant_extra_cycle
                                grant_extra_cycle(contract, attempt, delivery, event['id'])
                            else:
                                issue_credits(account, quantity, contract.terms['credit_definition'], 'checkout:' + attempt.stripe_session_id, timezone.now() + timedelta(days=contract.terms['credit_valid_days']), event_id=event['id'])
                        if not refunded and delivery.status == 'awaiting_payment' and delivery.reservation_expires > timezone.now():
                            reserve(account, delivery, quantity)
                            delivery.status = 'requested'
                            delivery.save(update_fields=['status'])
                        elif not refunded:
                            record(None, delivery, 'Late payment retained as available credit; appointment not booked', account=account, event_id=event['id'])
                    elif session.get('subscription'):
                        sub = stripe.Subscription.retrieve(session.subscription, **options())
                        apply_subscription(account, sub, event['id'])
            elif session.get('status') == 'expired' or event_type == 'checkout.session.async_payment_failed':
                if attempt.state != 'paid':
                    attempt.state = 'expired' if session.get('status') == 'expired' else 'failed'
                    if attempt.delivery_id:
                        delivery = Delivery.objects.select_for_update().get(pk=attempt.delivery_id)
                        if delivery.status == 'awaiting_payment':
                            settle(delivery, False)
                            delivery.status = 'canceled'
                            delivery.save(update_fields=['status', 'reserved_credits'])
                    elif account.contract.status == 'pending':
                        account.enrollment_status = 'checkout'
                        account.save(update_fields=['enrollment_status'])
            attempt.save(update_fields=['state', 'stripe_payment_id'])
            record(None, attempt, 'Checkout event processed', account=account, after={'state': attempt.state}, event_id=event['id'])
    elif event_type.startswith('customer.subscription.'):
        contract = account.contract
        if contract.stripe_subscription_id == obj['id']:
            # Retrieve current provider state: delivery order never regresses state.
            apply_subscription(account, stripe.Subscription.retrieve(obj['id'], **options()), event['id'])
    elif event_type.startswith('invoice.'):
        invoice = stripe.Invoice.retrieve(obj['id'], **options())
        if invoice.get('customer') != account.stripe_customer_id:
            raise ValidationError('Invoice ownership mismatch.')
        Invoice.objects.update_or_create(provider_id=obj['id'], defaults={'account': account, 'status': invoice['status'], 'total_cents': invoice['total'], 'currency': invoice['currency'], 'url': invoice.get('hosted_invoice_url') or '', 'receipt_url': invoice.get('invoice_pdf') or '', 'created_at': date(invoice['created'])})
        parent = invoice.get('parent') or {}
        subscription_id = invoice.get('subscription') or (parent.get('subscription_details') or {}).get('subscription')
        contract = Contract.objects.select_for_update().get(account=account)
        if subscription_id and contract.stripe_subscription_id in [None, subscription_id]:
            # A first invoice is linked only via a known server-created checkout session.
            if not contract.stripe_subscription_id:
                for attempt in Checkout.objects.filter(account=account, delivery=None, stripe_session_id__isnull=False):
                    session = stripe.checkout.Session.retrieve(attempt.stripe_session_id, **options())
                    if session.get('subscription') == subscription_id and session.get('customer') == account.stripe_customer_id:
                        contract.stripe_subscription_id = subscription_id
                        contract.save(update_fields=['stripe_subscription_id'])
                        break
            if contract.stripe_subscription_id == subscription_id:
                current = stripe.Subscription.retrieve(subscription_id, **options())
                apply_subscription(account, current, event['id'])
                # Only the latest invoice determines current payment action; old paid
                # invoices may issue their own historical credits without clearing arrears.
                latest = current.get('latest_invoice')
                if isinstance(latest, dict):
                    latest = latest.get('id')
                if latest == invoice['id']:
                    contract.refresh_from_db()
                    contract.payment_status = 'paid' if invoice['status'] == 'paid' else 'action_required'
                    contract.save(update_fields=['payment_status'])
                    account.enrollment_status = 'active' if invoice['status'] == 'paid' and current['status'] in ['active', 'trialing'] else 'payment_action_required'
                    account.save(update_fields=['enrollment_status'])
                contract.refresh_from_db()
                if invoice['status'] == 'paid' and contract.status in ['active', 'trialing'] and invoice.get('billing_reason') in ['subscription_create', 'subscription_cycle']:
                    period_end = max([line.get('period', {}).get('end', 0) for line in invoice.get('lines', {}).get('data', [])] or [0])
                    if not period_end and contract.renewal_at:
                        period_end = int(contract.renewal_at.timestamp())
                    if not period_end:
                        raise ValidationError('The paid billing period is missing.')
                    terms = contract.terms
                    if terms.get('service_model') == 'annual_cycle':
                        starts = [line.get('period', {}).get('start', 0) for line in invoice.get('lines', {}).get('data', []) if line.get('period', {}).get('end') == period_end]
                        start = date(min([value for value in starts if value] or [invoice['created']]))
                        contract.service_started_at = contract.service_started_at or date(current.get('start_date')) or start
                        contract.paid_through = max(filter(None, [contract.paid_through, date(period_end)]))
                        contract.save(update_fields=['service_started_at', 'paid_through'])
                        grant_service_year(contract, start, event['id'])
                        NotificationJob.objects.get_or_create(key=f'order-confirmed:{contract.pk}', defaults={
                            'account': account, 'subject': 'My Tote Keeper order confirmed',
                            'message': f'Your {terms["name"]} order is confirmed after verified payment. Service start: {contract.service_started_at.isoformat()}. Base recurring charge: {terms["currency"].upper()} {terms["price_cents"]/100:.2f} per {terms["interval"]}, plus applicable taxes. One-time setup: {terms.get("setup_fee_cents", 0)/100:.2f}. Your accepted documents and order are downloadable from Billing. Appointments require separate confirmation.'})
                    else:
                        expiry = date(period_end) + timedelta(days=terms['credit_valid_days']) if terms['carry_over'] else min(date(period_end), timezone.now() + timedelta(days=terms['credit_valid_days']))
                        quantity = terms['included_credits']
                        if quantity:
                            issue_credits(account, quantity, terms['credit_definition'], 'invoice:' + invoice['id'], expiry, event_id=event['id'])
                NotificationJob.objects.get_or_create(key='invoice:' + event['id'], defaults={'account': account, 'subject': 'ToteKeeper billing update', 'message': 'Your billing status changed. Sign in to review your invoice and any action required.'})
        record(None, account, 'Invoice reconciled', account=account, after={'status': invoice['status'], 'total_cents': invoice['total']}, event_id=event['id'])
    elif event_type == 'charge.refunded':
        charge = stripe.Charge.retrieve(obj['id'], **options())
        if charge.get('customer') != account.stripe_customer_id:
            raise ValidationError('Refund ownership mismatch.')
        account.billing_review_required = True
        account.review_reason = ''
        account.save(update_fields=['billing_review_required', 'review_reason'])
        attempt = Checkout.objects.filter(account=account, stripe_payment_id=charge.get('payment_intent')).first()
        if attempt and attempt.delivery_id:
            delivery = Delivery.objects.select_for_update().get(pk=attempt.delivery_id)
            if charge.get('refunded'):
                if delivery.status in ['requested', 'awaiting_payment', 'confirmed']:
                    settle(delivery, False)
                    delivery.status = 'canceled'
                    delivery.save(update_fields=['status', 'reserved_credits'])
                from .models import CreditGrant, LedgerEntry
                from .operations import totals
                grants = CreditGrant.objects.filter(Q(source='checkout:' + attempt.stripe_session_id) | Q(source__startswith='checkout:' + attempt.stripe_session_id + ':'))
                for grant in grants:
                    funded = grant.entries.exclude(delivery=None).values('delivery_id').annotate(reserved=Sum('reserved_delta')).filter(reserved__gt=0)
                    for reservation in list(funded):
                        funded_delivery = Delivery.objects.select_for_update().get(pk=reservation['delivery_id'])
                        if funded_delivery.status in ['requested', 'awaiting_payment', 'confirmed']:
                            settle(funded_delivery, False)
                            funded_delivery.status = 'canceled'
                            funded_delivery.save(update_fields=['status', 'reserved_credits'])
                            record(None, funded_delivery, 'Refunded credit reservation canceled', account=account, event_id=event['id'])
                    available, _ = totals(grant)
                    if available > 0:
                        LedgerEntry.objects.create(grant=grant, kind='refund', available_delta=-available, reason='Provider full refund')
        record(None, account, 'Provider refund received; review consumed/partial credits', account=account, after={'refunded_cents': charge.get('amount_refunded', 0)}, event_id=event['id'])
        SupportRequest.objects.create(account=account, subject='Refund reconciliation review', message='Review refund, consumed credits and fulfillment before closing this ticket.')
    WebhookEvent.objects.create(provider_id=event['id'], event_type=event_type, provider_created=event['created'])
