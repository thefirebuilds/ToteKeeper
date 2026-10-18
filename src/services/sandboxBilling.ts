import type { BulkySelection, PackageSelection } from '../domain/operations'
import type { BillingPackage, PaymentOrder } from '../../server/model'

export const SANDBOX_BILLING_ENABLED = import.meta.env.DEV && import.meta.env.VITE_STRIPE_SANDBOX_ENABLED === 'true'
export interface SandboxConfig { mode: 'sandbox'; agreementVersion: string | null; agreementText: string; agreementEnabled: boolean; authenticated: boolean; productionReady: false }
export interface SandboxAccount { actor: { id: string; role: 'Customer' | 'Owner' }; orders: PaymentOrder[]; packages: BillingPackage[]; events?: Record<string, { status: string }>; outbox?: Record<string, unknown> }
export async function sandboxApi<T>(path: string, body?: unknown): Promise<T> {
  if (!SANDBOX_BILLING_ENABLED) throw new Error('Separate Stripe sandbox integration is disabled.')
  const response = await fetch(`/api/sandbox${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Sandbox server is not connected. Start the local API and Vite proxy.')
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'Sandbox request failed.')
  return result as T
}
export function saveSandboxCart(packages: PackageSelection[], bulky: BulkySelection[], address: string, requestKey: string) {
  return sandboxApi<PaymentOrder>('/orders', { packages, bulky, address, requestKey, agreementVersion: '', accepted: false })
}
