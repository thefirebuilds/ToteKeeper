from io import BytesIO
import warnings
from PIL import Image, ImageOps, UnidentifiedImageError
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from storage.models import Tote
from .audit import record
from .models import Account, Photo
from .operations import owned


def normalized_image(upload):
    if upload.size > settings.PHOTO_MAX_BYTES:
        raise ValidationError('Photo exceeds 5 MB.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            raw = upload.read(settings.PHOTO_MAX_BYTES + 1)
            if len(raw) > settings.PHOTO_MAX_BYTES:
                raise ValidationError('Photo exceeds 5 MB.')
            probe = Image.open(BytesIO(raw))
            if probe.format not in ['JPEG', 'PNG', 'WEBP'] or probe.width * probe.height > 20_000_000:
                raise ValidationError('Use a JPEG, PNG or WebP photo under 20 megapixels.')
            probe.verify()
            image = Image.open(BytesIO(raw))
            if getattr(image, 'is_animated', False):
                raise ValidationError('Animated images are not accepted.')
            image = ImageOps.exif_transpose(image).convert('RGB')
            image.thumbnail((1800, 1800))
            output = BytesIO()
            # A fresh image strips EXIF/GPS, comments, ICC profiles and filenames.
            clean = Image.new('RGB', image.size)
            clean.paste(image)
            clean.save(output, 'JPEG', quality=85)
            return output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ValidationError('That file is not a valid supported photo.') from None


@transaction.atomic
def upload_photo(actor, account_id, tote_id, upload):
    account = Account.objects.select_for_update().get(pk=account_id)
    owned(actor, account)
    tote = Tote.objects.select_for_update().get(pk=tote_id, customer=account.customer)
    if tote.photos.filter(deleted_at=None).count() >= settings.PHOTO_LIMIT:
        raise ValidationError('This item already has the maximum number of photos.')
    photo = Photo.objects.create(tote=tote, content=normalized_image(upload))
    record(actor, photo, 'Photo uploaded', account=account, after={'item_id': tote.pk})
    return photo


@transaction.atomic
def delete_photo(actor, account_id, photo):
    account = Account.objects.select_for_update().get(pk=account_id)
    owned(actor, account)
    if photo.tote.customer_id != account.customer_id:
        from django.core.exceptions import PermissionDenied
        raise PermissionDenied
    photo.deleted_at = timezone.now()
    photo.content = b''
    photo.save(update_fields=['deleted_at', 'content'])
    record(actor, photo, 'Photo deleted', account=account)
