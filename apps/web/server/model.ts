import type { BulkySelection, PackageRecord, PackageSelection } from '../src/domain/operations.ts'

export interface Actor { id: string; role: 'Customer' | 'Owner' }
export interface OrderInput { packages: PackageSelection[]; bulky: BulkySelection[]; address: string; agreementVersion: string; accepted: boolean; requestKey: string }
export type PaymentState = 'Not started' | 'Checkout open' | 'Processing' | 'Paid' | 'Failed' | 'Expired'
export interface PurchaseUnit {
  id: string; kind: 'Package' | 'Standalone bulky' | 'Extra cycle'; packageId: string
  selection?: PackageSelection; bulky: (BulkySelection & { id: string })[]
  prices: string[]; amountCents: number; state: PaymentState; attempt: number; attemptStartedAt?: string
  sessionId?: string; sessionUrl?: string; subscriptionId?: string; subscriptionItemIds?: string[]; invoiceId?: string; paymentIntentId?: string
  previousSessionIds?: string[]
  lines: { id: string; recordId: string; lookupKey: string | null; amountCents: number; stripePriceId?: string; subscriptionItemId?: string; checkoutLineId?: string }[]
}
export interface PaymentOrder {
  id: string; customerId: string; requestKey: string; fingerprint: string; address: string; createdAt: string
  agreement: { version: string; acceptedAt: string; contentHash: string } | null; reviewedBy?: string; reviewedAt?: string
  addressApproved: boolean; itemsApproved: boolean; units: PurchaseUnit[]; extraCycleAuthorized?: boolean
}
export interface BillingPackage {
  id: string; customerId: string; orderId: string; unitId: string; subscriptionId: string
  operations: PackageRecord; selection?: PackageSelection; bulky: PurchaseUnit['bulky']
  subscriptionStatus: string; billingEndsAt?: number; billingReview?: string
  invoiceIds: string[]; paymentIntentIds: string[]; cancellationSyncPending: boolean
  billingLines: PurchaseUnit['lines']
  finalReturnRequest?: { id: string; preferredDate: string; preferredWindow: string; status: 'Awaiting owner confirmation' }
  serviceYears: { invoiceId: string; startedAt: string; endsAt: string; cycleId: string }[]
}
export interface EventRecord { id: string; type: string; status: 'Received' | 'Processed' | 'Failed'; attempts: number; receivedAt: string; processedAt?: string; error?: string }
export interface SandboxState {
  orders: Record<string, PaymentOrder>; packages: Record<string, BillingPackage>
  customers: Record<string, { stripeId: string; creatingSince?: string }>; events: Record<string, EventRecord>
  sessions: Record<string, { actor: Actor; expiresAt: number }>
  audit: { at: string; action: string; recordId: string }[]
  outbox: Record<string, { customerId: string; kind: string; recordId: string; dueAt?: string; delivered: boolean }>
}
export function emptyState(): SandboxState { return { orders: {}, packages: {}, customers: {}, events: {}, sessions: {}, audit: [], outbox: {} } }
export interface PaymentRepository {
  read(): SandboxState
  transaction<T>(work: (state: SandboxState) => T): T
}
export interface Readiness {
  agreementVersion: string | null
  agreementContentHash: string | null
  /** Explicit sandbox-only policy approval, never an invented legal agreement. */
  sandboxAgreementEnabled: boolean
  tax: { mode: 'unconfigured' | 'disabled' | 'automatic'; approved: boolean; behavior?: 'exclusive' | 'inclusive'; storageCode?: string; serviceCode?: string; setupCode?: string; originConfigured: boolean; registrationsConfigured: boolean }
  addOnCouplingApproved: boolean
}
