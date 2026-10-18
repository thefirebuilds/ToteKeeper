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
    const request = await service.createRequest({ kind: 'Collection', toteIds: ['MTK-1044'], preferredDate: '2026-11-15', preferredWindow: 'Weekend evening, 4–7 pm', address: '142 Cedar Hollow Dr, Kyle, TX 78640', instructions: '', toteAcknowledgements: [{ toteId: 'MTK-1044', contentsDescription: 'Spare bedding', combinedContentsValue: 200, acknowledged: true }] })
    expect(request.status).toBe('Awaiting confirmation')
    const updated = await service.getDemoData()
    expect(updated.requests[0].id).toBe(request.id)
    expect(updated.totes.find((tote) => tote.id === 'MTK-1044')).toMatchObject({ description: 'Spare bedding', combinedContentsValue: 200, contentsAcknowledged: true })
  })

  it('blocks collection unless every selected tote is acknowledged within the combined contents value cap', async () => {
    const service = createMockToteKeeperService()
    const request = { kind: 'Collection' as const, toteIds: ['MTK-1044'], preferredDate: '2026-11-15', preferredWindow: 'Weekend evening, 4–7 pm', address: '142 Cedar Hollow Dr, Kyle, TX 78640', instructions: '' }
    await expect(service.createRequest(request)).rejects.toThrow('Confirm the packing rules')
    await expect(service.createRequest({ ...request, toteAcknowledgements: [{ toteId: 'MTK-1044', contentsDescription: 'Bedding', combinedContentsValue: 200.01, acknowledged: true }] })).rejects.toThrow('no more than $200')
    await expect(service.createRequest({ ...request, toteAcknowledgements: [{ toteId: 'MTK-1044', contentsDescription: 'Bedding', combinedContentsValue: 200, acknowledged: false }] })).rejects.toThrow('Confirm the packing rules')
  })
})