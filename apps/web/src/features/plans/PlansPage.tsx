import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Brand } from '../../components/Brand'
import { OWNER, POLICY, SERVICE_CONFIG, formatMonthlyEquivalent, formatUsd, TOTE_LIABILITY_DISCLOSURE } from '../../config/commercial'
import { PolicyLinks } from '../policies/PolicyPage'
import { planImages } from './imageManifest'
import { PlanVisual } from './PlanVisual'
import { inquiryLink, planUseCases, toteMixes } from './planContent'
import './plans.css'

const sectionLinks = [
  ['choose-plan', 'Choose your plan'], ['meet-totes', 'Meet the totes'], ['included', 'What every plan includes'],
  ['typical-year', 'A typical year of storage'], ['partial-return', 'Getting some things back sooner'],
  ['bulky', 'Bulky items'], ['important', 'Important things to know'], ['get-plan', 'Get my storage plan'],
] as const

export function PlansPage() {
  const location = useLocation()
  useEffect(() => {
    const previous = document.title
    document.title = 'Plans & details | My Tote Keeper'
    return () => { document.title = previous }
  }, [])
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const id = location.hash.slice(1)
      const target = document.getElementById(id || 'plans-title')
      if (target) { target.scrollIntoView({ block: 'start', behavior: 'instant' }); target.focus({ preventScroll: true }) }
      else window.scrollTo({ top: 0, behavior: 'instant' })
    })
    return () => cancelAnimationFrame(frame)
  }, [location.hash, location.key])

  return <>
    <a className="policy-skip" href="#plans-main">Skip to plans</a>
    <header className="site-header"><div className="header-inner"><Brand /><nav aria-label="Plans navigation"><Link to="/#plans">Back to homepage</Link><Link className="button button-primary" to={inquiryLink('undecided')}>Get my storage plan</Link></nav></div></header>
    <main className="plans-page" id="plans-main">
      <p className="eyebrow">A LITTLE MORE ROOM. A LITTLE MORE DETAIL.</p>
      <h1 id="plans-title" tabIndex={-1}>Plans &amp; details</h1>
      <p className="plans-intro">Keep the decorations. Skip the attic expedition. Choose space for your seasonal belongings, then meet us at the door. You bring packed belongings to the agreed outdoor handoff; we don’t enter your home.</p>
      <nav className="plans-contents" aria-label="On this page">{sectionLinks.map(([id, title]) => <Link key={id} to={`/plans#${id}`}>{title}</Link>)}</nav>

      <section aria-labelledby="choose-plan"><h2 id="choose-plan" tabIndex={-1}>Choose your plan</h2>
        <p>Annual prices below are billed once a year. Monthly equivalents help you compare; they are not monthly payment plans.</p>
        <div className="plan-comparison"><table><caption>Annual plan comparison</caption><thead><tr><th scope="col">Plan</th><th scope="col">Tote space</th><th scope="col">Annual price</th></tr></thead><tbody>{SERVICE_CONFIG.plans.map(plan => <tr key={plan.id}><th scope="row"><Link to={`/plans#${plan.id}`}>{plan.name}</Link>{plan.featured && <span className="detail-value">Best value</span>}</th><td>{plan.credits} Large or {plan.credits / SERVICE_CONFIG.toteSizes.xl.credits} XL</td><td>{formatUsd(plan.annualPrice)}<small>About {formatMonthlyEquivalent(plan.annualPrice)}/month, billed annually</small></td></tr>)}</tbody></table></div>
        <p>Mixing sizes? A Large uses one space credit and an XL uses two. Use the combinations below; you don’t need to do the tote math.</p>
        <Link className="text-link" to={inquiryLink('undecided')}>Help me decide</Link>
        <div className="detail-plan-list">{SERVICE_CONFIG.plans.map(plan => <article className="detail-plan" key={plan.id} aria-labelledby={plan.id}>
          <div><p className="eyebrow">{plan.featured ? 'BEST VALUE' : plan.note}</p><h3 id={plan.id} tabIndex={-1}>{plan.name}</h3>
            <p className="detail-annual">{formatUsd(plan.annualPrice)}<span> / year</span></p><p>About {formatMonthlyEquivalent(plan.annualPrice)}/month equivalent, billed annually.</p>
            <p><strong>Up to {plan.credits} Large totes or {plan.credits / SERVICE_CONFIG.toteSizes.xl.credits} XL totes.</strong> Choose a mix below, or use fewer totes.</p>
            <p className="detail-mixes"><strong>Full-plan combinations:</strong> {toteMixes(plan.credits).join(' · ')}.</p>
            <p>Tote use, initial empty-tote delivery, one packed collection and one packed return each service year, plus the associated empty-tote collection and redelivery.</p>
            {plan.id === 'big' && <p><strong>Annual Big also includes one eligible standard bulky item</strong> on its included visits, subject to handling approval. No extra trip is included.</p>}
            <p><strong>Picture it:</strong> {planUseCases[plan.id]} This is illustrative; what fits depends on the size, shape and packing of your belongings.</p>
            <Link className="button button-primary" to={inquiryLink(plan.id)}>Get my storage plan<span className="sr-only"> — {plan.name}</span></Link>
          </div><PlanVisual image={planImages[plan.id]} />
        </article>)}</div>
      </section>

      <section aria-labelledby="meet-totes"><h2 id="meet-totes" tabIndex={-1}>Meet the totes</h2><div className="detail-totes">
        <div>{Object.values(SERVICE_CONFIG.toteSizes).map(tote => <div key={tote.id} className="detail-tote-spec"><h3>{tote.name}</h3><p>About {tote.capacityGallons} gallons. {tote.description}</p><p>Inside: {tote.interiorDimensionsLabel}. These are approximate dimensions; shape and packing affect fit.</p></div>)}<p>An XL holds about twice as much as a Large. The listed dimensions are your fit reference; a planned image is not proof that a particular item will fit.</p></div>
        <PlanVisual image={planImages.toteComparison} />
      </div></section>

      <section aria-labelledby="included"><h2 id="included" tabIndex={-1}>What every plan includes</h2>
        <ul className="detail-included"><li>Use of company-owned totes and initial empty-tote delivery.</li><li>One collection of packed belongings and one packed return during the service year.</li><li>Collection of empty totes while you use your belongings, and redelivery of those empties for repacking, as part of that service cycle.</li><li>Dry, climate-controlled storage and scheduled doorstep or driveway handoffs. No home entry.</li></ul>
        <p>Empty-tote handling is part of the included cycle, not unlimited on-demand visits. A partial return uses the plan’s included return visit. Additional packed return-and-recollection cycles cost <strong>{formatUsd(POLICY.extraCyclePrice)} for both legs together</strong>.</p>
        <p>Totes remain company property and must be emptied and returned when service ends. Their space stays assigned to your plan while the totes are at home. Need more space? Ask about another plan; each has its own allowance and included visits.</p>
      </section>

      <section aria-labelledby="typical-year"><h2 id="typical-year" tabIndex={-1}>A typical year of storage</h2>
        <p>A seasonal example: your holiday decorations need somewhere else to spend the summer. Timing is illustrative, not an extra collection promise.</p>
        <ol className="storage-year"><li><strong>Empty totes arrive.</strong> We agree on an appointment and deliver the company totes.</li><li><strong>Pack at your pace.</strong> Ask Blake to wait, come back later, or collect after the season. Timing needs confirmation; there’s no fixed packing deadline.</li><li><strong>Packed collection.</strong> Once your decorations are ready, we confirm the collection and meet at your doorstep or driveway.</li><li><strong>Somewhere else for the off-season.</strong> Your belongings wait in climate-controlled storage.</li><li><strong>Bring the holidays home.</strong> Request a return appointment. This uses the plan’s included packed-return visit.</li><li><strong>After unpacking.</strong> Arrange collection of the empty company totes and redelivery for repacking as part of the included cycle. Another packed collection is not automatically an extra free visit; ask about your remaining service or an additional cycle.</li></ol>
        <div className="detail-gallery"><PlanVisual image={planImages.crowdedGarage} /><PlanVisual image={planImages.reclaimedGarage} /><PlanVisual image={planImages.attic} /><PlanVisual image={planImages.handoff} /></div>
      </section>

      <section aria-labelledby="partial-return"><h2 id="partial-return" tabIndex={-1}>Getting some things back sooner</h2>
        <p>Need the winter clothes before the decorations? You can request only those totes. That partial return uses the plan’s included packed-return visit, not one free return per tote. The other totes can remain in storage.</p>
        <p>A later packed return and subsequent recollection is an additional <strong>{formatUsd(POLICY.extraCyclePrice)} round trip, covering both legs</strong>. Confirm which totes and appointments it covers with Blake before booking. Empty-tote handling is separate from this paid packed-belongings cycle.</p>
        <p>Request pickup or delivery at least {POLICY.scheduling.noticeHours} hours ahead. We’ll confirm your appointment. This is minimum advance notice, not a guaranteed appointment or delivery deadline. Evening and weekend appointments are available subject to scheduling. Size swaps can be arranged at no added swap charge during an already scheduled visit, within your plan’s allowance.</p>
      </section>

      <section aria-labelledby="bulky"><h2 id="bulky" tabIndex={-1}>Bulky items</h2>
        <p>The tree that won’t take a hint? Ask about a separately registered bulky item. Standard packed size is up to {POLICY.bulky.envelopeInches.join(' × ')} inches; handling approval is required. Each bag is registered separately, and anything outside that size or handling ability needs a custom quote.</p>
        <p>Annual Big includes one eligible standard item on the plan’s included visits, without an extra trip. Other standard items cost <strong>{formatUsd(POLICY.bulky.addOnAnnualPrice)}/year</strong> with tote appointments, or <strong>{formatUsd(POLICY.bulky.standaloneAnnualPrice)}/year</strong> standalone with one collection and one return.</p>
        <p>A quote does not override packing restrictions or add tote space. Bulky-item liability and numerical weight limits are not finalized; the tote liability limit does not automatically apply.</p><Link className="text-link" to={inquiryLink('bulky')}>Ask about a bulky item</Link>
      </section>

      <section aria-labelledby="important"><h2 id="important" tabIndex={-1}>Important things to know</h2>
        <ul><li><strong>Billing:</strong> annual prices are billed annually with automatic renewal; the published policy calls for an annual reminder {POLICY.renewal.annualReminderDays} days ahead. Actual monthly billing is not finalized.</li><li><strong>Visits:</strong> one packed collection and one packed return per service year; a partial return uses that return. Extra packed return-and-recollection cycles are {formatUsd(POLICY.extraCyclePrice)} for both legs, not per tote or per leg.</li><li><strong>Area:</strong> Buda, Kyle and South Austin, subject to exact-address review and availability. A ZIP code alone does not approve service.</li><li><strong>Scheduling:</strong> at least {POLICY.scheduling.noticeHours} hours’ notice, operator confirmation, no home entry. Do not assume an unattended handoff is authorized.</li><li><strong>Packing:</strong> clean, dry, permitted everyday belongings only. Keep cash, jewelry, important documents and irreplaceable items at home. The current published tote weight is up to {SERVICE_CONFIG.maxPackedToteWeightPounds} lb; confirm handling needs with Blake.</li></ul>
        <p>{TOTE_LIABILITY_DISCLOSURE} This is not insurance or an automatic payout.</p>
        <p>Published cancellation policy: no cancellation penalty; future renewals stop, one free final return is coordinated immediately, and the committed annual year is not refunded. Confirm return timing and final terms before booking; the agreement is still a draft.</p>
        <p>Terms are still drafts. Read the <Link to="/policies/storage-agreement">draft Storage Agreement</Link> and <Link to="/policies/packing">draft Packing and Prohibited Items policy</Link>. Cancellation timing, final-return arrangements and some handling rules need confirmation before any agreement or payment. An inquiry creates neither.</p>
      </section>

      <section className="detail-contact" aria-labelledby="get-plan"><h2 id="get-plan" tabIndex={-1}>Get my storage plan</h2><p>Tell Blake what’s taking over your space. We’ll review the fit, address, pricing and timing before you commit.</p><div className="detail-actions">{SERVICE_CONFIG.plans.map(plan => <Link className="button button-primary" key={plan.id} to={inquiryLink(plan.id)}>{plan.name} — get my storage plan</Link>)}<Link className="text-link" to={inquiryLink('undecided')}>Help me decide</Link></div><p>Prefer to talk? <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a> · <a href={OWNER.phoneHref}>{OWNER.phone}</a></p></section>
    </main>
    <footer className="site-footer"><Brand light /><Link to="/#plans">Back to homepage plans</Link><PolicyLinks /></footer>
  </>
}
