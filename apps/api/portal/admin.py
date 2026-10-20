from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin
from allauth.mfa.models import Authenticator
from storage.admin import AdministratorOnly, ReadOnlyAdmin
from . import models
from .audit import record

for model in [models.Address, models.Policy, models.Offering, models.ServiceWindow, models.SupportRequest]:
    admin.site.register(model, AdministratorOnly)


@admin.register(models.ServiceArea)
class ServiceAreaAdmin(AdministratorOnly):
    list_display = ['postal_code', 'name', 'active', 'auto_enrollment']
    list_filter = ['active', 'auto_enrollment']
    search_fields = ['postal_code', 'name']


@admin.register(models.Account)
class AccountAdmin(AdministratorOnly):
    list_display = ['id', 'customer', 'enrollment_status', 'closure_status', 'billing_review_required']
    readonly_fields = ['customer', 'stripe_customer_id', 'enrollment_status']

    def has_add_permission(self, request):
        return False


@admin.register(models.Delivery)
class DeliveryAdmin(AdministratorOnly):
    list_display = ['id', 'account', 'kind', 'status', 'window', 'assigned_to']
    list_filter = ['status', 'kind']
    readonly_fields = [field.name for field in models.Delivery._meta.fields if field.name != 'assigned_to']

    def has_add_permission(self, request):
        return False

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'assigned_to':
            kwargs['queryset'] = get_user_model().objects.filter(is_active=True, membership__role__in=['steward', 'administrator'])
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


for model in [models.Contract, models.Checkout, models.Invoice, models.Acceptance, models.LedgerEntry, models.CreditGrant, models.WebhookEvent, models.Membership, models.NotificationJob]:
    admin.site.register(model, ReadOnlyAdmin)

# MFA secrets/recovery codes and photo blobs must never appear in admin forms.
if admin.site.is_registered(Authenticator):
    admin.site.unregister(Authenticator)


admin.site.unregister(get_user_model())


@admin.register(get_user_model())
class SafeUserAdmin(UserAdmin):
    readonly_fields = ['is_staff', 'is_superuser', 'groups', 'user_permissions']

    def has_module_permission(self, request):
        return request.user.is_superuser

    def has_view_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_change_permission(self, request, obj=None):
        return request.user.is_superuser

    def has_add_permission(self, request):
        return request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        return False

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        record(request.user, obj, 'User account updated' if change else 'User account provisioned', after={'active': obj.is_active})

@admin.register(models.Inquiry)
class InquiryAdmin(ReadOnlyAdmin):
    list_display = ['reference', 'created_at', 'plan', 'delivery_status']
    list_filter = ['delivery_status', 'plan']
