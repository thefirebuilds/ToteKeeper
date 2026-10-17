import type { CreateRequestInput, DemoData, ServiceRequest, Tote } from '../types'
import { SERVICE_CONFIG } from '../config/business'

export interface ToteKeeperService {
  getDemoData(): Promise<DemoData>
  saveTote(toteId: string, changes: Pick<Tote, 'nickname' | 'description'>): Promise<Tote>
  createRequest(input: CreateRequestInput): Promise<ServiceRequest>
  cancelRequest(requestId: string): Promise<void>
  resetDemo(): Promise<DemoData>
}

const STORAGE_KEY = 'my-tote-keeper-demo-v1'
const initialData: DemoData = {
  profile: {
    name: 'Jamie Morgan', email: 'jamie@example.test', address: '142 Cedar Hollow Dr',
    city: 'Kyle, TX', zip: '78640', plan: `${SERVICE_CONFIG.plans[1].totes}-tote plan`, toteAllowance: SERVICE_CONFIG.plans[1].totes,
  },
  totes: [
    { id: 'MTK-1042', nickname: 'Christmas ornaments', category: 'Holiday décor', description: 'Tree ornaments, ribbon, and the little village houses.', status: 'In storage', tieNumber: '5812', history: [{ date: 'Oct 12, 2025', label: 'Collected', detail: 'Doorstep handoff in Kyle' }, { date: 'Oct 12, 2025', label: 'Checked in', detail: 'Tote received for seasonal storage' }] },
    { id: 'MTK-1043', nickname: 'Halloween decorations', category: 'Holiday décor', description: 'Indoor decorations and porch lanterns.', status: 'In storage', tieNumber: '5813', history: [{ date: 'Oct 12, 2025', label: 'Collected', detail: 'Doorstep handoff in Kyle' }] },
    { id: 'MTK-1044', nickname: 'Summer linens', category: 'Seasonal household', description: 'Guest bedding and lightweight summer blankets.', status: 'At home', history: [{ date: 'May 18, 2026', label: 'Returned', detail: 'Delivered to your service address' }] },
    { id: 'MTK-1045', nickname: 'Patio cushions', category: 'Seasonal household', description: 'Clean, dry cushion covers and outdoor throws.', status: 'At home', history: [{ date: 'May 18, 2026', label: 'Returned', detail: 'Delivered to your service address' }] },
  ],
  requests: [{ id: 'REQ-2081', kind: 'Return delivery', toteIds: ['MTK-1042'], preferredDate: '2026-11-06', preferredWindow: 'Morning, 8 am–12 pm', address: '142 Cedar Hollow Dr, Kyle, TX 78640', instructions: 'Please text when you are on the way.', status: 'Awaiting confirmation', createdAt: 'Oct 17, 2026' }],
}

function copy(data: DemoData): DemoData {
  return structuredClone(data)
}

function read(): DemoData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) as DemoData : copy(initialData)
  } catch {
    return copy(initialData)
  }
}

function write(data: DemoData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function isToteEligible(tote: Tote, kind: CreateRequestInput['kind']): boolean {
  return kind === 'Collection' ? tote.status === 'At home' : tote.status === 'In storage'
}

export function hasActiveConflict(data: DemoData, toteIds: string[]): boolean {
  return data.requests.some((request) => request.status !== 'Cancelled' && request.toteIds.some((id) => toteIds.includes(id)))
}

export function createMockToteKeeperService(): ToteKeeperService {
  return {
    async getDemoData() { return read() },
    async saveTote(toteId, changes) {
      const data = read()
      const tote = data.totes.find((item) => item.id === toteId)
      if (!tote) throw new Error('That tote could not be found.')
      tote.nickname = changes.nickname.trim() || tote.nickname
      tote.description = changes.description.trim()
      write(data)
      return structuredClone(tote)
    },
    async createRequest(input) {
      const data = read()
      if (!input.toteIds.length) throw new Error('Choose at least one tote.')
      const selected = data.totes.filter((tote) => input.toteIds.includes(tote.id))
      if (selected.length !== input.toteIds.length || selected.some((tote) => !isToteEligible(tote, input.kind))) throw new Error('One or more selected totes are not eligible for this request.')
      if (hasActiveConflict(data, input.toteIds)) throw new Error('An active request already includes one of those totes.')
      const request: ServiceRequest = { ...input, id: `REQ-${Math.floor(3000 + Math.random() * 6000)}`, status: 'Awaiting confirmation', createdAt: new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Chicago' }).format(new Date()) }
      data.requests.unshift(request)
      write(data)
      return request
    },
    async cancelRequest(requestId) {
      const data = read()
      const request = data.requests.find((item) => item.id === requestId)
      if (!request || request.status !== 'Awaiting confirmation') throw new Error('Only unconfirmed requests can be cancelled.')
      request.status = 'Cancelled'
      write(data)
    },
    async resetDemo() {
      localStorage.removeItem(STORAGE_KEY)
      return copy(initialData)
    },
  }
}

export const toteKeeperService = createMockToteKeeperService()