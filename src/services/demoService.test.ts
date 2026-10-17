import { beforeEach, describe, expect, it } from 'vitest'
import { createMockToteKeeperService, hasActiveConflict, isToteEligible } from './demoService'
import type { DemoData } from '../types'

const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) } })

describe('demo request rules', () => {
  beforeEach(() => memory.clear())

  it('allows collection only for totes at home and returns only for stored totes', async () => {
    const data = await createMockToteKeeperService().getDemoData()
    expect(data.totes.filter((tote) => isToteEligible(tote, 'Collection')).map((tote) => tote.id)).toEqual(['MTK-1044', 'MTK-1045'])
    expect(data.totes.filter((tote) => isToteEligible(tote, 'Return delivery')).map((tote) => tote.id)).toEqual(['MTK-1042', 'MTK-1043'])
  })

  it('blocks overlapping active requests but releases cancelled totes', () => {
    const data = { requests: [{ toteIds: ['MTK-1042'], status: 'Awaiting confirmation' }] } as DemoData
    expect(hasActiveConflict(data, ['MTK-1042'])).toBe(true)
    data.requests[0].status = 'Cancelled'
    expect(hasActiveConflict(data, ['MTK-1042'])).toBe(false)
  })

  it('creates a request awaiting confirmation', async () => {
    const service = createMockToteKeeperService()
    const request = await service.createRequest({ kind: 'Collection', toteIds: ['MTK-1044'], preferredDate: '2026-11-15', preferredWindow: 'Afternoon, 12–4 pm', address: '142 Cedar Hollow Dr, Kyle, TX 78640', instructions: '' })
    expect(request.status).toBe('Awaiting confirmation')
    expect((await service.getDemoData()).requests[0].id).toBe(request.id)
  })
})