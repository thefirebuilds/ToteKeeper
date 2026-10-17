import uuid
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, RegexValidator
from django.db import models


class Customer(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='customer')
    name = models.CharField(max_length=160)
    email = models.EmailField()
    phone = models.CharField(max_length=40, blank=True)
    service_address = models.TextField(max_length=1000)
    status = models.CharField(max_length=12, choices=[('active', 'Active'), ('suspended', 'Suspended')], default='active')
    visible_notes = models.TextField(blank=True)
    admin_notes = models.TextField(blank=True)

    def __str__(self):
        return self.name


class Plan(models.Model):
    name = models.CharField(max_length=100, unique=True)
    tote_allowance = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    annual_price = models.DecimalField(max_digits=9, decimal_places=2, validators=[MinValueValidator(0)])
    is_draft = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class Subscription(models.Model):
    customer = models.OneToOneField(Customer, on_delete=models.PROTECT, related_name='subscription')
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT)
    status = models.CharField(max_length=12, choices=[('active', 'Active'), ('paused', 'Paused'), ('ended', 'Ended')], default='active')
    start_date = models.DateField()
    renewal_date = models.DateField()
    agreed_annual_price = models.DecimalField(max_digits=9, decimal_places=2, validators=[MinValueValidator(0)])
    payment_status = models.CharField(max_length=12, choices=[('unpaid', 'Unpaid'), ('paid', 'Paid'), ('overdue', 'Overdue')], default='unpaid')

    def clean(self):
        if self.start_date and self.renewal_date and self.renewal_date <= self.start_date:
            raise ValidationError('Renewal must be after the start date.')

    def __str__(self):
        return f'{self.customer} subscription'


def tote_id():
    return 'T-' + uuid.uuid4().hex[:12].upper()


class Tote(models.Model):
    class Status(models.TextChoices):
        WITH_CUSTOMER = 'with_customer', 'With customer'
        PICKUP = 'pickup_scheduled', 'Pickup scheduled'
        TRANSIT = 'in_transit', 'In transit'
        STORAGE = 'in_storage', 'In storage'
        RETURN = 'return_scheduled', 'Return scheduled'
        RETIRED = 'retired', 'Retired'

    label = models.CharField(max_length=32, unique=True, default=tote_id, validators=[RegexValidator(r'^[A-Z0-9-]+$', 'Use uppercase letters, numbers and hyphens.')])
    customer = models.ForeignKey(Customer, null=True, blank=True, on_delete=models.PROTECT, related_name='totes')
    nickname = models.CharField(max_length=100, blank=True)
    category = models.CharField(max_length=100, blank=True)
    description = models.TextField(max_length=3000, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.WITH_CUSTOMER)
    location = models.CharField(max_length=160, blank=True)
    seal_number = models.CharField(max_length=100, blank=True)
    declared_value = models.DecimalField(max_digits=10, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    admin_notes = models.TextField(blank=True)

    def clean(self):
        if self.customer_id and self.customer.status != 'active':
            raise ValidationError('Totes can only be assigned to active customers.')
        if not self.pk and self.status in [self.Status.PICKUP, self.Status.RETURN]:
            raise ValidationError('Scheduled statuses are managed through requests.')
        if self.pk:
            old = Tote.objects.get(pk=self.pk)
            transitions = {
                self.Status.WITH_CUSTOMER: {self.Status.TRANSIT, self.Status.RETIRED},
                self.Status.TRANSIT: {self.Status.WITH_CUSTOMER, self.Status.STORAGE},
                self.Status.STORAGE: {self.Status.TRANSIT, self.Status.RETIRED},
                self.Status.RETIRED: {self.Status.WITH_CUSTOMER},
            }
            if old.status != self.status and self.status not in transitions.get(old.status, set()):
                raise ValidationError('Invalid tote status transition. Scheduled statuses are managed through requests.')
            if (old.customer_id != self.customer_id or old.status != self.status) and self.request_items.filter(request__status__in=['requested', 'confirmed']).exists():
                raise ValidationError('Use the request workflow while this tote has an active request.')
            if old.customer_id != self.customer_id and old.status not in [self.Status.WITH_CUSTOMER, self.Status.RETIRED]:
                raise ValidationError('Only totes with the customer or retired totes may be reassigned.')
        if not self.customer_id and self.status not in [self.Status.WITH_CUSTOMER, self.Status.RETIRED]:
            raise ValidationError('A moving or stored tote must have an owner.')

    def __str__(self):
        return self.label


class ServiceRequest(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name='requests')
    kind = models.CharField(max_length=10, choices=[('collection', 'Collection'), ('return', 'Return delivery')])
    preferred_date = models.DateField()
    preferred_window = models.CharField(max_length=100)
    address_snapshot = models.TextField(max_length=1000)
    instructions = models.TextField(max_length=3000, blank=True)
    status = models.CharField(max_length=12, choices=[('requested', 'Requested'), ('confirmed', 'Confirmed'), ('completed', 'Completed'), ('canceled', 'Canceled')], default='requested')
    appointment = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    totes = models.ManyToManyField(Tote, through='RequestItem')

    def __str__(self):
        return f'#{self.pk} {self.get_kind_display()}'


class RequestItem(models.Model):
    request = models.ForeignKey(ServiceRequest, on_delete=models.PROTECT, related_name='items')
    tote = models.ForeignKey(Tote, on_delete=models.PROTECT, related_name='request_items')

    class Meta:
        constraints = [models.UniqueConstraint(fields=['request', 'tote'], name='unique_request_tote')]


class Activity(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    record_type = models.CharField(max_length=40)
    record_id = models.PositiveBigIntegerField()
    action = models.CharField(max_length=200)
    details = models.JSONField(default=dict)

    class Meta:
        ordering = ['-created_at']


class ToteHistory(models.Model):
    tote = models.ForeignKey(Tote, on_delete=models.PROTECT, related_name='history')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20)
    location = models.CharField(max_length=160, blank=True)
    customer_id_snapshot = models.PositiveBigIntegerField(null=True)

    class Meta:
        ordering = ['-created_at']
