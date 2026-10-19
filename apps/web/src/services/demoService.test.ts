import { beforeEach, describe, expect, it } from 'vitest'
import { createMockToteKeeperService, hasActiveConflict, isToteEligible } from './demoService'
import { creditsForToteMix, SERVICE_CONFIG, smallestPlanForCredits } from '../config/business'
import type { DemoData } from '../types'

const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) } })

describe('demo request rules', () => {
  beforeEach(() => memory.clear())

  it('allows collection only for totes at home and returns only for stored totes', async () => {
    const data = await createMockToteKeeperService().getDemoData()
    expect(data.totes.filter((tote) => isToteEligible(tote, 'Collection')).map((tote) => tote.id)).toEqual(['MTK-1043'])
    expect(data.totes.filter((tote) => isToteEligible(tote, 'Return delivery')).map((tote) => tote.id)).toEqual(['MTK-1042', 'MTK-1044'])
    expect(data.totes.reduce((sum, tote) => sum + SERVICE_CONFIG.toteSizes[tote.size].credits, 0)).toBe(4)
    expect(data.totes).toHaveLength(3)
  })

  it('blocks overlapping active requests but releases cancelled totes', () => {
    const data = { requests: [{ toteIds: ['MTK-1042'], status: 'Awaiting confirmation' }] } as DemoData
    expect(hasActiveConflict(data, ['MTK-1042'])).toBe(true)
    data.requests[0].status = 'Cancelled'
    expect(hasActiveConflict(data, ['MTK-1042'])).toBe(false)
  })

  it('creates a request awaiting confirmation', async () => {
    const service = createMockToteKeeperService()
    const request = await service.createRequest({ kind: 'Collection', toteIds: ['MTK-1043'], preferredDate: '2026-11-15', preferredWindow: 'Weekend evening, 4–7 pm', address: '142 Cedar Hollow Dr, Kyle, TX 78640', instructions: '', toteAcknowledgements: [{ toteId: 'MTK-1043', contentsDescription: 'Halloween decorations', combinedContentsValue: 750, acknowledged: true }] })
    expect(request.status).toBe('Awaiting confirmation')
    const updated = await service.getDemoData()
    expect(updated.requests[0].id).toBe(request.id)
    expect(updated.totes.find((tote) => tote.id === 'MTK-1043')).toMatchObject({ description: 'Halloween decorations', combinedContentsValue: 750, contentsAcknowledged: true })
  })

  it('requires packing acknowledgment and valid values without a liability-based eligibility cap', async () => {
    const service = createMockToteKeeperService()
    const request = { kind: 'Collection' as const, toteIds: ['MTK-1043'], preferredDate: '2026-11-15', preferredWindow: 'Weekend evening, 4–7 pm', address: '142 Cedar Hollow Dr, Kyle, TX 78640', instructions: '' }
    await expect(service.createRequest(request)).rejects.toThrow('Confirm the packing rules')
    await expect(service.createRequest({ ...request, toteAcknowledgements: [{ toteId: 'MTK-1043', contentsDescription: 'Decorations', combinedContentsValue: -1, acknowledged: true }] })).rejects.toThrow('valid nonnegative')
    await expect(service.createRequest({ ...request, toteAcknowledgements: [{ toteId: 'MTK-1043', contentsDescription: 'Decorations', combinedContentsValue: 200, acknowledged: false }] })).rejects.toThrow('Confirm the packing rules')
  })

  it('selects the smallest plan for the requested tote mixes', () => {
    expect(creditsForToteMix(2, 0)).toBe(2)
    expect(smallestPlanForCredits(creditsForToteMix(2, 0))?.id).toBe('small')
    expect(smallestPlanForCredits(creditsForToteMix(0, 1))?.id).toBe('small')
    expect(smallestPlanForCredits(creditsForToteMix(2, 1))?.id).toBe('medium')
    expect(smallestPlanForCredits(creditsForToteMix(0, 5))?.id).toBe('big')
    expect(creditsForToteMix(1, 5)).toBe(11)
    expect(smallestPlanForCredits(creditsForToteMix(1, 5))).toBeUndefined()
  })

  it('migrates older demo records without a size to Large and maps the legacy plan allowance', async () => {
    const legacy = {
      profile: { name: 'Demo', email: 'demo@example.test', address: '1 Main St', city: 'Kyle, TX', zip: '78640', plan: '4-tote plan', toteAllowance: 4 },
      totes: [{ id: 'MTK-1042', nickname: 'Old tote', category: 'Seasonal', description: 'Old demo item', status: 'At home', history: [] }],
      requests: [],
    }
    memory.set('my-tote-keeper-demo-v1', JSON.stringify(legacy))
    const migrated = await createMockToteKeeperService().getDemoData()
    expect(migrated.profile).toMatchObject({ planId: 'medium', planCreditAllowance: 4 })
    expect(migrated.totes[0].size).toBe('large')
    expect(migrated.totes.reduce((sum, tote) => sum + SERVICE_CONFIG.toteSizes[tote.size].credits, 0)).toBe(1)
  })

  it('migrates old seal fields into current or prior seal state without losing tote identity', async () => {
    const legacy = {
      profile: { name: 'Demo', email: 'demo@example.test', address: '1 Main St', city: 'Kyle, TX', zip: '78640', planId: 'medium', planCreditAllowance: 4 },
      totes: [
        { id: 'MTK-2001', nickname: 'Still stored', category: 'Seasonal', description: 'Packed keepsakes', status: 'In storage', tieNumber: 'S-3101', history: [{ date: 'Mar 1, 2026', label: 'Collected', detail: 'Handoff' }] },
        { id: 'MTK-2002', nickname: 'Returned home', category: 'Seasonal', description: 'Packed linens', status: 'At home', tieNumber: 'S-3102', history: [{ date: 'Mar 1, 2026', label: 'Collected', detail: 'Handoff' }, { date: 'Mar 2, 2026', label: 'Returned to customer', detail: 'Customer took tote home' }] },
      ], requests: [],
    }
    memory.set('my-tote-keeper-demo-v2', JSON.stringify(legacy))
    const data = await createMockToteKeeperService().getDemoData()
    expect(data.totes[0]).toMatchObject({ id: 'MTK-2001', currentSealNumber: 'S-3101', priorSealNumbers: [] })
    expect(data.totes[1]).toMatchObject({ id: 'MTK-2002', priorSealNumbers: ['S-3102'] })
    expect(data.totes[1]).not.toHaveProperty('currentSealNumber')
  })

  it('blocks a demo tote allocation that exceeds available plan credits', async () => {
    const service = createMockToteKeeperService()
    for (let index = 0; index < 3; index += 1) await service.addDemoTote({ size: 'xl', nickname: `Packed XL tote ${index + 1}`, category: 'Holiday décor', description: 'Clean seasonal bedding', status: 'At home', combinedContentsValue: 80, contentsAcknowledged: true })
    const data = await service.getDemoData()
    expect(data.totes.reduce((sum, tote) => sum + SERVICE_CONFIG.toteSizes[tote.size].credits, 0)).toBe(10)
    await expect(service.addDemoTote({ size: 'xl', nickname: 'Extra XL tote', category: 'Seasonal', description: 'Demo item', status: 'At home', combinedContentsValue: 50, contentsAcknowledged: true })).rejects.toThrow('would use 12 of 10 package credits')
  })

  it('keeps concern reports fictional and unpersisted', async () => {
    const service = createMockToteKeeperService()
    const before = await service.getDemoData()
    await service.reportConcern({ toteId: 'MTK-1042', category: 'Seal discrepancy', description: 'The sample seal looks different.' })
    expect(await service.getDemoData()).toEqual(before)
    await expect(service.reportConcern({ toteId: 'MTK-9999', category: 'Other', description: 'Not found' })).rejects.toThrow('could not be found')
  })

  it('persists the XL migration without losing records and resets both storage versions', async () => {
    const service = createMockToteKeeperService()
    const original = await service.getDemoData()
    const legacy = structuredClone(original) as unknown as { totes: Array<Record<string, unknown>> }
    legacy.totes[2].size = 'oversized'
    const encoded = JSON.stringify(legacy)
    memory.set('my-tote-keeper-demo-v2', encoded)
    memory.set('my-tote-keeper-demo-v1', encoded)
    const migrated = await service.getDemoData()
    expect(migrated).toMatchObject(original)
    expect(migrated.totes[2].size).toBe('xl')
    expect(JSON.parse(memory.get('my-tote-keeper-demo-v2')!).totes[2]).toMatchObject(original.totes[2])
    await service.saveTote(migrated.totes[2].id, { nickname: 'Updated XL', description: 'Clean linens' })
    expect((await createMockToteKeeperService().getDemoData()).totes[2].nickname).toBe('Updated XL')
    expect(await service.resetDemo()).toEqual(original)
    expect(memory.size).toBe(0)
    expect(await service.getDemoData()).toEqual(original)
  })

  it('keeps new package allocation and retried fictional enrollment independent', async () => {
    const service = createMockToteKeeperService()
    const input = { packages: [{ planId: 'small' as const, billing: 'annual' as const, large: 0, xl: 1 }], bulky: [], address: 'Fictional address', agreement: { version: 'business-preview-v1', accepted: true }, serviceSms: false, marketingSms: false, retryKey: 'same-attempt' }
    await service.enrollDemo(input); await service.enrollDemo(input)
    const data = await service.getDemoData()
    expect(data.packages).toHaveLength(2)
    expect(data.agreements).toHaveLength(1)
    expect(data.agreements[0].mode).toBe('Fictional preview')
    const pkg = data.packages[1]
    await expect(service.addDemoTote({ packageId: pkg.id, size: 'large', nickname: 'Extra', description: 'Linens', category: 'Seasonal', status: 'At home', contentsAcknowledged: true, combinedContentsValue: 20 })).rejects.toThrow('3 of 2 package credits')
    expect(data.packages[0].credits).toBe(10)
    await expect(service.enrollDemo({ ...input, retryKey: 'monthly', packages: [{ ...input.packages[0], billing: 'monthly' }] })).rejects.toThrow('setup charge')
    expect((await service.getDemoData()).packages).toHaveLength(2)
  })

  it('reserves a partial return, tracks both extra-cycle legs, then allows free cancellation return', async () => {
    const service = createMockToteKeeperService()
    const data = await service.getDemoData(); const packageId = data.packages[0].id
    const preferredDate = '2030-11-17'
    const base = { kind: 'Return delivery' as const, packageId, preferredDate, preferredWindow: 'Weekend evening, 4–7 pm', address: 'Fictional address', instructions: '' }
    const partial = await service.createRequest({ ...base, toteIds: ['MTK-1042'] })
    await expect(service.createRequest({ ...base, toteIds: ['MTK-1044'] })).rejects.toThrow('partial return')
    await service.simulateCompletedRequest(partial.id)
    await service.buyExtraCycle(packageId)
    let updated = await service.getDemoData(); const extraId = updated.packages[0].cycles.find(cycle => cycle.kind === 'Extra')!.id
    const dropoff = await service.createRequest({ ...base, cycleId: extraId, toteIds: ['MTK-1044'] })
    await service.simulateCompletedRequest(dropoff.id)
    const pickup = await service.createRequest({ ...base, kind: 'Collection', cycleId: extraId, toteIds: ['MTK-1044'], toteAcknowledgements: [{ toteId: 'MTK-1044', contentsDescription: 'Clean bedding', combinedContentsValue: 100, acknowledged: true }] })
    await service.simulateCompletedRequest(pickup.id)
    updated = await service.getDemoData()
    expect(updated.packages[0].cycles.find(cycle => cycle.id === extraId)!.legs.every(leg => leg.status === 'Completed')).toBe(true)
    await service.cancelPackage(packageId)
    updated = await service.getDemoData()
    expect(updated.packages[0].renewalEnabled).toBe(false)
    const final = await service.createRequest({ ...base, purpose: 'Final return', toteIds: ['MTK-1044'] })
    expect(final.purpose).toBe('Final return')
    expect(updated.packages[0].cycles.find(cycle => cycle.kind === 'Cancellation')!.price).toBe(0)
  })

  it('records unattended authorization without claiming owner approval or accepting arbitrary windows', async () => {
    const service = createMockToteKeeperService()
    const input = { kind: 'Return delivery' as const, toteIds: ['MTK-1042'], preferredDate: '2030-11-17', preferredWindow: 'Weekend evening, 4–7 pm', address: 'Fictional address', instructions: '', unattended: { requested: true, location: 'Fictional porch', authorized: true, agreedByOwner: true, riskAcknowledged: false } }
    await expect(service.createRequest(input)).rejects.toThrow('theft-risk')
    const request = await service.createRequest({ ...input, unattended: { ...input.unattended, riskAcknowledged: true } })
    expect(request.unattended?.agreedByOwner).toBe(false)
    expect(request.unattended?.authorizedAt).toBeTruthy()
    expect(request.confirmedAppointment).toBeUndefined()
  })
})
