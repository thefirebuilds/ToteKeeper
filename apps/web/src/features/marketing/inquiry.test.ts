import { describe, expect, it, vi, afterEach } from 'vitest'
import { legacyInquiryTarget, selectionFromSearch } from './inquiryContext'
import { sendInquiry } from '../../services/inquiries'

afterEach(() => vi.unstubAllGlobals())
describe('inquiry entry points', () => {
  it.each(['small', 'medium', 'big'] as const)('preserves the %s legacy enrollment choice without carrying personal query values', plan => {
    const target = legacyInquiryTarget(`?plan=${plan}&email=private@example.com&address=private`)
    expect(target).toContain(`plan=${plan}`)
    expect(target).toContain('source=legacy-enroll')
    expect(target).toContain('#interest')
    expect(target).not.toContain('private')
  })
  it('uses Help me decide for unknown plans and preserves recognized context', () => {
    expect(selectionFromSearch('?plan=Medium&source=pricing-medium')).toEqual({ plan: 'medium', source: 'pricing-medium', context: 'general' })
    expect(selectionFromSearch('?plan=unrecognized&context=summer&source=summer')).toEqual({ plan: 'undecided', context: 'summer', source: 'summer' })
    expect(selectionFromSearch('?context=https://example.com')).toEqual({ plan: 'undecided', source: 'final', context: 'general' })
  })
})
const fields = { name: 'Customer', email: 'customer@example.com', zip_code: '78610', plan: 'small' as const, description: 'Holiday decorations', phone: '', reply_method: 'email' as const, website: '' }
const selection = { plan: 'small' as const, source: 'pricing-small' as const, context: 'general' as const }
describe('inquiry submission', () => {
  it('sends CSRF-protected JSON with an idempotency key and requires a real receipt', async () => {
    const reference = 'TK-12345678-1234-1234-1234-123456789abc'
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'csrf' }))).mockResolvedValueOnce(new Response(JSON.stringify({ reference }), { status: 201 }))
    vi.stubGlobal('fetch', fetch)
    expect(await sendInquiry(fields, selection, 'request-key')).toBe(reference)
    const [url, options] = fetch.mock.calls[1]
    expect(url).toBe('/api/inquiries/')
    expect(options.headers['X-CSRFToken']).toBe('csrf')
    expect(JSON.parse(options.body)).toMatchObject({ ...fields, request_key: 'request-key', source: 'pricing-small' })
  })
  it('reports provider errors and rejects success responses without receipts', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ csrfToken: 'csrf' })))
    vi.stubGlobal('fetch', fetch)
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'csrf' }))).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Contact Blake', fields: { email: ['Check email'] } }), { status: 503 }))
    await expect(sendInquiry(fields, selection, 'key')).rejects.toMatchObject({ message: 'Contact Blake', fields: { email: ['Check email'] } })
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'csrf' }))).mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await expect(sendInquiry(fields, selection, 'key')).rejects.toThrow('could not confirm')
  })
})
