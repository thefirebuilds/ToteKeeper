from django.contrib import admin, messages
from django.core.exceptions import ValidationError
from django.core.serializers.json import DjangoJSONEncoder
import json
from .models import Activity, Customer, Plan, ServiceRequest, Subscription, Tote, ToteHistory
from .services import bulk_move, save_tote
from portal.audit import record
from portal.permissions import role

admin.site.site_header = 'Octagon · ToteKeeper operations'
admin.site.site_title = 'Octagon'


class AdministratorOnly(admin.ModelAdmin):
    def has_module_permission(self, request):
        return role(request.user) == 'administrator'

    def has_view_permission(self, request, obj=None):
        return role(request.user) == 'administrator'

    def has_add_permission(self, request):
        return role(request.user) == 'administrator'

    def has_change_permission(self, request, obj=None):
        return role(request.user) == 'administrator'

    def has_delete_permission(self, request, obj=None):
        return False

    def save_model(self, request, obj, form, change):
        fields = {field.name: field for field in obj._meta.concrete_fields}
        changed = [name for name in form.changed_data if name in fields]
        before = {}
        if change:
            old = type(obj).objects.get(pk=obj.pk)
            before = {name: fields[name].value_from_object(old) for name in changed}
        super().save_model(request, obj, form, change)
        after = {name: fields[name].value_from_object(obj) for name in changed}
        before = json.loads(json.dumps(before, cls=DjangoJSONEncoder))
        after = json.loads(json.dumps(after, cls=DjangoJSONEncoder))
        account_id = getattr(obj, 'account_id', None)
        if isinstance(obj, Customer):
            from portal.models import Account
            account_id = Account.objects.filter(customer=obj).values_list('pk', flat=True).first()
        record(request.user, obj, 'Administrator updated record' if change else 'Administrator created record', account=account_id, before=before, after=after, reason=getattr(obj, 'review_reason', ''))


class ReadOnlyAdmin(AdministratorOnly):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Customer)
class CustomerAdmin(AdministratorOnly):
    list_display = ['name', 'email', 'phone', 'status']
    search_fields = ['name', 'email', 'phone', 'user__username']
    list_filter = ['status']
    autocomplete_fields = ['user']
    readonly_fields = ['email']

    def save_model(self, request, obj, form, change):
        obj.email = obj.user.email
        super().save_model(request, obj, form, change)


@admin.register(Plan)
class PlanAdmin(AdministratorOnly):
    list_display = ['name', 'tote_allowance', 'annual_price', 'is_draft']


@admin.register(Subscription)
class LegacySubscriptionAdmin(ReadOnlyAdmin):
    list_display = ['customer', 'plan', 'status', 'renewal_date', 'agreed_annual_price']


class HistoryInline(admin.TabularInline):
    model = ToteHistory
    extra = 0
    readonly_fields = ['created_at', 'actor', 'status', 'location', 'customer_id_snapshot']
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


def move_action(target):
    @admin.action(description=f'Move selected inventory: {target}')
    def action(modeladmin, request, queryset):
        try:
            bulk_move(request.user, list(queryset.values_list('pk', flat=True)), target)
        except ValidationError as error:
            modeladmin.message_user(request, '; '.join(error.messages), messages.ERROR)
        else:
            modeladmin.message_user(request, 'Inventory updated.')
    action.__name__ = 'move_' + target
    return action


@admin.register(Tote)
class ToteAdmin(AdministratorOnly):
    list_display = ['label', 'customer', 'item_type', 'nickname', 'status', 'location', 'oversized_approved']
    search_fields = ['label', 'nickname', 'customer__name', 'location']
    list_filter = ['status', 'item_type', 'oversized_approved']
    autocomplete_fields = ['customer']
    inlines = [HistoryInline]
    actions = [move_action(target) for target in ['in_transit', 'in_storage', 'with_customer', 'retired']]

    def get_readonly_fields(self, request, obj=None):
        return ['label'] if obj else []

    def save_model(self, request, obj, form, change):
        save_tote(request.user, obj)


@admin.register(ServiceRequest)
class LegacyRequestAdmin(ReadOnlyAdmin):
    list_display = ['id', 'customer', 'kind', 'status', 'preferred_date', 'appointment']


@admin.register(Activity)
class ActivityAdmin(ReadOnlyAdmin):
    list_display = ['created_at', 'actor_type', 'account_id', 'action', 'outcome', 'correlation_id']
    list_filter = ['actor_type', 'outcome', 'record_type']
    readonly_fields = [field.name for field in Activity._meta.fields]
