import { creditsForToteMix, POLICY, SERVICE_CONFIG } from '../config/business'
import type { ToteSizeId } from '../types'

export type PlanId = 'small' | 'medium' | 'big'
export type Billing = 'annual' | 'monthly'
export type CancellationStage = 'Active' | 'Cancellation requested' | 'Return scheduled' | 'Belongings returned' | 'Totes reconciled'
export type LegKind = 'Initial empty delivery' | 'Packed collection' | 'Packed return' | 'Empty collection' | 'Empty redelivery' | 'Final return'
export interface TripLeg { id: string; kind: LegKind; status: 'Available' | 'Requested' | 'Confirmed' | 'Completed'; requestId?: string; completedAt?: string }
export interface ServiceCycle { id: string; kind: 'Included' | 'Extra' | 'Cancellation'; price: number; payment: 'Included' | 'Demo recorded' | 'Unpaid'; legs: TripLeg[] }
export interface PackageRecord {
  id: string; customerId: string; planId: PlanId; billing: Billing; credits: number
  serviceYear: { startedAt: string; resetAt: string | null; resetReviewRequired: boolean }
  renewalEnabled: boolean; renewalDate: string; paymentState: 'Demo only' | 'Current' | 'Past due'; paidMonths: number
  cancellation: CancellationStage; cancellationRequestedAt?: string; cycles: ServiceCycle[]
  annualReminderAt: string; annualBonusItemId?: string
}
export interface BulkyRecord {
  id: string; customerId: string; packageId?: string; type: BulkyType; dimensions: [number, number, number]
  value: number; pricing: 'Bonus' | 'Add-on' | 'Standalone' | 'Custom quote'; annualPrice: number | null
  handlingStatus: 'Operator review' | 'Approved'; standaloneCycle?: ServiceCycle
}
export type BulkyType = 'Bagged artificial tree' | 'Snowboard bag' | 'Bundled oars' | 'Other'
export interface PackageSelection { planId: PlanId; billing: Billing; large: number; xl: number }
export interface BulkySelection { type: BulkyType; dimensions: [number, number, number]; value: number; packageIndex?: number; useBonus: boolean }
export interface OrderQuote { lines: { label: string; amount: number; cadence: Billing }[]; annualTotal: number; monthlyTotal: number; reviewReasons: string[]; canPay: boolean }
export interface ConsentRecord { serviceSms: boolean; marketingSms: boolean; optedOut: boolean; recordedAt: string }
export interface DemoAudit { at: string; action: string; packageId?: string; detail: string }
export interface ReviewCase { id: string; packageId: string; reason: 'Nonpayment' | 'Unclaimed goods'; status: 'Operator review'; notices: { at: string; templateVersion: string; operatorId: string }[] }

export function requireOwner(record: { customerId: string }, customerId: string) {
  if (record.customerId !== customerId) throw new Error('This record does not belong to this customer.')
}
export function planFor(id: PlanId) {
  const plan = SERVICE_CONFIG.plans.find(plan => plan.id === id)
  if (!plan) throw new Error('Unknown package.')
  return plan
}
export function validateMix(selection: PackageSelection) {
  if (selection.billing !== 'annual' && selection.billing !== 'monthly') throw new Error('Choose annual or monthly billing.')
  if (![selection.large, selection.xl].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Tote quantities must be whole nonnegative numbers.')
  const cost = creditsForToteMix(selection.large, selection.xl)
  if (cost === 0 || cost > planFor(selection.planId).credits) throw new Error('Choose a tote mix within this package’s allowance.')
  return cost
}
export function assessAddress(address: string, decision?: { address: string; approved: boolean; reviewedBy: string }) {
  // No geocoder, approved polygon, or ZIP list exists. Never infer approval from a city or ZIP.
  if (!address.trim()) return 'Address required' as const
  if (decision?.address === address && decision.reviewedBy.trim()) return decision.approved ? 'Approved' as const : 'Outside service area' as const
  return 'Operator review' as const
}
export function standardEnvelope(dimensions: readonly number[]) {
  if (dimensions.length !== 3 || dimensions.some(value => !Number.isFinite(value) || value <= 0)) throw new Error('Provide all three positive packed dimensions.')
  return dimensions.every((value, index) => value <= POLICY.bulky.envelopeInches[index])
}
export function quoteOrder(packages: PackageSelection[], bulky: BulkySelection[], address: string): OrderQuote {
  const quote: OrderQuote = { lines: [], annualTotal: 0, monthlyTotal: 0, reviewReasons: [], canPay: false }
  if (!packages.length && !bulky.length) throw new Error('Select a package or a bulky item.')
  packages.forEach(selection => {
    validateMix(selection)
    const plan = planFor(selection.planId)
    quote.lines.push({ label: `${plan.name} · ${selection.large} Large + ${selection.xl} XL · ${plan.credits} credits`, amount: selection.billing === 'annual' ? plan.annualPrice : plan.monthlyPrice, cadence: selection.billing })
    if (selection.billing === 'monthly' && (POLICY.monthlySetupCharge.amount === null || POLICY.monthlySetupCharge.refundable === null)) quote.reviewReasons.push('Monthly enrollment is paused until the tote/setup charge and refundability are finalized.')
  })
  const bonuses = new Set<number>()
  bulky.forEach(item => {
    if (!['Bagged artificial tree', 'Snowboard bag', 'Bundled oars', 'Other'].includes(item.type)) throw new Error('Choose a listed bulky-item type or request a custom quote.')
    if (!Number.isFinite(item.value) || item.value < 0 || item.value > 200) throw new Error('Each registered bulky item has a $200 combined contents-value limit.')
    const fits = standardEnvelope(item.dimensions)
    const linked = item.packageIndex === undefined ? undefined : packages[item.packageIndex]
    if (item.packageIndex !== undefined && !linked) throw new Error('Choose an existing package for this bulky item.')
    if (!fits || item.type === 'Other') {
      if (item.useBonus) throw new Error('Custom-quote items are not automatically eligible for the Big bonus.')
      quote.reviewReasons.push('Nonstandard bulky items need a custom quote; no automatic price has been assigned.')
      return
    }
    if (item.useBonus) {
      if (!linked || linked.planId !== 'big' || linked.billing !== 'annual' || bonuses.has(item.packageIndex!)) throw new Error('One standard bulky item is included per annual Big package.')
      bonuses.add(item.packageIndex!)
    }
    quote.lines.push({ label: `${item.type} · ${item.useBonus ? 'annual Big bonus, included visits' : linked ? 'add-on, travels with tote appointments' : 'standalone, one collection and one return'}`, amount: item.useBonus ? 0 : linked ? POLICY.bulky.addOnAnnualPrice : POLICY.bulky.standaloneAnnualPrice, cadence: 'annual' })
    quote.reviewReasons.push('Bulky-item handling needs operator approval before payment.')
  })
  if (assessAddress(address) !== 'Approved') quote.reviewReasons.push('The exact service address needs operator review before payment.')
  quote.reviewReasons.push('Checkout is unavailable: Octagon, hosted payments, and an approved agreement are not connected.')
  quote.lines.forEach(line => { if (line.cadence === 'annual') quote.annualTotal += line.amount; else quote.monthlyTotal += line.amount })
  quote.reviewReasons = [...new Set(quote.reviewReasons)]
  return quote
}

function leg(id: string, kind: LegKind): TripLeg { return { id, kind, status: 'Available' } }
export function createPackage(id: string, customerId: string, planId: PlanId, billing: Billing, startedAt: string): PackageRecord {
  const renewal = new Date(startedAt); renewal.setUTCFullYear(renewal.getUTCFullYear() + 1)
  const reminder = new Date(renewal); reminder.setUTCDate(reminder.getUTCDate() - POLICY.renewal.annualReminderDays)
  const nextInvoice = new Date(startedAt); nextInvoice.setUTCMonth(nextInvoice.getUTCMonth() + 1)
  return { id, customerId, planId, billing, credits: planFor(planId).credits, serviceYear: { startedAt, resetAt: billing === 'annual' ? renewal.toISOString() : null, resetReviewRequired: billing === 'monthly' }, renewalEnabled: true, renewalDate: billing === 'annual' ? renewal.toISOString() : nextInvoice.toISOString(), annualReminderAt: reminder.toISOString(), paymentState: 'Demo only', paidMonths: 0, cancellation: 'Active', cycles: [{ id: `${id}-included`, kind: 'Included', price: 0, payment: 'Included', legs: [leg(`${id}-initial`, 'Initial empty delivery'), leg(`${id}-collect`, 'Packed collection'), leg(`${id}-return`, 'Packed return'), leg(`${id}-empty-collect`, 'Empty collection'), leg(`${id}-empty-deliver`, 'Empty redelivery')] }] }
}
export function packageCredits(totes: { packageId?: string; size: ToteSizeId }[], packageId: string) {
  return totes.filter(tote => tote.packageId === packageId).reduce((sum, tote) => sum + SERVICE_CONFIG.toteSizes[tote.size].credits, 0)
}
export function addExtraCycle(pkg: PackageRecord, cycleId: string) {
  if (pkg.cancellation !== 'Active') throw new Error('Cancelled packages use their free final-return process.')
  pkg.cycles.push({ id: cycleId, kind: 'Extra', price: POLICY.extraCyclePrice, payment: 'Demo recorded', legs: [leg(`${cycleId}-dropoff`, 'Packed return'), leg(`${cycleId}-pickup`, 'Packed collection')] })
}
export function reserveLeg(pkg: PackageRecord, customerId: string, cycleId: string, kind: LegKind, requestId: string) {
  requireOwner(pkg, customerId)
  const cycle = pkg.cycles.find(item => item.id === cycleId)
  if (!cycle || cycle.payment === 'Unpaid') throw new Error('Choose an included or purchased service cycle.')
  if (pkg.cancellation !== 'Active' && cycle.kind !== 'Cancellation') throw new Error('This package is cancelling; use its free final return.')
  const selected = cycle.legs.find(item => item.kind === kind && item.status === 'Available')
  if (!selected) throw new Error('This cycle’s visit has already been used or reserved. A partial return uses the whole visit.')
  if (cycle.kind === 'Extra' && kind === 'Packed collection' && cycle.legs[0].status !== 'Completed') throw new Error('Complete the dropoff leg before requesting the subsequent pickup.')
  selected.status = 'Requested'; selected.requestId = requestId
  return selected
}
export function recordMonthlyInvoice(pkg: PackageRecord) {
  if (pkg.billing !== 'monthly') throw new Error('Not a monthly package.')
  pkg.paidMonths += 1
  // Invoice events never replenish trips. Reset qualification remains an operator decision.
}
export function requestCancellation(pkg: PackageRecord, customerId: string, now: string) {
  requireOwner(pkg, customerId)
  if (pkg.cancellation !== 'Active') return
  pkg.renewalEnabled = false; pkg.cancellation = 'Cancellation requested'; pkg.cancellationRequestedAt = now
  pkg.cycles.push({ id: `${pkg.id}-final`, kind: 'Cancellation', price: 0, payment: 'Included', legs: [leg(`${pkg.id}-final-return`, 'Final return')] })
}
export function advanceCancellation(pkg: PackageRecord, next: CancellationStage) {
  const stages: CancellationStage[] = ['Active', 'Cancellation requested', 'Return scheduled', 'Belongings returned', 'Totes reconciled']
  if (stages.indexOf(next) !== stages.indexOf(pkg.cancellation) + 1 || next === 'Cancellation requested') throw new Error('Complete the preceding cancellation step first.')
  pkg.cancellation = next
}
export function registerBonus(pkg: PackageRecord, itemId: string) {
  if (pkg.billing !== 'annual' || pkg.planId !== 'big' || pkg.annualBonusItemId) throw new Error('Only one standard bulky bonus is available for this annual Big package.')
  pkg.annualBonusItemId = itemId
}
export function validateAppointment(date: string, window: string, now = new Date()) {
  const parsed = chicagoMidnight(date)
  // Midnight is conservative: a later slot can be reviewed by Blake rather than promising <48h notice.
  if (!Number.isFinite(parsed.getTime()) || parsed.getTime() < now.getTime() + POLICY.scheduling.noticeHours * 3600000) throw new Error('Request at least 48 hours ahead.')
  if (POLICY.scheduling.blackoutDates.includes(date)) throw new Error('This date is unavailable.')
  if (!(POLICY.scheduling.windows as readonly string[]).includes(window)) throw new Error('Choose an available evening or weekend window.')
}

export function chicagoMidnight(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Date(NaN)
  const midnight = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== date) return new Date(NaN)
  let instant = midnight
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant))
    const get = (key: string) => parts.find(part => part.type === key)!.value
    const represented = Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`)
    instant += midnight - represented
  }
  return new Date(instant)
}

export function swapSize(pkg: PackageRecord, totes: { id: string; packageId?: string; size: ToteSizeId }[], toteId: string, size: ToteSizeId, scheduledVisitId: string) {
  const visit = pkg.cycles.flatMap(cycle => cycle.legs).find(leg => leg.id === scheduledVisitId && leg.status === 'Confirmed')
  if (!visit) throw new Error('Free size swaps require an already scheduled contractual visit.')
  const tote = totes.find(tote => tote.id === toteId && tote.packageId === pkg.id)
  if (!tote || pkg.cancellation !== 'Active') throw new Error('Choose a tote assigned to this active package.')
  const credits = packageCredits(totes, pkg.id) - SERVICE_CONFIG.toteSizes[tote.size].credits + SERVICE_CONFIG.toteSizes[size].credits
  if (credits > pkg.credits) throw new Error('This size swap exceeds this package’s allowance.')
  tote.size = size
}
export function missedVisit(previousFailures: number, replacementDate?: string, missedDate?: string) {
  if (previousFailures === 0) {
    if (replacementDate && missedDate && (Date.parse(replacementDate) < Date.parse(missedDate) || Date.parse(replacementDate) - Date.parse(missedDate) > POLICY.scheduling.replacementWithinDays * 86400000)) throw new Error('Courtesy replacement should be within three days where mutually available; otherwise ask the owner to review.')
    return { charge: 0, reviewRequired: true, message: 'One courtesy reschedule, subject to mutual availability.' }
  }
  return { charge: POLICY.scheduling.failedVisitFee, reviewRequired: true, message: 'Further failed visits incur a charge; the amount must be finalized and disclosed before booking.' }
}

export function openResolutionCase(id: string, packageId: string, reason: ReviewCase['reason'], actor: { role: 'Customer' | 'Owner' }): ReviewCase {
  if (actor.role !== 'Owner') throw new Error('Only the owner may open an operational resolution case.')
  return { id, packageId, reason, status: 'Operator review', notices: [] }
}
export function recordReviewedNotice(record: ReviewCase, actor: { role: 'Customer' | 'Owner'; id: string }, templateVersion: string, at: string, approvedPolicy: { templateVersions: string[]; deadlinesApproved: boolean } | null = null) {
  if (actor.role !== 'Owner') throw new Error('Owner review is required.')
  if (!approvedPolicy?.deadlinesApproved || !approvedPolicy.templateVersions.includes(templateVersion)) throw new Error('Legal deadlines and the notice template must be approved before activation.')
  record.notices.push({ at, templateVersion, operatorId: actor.id })
  // This records a reviewed notice only; there is deliberately no automatic disposition action.
}
