export const BRAND = {
  name: 'My Tote Keeper',
  tagline: 'We’ll hang onto that for you.',
} as const

export const DEMO_PORTAL_ENABLED = true

export const OPERATIONAL_PRACTICES = {
  ownerOperated: true,
  toteIdentification: 'planned',
  numberedTamperEvidentSeal: 'planned',
  handoffAndMovementRecords: 'planned',
  authorizedOperatorsOnly: 'planned',
  exteriorConditionPhotos: 'planned',
  toteHandlingAndWeightLimits: 'planned',
  securedTransport: 'planned',
  damageReportingProcess: 'planned',
  offFloorStorage: 'planned',
  storageAreaInspections: 'planned',
  professionalPestControl: 'unconfirmed',
  ownerIntroduction: 'Replace with owner introduction before launch.',
  ownerPhoto: 'Add owner photo before launch.',
  directContact: 'Add verified business contact details before launch.',
} as const

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
  toteSizes: {
    large: {
      id: 'large',
      name: 'Large tote',
      outsideDimensionsInches: { length: 21.5, width: 15.25, height: 12.5 },
      credits: 1,
      referenceFormat: 'Akro-Mils 39120 or equivalent commercial attached-lid tote',
      lid: 'Attached, interlocking flip-top lid',
    },
    oversized: {
      id: 'oversized',
      name: 'Oversized tote',
      outsideDimensionsInches: { length: 28, width: 21, height: 15.5 },
      credits: 2,
      referenceFormat: 'Akro-Mils 39280 or equivalent commercial attached-lid tote',
      lid: 'Attached, interlocking flip-top lid',
    },
  },
  plans: [
    { id: 'small', name: 'Small', credits: 2, annualPrice: 149, monthlyPrice: 15, note: 'One less thing underfoot.', examples: '2 large totes OR 1 oversized tote', featured: false },
    { id: 'medium', name: 'Medium', credits: 4, annualPrice: 299, monthlyPrice: 50, note: 'Give a closet its job back.', examples: '4 large OR 2 large + 1 oversized OR 2 oversized', featured: true },
    { id: 'big', name: 'Big', credits: 10, annualPrice: 599, monthlyPrice: 100, note: 'Your garage has other ambitions.', examples: '10 large OR 6 large + 2 oversized OR 5 oversized', featured: false },
  ],
  oversizedEstimates: [
    { label: '12-foot skeleton, disassembled and packed', estimate: 'Request a quote' },
    { label: 'Snowboard bag', estimate: 'Request a quote' },
    { label: 'Packed Christmas tree', estimate: 'Request a quote' },
    { label: 'Other larger items', estimate: 'Request a quote' },
  ],
  standardTreeBag: {
    maxLengthInches: 54,
    maxWidthInches: 24,
    maxHeightInches: 24,
    maxWeightPounds: 50,
    pricing: 'Request a quote',
    bagsQuotedSeparately: true,
  },
} as const

export function smallestPlanForCredits(creditsRequired: number) {
  if (creditsRequired <= 0) return undefined
  return SERVICE_CONFIG.plans.find((plan) => plan.credits >= creditsRequired)
}

export function creditsForToteMix(largeCount: number, oversizedCount: number) {
  return largeCount * SERVICE_CONFIG.toteSizes.large.credits + oversizedCount * SERVICE_CONFIG.toteSizes.oversized.credits
}

export const TOTE_CONTENTS_ACKNOWLEDGMENT = `I confirm that this tote’s contents have a combined value of no more than $${SERVICE_CONFIG.maxCombinedToteContentsValue}, are clean and dry, and comply with the packing guidelines. It contains no prohibited valuables, irreplaceable items, food, perishables, firearms, ammunition, fireworks, fuel, hazardous materials, or unapproved batteries.`

export const formatUsd = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: SERVICE_CONFIG.currency, maximumFractionDigits: 0 }).format(amount)
export const formatMonthlyEquivalent = (annualPrice: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: SERVICE_CONFIG.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(annualPrice / 12)
export const formatUsdCents = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: SERVICE_CONFIG.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)