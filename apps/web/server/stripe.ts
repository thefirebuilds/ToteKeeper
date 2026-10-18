import Stripe from 'stripe'

export const STRIPE_API_VERSION = '2026-09-30.endive' as const
export function stripeClient(key: string) {
  if (!/^(sk|rk)_test_/.test(key)) throw new Error('Only Stripe sandbox/test secret keys are accepted. Live mode is disabled.')
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2, timeout: 20000 })
}
export function assertTest(object: { livemode?: boolean }) {
  if (object.livemode !== false) throw new Error('Expected a Stripe test-mode object.')
}
export function stripeId(value: string | { id: string } | null | undefined) { return typeof value === 'string' ? value : value?.id }
