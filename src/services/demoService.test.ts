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
    const request = await service.createRequest({ kind: 'Collection', toteIds: ['MTK-1043'], preferredDate: '2026-11-15', preferredWindow: 'Weekend evening, 4–7 pm', address: '142 Cedar Hollow Dr, Kyle, TX 78640', instructions: '', toteAcknowledgements: [{ toteId: 'MTK-1043', contentsDescription: 'Halloween decorations', combinedContentsValue: 200, acknowledged: true }] })
    expect(request.status).toBe('Awaiting confirmation')
    const updated = await service.getDemoData()
    expect(updated.requests[0].id).toBe(request.id)
    expect(updated.totes.find((tote) => tote.id === 'MTK-1043')).toMatchObject({ description: 'Halloween decorations', combinedContentsValue: 200, contentsAcknowledged: true })
  })

  it('blocks collection unless every selected tote is acknowledged within the combined contents value cap', async () => {
    const service = createMockToteKeeperService()
    const request = { kind: 'Collection' as const, toteIds: ['MTK-1043'], preferredDate: '2026-11-15', preferredWindow: 'Weekend evening, 4–7 pm', address: '142 Cedar Hollow Dr, Kyle, TX 78640', instructions: '' }
    await expect(service.createRequest(request)).rejects.toThrow('Confirm the packing rules')
    await expect(service.createRequest({ ...request, toteAcknowledgements: [{ toteId: 'MTK-1043', contentsDescription: 'Decorations', combinedContentsValue: 200.01, acknowledged: true }] })).rejects.toThrow('no more than $200')
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
    for (let index = 0; index < 3; index += 1) await service.addDemoTote({ size: 'oversized', nickname: `Packed tree bag ${index + 1}`, category: 'Holiday décor', description: 'One disassembled tree bag', status: 'At home', combinedContentsValue: 80, contentsAcknowledged: true })
    const data = await service.getDemoData()
    expect(data.totes.reduce((sum, tote) => sum + SERVICE_CONFIG.toteSizes[tote.size].credits, 0)).toBe(10)
    await expect(service.addDemoTote({ size: 'oversized', nickname: 'Extra oversized tote', category: 'Seasonal', description: 'Demo item', status: 'At home', combinedContentsValue: 50, contentsAcknowledged: true })).rejects.toThrow('would use 12 of 10 plan credits')
  })

  it('keeps concern reports fictional and unpersisted', async () => {
    const service = createMockToteKeeperService()
    const before = await service.getDemoData()
    await service.reportConcern({ toteId: 'MTK-1042', category: 'Seal discrepancy', description: 'The sample seal looks different.' })
    expect(await service.getDemoData()).toEqual(before)
    await expect(service.reportConcern({ toteId: 'MTK-9999', category: 'Other', description: 'Not found' })).rejects.toThrow('could not be found')
  })
})