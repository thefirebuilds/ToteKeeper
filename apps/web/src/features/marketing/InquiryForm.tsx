import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { OWNER } from '../../config/business'
import { InquirySubmissionError, sendInquiry, type InquiryFields } from '../../services/inquiries'
import type { InquiryPlan, InquirySelection } from './inquiryContext'

const labels = { undecided: 'Help me decide', small: 'Small', medium: 'Medium', big: 'Big', bulky: 'Bulky item' }
const contextLabels = { general: '', summer: 'Summer storage', bulky: 'Bulky-item inquiry', 'service-area': 'Service-area inquiry' }
function Contact() {
  return <p className="inquiry-contact">Email <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a> or call <a href={OWNER.phoneHref}>{OWNER.phone}</a>.</p>
}
export function InquiryForm({ selection, focusRequest, onPlanChange }: { selection: InquirySelection; focusRequest: number; onPlanChange: (plan: InquiryPlan) => void }) {
  const [values, setValues] = useState<Omit<InquiryFields, 'plan'>>({ name: '', email: '', zip_code: '', description: '', phone: '', reply_method: 'email', website: '' })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<InquirySubmissionError | null>(null)
  const [reference, setReference] = useState('')
  const [completionFocus, setCompletionFocus] = useState(-1)
  const requestKey = useRef(crypto.randomUUID())
  const attempted = useRef(false)
  const locked = useRef(false)
  const nameInput = useRef<HTMLInputElement>(null)
  const result = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (attempted.current) requestKey.current = crypto.randomUUID()
    if (focusRequest) {
      document.getElementById('interest')?.scrollIntoView({ behavior: 'instant' })
      nameInput.current?.focus({ preventScroll: true })
    }
  }, [focusRequest])
  useEffect(() => { if (error || reference) result.current?.focus() }, [error, reference])
  function change<K extends keyof Omit<InquiryFields, 'plan'>>(key: K, value: InquiryFields[K]) {
    if (attempted.current) { requestKey.current = crypto.randomUUID(); attempted.current = false }
    setValues(previous => ({ ...previous, [key]: value, ...(key === 'phone' && !value.toString().trim() ? { reply_method: 'email' as const } : {}) }))
    setError(null)
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked.current || !event.currentTarget.reportValidity()) return
    locked.current = true
    attempted.current = true
    setSending(true)
    setError(null)
    try { const received = await sendInquiry({ ...values, plan: selection.plan }, selection, requestKey.current); setCompletionFocus(focusRequest); setReference(received) }
    catch (failure) { setError(failure as InquirySubmissionError) }
    finally { locked.current = false; setSending(false) }
  }
  const fieldError = (field: keyof InquiryFields) => error?.fields[field]?.[0]
  const errorHint = (field: keyof InquiryFields) => fieldError(field) ? `inquiry-${field}-error` : undefined
  const errorText = (field: keyof InquiryFields) => fieldError(field) && <span id={`inquiry-${field}-error`} className="inquiry-field-error">{fieldError(field)}</span>
  if (reference && completionFocus === focusRequest) return <div className="interest-form inquiry-confirmation" ref={result} tabIndex={-1} role="status" aria-live="polite">
    <h3>Your storage request has been received.</h3>
    <p>Blake will review your service area, storage needs and availability, then contact you about the next steps. Requested appointments require confirmation.</p>
    <p>No subscription, payment, or appointment has been created.</p>
    <p className="inquiry-reference">Your reference: <strong>{reference}</strong></p><Contact />
  </div>
  return <form className="interest-form" method="post" action="/api/inquiries/" onSubmit={submit} noValidate aria-label="Storage inquiry" aria-busy={sending}>
    {contextLabels[selection.context] && <p className="inquiry-context">{contextLabels[selection.context]}</p>}
    <fieldset disabled={sending}>
      <legend className="sr-only">Get my storage plan</legend>
      <label htmlFor="inquiry-name"><span id="inquiry-name-label">Your name</span><input aria-labelledby="inquiry-name-label" ref={nameInput} id="inquiry-name" name="name" required minLength={1} maxLength={100} autoComplete="name" value={values.name} onChange={event => change('name', event.target.value)} aria-invalid={!!fieldError('name')} aria-describedby={errorHint('name')} />{errorText('name')}</label>
      <label htmlFor="inquiry-email"><span id="inquiry-email-label">Email address</span><input aria-labelledby="inquiry-email-label" id="inquiry-email" name="email" type="email" required maxLength={254} autoComplete="email" value={values.email} onChange={event => change('email', event.target.value)} aria-invalid={!!fieldError('email')} aria-describedby={errorHint('email')} />{errorText('email')}</label>
      <div className="form-row"><label htmlFor="inquiry-zip"><span id="inquiry-zip-label">ZIP code</span><input aria-labelledby="inquiry-zip-label" id="inquiry-zip" name="zip_code" required inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{5}(-[0-9]{4})?" maxLength={10} value={values.zip_code} onChange={event => change('zip_code', event.target.value)} aria-invalid={!!fieldError('zip_code')} aria-describedby={errorHint('zip_code') || 'inquiry-area-note'} />{errorText('zip_code')}</label>
      <label htmlFor="inquiry-plan">Plan interest<select id="inquiry-plan" name="plan" value={selection.plan} onChange={event => { if (attempted.current) requestKey.current = crypto.randomUUID(); setError(null); onPlanChange(event.target.value as InquiryPlan) }}>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
      <label htmlFor="inquiry-description"><span id="inquiry-description-label">What would you like to store?</span><textarea aria-labelledby="inquiry-description-label" id="inquiry-description" name="description" required minLength={1} maxLength={1000} rows={3} placeholder="Holiday decorations, a few winter coats, that guest-room takeover..." value={values.description} onChange={event => change('description', event.target.value)} aria-invalid={!!fieldError('description')} aria-describedby={errorHint('description')} />{errorText('description')}</label>
      <label htmlFor="inquiry-phone"><span id="inquiry-phone-label">Phone <span className="optional-label">optional</span></span><input aria-labelledby="inquiry-phone-label" id="inquiry-phone" name="phone" type="tel" autoComplete="tel" maxLength={30} value={values.phone} onChange={event => change('phone', event.target.value)} aria-invalid={!!fieldError('phone')} aria-describedby={errorHint('phone')} />{errorText('phone')}</label>
      <label htmlFor="inquiry-reply">Preferred reply method<select id="inquiry-reply" name="reply_method" value={values.reply_method} onChange={event => change('reply_method', event.target.value as InquiryFields['reply_method'])}><option value="email">Email</option>{values.phone.trim() && <><option value="phone">Phone call</option><option value="text">Text message</option></>}</select></label>
      <div className="inquiry-honeypot" aria-hidden="true"><label>Leave this blank<input name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={event => change('website', event.target.value)} /></label></div>
      <p id="inquiry-area-note" className="form-disclaimer">Service eligibility uses the active approved ZIP list. Each listed ZIP qualifies in full; plan capacity and confirmed appointments are checked separately.</p>
      <p className="form-disclaimer">Request pickup or delivery at least 72 hours ahead. We’ll confirm your appointment. Minimum notice is not a guaranteed appointment or delivery deadline.</p>
      <p className="form-disclaimer">Tell us what you'd like out of the way. We'll review your area and storage needs, then contact you with a recommended plan and next steps. No payment or commitment.</p>
      <button className="button button-primary" type="submit" disabled={sending}>{sending ? 'Sending your request...' : 'Get my storage plan'}</button>
    </fieldset>
    {error && <div ref={result} tabIndex={-1} role="alert" className="inquiry-error"><p>{error.message}</p>{error.reference && <p className="inquiry-reference">Reference: {error.reference}</p>}<Contact /></div>}
    <p className="form-disclaimer">This is a service inquiry only. You will not be added to a marketing list, and no automated text message will be sent.</p>
    <p className="form-disclaimer">Read our <Link to="/policies/privacy">draft Privacy Notice</Link> for how inquiry information is handled. No policy acceptance is required to inquire.</p>
  </form>
}
