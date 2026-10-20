"""Versioned owner-approved documents and enrollment acknowledgments."""
from pathlib import Path

VERSION = '2026-10-19.3'
PACKING_VERSION = '2026-10-19.3'
TERMS = Path(__file__).with_name('agreement_2026_10_19.txt').read_text(encoding='utf-8')
PACKING = '''Packing and Prohibited Items — version 2026-10-19.3
Pack only clean, completely dry belongings. Cushion fragile items and close lids properly. Each packed tote must weigh no more than 50 lb. Bulky items require separate handling approval.
Do not store illegal goods; food or perishables; living things; firearms, ammunition, fireworks, explosives, fuel, flammables, hazardous chemicals, or batteries, including batteries installed in an item.
Do not store cash, securities, jewelry, important original documents, unique or irreplaceable items, or other unusually valuable belongings unsuitable for ordinary clutter storage.
Permitted contents may be worth more than $250. The agreement limits liability to actual proven compensable loss up to $250 per physical tote or separately registered bulky item, subject to its legal exceptions and applicable law. This is not insurance.
We supply security tags for you to apply. Tags are not locks or verification of contents. Company totes remain ours. Handoffs occur at an accessible doorstep or driveway; we do not enter your home. Unattended service requires express written authorization for the particular appointment, location and items. Request appointments at least 72 hours ahead; confirmation is required.
'''
ACKNOWLEDGMENTS = {
    'accept': 'I agree to the Storage Agreement and identified Packing and Prohibited Items policy.',
    'liability_acknowledged': 'I understand that permitted contents may be worth more than $250, but the contractual liability limit is $250 per physical tote or registered bulky item, subject to the stated legal exceptions. Value above an enforceable limit remains my risk. This is not insurance.',
    'recurring_authorized': 'I authorize the disclosed recurring subscription charges until I stop renewal using the stated cancellation methods.',
    'disputes_acknowledged': 'I have read the dispute terms, including arbitration, small-claims access, and the 30-day opt-out.',
}

CATALOG = {
    'small': ('Small', 2, 1495, 2500, 12500),
    'medium': ('Medium', 4, 2995, 5000, 22500),
    'large': ('Large', 10, 3995, 7500, 39900),
}
