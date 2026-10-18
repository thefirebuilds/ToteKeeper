import largeToteImage from '../assets/images/large_tote.jpeg'
import xlToteImage from '../assets/images/XL_tote.jpeg'

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
  toteFeatures: 'Made in the USA from commercial-grade polyethylene, with attached interlocking flip-top lids, molded carrying handles, and security-tie attachment points. Same-size totes stack when closed and nest when empty.',
  toteCapacityComparison: 'One XL tote uses two credits and offers approximately twice the capacity of a Large tote.',
  toteSizes: {
    large: {
      id: 'large',
      name: 'Large tote',
      image: largeToteImage,
      imageAlt: 'Blue Large storage tote with attached flip-top lids open',
      outsideDimensionsInches: { length: 21.875, width: 15.25, height: 9.6875 },
      exteriorDimensionsLabel: '21-7/8 in L x 15-1/4 in W x 9-11/16 in H',
      interiorDimensionsLabel: '19-3/4 in L x 14-1/4 in W x 9 in H',
      bottomExteriorDimensionsLabel: '19-1/4 in L x 13-1/8 in W x 9-11/16 in H',
      bottomInteriorDimensionsLabel: '18-3/4 in L x 12-1/2 in W x 9 in H',
      capacityGallons: 9,
      volumeCubicFeet: 1.3,
      partNumber: 'ATL21159',
      description: 'Give a shelf or drawer some breathing room. With 9 gallons of storage for one credit, the Large tote keeps smaller seasonal belongings together until you need them again.',
      packingExamples: 'Try a set of string lights and fabric decorations, a stack of folded T-shirts, or a collection of winter hats, scarves, and gloves.',
      credits: 1,
      referenceFormat: 'Farmplast ATL21159',
      lid: 'Attached, interlocking flip-top lid',
    },
    xl: {
      id: 'xl',
      name: 'XL tote',
      image: xlToteImage,
      imageAlt: 'Blue XL storage tote with attached interlocking lids closed',
      outsideDimensionsInches: { length: 27, width: 17, height: 12 },
      exteriorDimensionsLabel: '27 in L x 17 in W x 12 in H',
      interiorDimensionsLabel: '25.5 in L x 15.5 in W x 11.8 in H',
      bottomExteriorDimensionsLabel: null,
      bottomInteriorDimensionsLabel: null,
      capacityGallons: 18.75,
      volumeCubicFeet: 2.5,
      partNumber: 'XLT271712',
      description: 'Make room in the closet for what you use now. With 18.75 gallons of storage for two credits, the XL offers approximately twice the capacity of a Large for bulkier seasonal belongings.',
      packingExamples: 'Try a folded lightweight duvet, spare sheets and towels, or a stack of sweaters and seasonal jackets. Soft items make the most of the extra room.',
      credits: 2,
      referenceFormat: 'Farmplast XLT271712',
      lid: 'Attached, interlocking flip-top lid',
    },
  },
  plans: [
    { id: 'small', name: 'Small', credits: 2, annualPrice: 149, monthlyPrice: 15, note: 'One less thing underfoot.', examples: '2 Large or 1 XL', featured: false },
    { id: 'medium', name: 'Medium', credits: 4, annualPrice: 299, monthlyPrice: 50, note: 'Give a closet its job back.', examples: '4 Large, 2 Large + 1 XL, or 2 XL', featured: true },
    { id: 'big', name: 'Big', credits: 10, annualPrice: 599, monthlyPrice: 100, note: 'Your garage has other ambitions.', examples: '10 Large, 6 Large + 2 XL, or 5 XL', featured: false },
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

export function creditsForToteMix(largeCount: number, xlCount: number) {
  return largeCount * SERVICE_CONFIG.toteSizes.large.credits + xlCount * SERVICE_CONFIG.toteSizes.xl.credits
}

export const TOTE_CONTENTS_ACKNOWLEDGMENT = `I confirm that this tote’s contents have a combined value of no more than $${SERVICE_CONFIG.maxCombinedToteContentsValue}, are clean and dry, and comply with the packing guidelines. It contains no prohibited valuables, irreplaceable items, food, perishables, firearms, ammunition, fireworks, fuel, hazardous materials, or unapproved batteries.`

export const formatUsd = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: SERVICE_CONFIG.currency, maximumFractionDigits: 0 }).format(amount)
export const formatMonthlyEquivalent = (annualPrice: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: SERVICE_CONFIG.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(annualPrice / 12)
export const formatUsdCents = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: SERVICE_CONFIG.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
