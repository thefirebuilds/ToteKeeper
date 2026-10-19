"""Minimum advance notice for new requests; existing appointments are not rewritten."""
from datetime import datetime, time, timedelta
from django.utils import timezone

MINIMUM_NOTICE_HOURS = 72


def notice_hours(window):
    return max(MINIMUM_NOTICE_HOURS, window.lead_hours)


def earliest_requested_date():
    """Date-only legacy requests conservatively use local midnight, not an invented slot."""
    earliest = timezone.localtime() + timedelta(hours=MINIMUM_NOTICE_HOURS)
    day = earliest.date()
    if earliest.time().replace(tzinfo=None) != time.min:
        day += timedelta(days=1)
    return day


def requested_date_is_available(day):
    start = timezone.make_aware(datetime.combine(day, time.min))
    return start >= timezone.now() + timedelta(hours=MINIMUM_NOTICE_HOURS)
