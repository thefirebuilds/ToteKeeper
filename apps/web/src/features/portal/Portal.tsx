import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, NavLink, useLocation, useParams } from 'react-router-dom'
import { Brand } from '../../components/Brand'
import { POLICY, SERVICE_CONFIG, TOTE_CONTENTS_ACKNOWLEDGMENT } from '../../config/business'
import { allocatedCredits, creditsForToteSize, hasActiveConflict, isToteEligible, toteKeeperService } from '../../services/demoService'
import { PackagesPanel } from './PackagesPanel'
import type { AddDemoToteInput, DemoData, RequestKind, Tote, ToteSizeId } from '../../types'

const navItems = [
  { label: 'Overview', to: '/portal', icon: '⌂' }, { label: 'My totes', to: '/portal/totes', icon: '▧' },
  { label: 'Requests', to: '/portal/requests', icon: '↗' }, { label: 'My packages', to: '/portal/plan', icon: '◇' }, { label: 'Profile & address', to: '/portal/profile', icon: '○' },
]
const REQUEST_MIN_DATE = new Date(Date.now() + 48 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

function formatDate(date: string) {
  if (!date) return 'Choose a date'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }).format(new Date(`${date}T12:00:00-05:00`))
}

function StatusPill({ children }: { children: string }) { return <span className={`status-pill ${children === 'In storage' ? 'status-stored' : children === 'At home' ? 'status-home' : 'status-pending'}`}>{children}</span> }

function ToteCard({ tote }: { tote: Tote }) {
  const size = SERVICE_CONFIG.toteSizes[tote.size]
  return <Link to={`/portal/totes/${tote.id}`} className="portal-tote-card"><img className="portal-product-image" src={size.image} alt={size.imageAlt} /><div className="portal-tote-info"><small>{tote.id} · {tote.category}</small><strong>{tote.nickname}</strong><span>{tote.emptyLocation === 'Company' ? 'Empty tote with company; belongings at home' : tote.status}</span><span className={`tote-size-badge size-${tote.size}`}>{size.name} · {size.credits} {size.credits === 1 ? 'credit' : 'credits'}</span></div><span className="card-arrow" aria-hidden="true">↗</span></Link>
}

function AddToteDialog({ data, onClose, onAdded }: { data: DemoData; onClose: () => void; onAdded: () => void }) {
  const [size, setSize] = useState<ToteSizeId>('large')
  const [nickname, setNickname] = useState('')
  const [category, setCategory] = useState('Seasonal household')
  const [description, setDescription] = useState('')
  const [value, setValue] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState('')
  const [packageId, setPackageId] = useState(data.packages.find(pkg => pkg.cancellation === 'Active')?.id ?? '')
  const pkg = data.packages.find(pkg => pkg.id === packageId)
  const allowance = pkg?.credits ?? 0
  const used = allocatedCredits(data, packageId)
  const newCost = creditsForToteSize(size)
  const canFit = !!pkg && pkg.cancellation === 'Active' && used + newCost <= allowance

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canFit) { setError('This tote would exceed your plan allowance. Purchase another independent package or choose a smaller tote.'); return }
    const input: AddDemoToteInput = { packageId, size, nickname, category, description, status: 'At home', combinedContentsValue: Number(value), contentsAcknowledged: acknowledged }
    try { await toteKeeperService.addDemoTote(input); onAdded() } catch (caught) { setError(caught instanceof Error ? caught.message : 'The demo tote could not be added.') }
  }

  return <div className="dialog-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === 'Escape') onClose() }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="request-dialog add-tote-dialog" role="dialog" aria-modal="true" aria-labelledby="add-tote-title"><button type="button" className="dialog-close" onClick={onClose} aria-label="Close add tote" autoFocus>×</button><p className="eyebrow">FICTIONAL DEMO</p><h2 id="add-tote-title">Add a tote to your demo</h2><p>Credits stay allocated while a tote is assigned to you, including when it is at home.</p><p className="allocation-meter">{used} of {allowance} credits allocated · {data.totes.length} physical totes</p><form onSubmit={submit}><label>Package<select value={packageId} onChange={event => setPackageId(event.target.value)}>{data.packages.filter(pkg => pkg.cancellation === 'Active').map(pkg => <option key={pkg.id} value={pkg.id}>{pkg.planId} · {pkg.id}</option>)}</select></label><label>Tote size<select value={size} onChange={(event) => setSize(event.target.value as ToteSizeId)}><option value="large">Large · 1 credit</option><option value="xl">XL · 2 credits</option></select></label><p className="subtle">After this addition: {used + newCost} of {allowance} credits.</p>{!canFit && <p className="credit-capacity-error" role="status">That mix exceeds this plan. Purchase another independent package or inquire about another option.</p>}<label>Nickname<input required value={nickname} onChange={(event) => setNickname(event.target.value)} /></label><label>Category<input required value={category} onChange={(event) => setCategory(event.target.value)} /></label><label>Contents description<textarea required rows={2} value={description} onChange={(event) => setDescription(event.target.value)} /></label><label>Combined contents value (maximum ${SERVICE_CONFIG.maxCombinedToteContentsValue})<input type="number" min="0" max={SERVICE_CONFIG.maxCombinedToteContentsValue} step="0.01" required value={value} onChange={(event) => setValue(event.target.value)} /></label><label className="policy-ack"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>{TOTE_CONTENTS_ACKNOWLEDGMENT.replace('the packing guidelines', 'the')} <Link to="/#packing-guidelines" target="_blank" rel="noreferrer">packing guidelines</Link></span></label>{error && <p className="error-message" role="alert">{error}</p>}{!canFit && <Link to="/enroll" target="_blank" rel="noreferrer">Purchase another independent package</Link>}<div className="dialog-actions"><button type="button" className="text-link" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={!canFit || !acknowledged}>Add demo tote</button></div></form></section></div>
}

function RequestDialog({ kind, data, onClose, onCreated }: { kind: RequestKind; data: DemoData; onClose: () => void; onCreated: () => void }) {
  const cancellationPackage = new URLSearchParams(useLocation().search).get('cancelPackage')
  const [packageId, setPackageId] = useState(cancellationPackage ?? data.packages[0]?.id ?? '')
  const pkg = data.packages.find(pkg => pkg.id === packageId)
  const [purpose, setPurpose] = useState<'Packed belongings' | 'Empty totes' | 'Final return'>(cancellationPackage ? 'Final return' : 'Packed belongings')
  const [emptyConfirmed, setEmptyConfirmed] = useState(false)
  const [initialDelivery, setInitialDelivery] = useState(false)
  const [cycleId, setCycleId] = useState('')
  const [packingPreference, setPackingPreference] = useState('Return later')
  const [unattended, setUnattended] = useState(false)
  const [handoffLocation, setHandoffLocation] = useState('')
  const [authorized, setAuthorized] = useState(false)
  const [riskAcknowledged, setRiskAcknowledged] = useState(false)
  const eligible = useMemo(() => data.totes.filter(tote => tote.packageId === packageId && (purpose === 'Empty totes' ? tote.status === 'At home' : isToteEligible(tote, kind)) && (purpose === 'Final return' || !hasActiveConflict(data, [tote.id]))), [data, kind, packageId, purpose])
  const [selected, setSelected] = useState<string[]>([])
  const [toteAcknowledgements, setToteAcknowledgements] = useState<Record<string, { contentsDescription: string; combinedContentsValue: string; acknowledged: boolean }>>(() => Object.fromEntries(data.totes.map((tote) => [tote.id, { contentsDescription: tote.description, combinedContentsValue: tote.combinedContentsValue === undefined ? '' : String(tote.combinedContentsValue), acknowledged: tote.contentsAcknowledged ?? false }])))
  const [date, setDate] = useState('')
  const [window, setWindow] = useState<string>(POLICY.scheduling.windows[0])
  const [address, setAddress] = useState(`${data.profile.address}, ${data.profile.city} ${data.profile.zip}`)
  const [instructions, setInstructions] = useState('')
  const [review, setReview] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!selected.length) { setError('Choose at least one eligible tote.'); return }
    if (!date || date < REQUEST_MIN_DATE) { setError('Choose a preferred date at least 48 hours from now.'); return }
    if (kind === 'Collection' && purpose === 'Packed belongings' && selected.some((id) => {
      const entry = toteAcknowledgements[id]
      const value = Number(entry?.combinedContentsValue)
      return !entry?.acknowledged || !entry.contentsDescription.trim() || entry.combinedContentsValue === '' || !Number.isFinite(value) || value < 0 || value > SERVICE_CONFIG.maxCombinedToteContentsValue
    })) {
      setError(`For each selected tote, describe the contents, enter a combined value of $${SERVICE_CONFIG.maxCombinedToteContentsValue} or less, and check the packing acknowledgment.`)
      return
    }
    setError('')
    if (!review) { setReview(true); return }
    setBusy(true)
    try {
      await toteKeeperService.createRequest({ kind, packageId, cycleId: cycleId || undefined, purpose, emptyAction: kind === 'Collection' ? 'Collection' : initialDelivery ? 'Initial delivery' : 'Redelivery', emptyConfirmed, packingPreference, unattended: { requested: unattended, location: handoffLocation, authorized, agreedByOwner: false, riskAcknowledged }, toteIds: selected, preferredDate: date, preferredWindow: window, address, instructions, toteAcknowledgements: kind === 'Collection' && purpose === 'Packed belongings' ? selected.map((toteId) => ({ toteId, contentsDescription: toteAcknowledgements[toteId].contentsDescription, combinedContentsValue: Number(toteAcknowledgements[toteId].combinedContentsValue), acknowledged: toteAcknowledgements[toteId].acknowledged })) : undefined })
      onCreated()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The request could not be created.') }
    finally { setBusy(false) }
  }

  return <div className="dialog-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === 'Escape') onClose() }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="request-dialog" role="dialog" aria-modal="true" aria-labelledby="request-title" aria-describedby="request-help" tabIndex={-1}>
    <button type="button" className="dialog-close" onClick={onClose} aria-label="Close request" autoFocus>×</button><p className="eyebrow">{review ? 'PLEASE DOUBLE-CHECK' : 'DEMO REQUEST'}</p><h2 id="request-title">{review ? 'Review your request' : `Request ${kind.toLowerCase()}`}</h2><p id="request-help">{review ? 'Your preferred date is not confirmed until we confirm it with you.' : 'Request at least 48 hours ahead. Evening and weekend appointments are available. Preferred dates and times need confirmation.'}</p>
    {kind === 'Return delivery' && <p className="request-visit-note">A partial return uses your plan’s included return visit. Additional return visits cost extra, with the charge agreed before scheduling.</p>}
    <form onSubmit={submit}>
      {!review ? <>
        <label>Package<select value={packageId} onChange={event => { setPackageId(event.target.value); setSelected([]); setCycleId('') }}>{data.packages.map(pkg => <option key={pkg.id} value={pkg.id}>{pkg.planId} · {pkg.id}</option>)}</select></label><label>Handling<select value={purpose} onChange={event => { setPurpose(event.target.value as typeof purpose); setSelected([]); setCycleId('') }}><option>Packed belongings</option><option>Empty totes</option>{kind === 'Return delivery' && pkg?.cancellation !== 'Active' && <option>Final return</option>}</select></label><label>Service cycle<select value={cycleId} onChange={event => setCycleId(event.target.value)}><option value="">{purpose === 'Final return' ? 'Free cancellation return' : 'Included cycle'}</option>{pkg?.cycles.filter(cycle => cycle.kind === 'Extra' && purpose === 'Packed belongings').map(cycle => <option key={cycle.id} value={cycle.id}>Extra round trip · {cycle.id}</option>)}</select></label><p className="subtle">One package per request. Partial returns use its whole return visit. Additional packed cycles cost $50 for both legs. Empty handling belongs to the included cycle.</p>{purpose === 'Empty totes' && <><label className="policy-ack"><input type="checkbox" required checked={emptyConfirmed} onChange={event => setEmptyConfirmed(event.target.checked)} /><span>These company totes are empty. Belongings remain with me.</span></label>{kind === 'Return delivery' && <label className="policy-ack"><input type="checkbox" checked={initialDelivery} onChange={event => setInitialDelivery(event.target.checked)} /><span>This is the initial empty-tote delivery, rather than redelivery for repacking.</span></label>}</>}<fieldset className="tote-choice-field"><legend>Which totes? <span>({eligible.length} eligible)</span></legend>{eligible.length ? eligible.map((tote) => <div className="collection-tote-choice" key={tote.id}><label className="tote-choice"><input type="checkbox" checked={selected.includes(tote.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, tote.id] : selected.filter((id) => id !== tote.id))} /><span><strong>{tote.nickname}</strong><small>{tote.id} · {tote.packageId}</small></span><StatusPill>{tote.status}</StatusPill></label>{kind === 'Collection' && purpose === 'Packed belongings' && selected.includes(tote.id) && <div className="collection-ack-fields"><label>Contents description<textarea required rows={2} value={toteAcknowledgements[tote.id]?.contentsDescription ?? ''} onChange={(event) => setToteAcknowledgements((current) => ({ ...current, [tote.id]: { ...current[tote.id], contentsDescription: event.target.value, acknowledged: false } }))} /></label><label>Combined contents value (maximum ${SERVICE_CONFIG.maxCombinedToteContentsValue})<input type="number" min="0" max={SERVICE_CONFIG.maxCombinedToteContentsValue} step="0.01" required value={toteAcknowledgements[tote.id]?.combinedContentsValue ?? ''} onChange={(event) => setToteAcknowledgements((current) => ({ ...current, [tote.id]: { ...current[tote.id], combinedContentsValue: event.target.value, acknowledged: false } }))} /></label><label className="policy-ack"><input type="checkbox" checked={toteAcknowledgements[tote.id]?.acknowledged ?? false} onChange={(event) => setToteAcknowledgements((current) => ({ ...current, [tote.id]: { ...current[tote.id], acknowledged: event.target.checked } }))} /><span>{TOTE_CONTENTS_ACKNOWLEDGMENT.replace('the packing guidelines', 'the')} <a href="/#packing-guidelines" target="_blank" rel="noreferrer">packing guidelines</a></span></label></div>}</div>) : <p className="empty-inline">No eligible totes are available for this request right now. Active requests may be holding some totes.</p>}</fieldset>
        <div className="form-row"><label>Preferred date<input type="date" min={REQUEST_MIN_DATE} required value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Preferred window<select value={window} onChange={(event) => setWindow(event.target.value)}>{POLICY.scheduling.windows.map(window => <option key={window}>{window}</option>)}</select></label></div>
        <label>Service address<input required value={address} onChange={(event) => setAddress(event.target.value)} /></label><label>Handoff instructions <span className="optional-label">optional</span><textarea rows={2} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Describe the handoff; avoid sensitive access codes in the demo" /></label>
        <label>Packing preference<select value={packingPreference} onChange={event => setPackingPreference(event.target.value)}><option>Return later</option><option>Ask Blake to wait</option><option>Collect after the season</option></select></label><p className="subtle">Waiting and timing require confirmation; there is no fixed seven-day deadline.</p><label className="policy-ack"><input type="checkbox" checked={unattended} onChange={event => setUnattended(event.target.checked)} /><span>Request an unattended handoff, including loaded totes. Owner agreement is required.</span></label>{unattended && <><label>Proposed handoff location<input required value={handoffLocation} onChange={event => setHandoffLocation(event.target.value)} /></label><label className="policy-ack"><input type="checkbox" required checked={authorized} onChange={event => setAuthorized(event.target.checked)} /><span>I authorize the requested handoff at this location, subject to Blake’s explicit agreement.</span></label><label className="policy-ack"><input type="checkbox" required checked={riskAcknowledged} onChange={event => setRiskAcknowledged(event.target.checked)} /><span>I understand unattended handoffs carry theft risk. The finalized agreement must address that risk.</span></label></>}
      </> : <div className="request-summary"><div><small>TOTES</small><strong>{data.totes.filter((tote) => selected.includes(tote.id)).map((tote) => tote.nickname).join(', ')}</strong></div><div><small>PREFERRED DATE &amp; WINDOW</small><strong>{formatDate(date)} · {window}</strong></div><div><small>ADDRESS</small><strong>{address}</strong></div><div><small>INSTRUCTIONS</small><strong>{instructions || 'None added'}</strong></div><p>Nothing is scheduled yet. We’ll confirm the appointment with you.</p></div>}
      {error && <p className="error-message" role="alert">{error}</p>}<div className="dialog-actions">{review && <button type="button" className="button button-outline" onClick={() => setReview(false)}>Back to edit</button>}<button type="button" className="text-link" onClick={onClose}>Cancel</button><button type="submit" disabled={busy || (!eligible.length && !review)} className="button button-primary">{busy ? 'Saving…' : review ? 'Submit request' : 'Review request'} <span aria-hidden="true">→</span></button></div>
    </form>
  </section></div>
}

export function Portal() {
  const location = useLocation()
  const params = useParams<{ toteId: string }>()
  const [data, setData] = useState<DemoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [requestKind, setRequestKind] = useState<RequestKind | null>(new URLSearchParams(location.search).has('cancelPackage') ? 'Return delivery' : null)
  const [addingTote, setAddingTote] = useState(false)
  const [editing, setEditing] = useState(false)
  const [nickname, setNickname] = useState('')
  const [description, setDescription] = useState('')
  const [combinedContentsValue, setCombinedContentsValue] = useState('')
  const [contentsAcknowledged, setContentsAcknowledged] = useState(false)
  const [notice, setNotice] = useState('')

  async function refresh() {
    setLoading(true); setError('')
    try { setData(await toteKeeperService.getDemoData()) } catch { setError('The demo data could not be loaded. Try again.') }
    finally { setLoading(false) }
  }
  useEffect(() => {
    let active = true
    void toteKeeperService.getDemoData().then((result) => { if (active) setData(result) }).catch(() => { if (active) setError('The demo data could not be loaded. Try again.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const path = location.pathname.replace(/\/$/, '') || '/portal'
  const toteId = params.toteId ?? (path.startsWith('/portal/totes/') ? path.split('/').at(-1) : undefined)
  const tote = data?.totes.find((item) => item.id === toteId)
  const stored = data?.totes.filter((item) => item.status === 'In storage').length ?? 0
  const home = data?.totes.filter((item) => item.status === 'At home').length ?? 0
  const allocated = data ? allocatedCredits(data) : 0
  const available = data ? Math.max(0, data.profile.planCreditAllowance - allocated) : 0
  const pageTitle = path.includes('/totes/') ? 'Tote details' : path === '/portal/totes' ? 'My totes' : path === '/portal/requests' ? 'Requests & appointments' : path === '/portal/plan' ? 'My packages' : path === '/portal/profile' ? 'Profile & service address' : 'Your space, at a glance'

  async function reset() {
    setData(await toteKeeperService.resetDemo()); setNotice('Demo data reset. No real information is stored.'); window.setTimeout(() => setNotice(''), 4000)
  }
  async function complete(id: string) { try { await toteKeeperService.simulateCompletedRequest(id); await refresh(); setNotice('Simulated handoff complete; no actual appointment occurred.') } catch (caught) { setError((caught as Error).message) } }
  async function cancel(id: string) {
    try { await toteKeeperService.cancelRequest(id); await refresh() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to cancel the request.') }
  }
  async function saveTote(event: FormEvent) {
    event.preventDefault()
    if (!tote) return
    const value = combinedContentsValue === '' ? undefined : Number(combinedContentsValue)
    if (contentsAcknowledged && (value === undefined || !Number.isFinite(value) || value < 0 || value > SERVICE_CONFIG.maxCombinedToteContentsValue || !description.trim())) {
      setError(`To acknowledge this tote, enter a contents description and combined value of $${SERVICE_CONFIG.maxCombinedToteContentsValue} or less.`)
      return
    }
    try { await toteKeeperService.saveTote(tote.id, { nickname, description, combinedContentsValue: value, contentsAcknowledged }); await refresh(); setEditing(false); setNotice('Tote details saved in this demo on this device.') } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to save tote details.') }
  }

  return <div className="portal-page">
    <header className="portal-topbar"><Brand /><div className="portal-top-actions"><span className="demo-label"><i /> DEMO MODE</span><Link to="/" className="back-home">Back to website <span>↗</span></Link></div></header>
    <div className="demo-banner"><span>DEMO PORTAL</span> You’re exploring with fictional data. No real account or password is used. <button onClick={() => void reset()}>Reset demo</button></div>
    <div className="portal-shell"><aside className="portal-sidebar"><div className="member-card"><span className="member-avatar">{data?.profile.name.split(' ').map((word) => word[0]).join('')}</span><div><strong>{data?.profile.name ?? 'Demo customer'}</strong><small>Customer account</small></div></div><nav aria-label="Customer portal">{navItems.map((item) => <NavLink end={item.to === '/portal'} to={item.to} key={item.to} className={({ isActive }) => `portal-nav-link${isActive ? ' is-active' : ''}`}><span aria-hidden="true">{item.icon}</span>{item.label}</NavLink>)}</nav><div className="sidebar-help"><span aria-hidden="true">✳</span><strong>We’re right here.</strong><p>Request at least 48 hours ahead. Evening and weekend appointments are available. Preferred times need confirmation. Contact Blake at blake@totekeeper.com or 262-880-4570. This is a fictional demo.</p></div><p className="security-note">Fictional demo only. No real bookings or payments are made. Contact Blake for service.</p></aside>
      <main className="portal-content"><div className="portal-heading"><div><p className="eyebrow">MY TOTE KEEPER · OCTAGON PREVIEW</p><h1>{pageTitle}</h1></div>{(path === '/portal' || path === '/portal/totes') && <div className="portal-actions">{path === '/portal/totes' && <button className="button button-outline" onClick={() => setAddingTote(true)}>Add demo tote</button>}<button className="button button-outline" onClick={() => setRequestKind('Collection')}>Request collection</button><button className="button button-primary" onClick={() => setRequestKind('Return delivery')}>Request return <span>→</span></button></div>}</div>
        {notice && <p className="portal-notice" role="status">{notice}</p>}{error && <p className="error-message" role="alert">{error} <button onClick={() => void refresh()}>Try again</button></p>}
        {loading ? <div className="loading-state" role="status"><span className="loader" />Loading your demo totes…</div> : !data ? <div className="empty-state"><h2>Demo data unavailable</h2><button className="button button-primary" onClick={() => void refresh()}>Try again</button></div> : <>
          {path === '/portal' && <>
            <section className="welcome-panel"><div><span className="welcome-sun" aria-hidden="true">✳</span><p className="eyebrow">A LITTLE ROOM TO BREATHE</p><h2>Howdy, {data.profile.name.split(' ')[0]}.</h2><p>Your totes are right where they should be. Here’s the latest.</p></div><span className="welcome-illustration" aria-hidden="true">▰<small>▰</small></span></section>
            <div className="stat-row"><div><span>▧</span><small>IN STORAGE</small><strong>{stored} <em>totes</em></strong></div><div><span>⌂</span><small>AT HOME</small><strong>{home} <em>totes</em></strong></div><div><span>◇</span><small>YOUR PACKAGES</small><strong>{data.packages.length} <em>independent</em></strong></div></div>
            <section className="portal-section"><div className="portal-section-title"><div><p className="eyebrow">YOUR TOTES</p><h2>All accounted for.</h2></div><Link to="/portal/totes" className="text-link">See all totes →</Link></div><p className="credit-allocation-summary"><strong>{allocated} of {data.profile.planCreditAllowance} credits allocated · {data.totes.length} totes</strong><span>{available} credits in total across separate packages; assignments cannot pool allowances. Credits stay allocated at home.</span></p>{allocated > data.profile.planCreditAllowance && <p className="credit-capacity-error" role="status">These existing fictional tote assignments exceed this plan allowance. Review assignments within each package.</p>}<div className="portal-tote-list">{data.totes.slice(0, 3).map((item) => <ToteCard key={item.id} tote={item} />)}</div></section>
            <section className="portal-section"><div className="portal-section-title"><div><p className="eyebrow">UP NEXT</p><h2>Requests &amp; appointments</h2></div><Link to="/portal/requests" className="text-link">View history →</Link></div><RequestList requests={data.requests.slice(0, 2)} totes={data.totes} onCancel={cancel} onComplete={complete} /></section>
          </>}
          {path === '/portal/totes' && <><p className="credit-allocation-summary"><strong>{allocated} of {data.profile.planCreditAllowance} credits allocated · {data.totes.length} totes</strong><span>{available} credits in total across separate packages. Each tote belongs to one package.</span></p>{allocated > data.profile.planCreditAllowance && <p className="credit-capacity-error" role="status">These existing fictional tote assignments exceed this plan allowance. Review assignments within each package.</p>}<section className="portal-totes-grid">{data.totes.map((item) => <ToteCard key={item.id} tote={item} />)}</section></>}
          {path.startsWith('/portal/totes/') && <ToteDetail tote={tote} editing={editing} setEditing={setEditing} nickname={nickname} setNickname={setNickname} description={description} setDescription={setDescription} combinedContentsValue={combinedContentsValue} setCombinedContentsValue={setCombinedContentsValue} contentsAcknowledged={contentsAcknowledged} setContentsAcknowledged={setContentsAcknowledged} onSave={saveTote} onRequest={(kind) => setRequestKind(kind)} />}
          {path === '/portal/requests' && <section className="portal-section"><div className="portal-section-title"><div><p className="eyebrow">YOUR ACTIVITY</p><h2>Requests &amp; appointments</h2><p className="subtle">Preferred dates are separate from confirmed appointments.</p></div></div><RequestList requests={data.requests} totes={data.totes} onCancel={cancel} onComplete={complete} /></section>}
          {path === '/portal/plan' && <PackagesPanel data={data} refresh={refresh} />}
          {path === '/portal/profile' && <section className="profile-panel"><p className="eyebrow">YOUR DETAILS</p><h2>Profile &amp; service address</h2><p className="subtle">Fictional demo profile. Editing is not connected to an account service.</p><dl><div><dt>Name</dt><dd>{data.profile.name}</dd></div><div><dt>Email</dt><dd>{data.profile.email}</dd></div><div><dt>Service address</dt><dd>{data.profile.address}<br />{data.profile.city} {data.profile.zip}</dd></div></dl><button className="button button-outline" onClick={() => setNotice('Profile editing is not connected in this demo.')}>Edit profile unavailable</button></section>}
        </>}
      </main>
    </div>
    <footer className="portal-footer"><span>My Tote Keeper</span><span>All times shown in America/Chicago</span></footer>
    {requestKind && data && <RequestDialog kind={requestKind} data={data} onClose={() => setRequestKind(null)} onCreated={() => { setRequestKind(null); void refresh(); setNotice('Request submitted: Awaiting confirmation. Your preferred date is not a confirmed appointment.') }} />}
    {addingTote && data && <AddToteDialog data={data} onClose={() => setAddingTote(false)} onAdded={() => { setAddingTote(false); void refresh(); setNotice('Fictional tote added to this demo account.') }} />}
  </div>
}

function RequestList({ requests, totes, onCancel, onComplete }: { requests: DemoData['requests']; totes: Tote[]; onCancel: (id: string) => void; onComplete: (id: string) => Promise<void> }) {
  if (!requests.length) return <div className="empty-state"><span aria-hidden="true">✳</span><h3>No requests just yet</h3><p>When you request a tote collection or return, it’ll show up here.</p></div>
  return <div className="request-list">{requests.map((request) => <article className="request-row" key={request.id}><div className="request-type-mark" aria-hidden="true">{request.kind === 'Collection' ? '↗' : '⌂'}</div><div className="request-main"><strong>{request.kind} ? {request.purpose ?? 'Packed belongings'}</strong><small>{request.packageId} ? {request.cycleId}</small><p>{totes.filter((item) => request.toteIds.includes(item.id)).map((item) => item.nickname).join(', ') || 'Tote details unavailable'}</p><small>Requested {request.createdAt} · Ref {request.id}</small></div><div className="request-timing"><small>{request.confirmedAppointment ? 'CONFIRMED APPOINTMENT' : 'PREFERRED DATE'}</small><strong>{request.confirmedAppointment ?? `${formatDate(request.preferredDate)} · ${request.preferredWindow}`}</strong>{request.confirmedAppointment && <small>America/Chicago</small>}</div><div className="request-status"><StatusPill>{request.status}</StatusPill>{request.status === 'Awaiting confirmation' && <button className="cancel-request" onClick={() => onCancel(request.id)}>Cancel request</button>}{request.status === 'Awaiting confirmation' && <button className="cancel-request" onClick={() => void onComplete(request.id)}>Simulate completed handoff</button>}</div></article>)}</div>
}

function ToteDetail({ tote, editing, setEditing, nickname, setNickname, description, setDescription, combinedContentsValue, setCombinedContentsValue, contentsAcknowledged, setContentsAcknowledged, onSave, onRequest }: { tote?: Tote; editing: boolean; setEditing: (value: boolean) => void; nickname: string; setNickname: (value: string) => void; description: string; setDescription: (value: string) => void; combinedContentsValue: string; setCombinedContentsValue: (value: string) => void; contentsAcknowledged: boolean; setContentsAcknowledged: (value: boolean) => void; onSave: (event: FormEvent) => void; onRequest: (kind: RequestKind) => void }) {
  const [concernOpen, setConcernOpen] = useState(false)
  if (!tote) return <div className="empty-state"><h2>Tote not found</h2><Link to="/portal/totes" className="text-link">Back to my totes</Link></div>
  const toteCreditCost = creditsForToteSize(tote.size)
  const size = SERVICE_CONFIG.toteSizes[tote.size]
  const collectedMovement = tote.history.find((movement) => movement.label === 'Collected')
  return <div className="tote-detail-layout"><div><Link to="/portal/totes" className="text-link back-link">← All totes</Link><section className="tote-detail-card"><div className="tote-detail-top"><img className="portal-product-image" src={size.image} alt={size.imageAlt} /><div><p className="eyebrow">{tote.id}</p><StatusPill>{tote.status}</StatusPill></div><button className="text-link" onClick={() => { setNickname(tote.nickname); setDescription(tote.description); setCombinedContentsValue(tote.combinedContentsValue === undefined ? '' : String(tote.combinedContentsValue)); setContentsAcknowledged(tote.contentsAcknowledged ?? false); setEditing(!editing) }}>{editing ? 'Close editor' : 'Edit details'}</button></div>
    {editing ? <form className="tote-edit-form" onSubmit={onSave}><label>Nickname<input required value={nickname} onChange={(event) => setNickname(event.target.value)} /></label><p className="tote-credit-detail"><span className={`size-badge size-${tote.size}`}>{SERVICE_CONFIG.toteSizes[tote.size].name}</span><strong>{creditsForToteSize(tote.size)} {creditsForToteSize(tote.size) === 1 ? 'credit' : 'credits'} allocated</strong></p><label>Contents description<textarea rows={3} required value={description} onChange={(event) => { setDescription(event.target.value); setContentsAcknowledged(false) }} /></label><label>Combined contents value (maximum ${SERVICE_CONFIG.maxCombinedToteContentsValue})<input type="number" min="0" max={SERVICE_CONFIG.maxCombinedToteContentsValue} step="0.01" value={combinedContentsValue} onChange={(event) => { setCombinedContentsValue(event.target.value); setContentsAcknowledged(false) }} /></label><p className="contents-value-note">The cap is the combined value of everything in this physical tote, not a per-item allowance. An XL tote still has the same proposed $200 contents limit as a Large tote.</p><label className="policy-ack"><input type="checkbox" checked={contentsAcknowledged} onChange={(event) => setContentsAcknowledged(event.target.checked)} /><span>{TOTE_CONTENTS_ACKNOWLEDGMENT.replace('the packing guidelines', 'the')} <a href="/#packing-guidelines" target="_blank" rel="noreferrer">packing guidelines</a></span></label><button className="button button-primary">Save tote details</button></form> : <><p className="eyebrow">{tote.category}</p><h2>{tote.nickname}</h2><p>{tote.description}</p><p className="tote-credit-detail"><span className={`size-badge size-${tote.size}`}>{SERVICE_CONFIG.toteSizes[tote.size].name}</span><strong>{creditsForToteSize(tote.size)} {creditsForToteSize(tote.size) === 1 ? 'storage credit' : 'storage credits'}</strong></p>{tote.combinedContentsValue !== undefined && <p className="seal-number">Declared combined contents value <strong>${tote.combinedContentsValue.toFixed(2)}</strong></p>}{tote.currentSealNumber && <p className="seal-number">Current numbered seal <strong>{tote.currentSealNumber}</strong></p>}{tote.priorSealNumbers?.length ? <p className="seal-number">Previous seal numbers <strong>{tote.priorSealNumbers.join(', ')}</strong></p> : null}
    <div className="inventory-preview"><strong>Photo inventory</strong><p>Planned account feature: add photos of your belongings to each tote. Photo uploads are not available in this demo.</p></div></>}
    <div className="tote-detail-actions">{tote.status === 'At home' ? <button className="button button-primary" onClick={() => onRequest('Collection')}>Request collection →</button> : <button className="button button-primary" onClick={() => onRequest('Return delivery')}>Request return →</button>}<button className="button button-outline" onClick={() => setConcernOpen(true)}>Report a concern</button></div>{tote.currentSealNumber && <p className="seal-number">Current numbered seal <strong>{tote.currentSealNumber}</strong></p>}{tote.priorSealNumbers?.length ? <p className="seal-number">Previous seal numbers <strong>{tote.priorSealNumbers.join(', ')}</strong></p> : null}
    <p className="seal-limit-note">A tamper-evident seal can show signs of opening; it is not a lock or a guarantee against theft.</p></section>{collectedMovement && <CollectionReceipt tote={tote} sizeName={size.name} creditCost={toteCreditCost} />}</div><section className="movement-panel"><p className="eyebrow">TOTE ACTIVITY</p><h3>Movement history</h3><ol className="movement-list">{tote.history.map((movement, index) => <li key={`${movement.date}-${movement.label}-${index}`}><span className="movement-dot" /><div><strong>{movement.label}</strong><small>{movement.date}</small><p>{movement.detail}</p>{movement.operator && <p><strong>Operator:</strong> {movement.operator}</p>}{movement.sealNumber && <p><strong>Seal recorded:</strong> {movement.sealNumber}</p>}{movement.exteriorCondition && <p><strong>Exterior:</strong> {movement.exteriorCondition}</p>}{movement.photoStatus && <p className="photo-placeholder">Photo: {movement.photoStatus}</p>}</div>{index === 0 && <span className="latest-tag">LATEST</span>}</li>)}</ol><p className="subtle">These fictional demo records show exterior handoff details only. They do not verify tote contents, contents condition, or declared value.</p><p className="subtle">Opening a sealed tote, if needed for safety or another reason permitted by finalized terms, and recording a replacement seal is a proposed process pending agreement terms.</p></section>{concernOpen && <ConcernDialog tote={tote} onClose={() => setConcernOpen(false)} />}</div>
}

function CollectionReceipt({ tote, sizeName, creditCost }: { tote: Tote; sizeName: string; creditCost: number }) {
  const collection = tote.history.find((movement) => movement.label === 'Collected')
  if (!collection) return null
  return <details className="collection-receipt"><summary>View collection receipt <span>DEMO</span></summary><div className="receipt-body"><h3>Collection receipt · fictional demo</h3><dl><div><dt>Tote</dt><dd>{tote.id} · {sizeName} · {creditCost} {creditCost === 1 ? 'credit' : 'credits'}</dd></div><div><dt>Collection date</dt><dd>{collection.date}</dd></div><div><dt>Operator</dt><dd>{collection.operator ?? 'Demo operator (fictional)'}</dd></div><div><dt>Seal number</dt><dd>{collection.sealNumber ?? 'No seal recorded in this older demo entry'}</dd></div><div><dt>Exterior condition</dt><dd>{collection.exteriorCondition ?? 'Not recorded'}</dd></div></dl><div className="receipt-photo">Exterior handoff photo placeholder <small>{collection.photoStatus ?? 'No photo uploaded or stored'}</small></div><p>An exterior check does not verify tote contents, contents condition, or their value. This receipt is fictional demo data, not a live business record.</p></div></details>
}

function ConcernDialog({ tote, onClose }: { tote: Tote; onClose: () => void }) {
  const [category, setCategory] = useState<'Damage' | 'Missing item' | 'Seal discrepancy' | 'Pest concern' | 'Other'>('Damage')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [disclosure, setDisclosure] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setDisclosure(false)
    try {
      await toteKeeperService.reportConcern({ toteId: tote.id, category, description })
      setDisclosure(true)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The demo could not prepare this concern.') }
  }

  return <div className="dialog-backdrop" role="presentation" onKeyDown={(event) => { if (event.key === 'Escape') onClose() }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="request-dialog" role="dialog" aria-modal="true" aria-labelledby="concern-title"><button type="button" className="dialog-close" onClick={onClose} aria-label="Close concern report" autoFocus>×</button><p className="eyebrow">DEMO ONLY</p><h2 id="concern-title">Report a concern</h2><p>For tote {tote.id} · {tote.nickname}</p><p className="demo-disclosure">Prototype only. Nothing will be sent or saved. For real concerns contact Blake at blake@totekeeper.com or 262-880-4570.</p><form onSubmit={submit}><label>Concern type<select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}><option>Damage</option><option>Missing item</option><option>Seal discrepancy</option><option>Pest concern</option><option>Other</option></select></label><label>What happened?<textarea required rows={4} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe what you noticed" /></label>{error && <p className="error-message" role="alert">{error}</p>}{disclosure && <p className="portal-notice" role="status">Demo preview only: your concern was not sent or saved. Contact blake@totekeeper.com or 262-880-4570 for real concerns.</p>}<div className="dialog-actions"><button type="button" className="text-link" onClick={onClose}>Close</button><button type="submit" className="button button-outline">Preview concern (demo only)</button></div></form></section></div>
}
