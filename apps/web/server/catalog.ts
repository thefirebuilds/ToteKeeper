import type Stripe from 'stripe'
import { POLICY, SERVICE_CONFIG } from '../src/config/commercial.ts'
import type { Readiness } from './model.ts'
import { assertTest, stripeId } from './stripe.ts'

export interface CatalogEntry { key: string; product: string; name: string; amount: number; interval?: 'month' | 'year'; classification: 'storage' | 'service' }
export const CATALOG: CatalogEntry[] = [
  ...SERVICE_CONFIG.plans.flatMap(plan => [
    { key: `totekeeper_${plan.id}_annual_usd_v1`, product: `totekeeper_${plan.id}`, name: `${plan.name} storage package`, amount: plan.annualPrice * 100, interval: 'year' as const, classification: 'storage' as const },
    { key: `totekeeper_${plan.id}_monthly_usd_v1`, product: `totekeeper_${plan.id}`, name: `${plan.name} storage package`, amount: plan.monthlyPrice * 100, interval: 'month' as const, classification: 'storage' as const },
  ]),
  { key: 'totekeeper_bulky_addon_annual_usd_v1', product: 'totekeeper_bulky_addon', name: 'Bulky storage with package appointments', amount: POLICY.bulky.addOnAnnualPrice * 100, interval: 'year', classification: 'storage' },
  { key: 'totekeeper_bulky_standalone_annual_usd_v1', product: 'totekeeper_bulky_standalone', name: 'Standalone bulky storage with collection and return', amount: POLICY.bulky.standaloneAnnualPrice * 100, interval: 'year', classification: 'storage' },
  { key: 'totekeeper_extra_cycle_usd_v1', product: 'totekeeper_extra_cycle', name: 'Return and recollection round trip', amount: POLICY.extraCyclePrice * 100, classification: 'service' },
]
export async function resolvePrice(stripe: Stripe, key: string, tax: Readiness['tax']) {
  const expected = CATALOG.find(entry => entry.key === key)
  if (!expected) throw new Error('Unrecognized catalog lookup key.')
  const prices = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 2 })
  if (prices.data.length !== 1) throw new Error(`Catalog setup required for ${key}.`)
  const price = prices.data[0]; assertTest(price)
  if (stripeId(price.product) !== expected.product || price.currency !== 'usd' || price.unit_amount !== expected.amount || price.recurring?.interval !== expected.interval || (price.recurring && price.recurring.interval_count !== 1) || (tax.mode === 'automatic' && price.tax_behavior !== tax.behavior)) throw new Error('Catalog price differs from approved configuration. Use an explicit versioned migration.')
  if (tax.mode === 'automatic') {
    const product = await stripe.products.retrieve(expected.product)
    assertTest(product)
    const taxCode = expected.classification === 'storage' ? tax.storageCode : tax.serviceCode
    if (stripeId(product.tax_code) !== taxCode) throw new Error('Product tax classification must match the owner-approved configuration.')
  }
  return price.id
}
/** Run explicitly, never at server startup. Immutable lookup keys; mismatches require v2 keys. */
export async function syncCatalog(stripe: Stripe, tax: Readiness['tax']) {
  for (const entry of CATALOG) {
    const existing = await stripe.prices.list({ lookup_keys: [entry.key], limit: 2 })
    if (existing.data.length) { await resolvePrice(stripe, entry.key, tax); continue }
    const taxCode = entry.classification === 'storage' ? tax.storageCode : tax.serviceCode
    let product: Stripe.Product
    try { product = await stripe.products.retrieve(entry.product) } catch (error) {
      if ((error as { statusCode?: number }).statusCode !== 404) throw error
      product = await stripe.products.create({ id: entry.product, name: entry.name, ...(tax.mode === 'automatic' && taxCode ? { tax_code: taxCode } : {}), metadata: { application: 'totekeeper', classification: entry.classification } }, { idempotencyKey: `catalog-product:${entry.product}` })
    }
    assertTest(product)
    await stripe.prices.create({ product: product.id, currency: 'usd', unit_amount: entry.amount, lookup_key: entry.key, ...(entry.interval ? { recurring: { interval: entry.interval } } : {}), ...(tax.mode === 'automatic' && tax.behavior ? { tax_behavior: tax.behavior } : {}), metadata: { application: 'totekeeper', classification: entry.classification } }, { idempotencyKey: `catalog-price:${entry.key}` })
  }
}
