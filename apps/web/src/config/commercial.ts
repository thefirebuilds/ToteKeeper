
export const BRAND = {
  name: 'My Tote Keeper',
  tagline: 'We’ll hang onto that for you.',
} as const

export const DEMO_PORTAL_ENABLED = true

export const OWNER = { name: 'Blake Thompson', email: 'blake@mytotekeeper.com', phone: '262-880-4570', phoneHref: 'tel:+12628804570' } as const

export const POLICY = {
  geography: {
    mode: 'zip-allowlist',
    boundary: 'ZIPs overlapping Hays County north of the Blanco River or Travis County south of the Colorado River qualify in full, including addresses outside those boundaries.',
    approvedPolygon: null,
    zipApprovalEnabled: true,
  },
  monthlySetupCharge: { amount: null, refundable: 'Before initial empty-tote delivery; afterward nonrefundable for voluntary cancellation, except as law requires.' },
  monthlyAllowanceReset: { anchor: null, continuousPaymentQualification: null, minimumPaidMonths: 12 },
  extraCyclePrice: 50,
  bulky: { addOnAnnualPrice: 75, standaloneAnnualPrice: 125, envelopeInches: [54, 24, 24], approvedWeightPounds: null, handlingApprovalRequired: true },
  scheduling: {
    noticeHours: 72,
    windows: ['Weekday evening, 4–7 pm', 'Weekend morning, 8 am–12 pm', 'Weekend afternoon, 12–4 pm', 'Weekend evening, 4–7 pm'],
    blackoutDates: [] as string[],
    courtesyReschedules: 1,
    replacementWithinDays: 3,
    failedVisitFee: null,
  },
  storage: { temperatureF: [55, 80], onShelves: true, facilityPestControl: true },
  renewal: { automatic: true, annualReminderDays: 30, failedPaymentGraceDays: null },
  agreement: { version: 'business-preview-v1', approved: false, legalNoticeDeadlines: null, approvedNoticeTemplates: null },
  integrations: { octagonConnected: false, paymentsConnected: false, smsConnected: false, emailConnected: false },
} as const

export const OPERATIONAL_PRACTICES = {
  ownerOperated: true,
  toteIdentification: 'planned',
  numberedTamperEvidentSeal: 'planned',
  handoffAndMovementRecords: 'planned',
  authorizedOperatorsOnly: 'Owner and trusted authorized help',
  exteriorConditionPhotos: 'planned',
  toteHandlingAndWeightLimits: 'planned',
  securedTransport: 'planned',
  damageReportingProcess: 'planned',
  offFloorStorage: 'Shelves, not floors',
  storageAreaInspections: 'planned',
  professionalPestControl: 'Provided by the storage facility',
  ownerIntroduction: 'Sole-proprietor, owner-operated service by Blake Thompson. Work directly with the person keeping your things.',
  directContact: 'blake@mytotekeeper.com · 262-880-4570',
} as const

export const SERVICE_CONFIG = {
  serviceAreas: ['Buda', 'Kyle', 'South Austin'],
  state: 'Texas',
  currency: 'USD',
  annualVisitsIncluded: { collection: 1, returnDelivery: 1 },
  proposedToteLiabilityLimit: 250,
  maxPackedToteWeightPounds: 50,
  toteTerms: {
    monthlySetupCharge: null,
    annualPrepay: 'Totes are provided for use at no added charge with annual prepayment.',
    ownership: 'Totes remain the property of My Tote Keeper and must be returned when storage ends.',
    depositHandling: 'Monthly setup is charged once per new package: Small $25, Medium $50, Large $75. It is not a deposit and is waived for annual enrollment.',
  },
  toteFeatures: 'Made in the USA from commercial-grade polyethylene, with attached interlocking flip-top lids, molded carrying handles, and security-tie attachment points. Same-size totes stack when closed and nest when empty.',
  toteCapacityComparison: 'An XL holds about twice as much as a Large and uses two storage credits.',
  toteSizes: {
    large: {
      id: 'large',
      name: 'Large tote',
      outsideDimensionsInches: { length: 21.875, width: 15.25, height: 9.6875 },
      exteriorDimensionsLabel: '21-7/8 in L x 15-1/4 in W x 9-11/16 in H',
      interiorDimensionsLabel: '19-3/4 in L x 14-1/4 in W x 9 in H',
      bottomExteriorDimensionsLabel: '19-1/4 in L x 13-1/8 in W x 9-11/16 in H',
      bottomInteriorDimensionsLabel: '18-3/4 in L x 12-1/2 in W x 9 in H',
      capacityGallons: 9,
      volumeCubicFeet: 1.3,
      partNumber: 'ATL21159',
      description: 'A good fit for folded clothes, lights, and smaller seasonal decorations.',
      packingExamples: 'Holiday lights, T-shirts, or hats and scarves.',
      credits: 1,
      referenceFormat: 'Farmplast ATL21159',
      lid: 'Attached, interlocking flip-top lid',
    },
    xl: {
      id: 'xl',
      name: 'XL tote',
      outsideDimensionsInches: { length: 27, width: 17, height: 12 },
      exteriorDimensionsLabel: '27 in L x 17 in W x 12 in H',
      interiorDimensionsLabel: '25.5 in L x 15.5 in W x 11.8 in H',
      bottomExteriorDimensionsLabel: null,
      bottomInteriorDimensionsLabel: null,
      capacityGallons: 18.75,
      volumeCubicFeet: 2.5,
      partNumber: 'XLT271712',
      description: 'About twice the room for bedding, jackets, and bulkier seasonal things.',
      packingExamples: 'A lightweight duvet, spare bedding, or winter jackets.',
      credits: 2,
      referenceFormat: 'Farmplast XLT271712',
      lid: 'Attached, interlocking flip-top lid',
    },
  },
  plans: [
    { id: 'small', name: 'Small', credits: 2, annualPrice: 125, annualCatalogVersion: 'v1', monthlyPrice: 14.95, monthlySetupFee: 25, monthlyCatalogVersion: 'v2', note: 'One less thing underfoot.', examples: '2 Large or 1 XL', featured: false },
    { id: 'medium', name: 'Medium', credits: 4, annualPrice: 225, annualCatalogVersion: 'v2', monthlyPrice: 29.95, monthlySetupFee: 50, monthlyCatalogVersion: 'v2', note: 'Give a closet its job back.', examples: '4 Large, 2 Large + 1 XL, or 2 XL', featured: false },
    { id: 'big', name: 'Large', credits: 10, annualPrice: 399, annualCatalogVersion: 'v2', monthlyPrice: 39.95, monthlySetupFee: 75, monthlyCatalogVersion: 'v2', note: 'Your garage has other ambitions.', examples: '10 Large, 6 Large + 2 XL, or 5 XL', featured: true },
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
    maxWeightPounds: null,
    pricing: '$75/year add-on or $125/year standalone; handling review required',
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

export const TOTE_LIABILITY_DISCLOSURE = 'Store everyday belongings, even if their combined value exceeds $250. Our liability for loss or damage is limited to actual contents value, up to $250 per tote, subject to the storage agreement. Value above that limit is at your risk.'
export const TOTE_LIABILITY_ACKNOWLEDGMENT = 'I understand that the stated liability limit is $250 per tote, subject to the storage agreement and applicable law. Belongings worth more may be stored, but value above that limit is at my risk.'
export const BULKY_LIABILITY_NOTICE = 'Liability for a separately registered bulky item is limited to actual proven compensable loss, up to $250 per item, subject to the storage agreement and applicable law. This is not insurance or an automatic payout.'
export const TOTE_CONTENTS_ACKNOWLEDGMENT = 'I confirm that these belongings are clean and dry and comply with the packing guidelines. This tote contains no prohibited valuables, irreplaceable items, food, perishables, firearms, ammunition, fireworks, fuel, hazardous materials, or unapproved batteries.'

export const formatUsd = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: SERVICE_CONFIG.currency, minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount)
export const formatMonthlyEquivalent = (annualPrice: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: SERVICE_CONFIG.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(annualPrice / 12)
export const formatUsdCents = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: SERVICE_CONFIG.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
