import { afterEach, describe, expect, it } from 'vitest'
import Stripe from 'stripe'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CATALOG, packagePriceKey, syncCatalog } from './catalog.ts'
import { PurchaseCoordinator } from './coordinator.ts'
import { SqlitePaymentRepository } from './repository.ts'
import { STRIPE_API_VERSION, stripeClient } from './stripe.ts'
import type { Actor, OrderInput, Readiness } from './model.ts'
import { createSandboxHandler } from './http.ts'
import { configuration } from './config.ts'
import { createServer } from 'node:http'

const repos: SqlitePaymentRepository[] = []
afterEach(() => { for (const repo of repos.splice(0)) repo.close() })
const customer: Actor = { id: 'C1', role: 'Customer' }; const owner: Actor = { id: 'OWNER', role: 'Owner' }
const ready = (): Readiness => ({ agreementVersion: 'sandbox-terms-test-v1', agreementContentHash: 'sha256-of-test-fixture-document', sandboxAgreementEnabled: true, tax: { mode: 'disabled', approved: true, originConfigured: false, registrationsConfigured: false }, addOnCouplingApproved: true })
const input = (plan: 'small' | 'medium' | 'big' = 'small'): OrderInput => ({ packages: [{ planId: plan, billing: 'annual', large: 2, xl: 0 }], bulky: [], address: '123 Fictional Lane, Kyle', agreementVersion: 'sandbox-terms-test-v1', accepted: true, liabilityAcknowledged: true, requestKey: crypto.randomUUID() })

function fixture(path = ':memory:') {
  const repo = new SqlitePaymentRepository(path); repos.push(repo)
  const sessions = new Map<string, Record<string, any>>()
  const subscriptions = new Map<string, Record<string, any>>()
  const invoices = new Map<string, Record<string, any>>()
  const keys = new Map<string, any>(); const calls: { params: Stripe.Checkout.SessionCreateParams; key: string }[] = []
  let customerCalls = 0; let cancelFails = false; let createsLoseResponse = false
  const sdk = new Stripe('sk_test_fixture_not_a_real_key', { apiVersion: STRIPE_API_VERSION })
  const mock = {
    webhooks: sdk.webhooks,
    prices: { async list(params: { lookup_keys: string[] }) { return { data: params.lookup_keys.map(key => { const e = CATALOG.find(entry => entry.key === key)!; return { id: `price_${e.key}`, lookup_key: key, unit_amount: e.amount, currency: 'usd', active: true, livemode: false, product: e.product, recurring: e.interval ? { interval: e.interval, interval_count: 1 } : null } }) } } },
    customers: { async create(_: unknown, options: { idempotencyKey: string }) { if (!keys.has(options.idempotencyKey)) { customerCalls++; keys.set(options.idempotencyKey, { id: `cus_${customerCalls}`, livemode: false }) } return keys.get(options.idempotencyKey) } },
    checkout: { sessions: {
      async create(params: Stripe.Checkout.SessionCreateParams, options: { idempotencyKey: string }) {
        if (!keys.has(options.idempotencyKey)) {
          calls.push({ params, key: options.idempotencyKey }); const id = `cs_test_${calls.length}`
          const amount = params.line_items!.reduce((sum, line) => sum + CATALOG.find(entry => `price_${entry.key}` === line.price)!.amount * line.quantity!, 0)
          const session = { id, livemode: false, customer: params.customer, client_reference_id: params.client_reference_id, metadata: params.metadata, status: 'open', payment_status: 'unpaid', mode: params.mode, currency: 'usd', amount_subtotal: amount, url: `https://checkout.stripe.com/${id}`, subscription: null, payment_intent: null, _params: params }
          keys.set(options.idempotencyKey, session); sessions.set(id, session)
        }
        if (createsLoseResponse) { createsLoseResponse = false; throw new Error('Simulated response lost after Stripe created Checkout.') }
        return structuredClone(keys.get(options.idempotencyKey))
      },
      async retrieve(id: string) { const session = structuredClone(sessions.get(id)!); if (typeof session.subscription === 'string') session.subscription = structuredClone(subscriptions.get(session.subscription)); return session },
      async listLineItems(id: string) { const session = sessions.get(id)!; return { has_more: false, data: session._params.line_items.map((line: { price: string; quantity: number }) => ({ quantity: line.quantity, price: { id: line.price, lookup_key: line.price.slice(6) } })) } },
    } },
    subscriptions: {
      async retrieve(id: string) { return structuredClone(subscriptions.get(id)!) },
      async update(id: string, params: { cancel_at_period_end: boolean }) { if (cancelFails) throw new Error('Provider unavailable'); const sub = subscriptions.get(id)!; sub.cancel_at_period_end = params.cancel_at_period_end; return structuredClone(sub) },
    },
    invoices: { async retrieve(id: string) { return structuredClone(invoices.get(id)!) } },
    billingPortal: {
      configurations: {
        async retrieve() {
          return { livemode: false, id: 'bpc_test', features: { payment_method_update: { enabled: true }, invoice_history: { enabled: true }, subscription_update: { enabled: false }, subscription_cancel: { enabled: false } } }
        },
      },
      sessions: { async create(params: { customer: string }) { return { url: `https://billing.stripe.com/${params.customer}` } } },
    },
  }
  const stripe = mock as unknown as Stripe
  const coordinator = new PurchaseCoordinator(repo, stripe, ready(), 'http://127.0.0.1:5173', 'bpc_test')
  function approve(orderId: string) { coordinator.review(owner, orderId, true, true) }
  function complete(sessionId: string, paid = true) {
    const session = sessions.get(sessionId)!; session.status = 'complete'; session.payment_status = paid ? 'paid' : 'unpaid'
    if (session.mode === 'payment') { session.payment_intent = { id: `pi_${sessionId}`, status: paid ? 'succeeded' : 'processing' }; return }
    const subId = `sub_${sessionId}`; const invoiceId = `in_${sessionId}`
    const invoice = { id: invoiceId, livemode: false, status: paid ? 'paid' : 'open', billing_reason: 'subscription_create', parent: { subscription_details: { subscription: subId } }, payments: { data: [{ payment: { payment_intent: `pi_${sessionId}` } }] } }
    invoices.set(invoiceId, invoice)
    subscriptions.set(subId, { id: subId, livemode: false, customer: session.customer, status: paid ? 'active' : 'incomplete', cancel_at_period_end: false, cancel_at: null, metadata: session.metadata, latest_invoice: invoice, items: { data: session._params.line_items.map((line: any, i: number) => ({ id: `si_${sessionId}_${i}`, current_period_end: 1830297600, price: { id: line.price } })) } })
    session.subscription = subId
  }
  function event(type: string, id: string, objectId: string): Stripe.Event { return { id, type, livemode: false, api_version: STRIPE_API_VERSION, created: 1, data: { object: { id: objectId } } } as Stripe.Event }
  return { repo, coordinator, stripe, sessions, subscriptions, invoices, calls, approve, complete, event, setCancelFailure(value: boolean) { cancelFails = value }, loseResponse() { createsLoseResponse = true }, get customerCalls() { return customerCalls } }
}

describe('Stripe sandbox purchase coordinator', () => {
  it('requires separate liability acknowledgment before recording agreement or opening checkout', () => {
    const f = fixture()
    const order = f.coordinator.saveOrder(customer, { ...input(), liabilityAcknowledged: false })
    expect(order.agreement).toBeNull()
    expect(() => f.coordinator.accept(customer, order.id, ready().agreementVersion!)).toThrow('separately')
    expect(f.coordinator.blockers(order).join(' ')).toContain('agreement before checkout')
    const accepted = f.coordinator.accept(customer, order.id, ready().agreementVersion!, true)
    expect(accepted.agreement?.liabilityAcknowledged).toBe(true)
  })
  it('uses new annual Prices without repricing persisted v1 package purchases', () => {
    expect(packagePriceKey('medium', 'annual')).toBe('totekeeper_medium_annual_usd_v2')
    expect(packagePriceKey('big', 'annual')).toBe('totekeeper_big_annual_usd_v2')
    expect(CATALOG.find(entry => entry.key === packagePriceKey('big', 'annual'))?.amount).toBe(39900)
    expect(CATALOG.find(entry => entry.key === 'totekeeper_big_annual_usd_v1')?.amount).toBe(59900)
    expect(CATALOG.find(entry => entry.key === 'totekeeper_medium_annual_usd_v1')?.amount).toBe(29900)
  })
  it.each(['small', 'medium', 'big'] as const)('activates annual %s only after authoritative payment', async plan => {
    const f = fixture(); const order = f.coordinator.saveOrder(customer, input(plan)); f.approve(order.id)
    const next = await f.coordinator.next(customer, order.id)
    expect(next.url).toMatch(/checkout.stripe/); expect(Object.keys(f.repo.read().packages)).toHaveLength(0)
    f.complete('cs_test_1')
    await f.coordinator.webhook(f.event('checkout.session.completed', 'evt_1', 'cs_test_1'))
    expect(Object.values(f.repo.read().packages)[0].operations.credits).toBe(plan === 'small' ? 2 : plan === 'medium' ? 4 : 10)
  })
  it('preserves a partially purchased cart and one Customer with independently cancellable subscriptions', async () => {
    const f = fixture(); const draft = input(); draft.packages.push({ planId: 'medium', billing: 'annual', large: 2, xl: 1 })
    const order = f.coordinator.saveOrder(customer, draft); f.approve(order.id)
    await f.coordinator.next(customer, order.id); f.complete('cs_test_1')
    await f.coordinator.webhook(f.event('invoice.paid', 'evt_first', 'in_cs_test_1'))
    expect(Object.keys(f.repo.read().packages)).toHaveLength(1)
    await f.coordinator.next(customer, order.id)
    expect(f.calls).toHaveLength(2); expect(f.customerCalls).toBe(1)
    await f.coordinator.next(customer, order.id); expect(f.calls).toHaveLength(2)
    f.complete('cs_test_2'); await f.coordinator.refreshOrder(customer, order.id)
    const pkgs = Object.values(f.repo.read().packages); expect(pkgs).toHaveLength(2)
    expect(new Set(pkgs.map(pkg => pkg.subscriptionId)).size).toBe(2)
    await f.coordinator.cancel(customer, pkgs[0].id)
    expect(f.repo.read().packages[pkgs[1].id].operations.renewalEnabled).toBe(true)
  })
  it('reuses persisted retry keys, reopens abandoned sessions, and safely recreates only expired sessions', async () => {
    const f = fixture(); const draft = input(); const order = f.coordinator.saveOrder(customer, draft)
    expect(f.coordinator.saveOrder(customer, draft).id).toBe(order.id)
    expect(() => f.coordinator.saveOrder(customer, { ...draft, address: 'Another address' })).toThrow('Retry key')
    f.approve(order.id); f.loseResponse()
    await expect(f.coordinator.next(customer, order.id)).rejects.toThrow('response lost')
    await f.coordinator.next(customer, order.id); expect(f.calls).toHaveLength(1)
    f.sessions.get('cs_test_1')!.status = 'expired'
    await f.coordinator.next(customer, order.id); expect(f.calls).toHaveLength(2)
    expect(f.calls[0].key).not.toBe(f.calls[1].key)
  })
  it('does not duplicate entitlements on replay, reversed invoice events, or annual renewal', async () => {
    const f = fixture(); const order = f.coordinator.saveOrder(customer, input()); f.approve(order.id)
    await f.coordinator.next(customer, order.id); f.complete('cs_test_1')
    await f.coordinator.webhook(f.event('invoice.paid', 'evt_a', 'in_cs_test_1'))
    await f.coordinator.webhook(f.event('checkout.session.completed', 'evt_b', 'cs_test_1'))
    await f.coordinator.webhook(f.event('invoice.paid', 'evt_a', 'in_cs_test_1'))
    const before = Object.values(f.repo.read().packages)[0]
    f.repo.transaction(s => { s.packages[before.id].operations.cycles[0].legs[2].status = 'Completed' })
    await f.coordinator.webhook(f.event('invoice.payment_failed', 'evt_old', 'in_cs_test_1'))
    const sub = f.subscriptions.get('sub_cs_test_1')!
    const invoice = { ...sub.latest_invoice, id: 'in_renewal', billing_reason: 'subscription_cycle' }; sub.latest_invoice = invoice; f.invoices.set(invoice.id, invoice)
    await f.coordinator.webhook(f.event('invoice.paid', 'evt_renewal', invoice.id))
    const after = Object.values(f.repo.read().packages)[0]
    expect(Object.keys(f.repo.read().packages)).toHaveLength(1)
    expect(after.operations.cycles[0].legs[2].status).toBe('Completed')
    expect(after.operations.cycles).toHaveLength(2); expect(after.operations.paymentState).toBe('Current')
    expect(after.serviceYears).toHaveLength(2)
    await f.coordinator.webhook(f.event('invoice.paid', 'evt_renewal_replay', invoice.id))
    expect(Object.values(f.repo.read().packages)[0].operations.cycles).toHaveLength(2)
    expect(after.invoiceIds).toContain('in_renewal'); expect(after.paymentIntentIds).toContain('pi_cs_test_1')
  })
  it('blocks pending/incomplete payments and later grants once on asynchronous success', async () => {
    const f = fixture(); const order = f.coordinator.saveOrder(customer, input()); f.approve(order.id)
    await f.coordinator.next(customer, order.id); f.complete('cs_test_1', false)
    await f.coordinator.webhook(f.event('checkout.session.completed', 'evt_pending', 'cs_test_1'))
    expect(Object.keys(f.repo.read().packages)).toHaveLength(0)
    expect((await f.coordinator.next(customer, order.id)).processing).toBe(true); expect(f.calls).toHaveLength(1)
    f.complete('cs_test_1', true); await f.coordinator.webhook(f.event('checkout.session.async_payment_succeeded', 'evt_done', 'cs_test_1'))
    expect(Object.keys(f.repo.read().packages)).toHaveLength(1)
  })
  it('resumes only after authoritative terminal failure and ignores late events for retired attempts', async () => {
    const f = fixture(); const order = f.coordinator.saveOrder(customer, input()); f.approve(order.id)
    await f.coordinator.next(customer, order.id); f.complete('cs_test_1', false)
    f.subscriptions.get('sub_cs_test_1')!.status = 'incomplete_expired'
    await f.coordinator.webhook(f.event('checkout.session.async_payment_failed', 'evt_failed', 'cs_test_1'))
    expect(f.coordinator.order(customer, order.id).units[0].state).toBe('Failed')
    await f.coordinator.next(customer, order.id); expect(f.calls).toHaveLength(2)
    await f.coordinator.webhook(f.event('checkout.session.async_payment_failed', 'evt_old_failed', 'cs_test_1'))
    f.complete('cs_test_2'); await f.coordinator.refreshOrder(customer, order.id)
    expect(Object.keys(f.repo.read().packages)).toHaveLength(1)
  })
  it('bills standard add-ons/standalone, omits the Big bonus charge, and handles repeated add-on Prices', async () => {
    const f = fixture(); const draft = input('big')
    const item = { type: 'Snowboard bag' as const, dimensions: [50, 10, 6] as [number, number, number], value: 100 }
    draft.bulky = [{ ...item, packageIndex: 0, useBonus: true }, { ...item, packageIndex: 0, useBonus: false }, { ...item, packageIndex: 0, useBonus: false }, { ...item, useBonus: false }]
    const order = f.coordinator.saveOrder(customer, draft); f.approve(order.id)
    expect(order.units.map(unit => unit.amountCents)).toEqual([54900, 12500])
    await f.coordinator.next(customer, order.id)
    expect(f.calls[0].params.line_items).toHaveLength(2)
    expect(f.calls[0].params.line_items![1].quantity).toBe(2)
    f.complete('cs_test_1'); await f.coordinator.refreshOrder(customer, order.id)
    expect(Object.values(f.repo.read().packages)[0].operations.annualBonusItemId).toBeTruthy()
    await f.coordinator.next(customer, order.id); f.complete('cs_test_2'); await f.coordinator.refreshOrder(customer, order.id)
    const standalone = Object.values(f.repo.read().packages).find(pkg => !pkg.selection)!
    expect(standalone.operations.credits).toBe(0); expect(standalone.operations.cycles[0].legs).toHaveLength(2)
  })
  it('rejects monthly, unreviewed addresses, unfinished tax/terms, custom items and unapproved add-on coupling', async () => {
    const f = fixture(); let draft = input(); draft.packages[0].billing = 'monthly'
    let order = f.coordinator.saveOrder(customer, draft); f.approve(order.id)
    await expect(f.coordinator.next(customer, order.id)).rejects.toThrow('Monthly')
    draft = input(); order = f.coordinator.saveOrder(customer, draft)
    await expect(f.coordinator.next(customer, order.id)).rejects.toThrow('address')
    f.approve(order.id); f.coordinator.readiness.tax.approved = false
    await expect(f.coordinator.next(customer, order.id)).rejects.toThrow('Tax')
    f.coordinator.readiness.tax.approved = true; f.coordinator.readiness.sandboxAgreementEnabled = false
    await expect(f.coordinator.next(customer, order.id)).rejects.toThrow('agreement')
    expect(f.calls).toHaveLength(0)
  })
  it('retains custom requests for review without billing them and gates paid add-on coupling', async () => {
    const f = fixture(); const draft = input()
    draft.bulky = [{ type: 'Other', dimensions: [60, 24, 24], value: 80, useBonus: false }]
    const custom = f.coordinator.saveOrder(customer, draft); f.approve(custom.id)
    expect(custom.units[1].prices).toEqual([])
    await expect(f.coordinator.next(customer, custom.id)).rejects.toThrow('Custom items')
    draft.requestKey = crypto.randomUUID(); draft.bulky = [{ type: 'Bagged artificial tree', dimensions: [54, 24, 24], value: 100, packageIndex: 0, useBonus: false }]
    const addOn = f.coordinator.saveOrder(customer, draft); f.approve(addOn.id)
    f.coordinator.readiness.addOnCouplingApproved = false
    await expect(f.coordinator.next(customer, addOn.id)).rejects.toThrow('coupling')
    expect(f.calls).toHaveLength(0)
  })
  it('denies cross-customer orders, cancellation, owner review, and billing portal access', async () => {
    const f = fixture(); const order = f.coordinator.saveOrder(customer, input()); f.approve(order.id)
    await expect(f.coordinator.next({ id: 'OTHER', role: 'Customer' }, order.id)).rejects.toThrow('ownership')
    expect(() => f.coordinator.review(customer, order.id, true, true)).toThrow('Owner')
    await f.coordinator.next(customer, order.id); f.complete('cs_test_1'); await f.coordinator.refreshOrder(customer, order.id)
    await expect(f.coordinator.billingPortal({ id: 'OTHER', role: 'Customer' })).rejects.toThrow('mapped customer')
    expect((await f.coordinator.billingPortal(customer)).url).toContain('cus_1')
    await expect(f.coordinator.cancel({ id: 'OTHER', role: 'Customer' }, Object.keys(f.repo.read().packages)[0])).rejects.toThrow('ownership')
    f.stripe.billingPortal.configurations.retrieve = (async () => ({ livemode: false, id: 'bpc_test', features: { payment_method_update: { enabled: true }, invoice_history: { enabled: true }, subscription_update: { enabled: true }, subscription_cancel: { enabled: false } } })) as unknown as typeof f.stripe.billingPortal.configurations.retrieve
    await expect(f.coordinator.billingPortal(customer)).rejects.toThrow('disable subscription changes')
  })
  it('coalesces simultaneous checkout creation into the same Stripe idempotency key', async () => {
    const f = fixture(); const order = f.coordinator.saveOrder(customer, input()); f.approve(order.id)
    const [first, second] = await Promise.all([f.coordinator.next(customer, order.id), f.coordinator.next(customer, order.id)])
    expect(first.url).toBe(second.url); expect(f.calls).toHaveLength(1); expect(f.customerCalls).toBe(1)
  })
  it('records free cancellation return immediately despite exhausted visits and provider failure; retries renewal stop', async () => {
    const f = fixture(); const order = f.coordinator.saveOrder(customer, input()); f.approve(order.id)
    await f.coordinator.next(customer, order.id); f.complete('cs_test_1'); await f.coordinator.refreshOrder(customer, order.id)
    const id = Object.keys(f.repo.read().packages)[0]
    f.repo.transaction(s => { s.packages[id].operations.cycles[0].legs[2].status = 'Completed' })
    f.setCancelFailure(true); await expect(f.coordinator.cancel(customer, id)).rejects.toThrow('Provider')
    expect(f.repo.read().packages[id].operations.renewalEnabled).toBe(false)
    expect(f.repo.read().packages[id].operations.cycles[1].kind).toBe('Cancellation')
    const request = f.coordinator.requestFinalReturn(customer, id, '2030-11-17', 'Weekend evening, 4–7 pm')
    expect(request.status).toBe('Awaiting owner confirmation')
    expect(f.repo.read().packages[id].operations.cancellation).toBe('Cancellation requested')
    f.setCancelFailure(false); await f.coordinator.reconcileAll(owner)
    expect(f.repo.read().packages[id].cancellationSyncPending).toBe(false)
    expect(f.subscriptions.get('sub_cs_test_1')!.cancel_at_period_end).toBe(true)
    expect(f.repo.read().packages[id].operations.cycles.filter(cycle => cycle.kind === 'Cancellation')).toHaveLength(1)
  })
  it('never resets monthly visits from an invoice, and handles Dashboard cancellation without losing inventory selection', async () => {
    const f = fixture(); const order = f.coordinator.saveOrder(customer, input()); f.approve(order.id)
    await f.coordinator.next(customer, order.id); f.complete('cs_test_1'); await f.coordinator.refreshOrder(customer, order.id)
    const id = Object.keys(f.repo.read().packages)[0]
    // Simulate a legacy monthly package migrated from Octagon; new monthly checkout stays blocked.
    f.repo.transaction(s => { s.packages[id].operations.billing = 'monthly'; s.packages[id].operations.serviceYear.resetAt = null; s.packages[id].operations.serviceYear.resetReviewRequired = true; s.packages[id].operations.cycles[0].legs[2].status = 'Completed' })
    const sub = f.subscriptions.get('sub_cs_test_1')!
    const invoice = { ...sub.latest_invoice, id: 'in_monthly', billing_reason: 'subscription_cycle' }; sub.latest_invoice = invoice; f.invoices.set(invoice.id, invoice)
    await f.coordinator.webhook(f.event('invoice.paid', 'evt_monthly', invoice.id))
    expect(f.repo.read().packages[id].operations.cycles).toHaveLength(1)
    sub.cancel_at_period_end = true
    await f.coordinator.webhook(f.event('customer.subscription.updated', 'evt_dashboard_cancel', sub.id))
    expect(f.repo.read().packages[id].selection).toEqual(order.units[0].selection)
    expect(f.repo.read().packages[id].operations.cycles.filter(cycle => cycle.kind === 'Cancellation')).toHaveLength(1)
  })
  it('creates exactly one two-leg entitlement for an explicitly authorized $50 payment', async () => {
    const f = fixture(); const order = f.coordinator.saveOrder(customer, input()); f.approve(order.id)
    await f.coordinator.next(customer, order.id); f.complete('cs_test_1'); await f.coordinator.refreshOrder(customer, order.id)
    const id = Object.keys(f.repo.read().packages)[0]
    expect(() => f.coordinator.extraCycle(customer, id, false, 'k')).toThrow('Authorize')
    const extra = f.coordinator.extraCycle(customer, id, true, 'k')
    expect(f.coordinator.extraCycle(customer, id, true, 'k').id).toBe(extra.id)
    await f.coordinator.next(customer, extra.id); expect(f.calls[1].params.mode).toBe('payment')
    f.complete('cs_test_2'); await f.coordinator.webhook(f.event('checkout.session.completed', 'evt_cycle', 'cs_test_2'))
    await f.coordinator.webhook(f.event('checkout.session.completed', 'evt_cycle2', 'cs_test_2'))
    const cycles = f.repo.read().packages[id].operations.cycles.filter(cycle => cycle.kind === 'Extra')
    expect(cycles).toHaveLength(1); expect(cycles[0].legs.map(leg => leg.kind)).toEqual(['Packed return', 'Packed collection'])
  })
  it('persists orders across repository instances and keeps event processing failures retryable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'totekeeper-payments-'))
    try {
      const f = fixture(join(dir, 'test.sqlite')); const order = f.coordinator.saveOrder(customer, input())
      const second = new SqlitePaymentRepository(join(dir, 'test.sqlite')); expect(second.read().orders[order.id].id).toBe(order.id); second.close()
      f.approve(order.id); await f.coordinator.next(customer, order.id); f.complete('cs_test_1')
      f.sessions.get('cs_test_1')!.amount_subtotal = 1
      await expect(f.coordinator.webhook(f.event('checkout.session.completed', 'evt_retry', 'cs_test_1'))).rejects.toThrow('persisted order')
      expect(f.repo.read().events.evt_retry.status).toBe('Failed')
      f.sessions.get('cs_test_1')!.amount_subtotal = 12500
      await f.coordinator.webhook(f.event('checkout.session.completed', 'evt_retry', 'cs_test_1'))
      expect(f.repo.read().events.evt_retry.attempts).toBe(2)
      f.repo.close(); repos.splice(repos.indexOf(f.repo), 1)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it('rejects live keys/objects and uses signed raw request bodies at the HTTP boundary', async () => {
    expect(() => stripeClient('sk_live_not_allowed')).toThrow('sandbox')
    const f = fixture(); const config = configuration({ SANDBOX_APP_ORIGIN: 'http://127.0.0.1:5173', STRIPE_WEBHOOK_SECRET: 'whsec_local_test_fixture' })
    const server = createServer(createSandboxHandler(f.repo, f.coordinator, config))
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    try {
      const body = JSON.stringify(f.event('unhandled.test', 'evt_signature', 'unused'))
      const signature = f.stripe.webhooks.generateTestHeaderString({ payload: body, secret: config.webhookSecret })
      expect((await fetch(`${url}/api/sandbox/stripe/webhook`, { method: 'POST', body, headers: { 'stripe-signature': signature } })).status).toBe(200)
      expect((await fetch(`${url}/api/sandbox/stripe/webhook`, { method: 'POST', body: body + ' ', headers: { 'stripe-signature': signature } })).status).toBe(400)
      expect((await fetch(`${url}/api/sandbox/account`)).status).toBe(401)
      expect((await fetch(`${url}/api/sandbox/orders`, { method: 'POST', body: '{}' })).status).toBe(403)
    } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
  })
  it('validates an idempotent existing sandbox catalog without creating objects at startup', async () => {
    const f = fixture(); await syncCatalog(f.stripe, ready().tax)
    expect(f.calls).toHaveLength(0)
  })
})
