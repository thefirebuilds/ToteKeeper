import os
from datetime import timedelta
from pathlib import Path
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'
SECRET_KEY = os.getenv('SECRET_KEY', '')
ALLOWED_HOSTS = [x.strip() for x in os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1' if DEBUG else '').split(',') if x.strip()]
CSRF_TRUSTED_ORIGINS = [x.strip() for x in os.getenv('CSRF_TRUSTED_ORIGINS', '').split(',') if x.strip()]
if DEBUG:
    SECRET_KEY = SECRET_KEY or 'local-development-only-not-for-production'
elif len(SECRET_KEY) < 50 or not ALLOWED_HOSTS or not CSRF_TRUSTED_ORIGINS or not os.getenv('POSTGRES_PASSWORD'):
    raise ImproperlyConfigured('Production requires a 50+ character SECRET_KEY, ALLOWED_HOSTS, CSRF_TRUSTED_ORIGINS and POSTGRES_PASSWORD.')

INSTALLED_APPS = ['django.contrib.admin', 'django.contrib.auth', 'django.contrib.contenttypes', 'django.contrib.sessions', 'django.contrib.messages', 'django.contrib.staticfiles', 'axes', 'storage']
MIDDLEWARE = ['django.middleware.security.SecurityMiddleware', 'whitenoise.middleware.WhiteNoiseMiddleware', 'django.contrib.sessions.middleware.SessionMiddleware', 'django.middleware.common.CommonMiddleware', 'django.middleware.csrf.CsrfViewMiddleware', 'django.contrib.auth.middleware.AuthenticationMiddleware', 'django.contrib.messages.middleware.MessageMiddleware', 'django.middleware.clickjacking.XFrameOptionsMiddleware', 'axes.middleware.AxesMiddleware']
ROOT_URLCONF = 'config.urls'
TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates', 'DIRS': [BASE_DIR / 'templates'], 'APP_DIRS': True, 'OPTIONS': {'context_processors': ['django.template.context_processors.request', 'django.contrib.auth.context_processors.auth', 'django.contrib.messages.context_processors.messages']}}]
WSGI_APPLICATION = 'config.wsgi.application'
DATABASES = {'default': {'ENGINE': 'django.db.backends.postgresql', 'NAME': os.getenv('POSTGRES_DB', 'octagon'), 'USER': os.getenv('POSTGRES_USER', 'octagon'), 'PASSWORD': os.getenv('POSTGRES_PASSWORD', ''), 'HOST': os.getenv('POSTGRES_HOST', 'db'), 'PORT': os.getenv('POSTGRES_PORT', '5432')}}
if DEBUG and os.getenv('USE_SQLITE', 'false').lower() == 'true':
    DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': BASE_DIR / 'db.sqlite3'}}
AUTH_PASSWORD_VALIDATORS = [{'NAME': 'django.contrib.auth.password_validation.' + name} for name in ['UserAttributeSimilarityValidator', 'MinimumLengthValidator', 'CommonPasswordValidator', 'NumericPasswordValidator']]
AUTHENTICATION_BACKENDS = ['axes.backends.AxesStandaloneBackend', 'django.contrib.auth.backends.ModelBackend']
AXES_FAILURE_LIMIT = 5
AXES_COOLOFF_TIME = timedelta(minutes=30)
AXES_LOCKOUT_PARAMETERS = ['username']
# Account-based lockout works across proxy addresses and client IP rotation.
# IP lockouts would treat every customer as Caddy's internal IP without trusted-IP parsing.
SILENCED_SYSTEM_CHECKS = ['axes.W006']
AXES_RESET_ON_SUCCESS = True
AXES_ENABLE_ACCESS_FAILURE_LOG = False
AXES_DISABLE_ACCESS_LOG = True
AXES_SENSITIVE_PARAMETERS = ['username', 'ip_address', 'user_agent', 'path_info', 'http_accept']
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'America/Chicago'
USE_TZ = True
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [BASE_DIR / 'static']
STORAGES = {'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'}, 'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'}}
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
LOGIN_URL = '/accounts/login/'
LOGIN_REDIRECT_URL = '/'
LOGOUT_REDIRECT_URL = LOGIN_URL
EMAIL_BACKEND = os.getenv('EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend' if DEBUG else 'django.core.mail.backends.smtp.EmailBackend')
EMAIL_HOST = os.getenv('EMAIL_HOST', '')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587'))
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'true').lower() == 'true'
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'local@example.invalid')
EMAIL_TIMEOUT = 10
if not DEBUG and (not EMAIL_HOST or DEFAULT_FROM_EMAIL.endswith('.invalid') or EMAIL_BACKEND != 'django.core.mail.backends.smtp.EmailBackend'):
    raise ImproperlyConfigured('Production requires SMTP EMAIL_HOST, DEFAULT_FROM_EMAIL and the SMTP email backend.')
if not DEBUG and (any(not x.startswith('https://') or '*' in x for x in CSRF_TRUSTED_ORIGINS) or any('*' in x or x.startswith('.') for x in ALLOWED_HOSTS)):
    raise ImproperlyConfigured('Production requires explicit ALLOWED_HOSTS and HTTPS trusted origins.')
SERVER_EMAIL = DEFAULT_FROM_EMAIL
SECURE_SSL_REDIRECT = not DEBUG
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_HTTPONLY = True
SECURE_HSTS_SECONDS = 31536000 if not DEBUG else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
# Do not emit request URLs, form contents, email addresses or authentication attempts.
LOGGING = {'version': 1, 'disable_existing_loggers': False, 'handlers': {'null': {'class': 'logging.NullHandler'}}, 'loggers': {name: {'handlers': ['null'], 'propagate': False} for name in ['django.request', 'django.server', 'django.security', 'axes']}}
