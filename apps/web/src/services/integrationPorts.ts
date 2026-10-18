/** Contracts for the standalone Octagon backend. No invented HTTP endpoints or provider SDKs. */
export interface Principal { customerId: string; role: 'Customer' | 'Owner' }
export interface HostedPaymentPort {
  createCheckout(input: { customerId: string; reviewedOrderId: string; idempotencyKey: string }): Promise<{ url: string }>
  createBillingSession(customerId: string): Promise<{ url: string }>
}
export interface VerifiedPaymentEvent {
  id: string; orderId: string; customerId: string; subscriptionIds: string[]
  amountCents: number; currency: string; state: 'paid' | 'failed'
}
export interface PaymentTransaction {
  eventSeen(eventId: string): Promise<boolean>
  getOrder(orderId: string): Promise<{ customerId: string; amountCents: number; currency: string; activated: boolean; expectedPackages: number }>
  activateOrder(orderId: string, subscriptionIds: string[]): Promise<void>
  recordPaymentFailure(orderId: string): Promise<void>
  recordEvent(eventId: string): Promise<void>
}
export interface PaymentBackendPort {
  verifySignature(rawBody: Uint8Array, signature: string): Promise<VerifiedPaymentEvent>
  /** Must use a durable DB transaction and unique constraints on provider event/order/subscription IDs. */
  transaction<T>(work: (tx: PaymentTransaction) => Promise<T>): Promise<T>
}
/** Server-side orchestration only. Not connected to a browser redirect or deployed webhook endpoint. */
export async function processPaymentWebhook(port: PaymentBackendPort, body: Uint8Array, signature: string) {
  const event = await port.verifySignature(body, signature)
  return port.transaction(async tx => {
    if (await tx.eventSeen(event.id)) return 'duplicate'
    const order = await tx.getOrder(event.orderId)
    if (order.customerId !== event.customerId || order.amountCents !== event.amountCents || order.currency !== event.currency) throw new Error('Payment event does not match the reviewed order.')
    if (event.state === 'paid') {
      if (event.subscriptionIds.length !== order.expectedPackages || new Set(event.subscriptionIds).size !== event.subscriptionIds.length) throw new Error('Provider subscriptions must match the independent packages.')
      if (!order.activated) await tx.activateOrder(event.orderId, event.subscriptionIds)
    } else await tx.recordPaymentFailure(event.orderId)
    await tx.recordEvent(event.id)
    return 'processed'
  })
}
export function authorizeRecord(principal: Principal, recordCustomerId: string, ownerOnly = false) {
  if (ownerOnly && principal.role !== 'Owner') throw new Error('Owner authorization required.')
  if (principal.role !== 'Owner' && principal.customerId !== recordCustomerId) throw new Error('Customer ownership required.')
}
export interface NotificationPort {
  sendServiceEmail(input: { customerId: string; templateVersion: string; eventId: string }): Promise<void>
  sendSms(input: { customerId: string; templateVersion: string; eventId: string; category: 'Service' | 'Marketing' }): Promise<void>
}
export function maySendSms(consent: { serviceSms: boolean; marketingSms: boolean; optedOut: boolean }, category: 'Service' | 'Marketing') {
  return !consent.optedOut && (category === 'Service' ? consent.serviceSms : consent.marketingSms)
}
export const unavailablePayments: HostedPaymentPort = {
  async createCheckout() { throw new Error('Hosted checkout is not connected. No payment was collected.') },
  async createBillingSession() { throw new Error('Hosted billing management is not connected.') },
}
