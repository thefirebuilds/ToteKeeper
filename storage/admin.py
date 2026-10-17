from django.contrib import admin, messages
from django.core.exceptions import ValidationError
from django.utils.html import format_html
from .models import Activity, Customer, Plan, RequestItem, ServiceRequest, Subscription, Tote, ToteHistory
from .services import audit, bulk_move, save_tote

admin.site.site_header = 'Your Storage Business · Operations'
admin.site.site_title = 'Storage administration'


class AuditedAdmin(admin.ModelAdmin):
    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        audit(request.user, obj, 'Admin updated record' if change else 'Admin created record')

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Customer)
class CustomerAdmin(AuditedAdmin):
    list_display = ['name', 'email', 'phone', 'status']
    search_fields = ['name', 'email', 'phone', 'user__username']
    list_filter = ['status']
    autocomplete_fields = ['user']

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        type(obj.user).objects.filter(pk=obj.user_id).update(email=obj.email)


@admin.register(Plan)
class PlanAdmin(AuditedAdmin):
    list_display = ['name', 'tote_allowance', 'annual_price', 'is_draft']


@admin.register(Subscription)
class SubscriptionAdmin(AuditedAdmin):
    list_display = ['customer', 'plan', 'status', 'renewal_date', 'agreed_annual_price', 'payment_status']
    list_filter = ['status', 'payment_status']
    autocomplete_fields = ['customer']


class HistoryInline(admin.TabularInline):
    model = ToteHistory
    extra = 0
    fields = ['created_at', 'actor', 'status', 'location', 'customer_id_snapshot']
    readonly_fields = fields
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


def movement_action(target, label):
    @admin.action(description=label)
    def action(modeladmin, request, queryset):
        try:
            bulk_move(request.user, list(queryset.values_list('pk', flat=True)), target)
        except ValidationError as error:
            modeladmin.message_user(request, '; '.join(error.messages), messages.ERROR)
        else:
            modeladmin.message_user(request, 'Selected totes updated.', messages.SUCCESS)
    action.__name__ = 'move_' + target
    return action


@admin.register(Tote)
class ToteAdmin(AuditedAdmin):
    list_display = ['label', 'customer', 'nickname', 'status', 'location', 'seal_number']
    search_fields = ['label', 'nickname', 'customer__name', 'location', 'seal_number']
    list_filter = ['status', 'category']
    autocomplete_fields = ['customer']
    readonly_fields = ['label']
    inlines = [HistoryInline]
    actions = [movement_action('in_transit', 'Move selected totes into transit'), movement_action('in_storage', 'Move selected totes into storage'), movement_action('with_customer', 'Mark selected totes with customer'), movement_action('retired', 'Retire selected totes')]

    def get_readonly_fields(self, request, obj=None):
        return ['label'] if obj else []

    def save_model(self, request, obj, form, change):
        save_tote(request.user, obj)


class ItemInline(admin.TabularInline):
    model = RequestItem
    extra = 0
    readonly_fields = ['tote']
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(ServiceRequest)
class RequestAdmin(admin.ModelAdmin):
    list_display = ['id', 'customer', 'kind', 'status', 'preferred_date', 'appointment', 'workflow']
    list_filter = ['status', 'kind']
    search_fields = ['customer__name', 'customer__email']
    readonly_fields = [f.name for f in ServiceRequest._meta.fields] + ['workflow']
    inlines = [ItemInline]

    @admin.display(description='Manage')
    def workflow(self, obj):
        return format_html('<a href="/operations/requests/{}/">Confirm / cancel / complete</a>', obj.pk)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ['created_at', 'actor', 'record_type', 'record_id', 'action']
    list_filter = ['record_type', 'action']
    readonly_fields = [f.name for f in Activity._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
