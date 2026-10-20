import stripe
from django.conf import settings
from .service_areas import enrollment_available
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from storage.models import Customer, Tote
from . import billing, operations
from .audit import record
from .forms import AddressForm, DeliveryForm, EnrollmentForm, InventoryForm, PhotoForm, ProfileForm, RescheduleForm, SupportForm
from .models import Account, Contract, Delivery, Photo, Policy, ServiceArea
from .permissions import operational_access, require_role, role
from .photos import delete_photo, upload_photo


def account_for(request, allow_suspended=False):
    if role(request.user) != 'customer':
        raise PermissionDenied
    customers = Customer.objects.filter(user=request.user)
    if not allow_suspended:
        customers = customers.filter(status='active')
    customer = get_object_or_404(customers)
    return get_object_or_404(Account, customer=customer)


def page(request, template, **context):
    if context.get('account'):
        context['credit_summary'] = operations.credit_summary(context['account'])
    return render(request, 'portal/' + template + '.html', context)


def error_message(request, error):
    if isinstance(error, ValidationError):
        messages.error(request, '; '.join(error.messages))
    elif isinstance(error, billing.ProviderUnavailable):
        messages.error(request, str(error))
    else:
        messages.error(request, 'The payment provider could not complete this operation. Your request is not confirmed. Try again or contact ToteKeeper.')


@login_required
def dashboard(request):
    if role(request.user) in ['administrator', 'steward']:
        return redirect('staff')
    account = account_for(request)
    contract = Contract.objects.filter(account=account).first()
    return page(request, 'dashboard', account=account, contract=contract, credits=operations.available_credits(account), inventory=account.customer.totes.exclude(status='retired')[:5], deliveries=account.deliveries.filter(status__in=operations.ACTIVE).select_related('window').order_by('window__starts_at'))


@login_required
def profile(request):
    account = account_for(request)
    customer = account.customer
    initial = {name: getattr(customer, name) for name in ['name', 'phone', 'service_address']}
    initial.update({name: getattr(account, name) for name in ['postal_code', 'delivery_instructions', 'service_email', 'marketing_consent']})
    form = ProfileForm(request.POST or None, initial=initial)
    if request.method == 'POST' and form.is_valid():
        with transaction.atomic():
            locked = Account.objects.select_for_update().get(pk=account.pk)
            for key in ['name', 'phone', 'service_address']:
                setattr(customer, key, form.cleaned_data[key])
            customer.save(update_fields=['name', 'phone', 'service_address'])
            for key in ['postal_code', 'delivery_instructions', 'service_email', 'marketing_consent']:
                setattr(locked, key, form.cleaned_data[key])
            locked.save()
            record(request.user, locked, 'Profile, address and preferences updated', account=locked, after={'marketing_consent': locked.marketing_consent, 'service_email': locked.service_email, 'address_changed': True})
        messages.success(request, 'Saved. Existing deliveries keep their original address snapshot.')
        return redirect('profile')
    return page(request, 'account', form=form, account=account, addresses=account.addresses.filter(active=True))


@login_required
def address_add(request):
    account = account_for(request)
    form = AddressForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        address = form.save(commit=False)
        address.account = account
        address.postal_code = address.postal_code.strip().upper()
        address.save()
        record(request.user, address, 'Service address added', account=account)
        return redirect('profile')
    return page(request, 'form', title='Add service address', form=form)


@login_required
@require_POST
def address_remove(request, pk):
    account = account_for(request)
    address = get_object_or_404(account.addresses, pk=pk, active=True)
    address.active = False
    address.save(update_fields=['active'])
    record(request.user, address, 'Service address archived', account=account)
    return redirect('profile')


@login_required
def enrollment(request):
    account = account_for(request)
    policy = Policy.objects.filter(active=True, published_at__lte=timezone.now()).order_by('-published_at', '-pk').first() if settings.STORAGE_AGREEMENT_FINALIZED else None
    form = EnrollmentForm(request.POST or None, initial={'policy_id': policy.pk if policy else None})
    if request.method == 'GET':
        requested_plan = {'small': 'Small', 'medium': 'Medium', 'big': 'Large'}.get(request.GET.get('plan'))
        if requested_plan:
            chosen = form.fields['offering'].queryset.filter(name=requested_plan, interval='year').first()
            if chosen:
                form.initial['offering'] = chosen.pk
    if request.method == 'POST' and form.is_valid():
        try:
            billing.enroll(request.user, account.pk, form.cleaned_data['offering'].pk, form.cleaned_data['policy_id'], **{key: form.cleaned_data[key] for key in ['accept', 'liability_acknowledged', 'recurring_authorized', 'disputes_acknowledged']})
        except ValidationError as error:
            form.add_error(None, error)
        else:
            return redirect('billing')
    return page(request, 'enroll', form=form, policy=policy, offerings=form.fields['offering'].queryset, account=account, available=enrollment_available(account.postal_code))


@login_required
def billing_page(request):
    account = account_for(request, allow_suspended=True)
    contract = Contract.objects.filter(account=account).first()
    estimate = None
    preview_unavailable = False
    if contract and contract.stripe_subscription_id:
        try:
            estimate = billing.preview(account)
        except (stripe.StripeError, billing.ProviderUnavailable):
            preview_unavailable = True
    return page(request, 'billing', account=account, contract=contract, invoices=account.invoices.order_by('-created_at'), acceptances=account.acceptance_set.order_by('-accepted_at'), estimate=estimate, preview_unavailable=preview_unavailable)


@login_required
@require_POST
def checkout(request, delivery_id=None):
    account = account_for(request)
    if delivery_id:
        get_object_or_404(Delivery, pk=delivery_id, account=account)
    try:
        attempt = billing.checkout(request.user, account.pk, delivery_id)
    except (ValidationError, billing.ProviderUnavailable, stripe.StripeError) as error:
        error_message(request, error)
        return redirect('delivery', pk=delivery_id) if delivery_id else redirect('billing')
    return redirect(attempt.url)


@login_required
@require_POST
def provider_portal(request):
    account = account_for(request, allow_suspended=True)
    try:
        return redirect(billing.portal_url(request.user, account))
    except (ValidationError, billing.ProviderUnavailable, stripe.StripeError) as error:
        error_message(request, error)
        return redirect('billing')


@login_required
def cancel_subscription(request):
    account = account_for(request, allow_suspended=True)
    contract = Contract.objects.filter(account=account).first()
    if request.method == 'POST':
        if request.POST.get('confirm') != 'yes':
            messages.error(request, 'Confirm that you want to cancel the subscription.')
        else:
            try:
                billing.cancel_subscription(request.user, account.pk)
            except (ValidationError, billing.ProviderUnavailable, stripe.StripeError) as error:
                error_message(request, error)
            else:
                messages.success(request, 'Cancellation submitted. Billing will show the provider-confirmed effective date when processed. Stored property remains yours; arrange its return with ToteKeeper.')
                return redirect('billing')
    return page(request, 'cancel', contract=contract, stored=account.customer.totes.filter(status__in=['in_storage', 'in_transit']).count(), acceptance=account.acceptance_set.order_by('-accepted_at').first())


@login_required
def inventory(request):
    account = account_for(request)
    return page(request, 'inventory', inventory=account.customer.totes.prefetch_related('photos').order_by('pk'))


@login_required
def item_edit(request, pk=None):
    account = account_for(request)
    item = get_object_or_404(Tote, pk=pk, customer=account.customer) if pk else Tote(customer=account.customer, status='registered')
    form = InventoryForm(request.POST or None, instance=item)
    if pk:
        form.fields.pop('item_type')
    if request.method == 'POST' and form.is_valid():
        item = form.save(commit=False)
        if pk:
            Tote.objects.filter(pk=pk, customer=account.customer).update(**form.cleaned_data)
        else:
            item.save()
        record(request.user, item, 'Inventory description updated' if pk else 'Inventory registered', account=account, after={'status': item.status, 'item_type': item.item_type})
        return redirect('item', pk=item.pk)
    return page(request, 'item', form=form, item=item if pk else None, photo_form=PhotoForm(), photos=item.photos.filter(deleted_at=None) if pk else [], movements=item.delivery_items.filter(delivery__account=account).select_related('delivery__window') if pk else [])


@login_required
@require_POST
def photo_upload(request, pk):
    account = account_for(request)
    get_object_or_404(Tote, pk=pk, customer=account.customer)
    form = PhotoForm(request.POST, request.FILES)
    if form.is_valid():
        try:
            upload_photo(request.user, account.pk, pk, form.cleaned_data['photo'])
        except ValidationError as error:
            error_message(request, error)
        else:
            messages.success(request, 'Photo uploaded. Unnecessary metadata was removed.')
    else:
        messages.error(request, 'Choose a supported photo file.')
    return redirect('item', pk=pk)


@login_required
def photo(request, key):
    current = role(request.user)
    images = Photo.objects.filter(deleted_at=None)
    if current == 'customer':
        images = images.filter(tote__customer=account_for(request).customer)
    elif current == 'steward':
        images = images.filter(tote__delivery_items__delivery__assigned_to=request.user, tote__delivery_items__delivery__status__in=operations.ACTIVE).distinct()
    elif current != 'administrator':
        raise PermissionDenied
    image = get_object_or_404(images, key=key)
    response = HttpResponse(bytes(image.content), content_type='image/jpeg')
    response['Content-Disposition'] = f'inline; filename="{image.key}.jpg"'
    response['X-Content-Type-Options'] = 'nosniff'
    response['Content-Security-Policy'] = "default-src 'none'; sandbox"
    response['Cache-Control'] = 'private, no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    return response


@login_required
@require_POST
def photo_remove(request, key):
    account = account_for(request)
    image = get_object_or_404(Photo, key=key, tote__customer=account.customer, deleted_at=None)
    delete_photo(request.user, account.pk, image)
    return redirect('item', pk=image.tote_id)


@login_required
def deliveries(request):
    account = account_for(request)
    return page(request, 'deliveries', deliveries=account.deliveries.select_related('window').order_by('-created_at'), credits=operations.available_credits(account), account=account, grants=account.credit_grants.prefetch_related('entries').order_by('expires_at'))


@login_required
def delivery_new(request):
    account = account_for(request)
    contract = Contract.objects.filter(account=account).first()
    credits = operations.available_credits(account)
    initial = {'address': account.customer.service_address, 'postal_code': account.postal_code, 'instructions': account.delivery_instructions}
    form = DeliveryForm(request.POST or None, account=account, initial=initial)
    if request.method == 'POST' and form.is_valid():
        data = form.cleaned_data
        try:
            delivery = operations.book(request.user, account.pk, data['kind'], data['window'].pk, [t.pk for t in data['inventory']], data['address'], data['postal_code'], data['instructions'], data['key'])
        except (ValidationError, Contract.DoesNotExist) as error:
            form.add_error(None, error if isinstance(error, ValidationError) else 'Enroll in a subscription first.')
        else:
            return redirect('delivery', pk=delivery.pk)
    return page(request, 'delivery_new', form=form, contract=contract, credits=credits, addresses=account.addresses.filter(active=True))


@login_required
def delivery_detail(request, pk):
    account = account_for(request)
    delivery = get_object_or_404(Delivery.objects.select_related('window'), pk=pk, account=account)
    form = RescheduleForm(request.POST or None, delivery=delivery)
    if request.method == 'POST':
        try:
            if request.POST.get('action') == 'cancel':
                operations.transition(request.user, delivery.pk, 'canceled')
            elif form.is_valid():
                operations.reschedule(request.user, delivery.pk, form.cleaned_data['window'].pk)
            else:
                return page(request, 'delivery', delivery=delivery, form=form)
        except ValidationError as error:
            error_message(request, error)
        return redirect('delivery', pk=pk)
    return page(request, 'delivery', delivery=delivery, form=form)


@login_required
def help_page(request):
    account = account_for(request, allow_suspended=True)
    form = SupportForm(request.POST or None)
    if request.method == 'POST' and form.is_valid():
        ticket = form.save(commit=False)
        ticket.account = account
        ticket.save()
        record(request.user, ticket, 'Support request submitted', account=account)
        messages.success(request, f'Support request #{ticket.pk} saved for our team. No response time is promised here.')
        return redirect('help')
    return page(request, 'help', form=form, phone=settings.BUSINESS_PHONE, email=settings.BUSINESS_EMAIL, hours=settings.BUSINESS_HOURS, tickets=account.support_requests.order_by('-created_at'))


@require_role('administrator', 'steward')
def staff_dashboard(request):
    requests = Delivery.objects.select_related('account__customer', 'window').order_by('window__starts_at')
    if role(request.user) == 'steward':
        requests = requests.filter(assigned_to=request.user)
    return page(request, 'staff', deliveries=requests, administrator=role(request.user) == 'administrator')


@require_role('administrator', 'steward')
def staff_delivery(request, pk):
    delivery = get_object_or_404(Delivery.objects.select_related('account__customer', 'window'), pk=pk)
    if not operational_access(request.user, delivery):
        raise PermissionDenied
    if request.method == 'POST':
        try:
            operations.transition(request.user, pk, request.POST.get('status'), request.POST.get('reason', ''))
        except ValidationError as error:
            error_message(request, error)
        return redirect('staff-delivery', pk=pk)
    return page(request, 'staff_delivery', delivery=delivery)


@require_role('administrator', 'steward')
def staff_item(request, pk):
    items = Tote.objects.all()
    if role(request.user) == 'steward':
        items = items.filter(delivery_items__delivery__assigned_to=request.user, delivery_items__delivery__status__in=operations.ACTIVE).distinct()
    item = get_object_or_404(items, pk=pk)
    if request.method == 'POST':
        with transaction.atomic():
            item = Tote.objects.select_for_update().get(pk=item.pk)
            before = {'location': item.location, 'seal_number': item.seal_number}
            location = request.POST.get('location', '').strip()
            seal = request.POST.get('seal_number', '').strip()
            if len(location) > 160 or len(seal) > 100:
                messages.error(request, 'Location or seal exceeds its length limit.')
            else:
                item.location = location
                item.seal_number = seal
                item.save(update_fields=['location', 'seal_number'])
                from storage.models import ToteHistory
                ToteHistory.objects.create(tote=item, actor=request.user, status=item.status, location=item.location, customer_id_snapshot=item.customer_id)
                account = Account.objects.filter(customer_id=item.customer_id).first()
                record(request.user, item, 'Operational item details updated', account=account, before=before, after={'location': item.location, 'seal_number': item.seal_number})
        return redirect('staff-item', pk=pk)
    return page(request, 'staff_item', item=item, photos=item.photos.filter(deleted_at=None))


@require_role('administrator')
def export_csv(request, kind):
    from storage.views import export_csv as legacy_export
    return legacy_export(request, kind)


@csrf_exempt
@require_POST
def webhook(request):
    if not settings.STRIPE_WEBHOOK_SECRET:
        return HttpResponse(status=503)
    try:
        event = stripe.Webhook.construct_event(request.body, request.headers.get('Stripe-Signature', ''), settings.STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.SignatureVerificationError):
        return HttpResponse(status=400)
    try:
        billing.process_event(event)
    except (stripe.StripeError, billing.ProviderUnavailable, ValidationError, Contract.DoesNotExist):
        return HttpResponse(status=503)
    return JsonResponse({'received': True})


@login_required
def acceptance_download(request, pk):
    account = account_for(request, allow_suspended=True)
    acceptance = get_object_or_404(account.acceptance_set, pk=pk)
    import json
    body = (f'Accepted at: {acceptance.accepted_at.isoformat()}\nAgreement version: {acceptance.policy.version}\n'
            f'Packing policy version: {acceptance.packing_version}\n\n'
            + 'ORDER\n' + json.dumps(acceptance.order_snapshot, indent=2) + '\n\n'
            + acceptance.terms_snapshot + '\n\nPACKING POLICY\n' + acceptance.packing_snapshot
            + '\n\nACKNOWLEDGMENTS\n' + json.dumps(acceptance.acknowledgments, indent=2))
    response = HttpResponse(body, content_type='text/plain; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="storage-agreement-{acceptance.pk}.txt"'
    response['Cache-Control'] = 'private, no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    return response


@login_required
def enrollment_documents(request, pk):
    account_for(request)
    policy = get_object_or_404(Policy, pk=pk, active=True, published_at__lte=timezone.now())
    response = HttpResponse(f'Agreement version: {policy.version}\n\n{policy.terms}\n\nPacking policy version: {policy.packing_version}\n\n{policy.packing_terms}\n\nCancellation\n{policy.cancellation}', content_type='text/plain; charset=utf-8')
    response['Content-Disposition'] = 'attachment; filename="storage-agreement-for-review.txt"'
    response['Cache-Control'] = 'private, no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    return response
