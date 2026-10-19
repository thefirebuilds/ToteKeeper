import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type Stripe from 'stripe'
import type { configuration } from './config.ts'
import type { Actor, OrderInput, PaymentRepository } from './model.ts'
import { PurchaseCoordinator } from './coordinator.ts'

type Config = ReturnType<typeof configuration>
export interface SessionAuthenticator { authenticate(request: IncomingMessage): Actor | null }
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
function tokenMatches(candidate: unknown, expected: string) { return typeof candidate === 'string' && expected.length >= 24 && timingSafeEqual(Buffer.from(hash(candidate)), Buffer.from(hash(expected))) }
async function rawBody(req: IncomingMessage) {
  const chunks: Buffer[] = []; let bytes = 0
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 256000) throw new Error('Request too large.'); chunks.push(Buffer.from(chunk)) }
  return Buffer.concat(chunks)
}
export function createSandboxHandler(repo: PaymentRepository, coordinator: PurchaseCoordinator, config: Config) {
  const auth: SessionAuthenticator = { authenticate(req) {
    const token = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('tk_sandbox='))?.slice('tk_sandbox='.length)
    if (!token) return null
    const session = repo.read().sessions[hash(token)]
    return session && session.expiresAt > Date.now() ? session.actor : null
  } }
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff')
    const reply = (status: number, value: unknown) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)) }
    try {
      const path = new URL(req.url ?? '/', config.origin).pathname
      if (path === '/api/sandbox/stripe/webhook' && req.method === 'POST') {
        if (!config.webhookSecret) return reply(503, { error: 'Webhook signing secret is not configured.' })
        const signature = req.headers['stripe-signature']; if (typeof signature !== 'string') return reply(400, { error: 'Missing Stripe signature.' })
        const body = await rawBody(req)
        let event: Stripe.Event
        try { event = coordinator.stripe.webhooks.constructEvent(body, signature, config.webhookSecret) } catch { return reply(400, { error: 'Invalid Stripe signature.' }) }
        try { await coordinator.webhook(event) } catch { return reply(500, { error: 'Webhook reconciliation failed; delivery can be retried.' }) }
        return reply(200, { received: true })
      }
      if (req.method !== 'GET' && req.headers.origin !== config.origin) return reply(403, { error: 'Same-origin request required.' })
      if (req.headers.origin && req.headers.origin !== config.origin) return reply(403, { error: 'Origin not allowed.' })
      if (path === '/api/sandbox/config' && req.method === 'GET') return reply(200, { mode: 'sandbox', agreementVersion: config.readiness.agreementVersion, agreementText: config.agreementText, agreementEnabled: config.readiness.sandboxAgreementEnabled, authenticated: !!auth.authenticate(req), productionReady: false })
      if (path === '/api/sandbox/login' && req.method === 'POST') {
        const body = JSON.parse((await rawBody(req)).toString())
        const role = body.role === 'Owner' ? 'Owner' : 'Customer'
        if (!tokenMatches(body.token, role === 'Owner' ? config.ownerToken : config.customerToken)) return reply(401, { error: 'Invalid sandbox login.' })
        const actor: Actor = { role, id: role === 'Owner' ? 'sandbox-owner' : 'sandbox-customer' }; const token = randomBytes(32).toString('hex')
        repo.transaction(s => { for (const [id, session] of Object.entries(s.sessions)) if (session.expiresAt < Date.now()) delete s.sessions[id]; s.sessions[hash(token)] = { actor, expiresAt: Date.now() + 8 * 3600000 } })
        res.setHeader('Set-Cookie', `tk_sandbox=${token}; HttpOnly; SameSite=Strict; Path=/api/sandbox; Max-Age=28800`)
        return reply(200, { actor })
      }
      const actor = auth.authenticate(req); if (!actor) return reply(401, { error: 'Sign in to the separate sandbox account.' })
      const body = req.method === 'GET' ? {} : JSON.parse((await rawBody(req)).toString() || '{}')
      if (path === '/api/sandbox/logout' && req.method === 'POST') {
        const token = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('tk_sandbox='))?.slice('tk_sandbox='.length)
        if (token) repo.transaction(s => { delete s.sessions[hash(token)] })
        res.setHeader('Set-Cookie', 'tk_sandbox=; HttpOnly; SameSite=Strict; Path=/api/sandbox; Max-Age=0'); return reply(200, { loggedOut: true })
      }
      if (path === '/api/sandbox/account' && req.method === 'GET') {
        const s = repo.read()
        return reply(200, { actor, orders: Object.values(s.orders).filter(order => actor.role === 'Owner' || order.customerId === actor.id), packages: Object.values(s.packages).filter(pkg => actor.role === 'Owner' || pkg.customerId === actor.id), ...(actor.role === 'Owner' ? { events: s.events, outbox: s.outbox, audit: s.audit } : {}) })
      }
      if (path === '/api/sandbox/orders' && req.method === 'POST') return reply(201, coordinator.saveOrder(actor, body as OrderInput))
      if (path === '/api/sandbox/portal' && req.method === 'POST') return reply(200, { url: (await coordinator.billingPortal(actor)).url })
      if (path === '/api/sandbox/reconcile' && req.method === 'POST') { await coordinator.reconcileAll(actor); return reply(200, { reconciled: true }) }
      const orderMatch = /^\/api\/sandbox\/orders\/([a-zA-Z0-9-]+)(?:\/(next|review|agreement))?$/.exec(path)
      if (orderMatch) {
        const [, id, action] = orderMatch
        if (!action && req.method === 'GET') return reply(200, { order: await coordinator.refreshOrder(actor, id), blockers: coordinator.blockers(coordinator.order(actor, id)) })
        if (action === 'next' && req.method === 'POST') return reply(200, await coordinator.next(actor, id))
        if (action === 'review' && req.method === 'POST') return reply(200, coordinator.review(actor, id, body.addressApproved, body.itemsApproved))
        if (action === 'agreement' && req.method === 'POST' && body.accepted === true) return reply(200, coordinator.accept(actor, id, body.version, body.liabilityAcknowledged === true))
      }
      const pkgMatch = /^\/api\/sandbox\/packages\/([a-zA-Z0-9-]+)\/(cancel|extra-cycle|final-return)$/.exec(path)
      if (pkgMatch && req.method === 'POST') {
        if (pkgMatch[2] === 'cancel') { await coordinator.cancel(actor, pkgMatch[1]); return reply(200, { cancellationRequested: true }) }
        if (pkgMatch[2] === 'final-return') return reply(201, coordinator.requestFinalReturn(actor, pkgMatch[1], body.preferredDate, body.preferredWindow))
        return reply(201, coordinator.extraCycle(actor, pkgMatch[1], body.authorized === true, body.requestKey))
      }
      return reply(404, { error: 'Unknown sandbox route.' })
    } catch (error) {
      // Stripe errors are deliberately not serialized: they can include request data.
      const message = error instanceof Error && !('raw' in error) ? error.message : 'Stripe sandbox request failed. Retry or ask the operator to reconcile.'
      reply(400, { error: message })
    }
  }
}
