import type { AddDemoToteInput, CreateRequestInput, DemoData, SaveToteInput, ServiceRequest, Tote, ToteSizeId } from '../types'
import { SERVICE_CONFIG } from '../config/business'

export interface ToteKeeperService {
  getDemoData(): Promise<DemoData>
  saveTote(toteId: string, changes: SaveToteInput): Promise<Tote>
  addDemoTote(input: AddDemoToteInput): Promise<Tote>
  reportConcern(input: { toteId: string; category: 'Damage' | 'Missing item' | 'Seal discrepancy' | 'Pest concern' | 'Other'; description: string }): Promise<void>
  createRequest(input: CreateRequestInput): Promise<ServiceRequest>
  cancelRequest(requestId: string): Promise<void>
  resetDemo(): Promise<DemoData>
}

const STORAGE_KEY = 'my-tote-keeper-demo-v2'
const LEGACY_STORAGE_KEY = 'my-tote-keeper-demo-v1'
const initialData: DemoData = {
  profile: {
    name: 'Jamie Morgan', email: 'jamie@example.test', address: '142 Cedar Hollow Dr',
    city: 'Kyle, TX', zip: '78640', planId: 'big', planCreditAllowance: 10,
  },
  totes: [
    { id: 'MTK-1042', size: 'large', nickname: 'Christmas ornaments', category: 'Holiday décor', description: 'Tree ornaments, ribbon, and the little village houses.', status: 'In storage', combinedContentsValue: 165, contentsAcknowledged: true, currentSealNumber: '5812', exteriorCondition: 'Small scuff on right side, noted at handoff.', exteriorPhotoStatus: 'Demo placeholder, no photo stored', history: [{ date: 'Oct 12, 2025', label: 'Collected', detail: 'Doorstep handoff in Kyle', operator: 'Casey R. (fictional operator)', sealNumber: '5812', exteriorCondition: 'Small scuff on right side, noted at handoff.', photoStatus: 'Demo placeholder, no photo stored' }, { date: 'Oct 12, 2025', label: 'Received into storage', detail: 'Receipt recorded; contents not inspected or verified.', operator: 'Casey R. (fictional operator)', sealNumber: '5812', exteriorCondition: 'Same exterior scuff noted.', photoStatus: 'Demo placeholder, no photo stored' }] },
    { id: 'MTK-1043', size: 'large', nickname: 'Halloween decorations', category: 'Holiday décor', description: 'Indoor decorations and porch lanterns.', status: 'At home', combinedContentsValue: 95, contentsAcknowledged: true, priorSealNumbers: ['5813'], exteriorCondition: 'No exterior exceptions noted in this fictional example.', exteriorPhotoStatus: 'Demo placeholder, no photo stored', history: [{ date: 'Oct 12, 2025', label: 'Collected', detail: 'Doorstep handoff in Kyle', operator: 'Casey R. (fictional operator)', sealNumber: '5813', exteriorCondition: 'No exterior exceptions noted in this fictional example.', photoStatus: 'Demo placeholder, no photo stored' }, { date: 'Oct 12, 2025', label: 'Received into storage', detail: 'Receipt recorded; contents not inspected or verified.', operator: 'Casey R. (fictional operator)', sealNumber: '5813' }, { date: 'Oct 25, 2025', label: 'Dispatched for return', detail: 'Fictional scheduled return dispatch.', operator: 'Casey R. (fictional operator)', sealNumber: '5813' }, { date: 'Oct 25, 2025', label: 'Returned to customer', detail: 'Customer handoff recorded; customer removed numbered seal.', operator: 'Casey R. (fictional operator)', sealNumber: '5813' }, { date: 'Oct 25, 2025', label: 'Seal removed', detail: 'Customer removed seal 5813 after return; retained in tote history.', sealNumber: '5813' }] },
    { id: 'MTK-1044', size: 'xl', nickname: 'Dorm room soft goods', category: 'Student summer storage', description: 'Clean bedding, towels, and a mattress topper for the summer break.', status: 'In storage', combinedContentsValue: 120, contentsAcknowledged: true, currentSealNumber: '5830', priorSealNumbers: ['5720'], exteriorCondition: 'No exterior exceptions noted at latest collection.', exteriorPhotoStatus: 'Demo placeholder, no photo stored', history: [{ date: 'May 18, 2026', label: 'Collected', detail: 'Doorstep handoff in Kyle', operator: 'Casey R. (fictional operator)', sealNumber: '5720', exteriorCondition: 'Clean exterior; no exceptions noted.', photoStatus: 'Demo placeholder, no photo stored' }, { date: 'May 18, 2026', label: 'Received into storage', detail: 'Receipt recorded; contents not inspected or verified.', operator: 'Casey R. (fictional operator)', sealNumber: '5720' }, { date: 'Aug 15, 2026', label: 'Dispatched for return', detail: 'Fictional scheduled return dispatch.', operator: 'Casey R. (fictional operator)', sealNumber: '5720' }, { date: 'Aug 15, 2026', label: 'Returned to customer', detail: 'Customer handoff recorded; customer removed numbered seal.', operator: 'Casey R. (fictional operator)', sealNumber: '5720', exteriorCondition: 'Clean exterior at return.' }, { date: 'Aug 15, 2026', label: 'Seal removed', detail: 'Customer removed seal 5720 after return; retained in tote history.', sealNumber: '5720' }, { date: 'Sep 10, 2026', label: 'Collected', detail: 'New collection after customer repacked tote.', operator: 'Casey R. (fictional operator)', sealNumber: '5830', exteriorCondition: 'No exterior exceptions noted.', photoStatus: 'Demo placeholder, no photo stored' }, { date: 'Sep 10, 2026', label: 'Received into storage', detail: 'New receipt recorded; contents not inspected or verified.', operator: 'Casey R. (fictional operator)', sealNumber: '5830', exteriorCondition: 'No exterior exceptions noted.', photoStatus: 'Demo placeholder, no photo stored' }] },
  ],
  requests: [],
}

function copy(data: DemoData): DemoData {
  return structuredClone(data)
}

function read(): DemoData {
  try {
    const current = localStorage.getItem(STORAGE_KEY)
    if (current) {
      const migrated = migrate(JSON.parse(current) as Record<string, unknown>)
      write(migrated)
      return migrated
    }
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!legacy) return copy(initialData)
    const migrated = migrate(JSON.parse(legacy) as Record<string, unknown>)
    write(migrated)
    return migrated
  } catch {
    return copy(initialData)
  }
}

function migrate(value: Record<string, unknown>): DemoData {
  const data = value as unknown as DemoData
  const profileRecord = data.profile as DemoData['profile'] & { plan?: string; toteAllowance?: number }
  if (!profileRecord.planId) {
    const legacyPlan = profileRecord.plan ?? ''
    const legacyToteCount = profileRecord.toteAllowance ?? (legacyPlan.includes('10') ? 10 : legacyPlan.includes('4') ? 4 : 1)
    const plan = legacyToteCount >= 10 ? SERVICE_CONFIG.plans[2] : legacyToteCount >= 4 ? SERVICE_CONFIG.plans[1] : SERVICE_CONFIG.plans[0]
    profileRecord.planId = plan.id
    profileRecord.planCreditAllowance = plan.credits
  }
  if (!profileRecord.planCreditAllowance) profileRecord.planCreditAllowance = SERVICE_CONFIG.plans.find((plan) => plan.id === profileRecord.planId)?.credits ?? SERVICE_CONFIG.plans[1].credits
  for (const tote of data.totes ?? []) {
    if ((tote.size as string) === 'oversized') tote.size = 'xl'
    if (tote.size !== 'large' && tote.size !== 'xl') tote.size = 'large'
    const mutable = tote as Tote & { tieNumber?: string }
    if (mutable.tieNumber && !tote.currentSealNumber) {
      if (tote.status === 'In storage') tote.currentSealNumber = mutable.tieNumber
      else tote.priorSealNumbers = [...(tote.priorSealNumbers ?? []), mutable.tieNumber]
      delete mutable.tieNumber
    }
    tote.priorSealNumbers ??= []
    tote.history = (tote.history ?? []).map((movement) => ({ ...movement, operator: movement.operator ?? 'Demo record (fictional)', exteriorCondition: movement.exteriorCondition ?? 'Condition record not supplied in older demo data.', photoStatus: movement.photoStatus ?? 'Demo placeholder, no photo stored' }))
  }
  data.profile = profileRecord
  return data
}

function write(data: DemoData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function creditsForToteSize(size: ToteSizeId): number {
  return SERVICE_CONFIG.toteSizes[size].credits
}

export function allocatedCredits(data: DemoData): number {
  return data.totes.reduce((total, tote) => total + creditsForToteSize(tote.size), 0)
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
      if (changes.contentsAcknowledged && (changes.combinedContentsValue === undefined || !Number.isFinite(changes.combinedContentsValue) || changes.combinedContentsValue < 0 || changes.combinedContentsValue > SERVICE_CONFIG.maxCombinedToteContentsValue || !changes.description.trim())) throw new Error(`To acknowledge this tote, provide a contents description and a combined value of $${SERVICE_CONFIG.maxCombinedToteContentsValue} or less.`)
      tote.nickname = changes.nickname.trim() || tote.nickname
      tote.description = changes.description.trim()
      if (changes.combinedContentsValue !== undefined) tote.combinedContentsValue = changes.combinedContentsValue
      if (changes.contentsAcknowledged !== undefined) tote.contentsAcknowledged = changes.contentsAcknowledged
      write(data)
      return structuredClone(tote)
    },
    async addDemoTote(input) {
      const data = read()
      if (!input.nickname.trim() || !input.description.trim()) throw new Error('Add a nickname and contents description for this tote.')
      if (!input.contentsAcknowledged || input.combinedContentsValue === undefined || !Number.isFinite(input.combinedContentsValue) || input.combinedContentsValue < 0 || input.combinedContentsValue > SERVICE_CONFIG.maxCombinedToteContentsValue) throw new Error(`Complete the packing acknowledgment and keep the combined contents value at or below $${SERVICE_CONFIG.maxCombinedToteContentsValue}.`)
      const credits = allocatedCredits(data) + creditsForToteSize(input.size)
      if (credits > data.profile.planCreditAllowance) throw new Error(`This tote would use ${credits} of ${data.profile.planCreditAllowance} plan credits. Choose a smaller tote or ask about a larger plan.`)
      const nextNumber = Math.max(1041, ...data.totes.map((tote) => Number(tote.id.replace(/\D/g, '')) || 0)) + 1
      const tote: Tote = { ...input, id: `MTK-${nextNumber}`, nickname: input.nickname.trim(), description: input.description.trim(), status: input.status, history: [{ date: new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Chicago' }).format(new Date()), label: 'Added to demo account', detail: 'Fictional tote record' }] }
      data.totes.push(tote)
      write(data)
      return structuredClone(tote)
    },
    async createRequest(input) {
      const data = read()
      if (!input.toteIds.length) throw new Error('Choose at least one tote.')
      const selected = data.totes.filter((tote) => input.toteIds.includes(tote.id))
      if (selected.length !== input.toteIds.length || selected.some((tote) => !isToteEligible(tote, input.kind))) throw new Error('One or more selected totes are not eligible for this request.')
      if (input.kind === 'Collection') {
        const acknowledgements = input.toteAcknowledgements ?? []
        if (acknowledgements.length !== selected.length || selected.some((tote) => {
          const acknowledgement = acknowledgements.find((entry) => entry.toteId === tote.id)
          return !acknowledgement || !acknowledgement.acknowledged || !acknowledgement.contentsDescription.trim() || !Number.isFinite(acknowledgement.combinedContentsValue) || acknowledgement.combinedContentsValue < 0 || acknowledgement.combinedContentsValue > SERVICE_CONFIG.maxCombinedToteContentsValue
        })) throw new Error(`Confirm the packing rules and contents value for each tote. Combined contents value must be no more than $${SERVICE_CONFIG.maxCombinedToteContentsValue} per tote.`)
        for (const acknowledgement of acknowledgements) {
          const tote = selected.find((item) => item.id === acknowledgement.toteId)
          if (tote) {
            tote.description = acknowledgement.contentsDescription.trim()
            tote.combinedContentsValue = acknowledgement.combinedContentsValue
            tote.contentsAcknowledged = true
          }
        }
      }
      if (hasActiveConflict(data, input.toteIds)) throw new Error('An active request already includes one of those totes.')
      const request: ServiceRequest = { ...input, id: `REQ-${Math.floor(3000 + Math.random() * 6000)}`, status: 'Awaiting confirmation', createdAt: new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Chicago' }).format(new Date()) }
      data.requests.unshift(request)
      write(data)
      return request
    },
    async reportConcern(input) {
      if (!input.description.trim()) throw new Error('Add a short description of your concern.')
      const data = read()
      if (!data.totes.some((tote) => tote.id === input.toteId)) throw new Error('That demo tote could not be found.')
      // Intentionally no submission or local persistence: this demo cannot contact the business.
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
      localStorage.removeItem(LEGACY_STORAGE_KEY)
      return copy(initialData)
    },
  }
}

export const toteKeeperService = createMockToteKeeperService()