import { describe, expect, it } from 'vitest'
import { authorizeRecord, maySendSms, processPaymentWebhook, unavailablePayments } from './integrationPorts'
import type { PaymentBackendPort, VerifiedPaymentEvent } from './integrationPorts'

describe('Octagon integration contracts (test adapters only)', () => {
  it('rejects cross-customer and customer-to-owner actions', () => {
    expect(() => authorizeRecord({ customerId: 'A', role: 'Customer' }, 'B')).toThrow('ownership')
    expect(() => authorizeRecord({ customerId: 'A', role: 'Customer' }, 'A', true)).toThrow('Owner')
    expect(() => authorizeRecord({ customerId: 'A', role: 'Customer' }, 'A')).not.toThrow()
  })
  it('verifies before processing and never duplicates package activation on replay or a second paid event', async () => {
    const seen = new Set<string>(); let activations = 0
    const order = { customerId: 'C', amountCents: 42400, currency: 'usd', activated: false, expectedPackages: 2 }
    const event: VerifiedPaymentEvent = { id: 'E1', orderId: 'O1', customerId: 'C', amountCents: 42400, currency: 'usd', subscriptionIds: ['S1', 'S2'], state: 'paid' }
    const port: PaymentBackendPort = {
      async verifySignature(_, signature) { if (signature !== 'test-verified') throw new Error('Invalid signature'); return event },
      async transaction(work) { return work({ async eventSeen(id) { return seen.has(id) }, async getOrder() { return order }, async activateOrder(_, subscriptions) { expect(subscriptions).toEqual(['S1', 'S2']); activations++; order.activated = true }, async recordPaymentFailure() {}, async recordEvent(id) { seen.add(id) } }) },
    }
    await expect(processPaymentWebhook(port, new Uint8Array(), 'bad')).rejects.toThrow('signature')
    expect(activations).toBe(0)
    expect(await processPaymentWebhook(port, new Uint8Array(), 'test-verified')).toBe('processed')
    expect(await processPaymentWebhook(port, new Uint8Array(), 'test-verified')).toBe('duplicate')
    event.id = 'E2'
    await processPaymentWebhook(port, new Uint8Array(), 'test-verified')
    expect(activations).toBe(1)
    event.id = 'E3'; event.amountCents = 1
    await expect(processPaymentWebhook(port, new Uint8Array(), 'test-verified')).rejects.toThrow('reviewed order')
  })
  it('honors separate consent and opt-outs and fails closed for unconnected checkout', async () => {
    expect(maySendSms({ serviceSms: true, marketingSms: false, optedOut: false }, 'Marketing')).toBe(false)
    expect(maySendSms({ serviceSms: true, marketingSms: true, optedOut: true }, 'Service')).toBe(false)
    await expect(unavailablePayments.createCheckout({ customerId: 'A', reviewedOrderId: 'O', idempotencyKey: 'K' })).rejects.toThrow('not connected')
  })
})
