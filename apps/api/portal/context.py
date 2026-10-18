from django.conf import settings


def portal_context(request):
    return {'development_mode': settings.DEBUG, 'service_timezone': settings.TIME_ZONE}
