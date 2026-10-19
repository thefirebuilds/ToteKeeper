from django.contrib import admin
from django.urls import include, path
from portal import inquiries, views
from storage.views import health

urlpatterns = [
    path('api/inquiries/csrf/', inquiries.csrf),
    path('api/inquiries/', inquiries.submit),
    # Same handlers and authorization; retain legacy URLs.
    path('api/health/', health),
    path('api/stripe/webhook/', views.webhook),
    path('admin/', admin.site.urls),
    path('accounts/', include('allauth.urls')),
    path('health/', health, name='health'),
    path('', views.dashboard, name='dashboard'),
    path('account/', views.profile, name='profile'),
    path('account/addresses/new/', views.address_add, name='address-add'),
    path('account/addresses/<int:pk>/remove/', views.address_remove, name='address-remove'),
    path('enroll/', views.enrollment, name='enroll'),
    path('billing/', views.billing_page, name='billing'),
    path('billing/checkout/', views.checkout, name='checkout'),
    path('billing/portal/', views.provider_portal, name='provider-portal'),
    path('billing/cancel/', views.cancel_subscription, name='subscription-cancel'),
    path('inventory/', views.inventory, name='inventory'),
    path('inventory/new/', views.item_edit, name='item-new'),
    path('inventory/<int:pk>/', views.item_edit, name='item'),
    path('inventory/<int:pk>/photos/', views.photo_upload, name='photo-upload'),
    path('photos/<uuid:key>/', views.photo, name='photo'),
    path('photos/<uuid:key>/remove/', views.photo_remove, name='photo-remove'),
    path('deliveries/', views.deliveries, name='deliveries'),
    path('deliveries/new/', views.delivery_new, name='delivery-new'),
    path('deliveries/<int:pk>/', views.delivery_detail, name='delivery'),
    path('deliveries/<int:delivery_id>/checkout/', views.checkout, name='delivery-checkout'),
    path('help/', views.help_page, name='help'),
    path('octagon/', views.staff_dashboard, name='staff'),
    path('octagon/deliveries/<int:pk>/', views.staff_delivery, name='staff-delivery'),
    path('octagon/inventory/<int:pk>/', views.staff_item, name='staff-item'),
    path('octagon/export/<str:kind>/', views.export_csv, name='export'),
    path('stripe/webhook/', views.webhook, name='stripe-webhook'),
]
