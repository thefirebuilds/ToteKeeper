import { describe, expect, it } from 'vitest'
import { addExtraCycle, assessAddress, chicagoMidnight, createPackage, missedVisit, openResolutionCase, packageCredits, quoteOrder, recordMonthlyInvoice, recordReviewedNotice, registerBonus, requestCancellation, reserveLeg, swapSize, validateAppointment, validateMix } from './operations'
import type { PackageSelection } from './operations'
import { formatMonthlyEquivalent } from '../config/business'

const selection: PackageSelection = { planId: 'small', billing: 'annual', large: 2, xl: 0 }
const make = (id = 'P1', billing: 'annual' | 'monthly' = 'annual') => createPackage(id, 'C1', 'small', billing, '2026-03-01T12:00:00Z')

describe('package policies', () => {
  it('quotes independent package prices and the supplied monthly equivalents', () => {
    const quote = quoteOrder([selection, { planId: 'big', billing: 'annual', large: 6, xl: 2 }], [], 'Fictional Buda address')
    expect(quote.annualTotal).toBe(524)
    expect(quote.canPay).toBe(false)
    expect([125, 225, 399].map(formatMonthlyEquivalent)).toEqual(['$10.42', '$18.75', '$33.25'])
    expect(() => validateMix({ ...selection, large: 1, xl: 1 })).toThrow('allowance')
    expect(() => validateMix({ ...selection, large: 1.5 })).toThrow('whole')
    expect(validateMix({ ...selection, large: 0, xl: 1 })).toBe(2)
  })
  it('never approves cities or ZIP codes as geographic eligibility', () => {
    expect(assessAddress('Buda TX 78610')).toBe('Operator review')
    expect(assessAddress('South Austin')).toBe('Operator review')
    expect(assessAddress('A', { address: 'B', approved: true, reviewedBy: 'Owner' })).toBe('Operator review')
    expect(assessAddress('A', { address: 'A', approved: true, reviewedBy: 'Owner' })).toBe('Approved')
  })
  it('keeps allocations and included returns independent; partial returns reserve the entire visit', () => {
    const first = make(); const second = make('P2')
    const totes = [{ id: 'T1', packageId: first.id, size: 'xl' as const }, { id: 'T2', packageId: second.id, size: 'large' as const }]
    expect(packageCredits(totes, first.id)).toBe(2)
    expect(packageCredits(totes, second.id)).toBe(1)
    reserveLeg(first, 'C1', first.cycles[0].id, 'Packed return', 'R1')
    expect(() => reserveLeg(first, 'C1', first.cycles[0].id, 'Packed return', 'R2')).toThrow('partial return')
    expect(reserveLeg(second, 'C1', second.cycles[0].id, 'Packed return', 'R3').status).toBe('Requested')
  })
  it('monthly payments never replenish the allowance or invent an enrollment-anniversary reset', () => {
    const pkg = make('P1', 'monthly')
    const returned = reserveLeg(pkg, 'C1', pkg.cycles[0].id, 'Packed return', 'APRIL')
    returned.status = 'Completed'
    for (let i = 0; i < 13; i++) recordMonthlyInvoice(pkg)
    expect(pkg.serviceYear.resetAt).toBeNull()
    expect(pkg.serviceYear.resetReviewRequired).toBe(true)
    expect(() => reserveLeg(pkg, 'C1', pkg.cycles[0].id, 'Packed return', 'MAY')).toThrow()
  })
  it('tracks both legs of a $50 round trip without consuming empty handling', () => {
    const pkg = make(); addExtraCycle(pkg, 'EXTRA')
    expect(pkg.cycles[1].price).toBe(50)
    expect(pkg.cycles[1].legs.map(leg => leg.kind)).toEqual(['Packed return', 'Packed collection'])
    expect(() => reserveLeg(pkg, 'C1', 'EXTRA', 'Packed collection', 'R1')).toThrow('dropoff')
    reserveLeg(pkg, 'C1', 'EXTRA', 'Packed return', 'R2').status = 'Completed'
    expect(reserveLeg(pkg, 'C1', 'EXTRA', 'Packed collection', 'R3').status).toBe('Requested')
    expect(reserveLeg(pkg, 'C1', pkg.cycles[0].id, 'Empty collection', 'R4').status).toBe('Requested')
  })
  it('allows one annual Big bonus without adding trips and rejects monthly/duplicate bonuses', () => {
    const pkg = createPackage('BIG', 'C1', 'big', 'annual', '2026-03-01T12:00:00Z')
    registerBonus(pkg, 'B1')
    expect(pkg.cycles[0].legs).toHaveLength(5)
    expect(() => registerBonus(pkg, 'B2')).toThrow()
    expect(() => registerBonus(createPackage('M', 'C1', 'big', 'monthly', '2026-03-01T12:00:00Z'), 'B')).toThrow()
    const quote = quoteOrder([{ planId: 'big', billing: 'annual', large: 10, xl: 0 }], [{ type: 'Bagged artificial tree', dimensions: [54, 24, 24], value: 100, packageIndex: 0, useBonus: true }, { type: 'Bundled oars', dimensions: [50, 6, 6], value: 90, packageIndex: 0, useBonus: false }, { type: 'Snowboard bag', dimensions: [54, 10, 6], value: 100, useBonus: false }], 'Fictional address')
    expect(quote.annualTotal).toBe(599)
    expect(quote.lines.map(line => line.amount)).toEqual([399, 0, 75, 125])
  })
  it('does not price custom-quote items automatically or collect an invented monthly setup fee', () => {
    const quote = quoteOrder([{ ...selection, billing: 'monthly' }], [{ type: 'Bagged artificial tree', dimensions: [55, 24, 24], value: 100, useBonus: false }], 'Fictional address')
    expect(quote.monthlyTotal).toBe(14.95)
    expect(quote.annualTotal).toBe(0)
    expect(quote.reviewReasons.join(' ')).toMatch(/setup charge/)
    expect(quote.reviewReasons.join(' ')).toMatch(/custom quote/)
    expect(() => quoteOrder([], [{ type: 'Snowboard bag', dimensions: [50, 10, 6], value: 750, useBonus: false }], 'A')).not.toThrow()
    expect(() => quoteOrder([], [{ type: 'Snowboard bag', dimensions: [50, 10, 6], value: -1, useBonus: false }], 'A')).toThrow('nonnegative')
  })
  it('stops renewal and grants a free final return after the ordinary return is exhausted', () => {
    const pkg = make()
    reserveLeg(pkg, 'C1', pkg.cycles[0].id, 'Packed return', 'R1').status = 'Completed'
    requestCancellation(pkg, 'C1', '2026-04-10T12:00:00Z')
    expect(pkg.renewalEnabled).toBe(false)
    expect(pkg.cancellation).toBe('Cancellation requested')
    expect(pkg.cycles[1].price).toBe(0)
    expect(reserveLeg(pkg, 'C1', pkg.cycles[1].id, 'Final return', 'R2').status).toBe('Requested')
    requestCancellation(pkg, 'C1', '2026-04-11T12:00:00Z')
    expect(pkg.cycles.filter(cycle => cycle.kind === 'Cancellation')).toHaveLength(1)
    expect(() => reserveLeg(pkg, 'OTHER', pkg.cycles[1].id, 'Final return', 'R3')).toThrow('customer')
  })
  it('requires a scheduled visit and capacity within the same package for a free size swap', () => {
    const pkg = make(); const totes = [{ id: 'T', packageId: pkg.id, size: 'large' as 'large' | 'xl' }]
    expect(() => swapSize(pkg, totes, 'T', 'xl', pkg.cycles[0].legs[0].id)).toThrow('scheduled')
    pkg.cycles[0].legs[0].status = 'Confirmed'
    swapSize(pkg, totes, 'T', 'xl', pkg.cycles[0].legs[0].id)
    expect(packageCredits(totes, pkg.id)).toBe(2)
  })
  it('enforces notice, available windows, and Chicago daylight-saving boundaries', () => {
    expect(chicagoMidnight('2026-07-01').toISOString()).toBe('2026-07-01T05:00:00.000Z')
    expect(chicagoMidnight('2026-12-01').toISOString()).toBe('2026-12-01T06:00:00.000Z')
    expect(() => validateAppointment('2026-07-02', 'Weekday evening, 4–7 pm', new Date('2026-07-01T00:00:00Z'))).toThrow('72 hours')
    expect(() => validateAppointment('2026-07-03', 'Weekday evening, 4–7 pm', new Date('2026-07-01T05:00:00Z'))).toThrow('72 hours')
    expect(() => validateAppointment('2026-07-04', 'Weekday evening, 4–7 pm', new Date('2026-07-01T05:00:00Z'))).not.toThrow()
    expect(() => validateAppointment('2026-07-04', 'Invented window', new Date('2026-07-01T00:00:00Z'))).toThrow('available')
    expect(missedVisit(0).charge).toBe(0)
    expect(missedVisit(1).charge).toBeNull()
  })

  it('keeps nonpayment/unclaimed review separate and gates notices on owner/legal approval', () => {
    expect(() => openResolutionCase('C', 'P', 'Nonpayment', { role: 'Customer' })).toThrow('owner')
    const review = openResolutionCase('C', 'P', 'Unclaimed goods', { role: 'Owner' })
    expect(review.status).toBe('Operator review')
    expect(() => recordReviewedNotice(review, { id: 'Blake', role: 'Owner' }, 'draft', '2026-10-17')).toThrow('approved')
    recordReviewedNotice(review, { id: 'Blake', role: 'Owner' }, 'approved-test', '2026-10-17', { templateVersions: ['approved-test'], deadlinesApproved: true })
    expect(review.notices).toHaveLength(1)
    expect(review.status).toBe('Operator review')
  })
})
