import csv
from functools import wraps
from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import connection, transaction
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST, require_safe
from .forms import AppointmentForm, ProfileForm, RequestForm, ToteForm
from .models import Customer, ServiceRequest, Tote
from .services import audit, create_request, transition_request


def customer_for(request):
    return get_object_or_404(Customer, user=request.user, status='active')


def operator(view):
    @login_required
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if not request.user.is_staff:
            raise PermissionDenied
        return view(request, *args, **kwargs)
    return wrapped


@require_safe
def health(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
    except Exception:
        return JsonResponse({'status': 'unavailable'}, status=503)
    return JsonResponse({'status': 'ok'})


@login_required
def dashboard(request):
    if request.user.is_staff:
        return redirect('operations')
    customer = customer_for(request)
    return render(request, 'storage/dashboard.html', {'customer': customer, 'totes': customer.totes.exclude(status='retired'), 'upcoming': customer.requests.filter(status__in=['requested', 'confirmed']).order_by('preferred_date')})


@login_required
def totes(request):
    return render(request, 'storage/totes.html', {'totes': customer_for(request).totes.all()})


@login_required
def tote_detail(request, pk):
    tote = get_object_or_404(Tote, pk=pk, customer=customer_for(request))
    form = ToteForm(request.POST or None, instance=tote)
    if request.method == 'POST' and form.is_valid():
        with transaction.atomic():
            # Only the two allowed fields are updated, avoiding stale operational data.
            Tote.objects.filter(pk=tote.pk, customer__user=request.user).update(**form.cleaned_data)
            audit(request.user, tote, 'Customer updated tote details')
        messages.success(request, 'Tote details saved.')
        return redirect('tote', pk=pk)
    return render(request, 'storage/tote.html', {'tote': tote, 'form': form})


@login_required
def profile(request):
    customer = customer_for(request)
    form = ProfileForm(request.POST or None, instance=customer)
    if request.method == 'POST' and form.is_valid():
        with transaction.atomic():
            Customer.objects.filter(pk=customer.pk).update(**form.cleaned_data)
            # Password resets use Django User.email; keep it synchronized.
            get_user_model().objects.filter(pk=request.user.pk).update(email=form.cleaned_data['email'])
            audit(request.user, customer, 'Customer updated profile')
        messages.success(request, 'Profile saved. Existing requests keep their original address.')
        return redirect('profile')
    return render(request, 'storage/form.html', {'form': form, 'title': 'Your profile'})


@login_required
def request_new(request):
    customer = customer_for(request)
    form = RequestForm(request.POST or None, customer=customer)
    if request.method == 'POST' and form.is_valid():
        data = form.cleaned_data
        try:
            service = create_request(request.user, customer.pk, [t.pk for t in data['totes']], data['kind'], data['preferred_date'], data['preferred_window'], data['instructions'])
        except ValidationError as error:
            form.add_error(None, error)
        else:
            messages.success(request, 'Request submitted. Your appointment is not confirmed until approved.')
            return redirect('request-detail', pk=service.pk)
    return render(request, 'storage/form.html', {'form': form, 'title': 'Request collection or return', 'notice': 'We collect and return your packed, sealed totes. We do not pack belongings, decorate homes, or enter attics. A requested appointment is not confirmed until approved.'})


@login_required
def requests(request):
    return render(request, 'storage/requests.html', {'requests': customer_for(request).requests.order_by('-created_at')})


@login_required
def request_detail(request, pk):
    service = get_object_or_404(ServiceRequest, pk=pk, customer=customer_for(request))
    return render(request, 'storage/request.html', {'service': service})


@login_required
@require_POST
def cancel_request(request, pk):
    service = get_object_or_404(ServiceRequest, pk=pk, customer=customer_for(request))
    try:
        transition_request(request.user, service.pk, 'canceled')
    except ValidationError as error:
        messages.error(request, '; '.join(error.messages))
    return redirect('request-detail', pk=pk)


@operator
def operations(request):
    return render(request, 'storage/operations.html', {'customer_count': Customer.objects.count(), 'stored_count': Tote.objects.filter(status='in_storage').count(), 'pending': ServiceRequest.objects.filter(status='requested').select_related('customer').order_by('created_at'), 'appointments': ServiceRequest.objects.filter(status='confirmed', appointment__gte=timezone.now()).select_related('customer').order_by('appointment')})


@operator
def manage_request(request, pk):
    service = get_object_or_404(ServiceRequest, pk=pk)
    form = AppointmentForm(request.POST or None)
    if request.method == 'POST':
        target = request.POST.get('action')
        if target != 'confirmed' or form.is_valid():
            try:
                transition_request(request.user, service.pk, target, form.cleaned_data.get('appointment') if target == 'confirmed' else None)
            except ValidationError as error:
                messages.error(request, '; '.join(error.messages))
            else:
                messages.success(request, 'Request updated.')
                return redirect('manage-request', pk=pk)
    return render(request, 'storage/manage_request.html', {'service': service, 'form': form})


def safe_cell(value):
    text = str(value if value is not None else '')
    return "'" + text if text.lstrip().startswith(('=', '+', '-', '@', '\t', '\r', '\n')) else text


@operator
def export_csv(request, kind):
    if kind == 'customers':
        fields = ['id', 'name', 'email', 'phone', 'service_address', 'status']
        records = Customer.objects.order_by('pk').values_list(*fields)
    elif kind == 'totes':
        fields = ['label', 'customer_id', 'nickname', 'category', 'status', 'location', 'seal_number', 'declared_value']
        records = Tote.objects.order_by('pk').values_list(*fields)
    else:
        return HttpResponse(status=404)
    response = HttpResponse(content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="{kind}.csv"'
    response['Cache-Control'] = 'no-store'
    writer = csv.writer(response)
    writer.writerow(fields)
    for row in records:
        writer.writerow([safe_cell(value) for value in row])
    return response
