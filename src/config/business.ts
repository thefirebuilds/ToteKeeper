export const BRAND = {
  name: 'My Tote Keeper',
  tagline: 'We’ll hang onto that for you.',
} as const

export const DEMO_PORTAL_ENABLED = true

export const SERVICE_CONFIG = {
  serviceAreas: ['Buda', 'Kyle', 'San Marcos', 'Austin'],
  state: 'Texas',
  currency: 'USD',
  annualVisitsIncluded: { collection: 1, returnDelivery: 1 },
  maxCombinedToteContentsValue: 200,
  toteTerms: {
    monthlyDepositPerTote: 25,
    annualPrepay: 'Totes are provided for use at no added charge with annual prepayment.',
    ownership: 'Totes remain the property of My Tote Keeper and must be returned when storage ends.',
    depositHandling: 'Deposit return conditions are confirmed before signup.',
  },
  plans: [
    { totes: 1, annualPrice: 149, note: 'One less thing underfoot.', featured: false },
    { totes: 4, annualPrice: 299, note: 'Give a closet its job back.', featured: true },
    { totes: 10, annualPrice: 599, note: 'Your garage has other ambitions.', featured: false },
  ],
  oversizedEstimates: [
    { label: '12-foot skeleton, disassembled and packed', estimate: 'Request a quote' },
    { label: 'Snowboard bag', estimate: 'Request a quote' },
    { label: 'Packed Christmas tree', estimate: 'Request a quote' },
    { label: 'Other larger items', estimate: 'Request a quote' },
  ],
} as const

export const TOTE_CONTENTS_ACKNOWLEDGMENT = `I confirm that this tote’s contents have a combined value of no more than $${SERVICE_CONFIG.maxCombinedToteContentsValue}, are clean and dry, and comply with the packing guidelines. It contains no prohibited valuables, irreplaceable items, food, perishables, firearms, ammunition, fireworks, fuel, hazardous materials, or unapproved batteries.`

export const formatUsd = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: SERVICE_CONFIG.currency, maximumFractionDigits: 0 }).format(amount)
export const formatMonthlyEquivalent = (annualPrice: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: SERVICE_CONFIG.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(annualPrice / 12)