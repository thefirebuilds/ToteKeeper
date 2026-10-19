import type { AddDemoToteInput, CreateRequestInput, DemoData, SaveToteInput, ServiceRequest, Tote, ToteSizeId } from '../types'
import { POLICY, SERVICE_CONFIG } from '../config/business'
import { addExtraCycle, advanceCancellation, createPackage, packageCredits, planFor, quoteOrder, registerBonus, requestCancellation, requireOwner, reserveLeg, validateAppointment, validateMix } from '../domain/operations'
import type { BulkySelection, CancellationStage, PackageSelection } from '../domain/operations'

const DEMO_CUSTOMER = 'fictional-jamie'

export interface ToteKeeperService {
  getDemoData(): Promise<DemoData>
  saveTote(toteId: string, changes: SaveToteInput): Promise<Tote>
  addDemoTote(input: AddDemoToteInput): Promise<Tote>
  reportConcern(input: { toteId: string; category: 'Damage' | 'Missing item' | 'Seal discrepancy' | 'Pest concern' | 'Other'; description: string }): Promise<void>
  createRequest(input: CreateRequestInput): Promise<ServiceRequest>
  cancelRequest(requestId: string): Promise<void>
  resetDemo(): Promise<DemoData>
  enrollDemo(input: { packages: PackageSelection[]; bulky: BulkySelection[]; address: string; agreement: { version: string; accepted: boolean }; serviceSms: boolean; marketingSms: boolean; retryKey: string }): Promise<void>
  buyExtraCycle(packageId: string): Promise<void>
  cancelPackage(packageId: string): Promise<void>
  progressCancellation(packageId: string, next: CancellationStage): Promise<void>
  simulateCompletedRequest(requestId: string): Promise<void>
}

const STORAGE_KEY = 'my-tote-keeper-demo-v2'
const LEGACY_STORAGE_KEY = 'my-tote-keeper-demo-v1'
const initialData: DemoData = {
  packages: [createPackage('PKG-DEMO-1', DEMO_CUSTOMER, 'big', 'annual', '2026-03-01T12:00:00Z')],
  bulkyItems: [], audit: [], cases: [], agreements: [],
  profile: {
    name: 'Jamie Morgan', email: 'jamie@example.test', address: '142 Cedar Hollow Dr',
    city: 'Kyle, TX', zip: '78640', planId: 'big', planCreditAllowance: 10,
  },
  totes: [
    { id: 'MTK-1042', size: 'large', nickname: 'Christmas ornaments', category: 'Holiday décor', description: 'Tree ornaments, ribbon, and the little village houses.', status: 'In storage', combinedContentsValue: 425, contentsAcknowledged: true, currentSealNumber: '5812', exteriorCondition: 'Small scuff on right side, noted at handoff.', exteriorPhotoStatus: 'Demo placeholder, no photo stored', history: [{ date: 'Oct 12, 2025', label: 'Collected', detail: 'Doorstep handoff in Kyle', operator: 'Casey R. (fictional operator)', sealNumber: '5812', exteriorCondition: 'Small scuff on right side, noted at handoff.', photoStatus: 'Demo placeholder, no photo stored' }, { date: 'Oct 12, 2025', label: 'Received into storage', detail: 'Receipt recorded; contents not inspected or verified.', operator: 'Casey R. (fictional operator)', sealNumber: '5812', exteriorCondition: 'Same exterior scuff noted.', photoStatus: 'Demo placeholder, no photo stored' }] },
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
    if (!legacy) return migrate(copy(initialData) as unknown as Record<string, unknown>)
    const migrated = migrate(JSON.parse(legacy) as Record<string, unknown>)
    write(migrated)
    return migrated
  } catch {
    return migrate(copy(initialData) as unknown as Record<string, unknown>)
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
  data.packages ??= [createPackage('PKG-DEMO-1', DEMO_CUSTOMER, planFor(profileRecord.planId as PackageSelection['planId']).id, 'annual', '2026-03-01T12:00:00Z')]
  data.bulkyItems ??= []; data.audit ??= []; data.cases ??= []; data.agreements ??= []
  for (const tote of data.totes ?? []) {
    if ((tote.size as string) === 'oversized') tote.size = 'xl'
    if (tote.size !== 'large' && tote.size !== 'xl') tote.size = 'large'
    tote.packageId ??= data.packages[0]?.id
    if (!data.packages.some(pkg => pkg.id === tote.packageId)) tote.assignmentReviewRequired = true
    const mutable = tote as Tote & { tieNumber?: string }
    if (mutable.tieNumber && !tote.currentSealNumber) {
      if (tote.status === 'In storage') tote.currentSealNumber = mutable.tieNumber
      else tote.priorSealNumbers = [...(tote.priorSealNumbers ?? []), mutable.tieNumber]
      delete mutable.tieNumber
    }
    tote.priorSealNumbers ??= []
    tote.history = (tote.history ?? []).map((movement) => ({ ...movement, operator: movement.operator ?? 'Demo record (fictional)', exteriorCondition: movement.exteriorCondition ?? 'Condition record not supplied in older demo data.', photoStatus: movement.photoStatus ?? 'Demo placeholder, no photo stored' }))
  }
  for (const request of data.requests ?? []) {
    if (request.packageId) continue
    const packageIds = new Set(data.totes.filter(tote => request.toteIds.includes(tote.id)).map(tote => tote.packageId))
    if (packageIds.size !== 1) continue
    const pkg = data.packages.find(pkg => pkg.id === [...packageIds][0])
    if (!pkg) continue
    request.packageId = pkg.id
    request.purpose ??= 'Packed belongings'
    const cycle = pkg.cycles.find(cycle => cycle.kind === 'Included')
    const leg = cycle?.legs.find(leg => leg.kind === (request.kind === 'Collection' ? 'Packed collection' : 'Packed return'))
    if (cycle && leg && leg.status === 'Available' && request.status !== 'Cancelled') {
      request.cycleId = cycle.id; request.legId = leg.id
      leg.requestId = request.id
      leg.status = request.status === 'Completed' ? 'Completed' : request.status === 'Confirmed' ? 'Confirmed' : 'Requested'
    }
  }
  data.profile = profileRecord
  data.profile.planCreditAllowance = data.packages.reduce((sum, pkg) => sum + pkg.credits, 0)
  return data
}

function write(data: DemoData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function creditsForToteSize(size: ToteSizeId): number {
  return SERVICE_CONFIG.toteSizes[size].credits
}

export function allocatedCredits(data: DemoData, packageId?: string): number {
  return data.totes.filter(tote => !packageId || tote.packageId === packageId).reduce((total, tote) => total + creditsForToteSize(tote.size), 0)
}

export function isToteEligible(tote: Tote, kind: CreateRequestInput['kind']): boolean {
  return kind === 'Collection' ? tote.status === 'At home' && tote.emptyLocation !== 'Company' : tote.status === 'In storage'
}

export function hasActiveConflict(data: DemoData, toteIds: string[]): boolean {
  return data.requests.some((request) => request.status !== 'Cancelled' && request.status !== 'Completed' && request.toteIds.some((id) => toteIds.includes(id)))
}

export function createMockToteKeeperService(): ToteKeeperService {
  return {
    async getDemoData() { return read() },
    async saveTote(toteId, changes) {
      const data = read()
      const tote = data.totes.find((item) => item.id === toteId)
      if (!tote) throw new Error('That tote could not be found.')
      if (changes.contentsAcknowledged && (changes.combinedContentsValue === undefined || !Number.isFinite(changes.combinedContentsValue) || changes.combinedContentsValue < 0 || !changes.description.trim())) throw new Error('To acknowledge this tote, provide a contents description and a valid nonnegative combined value.')
      tote.nickname = changes.nickname.trim() || tote.nickname
      tote.description = changes.description.trim()
      if (changes.combinedContentsValue !== undefined) tote.combinedContentsValue = changes.combinedContentsValue
      if (changes.contentsAcknowledged !== undefined) tote.contentsAcknowledged = changes.contentsAcknowledged
      write(data)
      return structuredClone(tote)
    },
    async addDemoTote(input) {
      const data = read()
      const pkg = data.packages.find(pkg => pkg.id === (input.packageId ?? data.packages[0]?.id))
      if (!pkg || pkg.cancellation !== 'Active') throw new Error('Choose an active package.')
      requireOwner(pkg, DEMO_CUSTOMER)
      if (!input.nickname.trim() || !input.description.trim()) throw new Error('Add a nickname and contents description for this tote.')
      if (!input.contentsAcknowledged || input.combinedContentsValue === undefined || !Number.isFinite(input.combinedContentsValue) || input.combinedContentsValue < 0) throw new Error('Complete the packing acknowledgment and enter a valid nonnegative combined contents value.')
      const credits = packageCredits(data.totes, pkg.id) + creditsForToteSize(input.size)
      if (credits > pkg.credits) throw new Error(`This tote would use ${credits} of ${pkg.credits} package credits. Choose a smaller tote or purchase another independent package.`)
      const nextNumber = Math.max(1041, ...data.totes.map((tote) => Number(tote.id.replace(/\D/g, '')) || 0)) + 1
      const tote: Tote = { ...input, packageId: pkg.id, id: `MTK-${nextNumber}`, nickname: input.nickname.trim(), description: input.description.trim(), status: input.status, history: [{ date: new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Chicago' }).format(new Date()), label: 'Added to demo account', detail: 'Fictional tote record' }] }
      data.totes.push(tote)
      write(data)
      return structuredClone(tote)
    },
    async createRequest(input) {
      const data = read()
      validateAppointment(input.preferredDate, input.preferredWindow)
      if (!input.toteIds.length) throw new Error('Choose at least one tote.')
      const selected = data.totes.filter((tote) => input.toteIds.includes(tote.id))
      if (selected.length !== input.toteIds.length || selected.some((tote) => input.purpose === 'Empty totes' ? tote.status !== 'At home' : !isToteEligible(tote, input.kind))) throw new Error('One or more selected totes are not eligible for this request.')
      if (input.purpose === 'Empty totes' && !input.emptyConfirmed) throw new Error('Confirm these totes are empty; empty-tote handling is not a packed-belongings cycle.')
      if (input.purpose === 'Final return' && input.kind !== 'Return delivery') throw new Error('A final return delivers belongings back to the customer.')
      const pkg = data.packages.find(pkg => pkg.id === (input.packageId ?? selected[0]?.packageId))
      if (!pkg || selected.some(tote => tote.packageId !== pkg.id)) throw new Error('Request one package at a time; package allowances are independent.')
      requireOwner(pkg, DEMO_CUSTOMER)
      if (selected.some(tote => tote.assignmentReviewRequired)) throw new Error('An operator must review this tote assignment first.')
      if (input.unattended?.requested && (!input.unattended.authorized || !input.unattended.location.trim() || !input.unattended.riskAcknowledged)) throw new Error('Record the unattended location, authorization, and theft-risk acknowledgment. Owner approval is still required.')
      if (input.kind === 'Collection' && (!input.purpose || input.purpose === 'Packed belongings')) {
        const acknowledgements = input.toteAcknowledgements ?? []
        if (acknowledgements.length !== selected.length || selected.some((tote) => {
          const acknowledgement = acknowledgements.find((entry) => entry.toteId === tote.id)
          return !acknowledgement || !acknowledgement.acknowledged || !acknowledgement.contentsDescription.trim() || !Number.isFinite(acknowledgement.combinedContentsValue) || acknowledgement.combinedContentsValue < 0
        })) throw new Error('Confirm the packing rules and enter a valid nonnegative contents value for each tote.')
        for (const acknowledgement of acknowledgements) {
          const tote = selected.find((item) => item.id === acknowledgement.toteId)
          if (tote) {
            tote.description = acknowledgement.contentsDescription.trim()
            tote.combinedContentsValue = acknowledgement.combinedContentsValue
            tote.contentsAcknowledged = true
          }
        }
      }
      if (input.purpose !== 'Final return' && hasActiveConflict(data, input.toteIds)) throw new Error('An active request already includes one of those totes.')
      const requestId = `REQ-${crypto.randomUUID()}`
      const purpose = input.purpose ?? 'Packed belongings'
      const cycle = data.packages.find(item => item.id === pkg.id)!.cycles.find(item => item.id === input.cycleId) ?? pkg.cycles.find(item => item.kind === (purpose === 'Final return' ? 'Cancellation' : 'Included'))
      if (!cycle) throw new Error('Choose a valid service cycle.')
      if (input.cycleId && cycle.id !== input.cycleId) throw new Error('That cycle does not belong to this package.')
      const legKind = purpose === 'Final return' ? 'Final return' : purpose === 'Empty totes' ? (input.emptyAction === 'Initial delivery' ? 'Initial empty delivery' : input.emptyAction === 'Redelivery' ? 'Empty redelivery' : 'Empty collection') : input.kind === 'Collection' ? 'Packed collection' : 'Packed return'
      const leg = reserveLeg(pkg, DEMO_CUSTOMER, cycle.id, legKind, requestId)
      const request: ServiceRequest = { ...input, packageId: pkg.id, cycleId: cycle.id, legId: leg.id, purpose, unattended: input.unattended ? { ...input.unattended, agreedByOwner: false, authorizedAt: new Date().toISOString() } : undefined, id: requestId, status: 'Awaiting confirmation', createdAt: new Date().toISOString() }
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
      const leg = data.packages.flatMap(pkg => pkg.cycles.flatMap(cycle => cycle.legs)).find(leg => leg.requestId === requestId)
      if (leg?.status === 'Requested') { leg.status = 'Available'; delete leg.requestId }
      write(data)
    },
    async resetDemo() {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(LEGACY_STORAGE_KEY)
      return migrate(copy(initialData) as unknown as Record<string, unknown>)
    },
    async enrollDemo(input) {
      const data = read()
      if (data.audit.some(event => event.action === `enroll:${input.retryKey}`)) return
      if (!input.retryKey || !input.agreement.accepted || input.agreement.version !== POLICY.agreement.version) throw new Error('Acknowledge the current demo policy preview. It is not an approved storage agreement.')
      quoteOrder(input.packages, input.bulky, input.address)
      if (input.packages.some(pkg => pkg.billing === 'monthly')) throw new Error('Monthly enrollment is in review until the setup charge and refundability are configured.')
      const ids: string[] = []
      for (const selection of input.packages) {
        validateMix(selection)
        const id = `PKG-${crypto.randomUUID()}`; ids.push(id)
        const pkg = createPackage(id, DEMO_CUSTOMER, selection.planId, selection.billing, new Date().toISOString())
        data.packages.push(pkg)
        for (const size of ['large', 'xl'] as const) for (let i = 0; i < selection[size]; i++) data.totes.push({ id: `MTK-${crypto.randomUUID()}`, packageId: id, size, nickname: `New ${size === 'xl' ? 'XL' : 'Large'} tote`, category: 'Unpacked demo tote', description: '', status: 'At home', history: [] })
      }
      for (const selection of input.bulky) {
        const id = `BULK-${crypto.randomUUID()}`; const pkg = selection.packageIndex === undefined ? undefined : data.packages.find(pkg => pkg.id === ids[selection.packageIndex!])
        if (selection.useBonus && pkg) registerBonus(pkg, id)
        const custom = selection.type === 'Other' || selection.dimensions.some((n, i) => n > [54, 24, 24][i])
        data.bulkyItems.push({ id, customerId: DEMO_CUSTOMER, packageId: pkg?.id, type: selection.type, dimensions: selection.dimensions, value: selection.value, pricing: custom ? 'Custom quote' : selection.useBonus ? 'Bonus' : pkg ? 'Add-on' : 'Standalone', annualPrice: custom ? null : selection.useBonus ? 0 : pkg ? 75 : 125, handlingStatus: 'Operator review', standaloneCycle: !pkg && !custom ? { id: `${id}-cycle`, kind: 'Included', price: 0, payment: 'Included', legs: [{ id: `${id}-collect`, kind: 'Packed collection', status: 'Available' }, { id: `${id}-return`, kind: 'Packed return', status: 'Available' }] } : undefined })
      }
      data.audit.push({ at: new Date().toISOString(), action: `enroll:${input.retryKey}`, detail: `Fictional enrollment only; policy preview ${input.agreement.version}; no payment, no eligibility approval, no legal agreement.` })
      data.consents = { serviceSms: input.serviceSms, marketingSms: input.marketingSms, optedOut: false, recordedAt: new Date().toISOString() }
      data.agreements.push({ version: input.agreement.version, acceptedAt: new Date().toISOString(), mode: 'Fictional preview' })
      write(data)
    },
    async buyExtraCycle(packageId) {
      const data = read(); const pkg = data.packages.find(pkg => pkg.id === packageId)
      if (!pkg) throw new Error('Package not found.')
      requireOwner(pkg, DEMO_CUSTOMER); addExtraCycle(pkg, `CYCLE-${crypto.randomUUID()}`)
      data.audit.push({ at: new Date().toISOString(), action: 'Demo extra cycle', packageId, detail: '$50 round trip; simulated, no payment collected.' }); write(data)
    },
    async cancelPackage(packageId) {
      const data = read(); const pkg = data.packages.find(pkg => pkg.id === packageId)
      if (!pkg) throw new Error('Package not found.')
      requestCancellation(pkg, DEMO_CUSTOMER, new Date().toISOString())
      for (const request of data.requests.filter(request => request.packageId === packageId && request.status === 'Awaiting confirmation' && request.purpose !== 'Final return')) {
        request.status = 'Cancelled'
        const leg = pkg.cycles.flatMap(cycle => cycle.legs).find(leg => leg.id === request.legId)
        if (leg?.status === 'Requested') { leg.status = 'Available'; delete leg.requestId }
      }
      data.audit.push({ at: new Date().toISOString(), action: 'Cancellation requested', packageId, detail: 'Stop future renewal; coordinate free final return immediately. No refund of committed charges, no penalty.' }); write(data)
    },
    async progressCancellation(packageId, next) {
      const data = read(); const pkg = data.packages.find(pkg => pkg.id === packageId)
      if (!pkg) throw new Error('Package not found.')
      requireOwner(pkg, DEMO_CUSTOMER); advanceCancellation(pkg, next)
      data.audit.push({ at: new Date().toISOString(), action: next, packageId, detail: 'Fictional operator progression; production requires operator authorization and fulfillment evidence.' }); write(data)
    },
    async simulateCompletedRequest(requestId) {
      const data = read(); const request = data.requests.find(request => request.id === requestId)
      if (!request || request.status === 'Cancelled') throw new Error('Choose an active request.')
      const pkg = data.packages.find(pkg => pkg.id === request.packageId)
      if (!pkg) throw new Error('Package not found.')
      requireOwner(pkg, DEMO_CUSTOMER)
      const leg = pkg.cycles.flatMap(cycle => cycle.legs).find(leg => leg.id === request.legId)
      if (!leg) throw new Error('Trip leg not found.')
      leg.status = 'Completed'; leg.completedAt = new Date().toISOString()
      request.status = 'Completed'
      for (const tote of data.totes.filter(tote => request.toteIds.includes(tote.id))) {
        if (request.purpose !== 'Empty totes') tote.status = request.kind === 'Collection' ? 'In storage' : 'At home'
        else tote.emptyLocation = request.kind === 'Collection' ? 'Company' : 'Customer'
        tote.history.unshift({ date: new Date().toISOString(), label: `Demo ${leg.kind}`, detail: 'Simulated handoff; no actual appointment or photo.', operator: 'Fictional operator simulation' })
      }
      data.audit.push({ at: new Date().toISOString(), action: 'Demo trip completed', packageId: pkg.id, detail: `${request.id}: ${leg.kind}` }); write(data)
    },
  }
}

export const toteKeeperService = createMockToteKeeperService()
