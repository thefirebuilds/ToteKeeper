import { configuration } from './config.ts'
import { stripeClient } from './stripe.ts'
import { syncCatalog } from './catalog.ts'

const config = configuration(); const stripe = stripeClient(config.stripeKey)
if (process.argv.includes('--portal')) {
  const configurations = await stripe.billingPortal.configurations.list({ limit: 100 })
  const existing = configurations.data.find(item => item.metadata?.application === 'totekeeper-sandbox' && item.active)
  const features = { payment_method_update: { enabled: true }, invoice_history: { enabled: true }, subscription_update: { enabled: false }, subscription_cancel: { enabled: false }, customer_update: { enabled: false } }
  const portal = existing ? await stripe.billingPortal.configurations.update(existing.id, { features }) : await stripe.billingPortal.configurations.create({ features, business_profile: { headline: 'ToteKeeper sandbox billing' }, metadata: { application: 'totekeeper-sandbox' } }, { idempotencyKey: 'totekeeper-portal-v1' })
  console.log(`Sandbox portal configured: ${portal.id}. Set STRIPE_PORTAL_CONFIGURATION_ID locally.`)
} else {
  await syncCatalog(stripe, config.readiness.tax)
  console.log('Sandbox catalog synchronized using stable versioned lookup keys.')
}
