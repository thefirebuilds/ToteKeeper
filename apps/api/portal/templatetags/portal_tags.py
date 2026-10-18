from django import template

register = template.Library()


@register.filter
def money(value):
    try:
        return f'{int(value) / 100:,.2f}'
    except (ValueError, TypeError):
        return 'Unavailable'
