import uuid
from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone
from storage.models import Customer, Tote
from .scheduling import MINIMUM_NOTICE_HOURS


class Membership(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    role = models.CharField(max_length=16, choices=[('steward', 'Steward'), ('administrator', 'Administrator')])


class ServiceArea(models.Model):
    name = models.CharField(max_length=100)
    postal_code = models.CharField(max_length=16, unique=True)
    active = models.BooleanField(default=False)

    def __str__(self):
        return f'{self.name} · {self.postal_code}'


class Policy(models.Model):
    version = models.CharField(max_length=60, unique=True)
    terms = models.TextField()
    cancellation = models.TextField()
    active = models.BooleanField(default=False)
    published_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return self.version

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.pk and self.acceptance_set.exists():
            old = Policy.objects.get(pk=self.pk)
            if (old.version, old.terms, old.cancellation) != (self.version, self.terms, self.cancellation):
                raise ValidationError('This policy has acceptances. Publish a new version instead of changing its terms.')


class Offering(models.Model):
    """Publish a new version to change commercial terms; enrolled snapshots stay fixed."""
    name = models.CharField(max_length=120)
    version = models.CharField(max_length=40)
    state = models.CharField(max_length=12, choices=[('draft', 'Draft'), ('active', 'Active'), ('archived', 'Archived')], default='draft')
    effective_from = models.DateTimeField(default=timezone.now)
    effective_until = models.DateTimeField(null=True, blank=True)
    price_cents = models.PositiveIntegerField()
    currency = models.CharField(max_length=3, default='usd')
    interval = models.CharField(max_length=8, choices=[('month', 'Monthly'), ('year', 'Annually')])
    storage_allowance = models.PositiveIntegerField()
    capacity = models.PositiveIntegerField(default=0, help_text='Maximum concurrent enrollments; zero means closed.')
    included_credits = models.PositiveIntegerField(default=0)
    credit_definition = models.CharField(max_length=300, help_text='Describe exactly what one credit buys.')
    credits_per_visit = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    credit_valid_days = models.PositiveIntegerField(default=365, validators=[MinValueValidator(1)])
    carry_over = models.BooleanField(default=False)
    extra_delivery_cents = models.PositiveIntegerField(default=0)
    stripe_price_id = models.CharField(max_length=120, blank=True)
    stripe_delivery_price_id = models.CharField(max_length=120, blank=True)
    tax_mode = models.CharField(max_length=12, choices=[('unreviewed', 'Not reviewed'), ('automatic', 'Stripe Tax'), ('none', 'Reviewed: no tax')], default='unreviewed')
    recurring_details = models.TextField(blank=True, help_text='Known recurring extras; provider preview remains authoritative.')

    class Meta:
        constraints = [models.UniqueConstraint(fields=['name', 'version'], name='unique_offering_version')]

    def __str__(self):
        return f'{self.name} · {self.version}'

    def clean(self):
        from django.core.exceptions import ValidationError
        self.currency = self.currency.lower()
        if len(self.currency) != 3 or not self.currency.isalpha():
            raise ValidationError('Use a three-letter currency code.')
        if self.effective_from and self.effective_until and self.effective_until <= self.effective_from:
            raise ValidationError('Effective end must be after the start.')
        if self.pk and self.contract_set.exists():
            old = Offering.objects.get(pk=self.pk)
            terms = ['price_cents', 'currency', 'interval', 'storage_allowance', 'included_credits', 'credit_definition', 'credits_per_visit', 'credit_valid_days', 'carry_over', 'extra_delivery_cents', 'stripe_price_id', 'stripe_delivery_price_id', 'tax_mode', 'recurring_details']
            if any(getattr(old, field) != getattr(self, field) for field in terms):
                raise ValidationError('Customers have accepted this offering. Create a new version for changed commercial terms.')

    @property
    def price(self):
        return f'{self.price_cents / 100:.2f}'


class Account(models.Model):
    customer = models.OneToOneField(Customer, on_delete=models.PROTECT, related_name='portal_account')
    postal_code = models.CharField(max_length=16, blank=True)
    delivery_instructions = models.TextField(max_length=2000, blank=True)
    marketing_consent = models.BooleanField(default=False)
    service_email = models.BooleanField(default=True, help_text='Optional service reminders. Required account/payment messages are always sent.')
    enrollment_status = models.CharField(max_length=30, default='profile')
    stripe_customer_id = models.CharField(max_length=120, unique=True, null=True, blank=True)
    closure_status = models.CharField(max_length=20, default='open')
    billing_review_required = models.BooleanField(default=False)
    review_reason = models.CharField(max_length=300, blank=True)

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.pk and not self.billing_review_required and Account.objects.filter(pk=self.pk, billing_review_required=True).exists() and not self.review_reason.strip():
            raise ValidationError('Record an approved case/reason before clearing a billing review hold.')


class Address(models.Model):
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='addresses')
    label = models.CharField(max_length=80)
    address = models.TextField(max_length=1000)
    postal_code = models.CharField(max_length=16)
    instructions = models.TextField(max_length=2000, blank=True)
    active = models.BooleanField(default=True)


class Acceptance(models.Model):
    account = models.ForeignKey(Account, on_delete=models.PROTECT)
    policy = models.ForeignKey(Policy, on_delete=models.PROTECT)
    accepted_at = models.DateTimeField(auto_now_add=True)
    terms_snapshot = models.TextField()
    cancellation_snapshot = models.TextField()


class Contract(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    account = models.OneToOneField(Account, on_delete=models.PROTECT, related_name='contract')
    offering = models.ForeignKey(Offering, on_delete=models.PROTECT)
    terms = models.JSONField(default=dict)
    status = models.CharField(max_length=30, default='pending')
    stripe_subscription_id = models.CharField(max_length=120, unique=True, null=True, blank=True)
    renewal_at = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    canceled_at = models.DateTimeField(null=True, blank=True)
    payment_status = models.CharField(max_length=30, default='unpaid')
    last_provider_at = models.BigIntegerField(default=0)
    last_paid_period = models.BigIntegerField(default=0)


class ServiceWindow(models.Model):
    area = models.ForeignKey(ServiceArea, on_delete=models.PROTECT)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    capacity = models.PositiveIntegerField(default=1)
    lead_hours = models.PositiveIntegerField(default=MINIMUM_NOTICE_HOURS)
    cancellation_hours = models.PositiveIntegerField(default=24)
    blackout = models.BooleanField(default=False)

    def __str__(self):
        return f'{timezone.localtime(self.starts_at):%b %d, %I:%M %p} – {timezone.localtime(self.ends_at):%I:%M %p} · {self.area.name}'

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.starts_at and self.ends_at and self.ends_at <= self.starts_at:
            raise ValidationError('Window end must be after its start.')


class Delivery(models.Model):
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='deliveries')
    kind = models.CharField(max_length=12, choices=[('pickup', 'Pickup'), ('return', 'Return'), ('exchange', 'Exchange')])
    window = models.ForeignKey(ServiceWindow, on_delete=models.PROTECT)
    status = models.CharField(max_length=20, choices=[(v, v.replace('_', ' ').title()) for v in ['requested', 'awaiting_payment', 'confirmed', 'in_progress', 'completed', 'canceled', 'unable_to_complete']], default='requested')
    address_snapshot = models.TextField()
    postal_code = models.CharField(max_length=16)
    instructions = models.TextField(max_length=2000, blank=True)
    extra_cents = models.PositiveIntegerField(default=0)
    currency = models.CharField(max_length=3)
    reserved_credits = models.PositiveIntegerField(default=0)
    reservation_expires = models.DateTimeField(null=True, blank=True)
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    idempotency_key = models.UUIDField(default=uuid.uuid4, unique=True)


class DeliveryItem(models.Model):
    delivery = models.ForeignKey(Delivery, on_delete=models.PROTECT, related_name='items')
    tote = models.ForeignKey(Tote, on_delete=models.PROTECT, related_name='delivery_items')
    direction = models.CharField(max_length=8, choices=[('pickup', 'Pickup'), ('return', 'Return')])

    class Meta:
        constraints = [models.UniqueConstraint(fields=['delivery', 'tote'], name='unique_delivery_item')]


class CreditGrant(models.Model):
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='credit_grants')
    quantity = models.PositiveIntegerField()
    expires_at = models.DateTimeField()
    source = models.CharField(max_length=160, unique=True)
    definition = models.CharField(max_length=300)


class LedgerEntry(models.Model):
    grant = models.ForeignKey(CreditGrant, on_delete=models.PROTECT, related_name='entries')
    delivery = models.ForeignKey(Delivery, on_delete=models.PROTECT, null=True, blank=True)
    kind = models.CharField(max_length=16, choices=[(v, v.title()) for v in ['grant', 'reserve', 'release', 'consume', 'expire', 'refund', 'adjust']])
    available_delta = models.IntegerField(default=0)
    reserved_delta = models.IntegerField(default=0)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    reason = models.CharField(max_length=300)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if self.pk:
            from django.core.exceptions import ValidationError
            raise ValidationError('Ledger entries are append-only; create an adjustment instead.')
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        from django.core.exceptions import ValidationError
        raise ValidationError('Ledger entries are append-only.')


class Checkout(models.Model):
    key = models.UUIDField(default=uuid.uuid4, unique=True)
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='checkouts')
    contract = models.ForeignKey(Contract, on_delete=models.PROTECT, null=True)
    delivery = models.ForeignKey(Delivery, on_delete=models.PROTECT, null=True)
    state = models.CharField(max_length=20, default='creating')
    stripe_session_id = models.CharField(max_length=160, unique=True, null=True)
    stripe_payment_id = models.CharField(max_length=160, blank=True)
    url = models.URLField(max_length=2000, blank=True)
    expires_at = models.DateTimeField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Invoice(models.Model):
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='invoices')
    provider_id = models.CharField(max_length=160, unique=True)
    status = models.CharField(max_length=30)
    total_cents = models.IntegerField()
    currency = models.CharField(max_length=3)
    url = models.URLField(max_length=2000, blank=True)
    receipt_url = models.URLField(max_length=2000, blank=True)
    created_at = models.DateTimeField(default=timezone.now)


class WebhookEvent(models.Model):
    provider_id = models.CharField(max_length=160, unique=True)
    event_type = models.CharField(max_length=120)
    provider_created = models.BigIntegerField()
    outcome = models.CharField(max_length=30, default='processed')
    created_at = models.DateTimeField(auto_now_add=True)


class Photo(models.Model):
    tote = models.ForeignKey(Tote, on_delete=models.PROTECT, related_name='photos')
    key = models.UUIDField(default=uuid.uuid4, unique=True)
    # Validated/re-encoded small images live privately in PostgreSQL for this MVP.
    content = models.BinaryField()
    created_at = models.DateTimeField(auto_now_add=True)
    deleted_at = models.DateTimeField(null=True, blank=True)


class SupportRequest(models.Model):
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='support_requests')
    subject = models.CharField(max_length=160)
    message = models.TextField(max_length=4000)
    callback = models.BooleanField(default=False)
    status = models.CharField(max_length=12, choices=[('open', 'Open'), ('resolved', 'Resolved')], default='open')
    created_at = models.DateTimeField(auto_now_add=True)


class NotificationJob(models.Model):
    account = models.ForeignKey(Account, on_delete=models.PROTECT)
    key = models.CharField(max_length=200, unique=True)
    subject = models.CharField(max_length=200)
    message = models.TextField()
    sent_at = models.DateTimeField(null=True)
    attempts = models.PositiveIntegerField(default=0)

class Inquiry(models.Model):
    """Private lead and delivery receipt; independent of accounts or subscriptions."""
    reference = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    request_key = models.UUIDField(unique=True, editable=False)
    fingerprint = models.CharField(max_length=64, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    name = models.CharField(max_length=100)
    email = models.EmailField()
    zip_code = models.CharField(max_length=10)
    plan = models.CharField(max_length=12)
    description = models.TextField(max_length=1000)
    phone = models.CharField(max_length=30, blank=True)
    reply_method = models.CharField(max_length=5, default='email')
    source = models.CharField(max_length=24)
    context = models.CharField(max_length=20, default='general')
    delivery_status = models.CharField(max_length=8, default='sending', choices=[('sending', 'Sending / needs review'), ('sent', 'Accepted by provider'), ('failed', 'Needs manual follow-up')])
    delivered_at = models.DateTimeField(null=True, blank=True)
