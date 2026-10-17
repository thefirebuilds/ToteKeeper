export const BRAND = {
  name: 'My Tote Keeper',
  tagline: 'We’ll hang onto that for you.',
} as const

export const DEMO_PORTAL_ENABLED = true

export const SERVICE_CONFIG = {
  pilotLocations: ['Buda', 'Kyle'],
  state: 'Texas',
  currency: 'USD',
  annualVisitsIncluded: { collection: 1, returnDelivery: 1 },
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
    { label: '12-foot disassembled skeleton', estimate: '$50/year' },
    { label: 'Snowboard bag', estimate: '$50/year' },
    { label: 'Packed Christmas tree', estimate: '$50/year' },
    { label: 'Canoe', estimate: '$100/year' },
    { label: 'Other larger or awkward items', estimate: 'Custom quote' },
  ],
} as const

export const formatUsd = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: SERVICE_CONFIG.currency, maximumFractionDigits: 0 }).format(amount)