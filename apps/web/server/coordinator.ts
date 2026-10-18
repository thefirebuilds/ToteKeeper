import { createHash, randomUUID } from 'node:crypto'
import type Stripe from 'stripe'
import { POLICY } from '../src/config/commercial.ts'
import { createPackage, planFor, quoteOrder, requestCancellation, reserveLeg, standardEnvelope, validateAppointment } from '../src/domain/operations.ts'
import { authorizeRecord } from '../src/services/integrationPorts.ts'
import { resolvePrice } from './catalog.ts'
import { assertTest, stripeId } from './stripe.ts'
import type { Actor, OrderInput, PaymentOrder, PaymentRepository, PurchaseUnit, Readiness, SandboxState } from './model.ts'

const now = () => new Date().toISOString()
const audit = (s: SandboxState, action: string, recordId: string) => s.audit.push({ at: now(), action, recordId })
const own = (actor: Actor, id: string) => authorizeRecord({ customerId: actor.id, role: actor.role }, id)
function enqueue(s: SandboxState, key: string, customerId: string, kind: string, recordId: string, dueAt?: string) { s.outbox[key] ??= { customerId, kind, recordId, dueAt, delivered: false } }

export class PurchaseCoordinator {
  readonly repo: PaymentRepository
  readonly stripe: Stripe
  readonly readiness: Readiness
  readonly origin: string
  readonly portalConfigurationId?: string
  constructor(repo: PaymentRepository, stripe: Stripe, readiness: Readiness, origin: string, portalConfigurationId?: string) {
    this.repo = repo; this.stripe = stripe; this.readiness = readiness; this.origin = origin; this.portalConfigurationId = portalConfigurationId
  }
  order(actor: Actor, id: string): PaymentOrder {
    const order = this.repo.read().orders[id]
    if (!order) throw new Error('Order not found.')
    own(actor, order.customerId); return order
  }
  saveOrder(actor: Actor, input: OrderInput) {
    if (actor.role !== 'Customer') throw new Error('Use an authenticated customer account to create an order.')
    if (!input || typeof input.address !== 'string' || !input.address.trim() || input.address.length > 1000 || typeof input.requestKey !== 'string' || !input.requestKey || input.requestKey.length > 150 || !Array.isArray(input.packages) || !Array.isArray(input.bulky) || input.packages.length > 20 || input.bulky.length > 20) throw new Error('Invalid order request.')
    quoteOrder(input.packages, input.bulky, input.address)
    const fingerprint = createHash('sha256').update(JSON.stringify({ packages: input.packages, bulky: input.bulky, address: input.address, agreementVersion: input.agreementVersion, accepted: input.accepted })).digest('hex')
    return this.repo.transaction(s => {
      const previous = Object.values(s.orders).find(order => order.customerId === actor.id && order.requestKey === input.requestKey)
      if (previous) { if (previous.fingerprint !== fingerprint) throw new Error('Retry key already belongs to another order.'); return previous }
      const units: PurchaseUnit[] = input.packages.map(selection => ({ id: randomUUID(), kind: 'Package', packageId: randomUUID(), selection, bulky: [], lines: [], prices: [`totekeeper_${selection.planId}_${selection.billing}_usd_v1`], amountCents: (selection.billing === 'annual' ? planFor(selection.planId).annualPrice : planFor(selection.planId).monthlyPrice) * 100, state: 'Not started', attempt: 0 }))
      for (const item of input.bulky) {
        const record = { ...item, id: randomUUID() }
        if (item.packageIndex !== undefined) {
          const unit = units[item.packageIndex]; if (!unit) throw new Error('Invalid parent package.')
          unit.bulky.push(record)
          if (!item.useBonus && item.type !== 'Other' && standardEnvelope(item.dimensions)) { unit.prices.push('totekeeper_bulky_addon_annual_usd_v1'); unit.amountCents += POLICY.bulky.addOnAnnualPrice * 100 }
        } else {
          const standard = item.type !== 'Other' && standardEnvelope(item.dimensions)
          units.push({ id: randomUUID(), kind: 'Standalone bulky', packageId: randomUUID(), bulky: [record], lines: [], prices: standard ? ['totekeeper_bulky_standalone_annual_usd_v1'] : [], amountCents: standard ? POLICY.bulky.standaloneAnnualPrice * 100 : 0, state: 'Not started', attempt: 0 })
        }
      }
      for (const unit of units) {
        if (unit.selection) unit.lines.push({ id: `${unit.id}:package`, recordId: unit.packageId, lookupKey: unit.prices[0], amountCents: (unit.selection.billing === 'annual' ? planFor(unit.selection.planId).annualPrice : planFor(unit.selection.planId).monthlyPrice) * 100 })
        for (const item of unit.bulky) {
          const billable = !item.useBonus && item.type !== 'Other' && standardEnvelope(item.dimensions)
          unit.lines.push({ id: `${item.id}:storage`, recordId: item.id, lookupKey: billable ? unit.kind === 'Package' ? 'totekeeper_bulky_addon_annual_usd_v1' : 'totekeeper_bulky_standalone_annual_usd_v1' : null, amountCents: billable ? (unit.kind === 'Package' ? POLICY.bulky.addOnAnnualPrice : POLICY.bulky.standaloneAnnualPrice) * 100 : 0 })
        }
      }
      const agreement = input.accepted && this.readiness.sandboxAgreementEnabled && this.readiness.agreementContentHash && input.agreementVersion === this.readiness.agreementVersion ? { version: input.agreementVersion, acceptedAt: now(), contentHash: this.readiness.agreementContentHash } : null
      const order: PaymentOrder = { id: randomUUID(), customerId: actor.id, requestKey: input.requestKey, fingerprint, address: input.address.trim(), createdAt: now(), agreement, addressApproved: false, itemsApproved: false, units }
      s.orders[order.id] = order; audit(s, 'Sandbox order saved for review', order.id); return order
    })
  }
  review(actor: Actor, orderId: string, addressApproved: boolean, itemsApproved: boolean) {
    if (actor.role !== 'Owner') throw new Error('Owner review required.')
    return this.repo.transaction(s => {
      const order = s.orders[orderId]; if (!order) throw new Error('Order not found.')
      if (order.units.some(unit => unit.sessionId)) throw new Error('An order with Checkout attempts is immutable; use an operator resolution workflow.')
      order.addressApproved = addressApproved === true; order.itemsApproved = itemsApproved === true; order.reviewedBy = actor.id; order.reviewedAt = now(); audit(s, 'Sandbox address/handling reviewed', orderId)
      return order
    })
  }
  accept(actor: Actor, orderId: string, version: string) {
    this.order(actor, orderId)
    if (!this.readiness.sandboxAgreementEnabled || !this.readiness.agreementContentHash || version !== this.readiness.agreementVersion) throw new Error('No matching approved sandbox agreement version is configured.')
    return this.repo.transaction(s => {
      const order = s.orders[orderId]
      if (order.units.some(unit => unit.sessionId)) throw new Error('Agreement is locked once Checkout starts.')
      order.agreement = { version, acceptedAt: now(), contentHash: this.readiness.agreementContentHash! }; audit(s, 'Sandbox agreement accepted', orderId); return order
    })
  }
  blockers(order: PaymentOrder) {
    const reasons: string[] = []
    if (!order.addressApproved || !order.reviewedBy) reasons.push('The exact address needs owner approval.')
    if (order.units.some(unit => unit.bulky.length) && !order.itemsApproved) reasons.push('Bulky items need owner handling approval.')
    if (!order.agreement || !this.readiness.sandboxAgreementEnabled || order.agreement.version !== this.readiness.agreementVersion || order.agreement.contentHash !== this.readiness.agreementContentHash) reasons.push('Review and accept the configured sandbox agreement before checkout.')
    if (order.units.some(unit => unit.selection?.billing === 'monthly')) reasons.push('Monthly checkout is blocked until the setup charge and refundability are finalized.')
    if (order.units.some(unit => unit.bulky.some(item => item.type === 'Other' || !standardEnvelope(item.dimensions)))) reasons.push('Custom items require a separately approved quote; instant checkout is unavailable.')
    if (!this.readiness.addOnCouplingApproved && order.units.some(unit => unit.kind === 'Package' && unit.bulky.some(item => !item.useBonus))) reasons.push('Paid bulky add-on renewal/cancellation coupling requires owner approval.')
    const tax = this.readiness.tax
    if (!tax.approved || tax.mode === 'unconfigured') reasons.push('Tax treatment must be explicitly configured; totals are not represented as tax-inclusive.')
    if (tax.mode === 'automatic' && (!tax.behavior || !tax.storageCode || !tax.serviceCode || !tax.originConfigured || !tax.registrationsConfigured)) reasons.push('Automatic tax requires approved classifications, behavior, origin and registrations.')
    return reasons
  }
  async customer(customerId: string) {
    const existing = this.repo.transaction(s => {
      const c = s.customers[customerId]
      if (c?.stripeId) return c
      if (!c) s.customers[customerId] = { stripeId: '', creatingSince: now() }
      return s.customers[customerId]
    })
    if (existing.stripeId) return existing.stripeId
    if (Date.now() - Date.parse(existing.creatingSince!) > 23 * 3600000) throw new Error('Customer creation needs operator reconciliation before retrying an old provider idempotency key.')
    const customer = await this.stripe.customers.create({ metadata: { octagon_customer_id: customerId, application: 'totekeeper-sandbox' } }, { idempotencyKey: `customer:${customerId}` })
    assertTest(customer)
    this.repo.transaction(s => { s.customers[customerId] = { stripeId: customer.id } })
    return customer.id
  }
  async next(actor: Actor, orderId: string): Promise<{ order: PaymentOrder; url?: string | null; complete?: boolean; processing?: boolean }> {
    let order = this.order(actor, orderId)
    const blockers = this.blockers(order); if (blockers.length) throw new Error(blockers.join(' '))
    if (this.readiness.tax.mode === 'automatic') {
      const settings = await this.stripe.tax.settings.retrieve()
      const registrations = await this.stripe.tax.registrations.list({ status: 'active', limit: 1 })
      if (settings.status !== 'active' || !registrations.data.length) throw new Error('Stripe Tax settings and active test registrations must be configured by the owner before automatic tax checkout.')
    }
    const unit = order.units.find(unit => unit.state !== 'Paid')
    if (!unit) return { complete: true, order }
    if (unit.sessionId) {
      await this.reconcileSession(unit.sessionId)
      order = this.order(actor, orderId)
      const updated = order.units.find(item => item.id === unit.id)!
      if (updated.state === 'Paid') return this.next(actor, orderId)
      const session = await this.stripe.checkout.sessions.retrieve(unit.sessionId); assertTest(session)
      if (session.status === 'open' && session.url) return { url: session.url, order }
      if (session.status !== 'expired' && updated.state !== 'Failed') return { processing: true, order }
      this.repo.transaction(s => {
        const u = s.orders[orderId].units.find(item => item.id === unit.id)!
        if (u.sessionId === session.id) { u.previousSessionIds ??= []; u.previousSessionIds.push(session.id); u.attempt++; delete u.sessionId; delete u.sessionUrl; delete u.attemptStartedAt; u.state = 'Expired' }
      })
    }
    const customer = await this.customer(order.customerId)
    const priceIds = await Promise.all(unit.prices.map(key => resolvePrice(this.stripe, key, this.readiness.tax)))
    const attempt = this.repo.transaction(s => {
      const u = s.orders[orderId].units.find(item => item.id === unit.id)!
      for (const line of u.lines) { const index = u.prices.indexOf(line.lookupKey ?? ''); if (index >= 0) line.stripePriceId = priceIds[index] }
      u.attemptStartedAt ??= now()
      if (Date.now() - Date.parse(u.attemptStartedAt) > 23 * 3600000) throw new Error('Old Checkout attempt needs operator reconciliation; no duplicate purchase was started.')
      return u.attempt
    })
    const metadata = { octagon_order_id: orderId, octagon_unit_id: unit.id, octagon_customer_id: order.customerId, octagon_package_id: unit.packageId }
    const session = await this.stripe.checkout.sessions.create({
      customer, mode: unit.kind === 'Extra cycle' ? 'payment' : 'subscription', client_reference_id: unit.id,
      adaptive_pricing: { enabled: false }, allow_promotion_codes: false,
      line_items: [...new Set(priceIds)].map(price => ({ price, quantity: priceIds.filter(id => id === price).length })), metadata,
      ...(unit.kind === 'Extra cycle' ? { payment_intent_data: { metadata } } : { subscription_data: { metadata } }),
      automatic_tax: { enabled: this.readiness.tax.mode === 'automatic' }, billing_address_collection: 'required', customer_update: { address: 'auto' },
      success_url: `${this.origin}/billing/return?order=${orderId}`, cancel_url: `${this.origin}/billing/return?order=${orderId}&cancelled=1`,
    }, { idempotencyKey: `checkout:${unit.id}:${attempt}` })
    assertTest(session)
    this.repo.transaction(s => { const u = s.orders[orderId].units.find(item => item.id === unit.id)!; if (u.attempt === attempt) { u.sessionId = session.id; u.sessionUrl = session.url ?? undefined; if (u.state !== 'Paid') u.state = 'Checkout open' } })
    return { url: session.url, order: this.order(actor, orderId) }
  }
  async reconcileSession(sessionId: string) {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription.latest_invoice.payments', 'payment_intent'] }); assertTest(session)
    const orderId = session.metadata?.octagon_order_id; const unitId = session.metadata?.octagon_unit_id
    if (!orderId || !unitId) return
    const order = this.repo.read().orders[orderId]; const unit = order?.units.find(unit => unit.id === unitId)
    if (!unit) return
    const customer = this.repo.read().customers[order.customerId]?.stripeId
    if (!customer || stripeId(session.customer) !== customer || session.client_reference_id !== unit.id) throw new Error('Checkout ownership/attempt mismatch.')
    if (unit.previousSessionIds?.includes(session.id)) {
      if (session.payment_status === 'paid') this.repo.transaction(s => { audit(s, 'Prior Checkout attempt unexpectedly paid; owner financial review required', session.id); enqueue(s, `prior-paid:${session.id}`, 'owner', 'Review unexpected payment on an older attempt; never grant a duplicate package', session.id) })
      return
    }
    if (unit.sessionId && unit.sessionId !== session.id) throw new Error('Unknown Checkout attempt.')
    const lines = await this.stripe.checkout.sessions.listLineItems(session.id, { limit: 100 })
    const compareSubtotal = this.readiness.tax.mode !== 'automatic' || this.readiness.tax.behavior !== 'inclusive'
    if (lines.has_more || session.currency !== 'usd' || compareSubtotal && session.amount_subtotal !== unit.amountCents) throw new Error('Checkout does not match the persisted order.')
    const actual = lines.data.flatMap(line => Array.from({ length: line.quantity ?? 0 }, () => line.price?.lookup_key)).sort()
    if (JSON.stringify(actual) !== JSON.stringify([...unit.prices].sort())) throw new Error('Checkout price mapping mismatch.')
    const actualIds = lines.data.flatMap(line => Array.from({ length: line.quantity ?? 0 }, () => line.price?.id)).sort()
    const expectedIds = unit.lines.filter(line => line.lookupKey).map(line => line.stripePriceId).sort()
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) throw new Error('Checkout uses different Price IDs from the persisted purchase attempt.')
    let subscription: Stripe.Subscription | undefined
    let invoice: Stripe.Invoice | undefined
    if (typeof session.subscription === 'object' && session.subscription) {
      subscription = session.subscription; assertTest(subscription)
      if (typeof subscription.latest_invoice === 'object' && subscription.latest_invoice) invoice = subscription.latest_invoice
    }
    const paid = session.status === 'complete' && session.payment_status === 'paid' && (unit.kind === 'Extra cycle' || (subscription?.status === 'active' && invoice?.status === 'paid'))
    this.repo.transaction(s => {
      const o = s.orders[orderId]; const u = o.units.find(unit => unit.id === unitId)!
      u.sessionId = session.id; u.subscriptionId = stripeId(session.subscription); u.invoiceId = invoice?.id
      u.paymentIntentId = stripeId(session.payment_intent) ?? stripeId(invoice?.payments?.data[0]?.payment.payment_intent); u.subscriptionItemIds = subscription?.items.data.map(item => item.id)
      for (const line of u.lines) {
        const checkoutLine = lines.data.find(item => item.price?.lookup_key === line.lookupKey)
        line.checkoutLineId = checkoutLine?.id
        line.stripePriceId = checkoutLine?.price?.id
        line.subscriptionItemId = subscription?.items.data.find(item => item.price.id === line.stripePriceId)?.id
      }
      if (!paid) {
        const terminalFailure = (subscription?.status === 'incomplete_expired' || subscription?.status === 'canceled') && invoice?.status !== 'paid' || typeof session.payment_intent === 'object' && session.payment_intent?.status === 'canceled'
        if (u.state !== 'Paid') u.state = session.status === 'expired' ? 'Expired' : terminalFailure ? 'Failed' : 'Processing'
        return
      }
      if (u.state === 'Paid') return
      u.state = 'Paid'
      if (u.kind === 'Extra cycle') {
        const pkg = s.packages[u.packageId]; if (!pkg || !o.extraCycleAuthorized) throw new Error('Authorized parent package required.')
        const cycleId = `paid-cycle:${u.id}`
        if (!pkg.operations.cycles.some(cycle => cycle.id === cycleId)) pkg.operations.cycles.push({ id: cycleId, kind: 'Extra', price: POLICY.extraCyclePrice, payment: 'Verified paid', legs: [{ id: `${cycleId}:dropoff`, kind: 'Packed return', status: 'Available' }, { id: `${cycleId}:pickup`, kind: 'Packed collection', status: 'Available' }] })
      } else if (!s.packages[u.packageId]) {
        const operations = createPackage(u.packageId, o.customerId, u.selection?.planId ?? 'small', 'annual', now())
        if (u.kind === 'Standalone bulky') { operations.credits = 0; operations.cycles[0].legs = operations.cycles[0].legs.filter(leg => leg.kind === 'Packed collection' || leg.kind === 'Packed return') }
        operations.paymentState = 'Current'
        const bonus = u.bulky.find(item => item.useBonus); if (bonus) operations.annualBonusItemId = bonus.id
        s.packages[u.packageId] = { id: u.packageId, customerId: o.customerId, orderId, unitId, subscriptionId: subscription!.id, subscriptionStatus: subscription!.status, operations, selection: u.selection, bulky: u.bulky, invoiceIds: invoice ? [invoice.id] : [], paymentIntentIds: u.paymentIntentId ? [u.paymentIntentId] : [], cancellationSyncPending: false, billingLines: u.lines, serviceYears: [{ invoiceId: invoice!.id, startedAt: operations.serviceYear.startedAt, endsAt: operations.serviceYear.resetAt!, cycleId: operations.cycles[0].id }] }
        enqueue(s, `renewal:${u.packageId}:${operations.annualReminderAt}`, o.customerId, 'Annual reminder (Octagon owns delivery)', u.packageId, operations.annualReminderAt)
      }
      audit(s, 'Verified Stripe sandbox payment; fulfillment created once', u.id)
      enqueue(s, `enrolled:${u.id}`, o.customerId, 'Enrollment notification (Octagon owns delivery)', u.packageId)
    })
  }
  async refreshOrder(actor: Actor, id: string) {
    const order = this.order(actor, id)
    for (const unit of order.units) if (unit.sessionId) await this.reconcileSession(unit.sessionId)
    return this.order(actor, id)
  }
  async syncSubscription(id: string) {
    const subscription = await this.stripe.subscriptions.retrieve(id, { expand: ['latest_invoice.payments'] }); assertTest(subscription)
    const existing = Object.values(this.repo.read().packages).find(pkg => pkg.subscriptionId === id)
    if (!existing) {
      const order = this.repo.read().orders[subscription.metadata.octagon_order_id]
      const unit = order?.units.find(unit => unit.id === subscription.metadata.octagon_unit_id)
      if (unit?.sessionId) await this.reconcileSession(unit.sessionId)
    }
    this.repo.transaction(s => {
      const pkg = Object.values(s.packages).find(pkg => pkg.subscriptionId === id); if (!pkg) return
      pkg.subscriptionStatus = subscription.status
      const cancelled = subscription.cancel_at_period_end || subscription.cancel_at !== null || subscription.status === 'canceled'
      if (cancelled) {
        requestCancellation(pkg.operations, pkg.customerId, now())
        pkg.billingEndsAt = subscription.cancel_at ?? undefined
        enqueue(s, `cancel:${pkg.id}`, pkg.customerId, 'Cancellation and immediate free final return', pkg.id)
      }
      const invoice = typeof subscription.latest_invoice === 'object' ? subscription.latest_invoice : null
      if (invoice && !pkg.invoiceIds.includes(invoice.id)) pkg.invoiceIds.push(invoice.id)
      for (const payment of invoice?.payments?.data ?? []) { const id = stripeId(payment.payment.payment_intent); if (id && !pkg.paymentIntentIds.includes(id)) pkg.paymentIntentIds.push(id) }
      if (subscription.status === 'past_due' || subscription.status === 'unpaid') { pkg.operations.paymentState = 'Past due'; pkg.billingReview = 'Operator payment review; preserve inventory/access/returns. Grace policy unresolved.' }
      else if (subscription.status === 'active') pkg.operations.paymentState = 'Current'
      // Billing events never reset service allowances, inventory, cycle records, or cancellation.
      if (invoice?.status === 'paid') enqueue(s, `receipt:${invoice.id}`, pkg.customerId, 'Payment receipt (Octagon owns delivery)', invoice.id)
      if (invoice?.status === 'open' && subscription.status === 'past_due') enqueue(s, `failed:${invoice.id}`, pkg.customerId, 'Payment failure (Octagon owns delivery)', invoice.id)
      if (pkg.operations.billing === 'annual' && invoice?.status === 'paid' && invoice.billing_reason === 'subscription_cycle' && subscription.items.data[0]) {
        const item = subscription.items.data[0]
        const end = item.current_period_end
        const reminder = new Date(end * 1000 - 30 * 86400000).toISOString()
        enqueue(s, `renewal:${pkg.id}:${reminder}`, pkg.customerId, 'Annual reminder (Octagon owns delivery)', pkg.id, reminder)
        if (pkg.operations.billing === 'annual' && pkg.operations.cancellation === 'Active' && !pkg.serviceYears.some(year => year.invoiceId === invoice.id)) {
          const start = item.current_period_start ? new Date(item.current_period_start * 1000).toISOString() : now()
          const cycle = createPackage(`${pkg.id}:year:${invoice.id}`, pkg.customerId, pkg.operations.planId, 'annual', start).cycles[0]
          cycle.legs = cycle.legs.filter(leg => pkg.selection ? leg.kind !== 'Initial empty delivery' : leg.kind === 'Packed collection' || leg.kind === 'Packed return')
          pkg.operations.cycles.push(cycle)
          pkg.serviceYears.push({ invoiceId: invoice.id, startedAt: start, endsAt: new Date(end * 1000).toISOString(), cycleId: cycle.id })
          pkg.operations.serviceYear = { startedAt: start, resetAt: new Date(end * 1000).toISOString(), resetReviewRequired: false }
        }
      }
    })
  }
  async webhook(event: Stripe.Event) {
    assertTest(event)
    const process = this.repo.transaction(s => {
      if (s.events[event.id]?.status === 'Processed') return false
      const old = s.events[event.id]
      s.events[event.id] = { id: event.id, type: event.type, status: 'Received', attempts: (old?.attempts ?? 0) + 1, receivedAt: old?.receivedAt ?? now() }
      return true
    })
    if (!process) return
    try {
      if (event.type.startsWith('checkout.session.')) await this.reconcileSession((event.data.object as Stripe.Checkout.Session).id)
      else if (event.type.startsWith('customer.subscription.')) await this.syncSubscription((event.data.object as Stripe.Subscription).id)
      else if (event.type.startsWith('invoice.')) {
        const invoice = await this.stripe.invoices.retrieve((event.data.object as Stripe.Invoice).id); assertTest(invoice)
        const id = stripeId(invoice.parent?.subscription_details?.subscription); if (id) await this.syncSubscription(id)
      } else if (event.type === 'charge.refunded' || event.type.startsWith('charge.dispute.') || event.type.startsWith('refund.')) {
        const recordId = (event.data.object as { id: string }).id
        const paymentIntentId = stripeId((event.data.object as Stripe.Refund).payment_intent)
        this.repo.transaction(s => {
          for (const pkg of Object.values(s.packages)) if (paymentIntentId && pkg.paymentIntentIds.includes(paymentIntentId)) pkg.billingReview = `Operator financial review: ${event.type}. Preserve inventory and return access.`
          audit(s, `Operator financial review: ${event.type}`, recordId); enqueue(s, `risk:${event.id}`, 'owner', 'Refund/dispute review; no automatic disposal or forfeiture', recordId)
        })
      }
      this.repo.transaction(s => { s.events[event.id].status = 'Processed'; s.events[event.id].processedAt = now(); delete s.events[event.id].error })
    } catch (error) {
      this.repo.transaction(s => { s.events[event.id].status = 'Failed'; s.events[event.id].error = 'Reconciliation failed; retry or inspect with operator tooling.' })
      throw error
    }
  }
  async cancel(actor: Actor, packageId: string) {
    const pkg = this.repo.read().packages[packageId]; if (!pkg) throw new Error('Package not found.')
    own(actor, pkg.customerId)
    this.repo.transaction(s => {
      const p = s.packages[packageId]; requestCancellation(p.operations, p.customerId, now()); p.cancellationSyncPending = true
      enqueue(s, `cancel:${p.id}`, p.customerId, 'Cancellation and immediate free final return', p.id); audit(s, 'Cancellation requested; free final return available immediately', p.id)
    })
    const current = await this.stripe.subscriptions.retrieve(pkg.subscriptionId); assertTest(current)
    if (current.status !== 'canceled' && !current.cancel_at_period_end) {
      const sub = await this.stripe.subscriptions.update(pkg.subscriptionId, { cancel_at_period_end: true }, { idempotencyKey: `cancel:${pkg.id}` }); assertTest(sub)
    }
    this.repo.transaction(s => { s.packages[packageId].cancellationSyncPending = false })
    await this.syncSubscription(pkg.subscriptionId)
  }
  async billingPortal(actor: Actor) {
    const customer = this.repo.read().customers[actor.id]?.stripeId
    if (actor.role !== 'Customer' || !customer || !this.portalConfigurationId) throw new Error('A mapped customer and restricted billing portal configuration are required.')
    const config = await this.stripe.billingPortal.configurations.retrieve(this.portalConfigurationId); assertTest(config)
    if (!config.features.payment_method_update.enabled || !config.features.invoice_history.enabled || config.features.subscription_update.enabled || config.features.subscription_cancel.enabled) throw new Error('Portal must allow card/invoice access but disable subscription changes and cancellation.')
    return this.stripe.billingPortal.sessions.create({ customer, configuration: config.id, return_url: `${this.origin}/billing/return` })
  }
  requestFinalReturn(actor: Actor, packageId: string, preferredDate: string, preferredWindow: string) {
    const pkg = this.repo.read().packages[packageId]; if (!pkg) throw new Error('Package not found.')
    own(actor, pkg.customerId); validateAppointment(preferredDate, preferredWindow)
    return this.repo.transaction(s => {
      const record = s.packages[packageId]
      if (record.operations.cancellation === 'Active') throw new Error('Request cancellation before its free final return.')
      if (record.finalReturnRequest) return record.finalReturnRequest
      const cycle = record.operations.cycles.find(cycle => cycle.kind === 'Cancellation')
      if (!cycle) throw new Error('Free final-return entitlement not found.')
      const request = { id: randomUUID(), preferredDate, preferredWindow, status: 'Awaiting owner confirmation' as const }
      reserveLeg(record.operations, record.customerId, cycle.id, 'Final return', request.id)
      record.finalReturnRequest = request
      enqueue(s, `final-return:${request.id}`, record.customerId, 'Final-return request for owner confirmation', record.id)
      audit(s, 'Free final-return request saved; not a confirmed appointment', record.id)
      return request
    })
  }
  extraCycle(actor: Actor, packageId: string, authorized: boolean, retryKey: string) {
    const pkg = this.repo.read().packages[packageId]; if (!pkg) throw new Error('Package not found.'); own(actor, pkg.customerId)
    if (!authorized || typeof retryKey !== 'string' || !retryKey || retryKey.length > 150 || !pkg.selection || pkg.operations.cancellation !== 'Active') throw new Error('Authorize the $50 round trip for an active tote package.')
    return this.repo.transaction(s => {
      const requestKey = `cycle:${packageId}:${retryKey}`; const old = Object.values(s.orders).find(order => order.customerId === actor.id && order.requestKey === requestKey); if (old) return old
      const original = s.orders[pkg.orderId]
      const unitId = randomUUID()
      const order: PaymentOrder = { ...original, id: randomUUID(), createdAt: now(), requestKey, fingerprint: requestKey, extraCycleAuthorized: true, units: [{ id: unitId, kind: 'Extra cycle', packageId, bulky: [], lines: [{ id: `${unitId}:trip`, recordId: `paid-cycle:${unitId}`, lookupKey: 'totekeeper_extra_cycle_usd_v1', amountCents: POLICY.extraCyclePrice * 100 }], prices: ['totekeeper_extra_cycle_usd_v1'], amountCents: POLICY.extraCyclePrice * 100, state: 'Not started', attempt: 0 }] }
      s.orders[order.id] = order; audit(s, 'Customer authorized one-time cycle purchase', order.id); return order
    })
  }
  async reconcileAll(actor: Actor) {
    if (actor.role !== 'Owner') throw new Error('Owner reconciliation required.')
    for (const order of Object.values(this.repo.read().orders)) for (const unit of order.units) if (unit.sessionId) await this.reconcileSession(unit.sessionId)
    for (const pkg of Object.values(this.repo.read().packages)) { if (pkg.cancellationSyncPending) await this.cancel({ id: pkg.customerId, role: 'Customer' }, pkg.id); else await this.syncSubscription(pkg.subscriptionId) }
  }
}
