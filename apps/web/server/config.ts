import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { Readiness } from './model.ts'

if (existsSync('.env')) process.loadEnvFile('.env')
export function configuration(env = process.env) {
  if (env.NODE_ENV === 'production') throw new Error('This local sandbox server cannot run in production. Connect the Octagon adapters first.')
  const origin = env.SANDBOX_APP_ORIGIN ?? 'http://127.0.0.1:5173'
  const url = new URL(origin)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.protocol !== 'http:' || url.pathname !== '/' || url.search || url.hash) throw new Error('Sandbox origin must be a loopback HTTP origin.')
  const agreementText = env.SANDBOX_AGREEMENT_FILE ? readFileSync(env.SANDBOX_AGREEMENT_FILE, 'utf8') : ''
  const readiness: Readiness = {
    agreementVersion: env.SANDBOX_AGREEMENT_VERSION || null,
    agreementContentHash: agreementText ? createHash('sha256').update(agreementText).digest('hex') : null,
    sandboxAgreementEnabled: env.SANDBOX_AGREEMENT_APPROVED === 'true' && !!agreementText && !!env.SANDBOX_AGREEMENT_VERSION,
    tax: { mode: env.STRIPE_TAX_MODE === 'automatic' ? 'automatic' : env.STRIPE_TAX_MODE === 'disabled' ? 'disabled' : 'unconfigured', approved: env.SANDBOX_TAX_POLICY_APPROVED === 'true', behavior: env.STRIPE_TAX_BEHAVIOR === 'inclusive' ? 'inclusive' : env.STRIPE_TAX_BEHAVIOR === 'exclusive' ? 'exclusive' : undefined, storageCode: env.STRIPE_STORAGE_TAX_CODE, serviceCode: env.STRIPE_SERVICE_TAX_CODE, setupCode: env.STRIPE_SETUP_TAX_CODE, originConfigured: env.STRIPE_TAX_ORIGIN_CONFIGURED === 'true', registrationsConfigured: env.STRIPE_TAX_REGISTRATIONS_CONFIGURED === 'true' },
    addOnCouplingApproved: env.SANDBOX_BULKY_ADDON_COUPLING_APPROVED === 'true',
  }
  return { origin: url.origin, port: Number(env.SANDBOX_PORT ?? 4242), databasePath: env.SANDBOX_DATABASE_PATH ?? '.sandbox/payments.sqlite', stripeKey: env.STRIPE_SECRET_KEY ?? '', webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '', portalConfigurationId: env.STRIPE_PORTAL_CONFIGURATION_ID, customerToken: env.SANDBOX_CUSTOMER_TOKEN ?? '', ownerToken: env.SANDBOX_OWNER_TOKEN ?? '', agreementText, readiness }
}
