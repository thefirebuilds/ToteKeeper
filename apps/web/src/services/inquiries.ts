import type { InquirySelection } from '../features/marketing/inquiryContext'
export interface InquiryFields { name: string; email: string; zip_code: string; plan: InquirySelection['plan']; description: string; phone: string; reply_method: 'email' | 'phone' | 'text'; website: string }
export class InquirySubmissionError extends Error {
  fields: Record<string, string[]>
  reference?: string
  constructor(message: string, fields: Record<string, string[]> = {}, reference?: string) {
    super(message)
    this.fields = fields
    this.reference = reference
  }
}
export async function sendInquiry(fields: InquiryFields, selection: InquirySelection, requestKey: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 35000)
  try {
    const csrf = await fetch('/api/inquiries/csrf/', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
    if (!csrf.ok) throw new Error('CSRF unavailable')
    const token = await csrf.json() as { csrfToken?: string }
    if (!token.csrfToken) throw new Error('CSRF unavailable')
    const response = await fetch('/api/inquiries/', { method: 'POST', credentials: 'same-origin', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': token.csrfToken },
      body: JSON.stringify({ ...fields, source: selection.source, context: selection.context, request_key: requestKey }) })
    const body = await response.json() as { error?: string; fields?: Record<string, string[]>; reference?: string }
    if (!response.ok) throw new InquirySubmissionError(body.error || 'We could not send your request. Please contact Blake directly.', body.fields, body.reference)
    if (!body.reference || !/^TK-[a-f0-9-]{36}$/i.test(body.reference)) throw new Error('No receipt received')
    return body.reference
  } catch (error) {
    if (error instanceof InquirySubmissionError) throw error
    throw new InquirySubmissionError('We could not confirm that your request was sent. Your details are still here. Try again or contact Blake directly.')
  } finally { clearTimeout(timer) }
}
