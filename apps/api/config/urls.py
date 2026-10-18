from django.contrib import admin
from django.urls import include, path
from storage import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('accounts/', include('django.contrib.auth.urls')),
    path('health/', views.health, name='health'),
    path('', views.dashboard, name='dashboard'),
    path('totes/', views.totes, name='totes'),
    path('totes/<int:pk>/', views.tote_detail, name='tote'),
    path('profile/', views.profile, name='profile'),
    path('requests/', views.requests, name='requests'),
    path('requests/new/', views.request_new, name='request-new'),
    path('requests/<int:pk>/', views.request_detail, name='request-detail'),
    path('requests/<int:pk>/cancel/', views.cancel_request, name='request-cancel'),
    path('operations/', views.operations, name='operations'),
    path('operations/requests/<int:pk>/', views.manage_request, name='manage-request'),
    path('operations/export/<str:kind>/', views.export_csv, name='export'),
]
