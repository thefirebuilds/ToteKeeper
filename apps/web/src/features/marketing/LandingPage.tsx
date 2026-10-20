import { customerPortalLink, enrollmentLink } from '../../config/customerPortal'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { PolicyLinks } from '../policies/PolicyPage'
import { Brand } from '../../components/Brand'
import { creditsForToteMix, formatMonthlyEquivalent, formatUsd, OWNER, POLICY, SERVICE_CONFIG, smallestPlanForCredits } from '../../config/business'
import { POLICY_FAQS } from '../../config/policyCopy'
import { InquiryForm } from './InquiryForm'
import { selectionFromSearch, type InquirySelection } from './inquiryContext'
import storageScenesImage from '../../assets/images/storage-scenes.svg'
import oversizedStoriesImage from '../../assets/images/oversized-stories.svg'
import { PlanVisual } from '../plans/PlanVisual'
import { planImages } from '../plans/imageManifest'
import apartmentToteImage from '../../assets/images/apartment_tote.png'
import christmasToteImage from '../../assets/images/christmas_tote.png'
import halloweenToteImage from '../../assets/images/halloween_tote.png'
import treeBagImage from '../../assets/images/tree_bag.png'

const plans = SERVICE_CONFIG.plans.map((plan) => ({
  ...plan,
  yearly: formatUsd(plan.annualPrice),
  monthlyEquivalent: formatMonthlyEquivalent(plan.annualPrice),
}))

function CategoryArt({ kind }: { kind: string }) {
  if (kind === 'camping') return <svg viewBox="0 0 100 72" aria-hidden="true"><path d="M12 59 43 14l18 27 9-13 20 31H12Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="m43 14 7 45m-8-12 12-1M27 60l8-12m35-8 7 20" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="80" cy="15" r="6" fill="currentColor" opacity=".5"/></svg>
  if (kind === 'clothes') return <svg viewBox="0 0 100 72" aria-hidden="true"><path d="M50 17c-8 0-10-10-3-12 6-2 10 5 6 9m-3 5-23 12 9 10 8-5v27h31V36l8 5 9-10-23-12c-3 9-19 9-22 0Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/></svg>
  if (kind === 'creature') return <svg viewBox="0 0 100 72" aria-hidden="true"><path d="M20 58h60M30 58V34l6-9h28l7 9v24M43 35h1m15 0h1m-17 8h15m-14 8 5-4 5 4 5-4 4 4M37 25l4-9m21 9-4-9M31 34l-9-8m48 8 9-8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="m51 56 0 8m-11-1-7 4m18-3 0 4m11-5 7 3" fill="none" stroke="currentColor" strokeWidth="3"/></svg>
  if (kind === 'occasional') return <svg viewBox="0 0 100 72" aria-hidden="true"><path d="M22 31h56v35H22zM17 22h66v11H17zM50 22v44M50 22c-18 0-20-14-10-15 7-1 10 15 10 15Zm0 0c18 0 20-14 10-15-7-1-10 15-10 15Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="M34 43h7m18 0h7" stroke="currentColor" strokeWidth="3"/></svg>
  return <svg viewBox="0 0 100 72" aria-hidden="true"><path d="m50 7 27 52H23L50 7Zm0 12v36m-14-18h28m-21 9h14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="M50 7v52" stroke="currentColor" strokeWidth="1.5"/></svg>
}

const FAQS = POLICY_FAQS

export function LandingPage() {
  const location = useLocation()
  useEffect(() => {
    if (location.hash === '#interest') return
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(location.hash.slice(1))
      if (target) target.scrollIntoView({ block: 'start', behavior: 'instant' })
      else if (!location.hash) window.scrollTo({ top: 0, behavior: 'instant' })
    })
    return () => cancelAnimationFrame(frame)
  }, [location.hash, location.key])
  const [inquirySelection, setInquirySelection] = useState(() => selectionFromSearch(location.search))
  const [focusRequest, setFocusRequest] = useState(location.hash === '#interest' ? 1 : 0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [largeQuantity, setLargeQuantity] = useState(0)
  const [oversizedQuantity, setOversizedQuantity] = useState(0)
  const creditsRequired = creditsForToteMix(largeQuantity, oversizedQuantity)
  const suggestedPlan = smallestPlanForCredits(creditsRequired)

  function quantityValue(value: string) {
    if (value === '') return 0
    return Math.max(0, Math.floor(Number(value) || 0))
  }

  function startInquiry(selection: InquirySelection) {
    setInquirySelection(selection)
    setFocusRequest(previous => previous + 1)
    setMenuOpen(false)
  }

  return <>
    <header className="site-header">
      <div className="header-inner"><Brand />
        <button className="menu-toggle" aria-expanded={menuOpen} aria-label="Toggle navigation" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
        <nav className={menuOpen ? 'main-nav nav-open' : 'main-nav'} aria-label="Main navigation">
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a><a href="#plans" onClick={() => setMenuOpen(false)}>Plans</a><a href="#what-we-store" onClick={() => setMenuOpen(false)}>What we store</a><a href="#care" onClick={() => setMenuOpen(false)}>How we care</a><a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
          <a className="login-link" href={customerPortalLink('/accounts/login/')}>Sign in <span aria-hidden="true">↗</span></a>
          <a className="button button-primary header-inquiry" href={enrollmentLink()}>Get my storage plan</a>
        </nav>
      </div>
    </header>
    <main>
      <section className="hero section-wrap">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> YOUR STUFF. SOMEWHERE ELSE.</p>
          <h1>Keep the things.<br /><em>Reclaim the space.</em></h1>
          <p className="hero-text">Holiday decorations. Camping gear. That skeleton with absolutely no business being twelve feet tall.</p>
          <p className="hero-text hero-text-second">Get seasonal boxes out of the garage or closet. You bring packed totes and approved larger items to the agreed doorstep or driveway handoff; we collect, store and return them by appointment. No home entry.</p>
          <div className="hero-actions"><a className="button button-primary" href={enrollmentLink()}>Get my storage plan</a><a className="text-link" href="#plans">See plans</a></div>
          <p className="service-note"><span aria-hidden="true">⌖</span> Serving Buda, Kyle, and South Austin</p>
        </div>
        <div className="hero-benefit-visual"><PlanVisual image={planImages.reclaimedSpace} /></div>
      </section>

      <section className="proof-strip"><div><strong>DOORSTEP PICKUP &amp; DELIVERY</strong><span>Scheduled local handoffs</span></div><i /><div><strong>START SMALL</strong><span>2 large totes or 1 XL tote</span></div><i /><div><strong>NO HOME ENTRY</strong><span>Your door stays yours</span></div></section>

      <section className="how-section section-pad" id="how-it-works">
        <div className="section-heading"><p className="eyebrow">LESS STUFF UNDERFOOT. LESS RUNNING AROUND.</p><h2>You pack. <em>We’ll take it from here.</em></h2></div>
        <div className="steps-grid">
          {[
            ['01', 'Pack up the things taking over.', 'Fill your totes with the things you want to keep, just somewhere else. Label them so future-you knows which one has the lights.'],
            ['02', 'Meet us at the door.', 'We collect your packed totes and approved larger items from your doorstep or driveway. No home entry. Your belongings stay in climate-controlled storage.'],
            ['03', 'Call your stuff home.', 'Request all your totes or just the ones you need. We’ll confirm a return appointment and bring them back.'],
          ].map(([number, title, body]) => <article className="step" key={number}><span className="step-number">{number}</span><div className="step-icon" aria-hidden="true">{number === '01' ? '▧' : number === '02' ? '↗' : '⌂'}</div><h3>{title}</h3><p>{body}</p></article>)}
        </div>
        <p className="route-note">Request pickup or delivery at least 72 hours ahead. We’ll confirm your appointment. Evening and weekend appointments are available subject to scheduling; minimum notice is not a guaranteed appointment or delivery deadline.</p>
      </section>

      <section className="plans-section section-pad" id="plans">
        <div className="section-heading"><p className="eyebrow">A LITTLE SPACE. A SENSIBLE PLAN.</p><h2>Room for your things. <em>Room for you.</em></h2><p>Start at {formatUsd(SERVICE_CONFIG.plans[0].annualPrice)} a year. Choose your tote space; we'll handle the doorstep trips.</p><button type="button" className="button button-outline help-decide" onClick={() => startInquiry({ plan: 'undecided', source: 'help-decide', context: 'general' })}>Help me decide</button></div>
        <div className="plans-grid">{plans.map(plan => <article className={plan.featured ? 'plan-card plan-featured' : 'plan-card'} key={plan.id}>
          {plan.featured && <span className="popular-tag">BEST VALUE</span>}<span className="plan-count"><small>STORAGE PLAN</small></span><h3>{plan.name}</h3><p className="plan-note">{plan.note}</p>
          <p className="home-plan-capacity">Up to {plan.credits} Large totes</p><p className="plan-examples">{plan.examples}. Mix sizes to suit your things.</p>
          <div className="plan-price plan-annual-price">{plan.yearly}<small> / year</small></div><p className="plan-renewal">About {plan.monthlyEquivalent}/month equivalent, billed annually.</p>
          <ul className="plan-inclusions"><li>Tote use and initial empty-tote delivery</li><li>One packed collection and one return each service year</li><li>Associated empty-tote collection and redelivery</li>{plan.id === 'big' && <li>One eligible standard bulky item on included visits; approval required</li>}<li>Extra return-and-recollection cycle: {formatUsd(POLICY.extraCyclePrice)} for both legs</li></ul>
          <a className={plan.featured ? 'button button-primary' : 'button button-outline'} href={enrollmentLink(plan.id)}>Get my storage plan</a><Link className="home-plan-more" to={`/plans#${plan.id}`} aria-label={`Learn more about ${plan.name}`}>Learn more</Link>
        </article>)}</div>
        <div className="plans-details"><p>Annual billing with automatic renewal and a reminder 30 days ahead. A partial return uses your plan's included return visit. Empty-tote handling is part of the service cycle, not unlimited visits. Totes remain company property and must be returned when service ends.</p><p>Published cancellation policy: no cancellation penalty; future renewals stop and one free final return is coordinated immediately. The committed annual year is not refunded. Final return may be arranged after cancellation and no later than 30 calendar days after the last paid storage period ends, subject to the storage agreement.</p><p><Link to="/plans">See plans &amp; details</Link> for tote combinations, packing examples and how visits work. An active approved ZIP, available plan capacity and confirmed appointments are required. Review the <Link to="/policies/storage-agreement">storage agreement</Link> during enrollment. Inquiries create no subscription, payment or appointment.</p></div>
      </section>
      <section className="tote-sizes-section section-pad" id="tote-sizes">
        <div className="section-heading"><p className="eyebrow">TWO SIZES. PLENTY OF POSSIBILITIES.</p><h2>Meet the totes. <em>Make room for more.</em></h2><p>{SERVICE_CONFIG.toteCapacityComparison} Mix the sizes to suit your stuff.</p></div>
        <div className="tote-size-grid">{Object.values(SERVICE_CONFIG.toteSizes).map((size) => <article className="tote-size-card" key={size.id}>
          <img className="tote-product-image" src={size.image} alt={size.imageAlt} loading="lazy" />
          <div><h3>{size.name}</h3><p className="tote-capacity">About {Math.round(size.capacityGallons)} gallons</p><p className="tote-product-description">{size.description}</p>
            <span className="size-badge">{size.credits} {size.credits === 1 ? 'storage credit' : 'storage credits'}</span>
            <dl className="tote-product-specs"><div><dt>Room inside</dt><dd>{size.id === 'large' ? 'About 19 x 13 x 9 inches' : 'About 25 x 15 x 11 inches'}</dd></div><div><dt>Packed weight</dt><dd>Up to {SERVICE_CONFIG.maxPackedToteWeightPounds} lb per tote</dd></div></dl>
          </div>
        </article>)}</div>
        <p className="size-dimensions-note">Reusable totes and attached lids are included with annual plans. Capacity and inside dimensions are approximate; fit depends on what you pack. Photos are not to scale.</p>
        <section className="mix-selector" aria-labelledby="mix-selector-title"><div><p className="eyebrow">TRY A TOTE MIX</p><h3 id="mix-selector-title">How much space are we talking?</h3><p>Any mix works when Large count + 2 × XL count fits your plan credits.</p></div><div className="mix-inputs"><label>Large totes <input type="number" min="0" step="1" inputMode="numeric" value={largeQuantity} onChange={(event) => setLargeQuantity(quantityValue(event.target.value))} /></label><label>XL totes <input type="number" min="0" step="1" inputMode="numeric" value={oversizedQuantity} onChange={(event) => setOversizedQuantity(quantityValue(event.target.value))} /></label></div><div className="mix-result" aria-live="polite">{creditsRequired === 0 ? <strong>Choose your totes to see a plan.</strong> : suggestedPlan ? <><strong>{creditsRequired} {creditsRequired === 1 ? 'credit' : 'credits'} required</strong><span>{suggestedPlan.name} plan · {suggestedPlan.credits} credits · {formatUsd(suggestedPlan.annualPrice)}/year</span></> : <><strong>Build another package</strong><span>{creditsRequired} credits needed, above one Large package’s {SERVICE_CONFIG.plans[SERVICE_CONFIG.plans.length - 1].credits} credits.</span><button className="text-link" type="button" onClick={() => startInquiry({ plan: 'undecided', source: 'tote-mix', context: 'general' })}>Ask about more storage</button></>}</div></section></section>

      <section className="who-section section-pad" id="what-we-store"><div className="who-art"><img className="scene-illustration" src={storageScenesImage} alt="Illustration of a camping tent, a numbered storage tote, and a sleeping bag" loading="lazy" /></div><div className="who-copy"><p className="eyebrow">GOOD STUFF. BAD ROOMMATES.</p><h2>Some things don’t need <em>year-round square footage.</em></h2><p>Keep what you use sometimes. Give it somewhere else to wait.</p><div className="storage-examples">
          {[
            ['holiday', 'Holiday décor', 'Christmas gets a season. It doesn’t need the whole garage.'],
            ['camping', 'Camping & winter sports gear', 'Tents and clean, dry camping gear, plus skis, snowboards, and the rest of winter’s long-haul kit.'],
            ['clothes', 'Seasonal clothing', 'Coats, ski clothes, and the Texas winter wardrobe you wear twice.'],
            ['creature', 'Halloween creatures', 'Your skeleton can spend the off-season somewhere other than the guest room.'],
            ['occasional', 'Occasional-use things', 'Party supplies, hobby gear, and other things worth keeping. Just less immediately around.'],
          ].map(([kind, title, body]) => <article className="storage-example" key={kind}><span className="category-art"><CategoryArt kind={kind} /></span><span><strong>{title}</strong><small>{body}</small></span></article>)}
        </div><small className="acceptance-note">Everyday replaceable belongings only. Permitted belongings may be worth more than $250 per tote; value above the proposed liability limit is at your risk. Larger items need approval before pickup.</small></div></section>

      <section className="trust-section section-pad" id="care"><div className="section-heading"><p className="eyebrow">OWNER-OPERATED. PERSONALLY ACCOUNTABLE.</p><h2>Local storage. <em>A direct line.</em></h2><p>Work directly with the person keeping your things, from your first question to your next scheduled return.</p></div><div className="owner-panel owner-contact-panel"><div><p className="eyebrow">MEET YOUR TOTE KEEPER</p><h3>{OWNER.name}</h3><p>My Tote Keeper is a sole-proprietor, owner-operated business. A familiar name, a direct conversation, and a little more room at home.</p><p><a href={`mailto:${OWNER.email}`}>{OWNER.email}</a><br /><a href={OWNER.phoneHref}>{OWNER.phone}</a></p></div></div><div className="care-card-grid"><article><span>01</span><h3>Your question. A direct answer.</h3><p>Talk with Blake about your storage needs, packing and the handoff details before collection.</p></article><article><span>02</span><h3>Your pace. A confirmed appointment.</h3><p>Ask Blake to wait, return later or collect after the season. We agree on the timing, and you bring packed belongings to the outdoor handoff.</p><small>Keep packed totes at 50 lb or less; ask about anything difficult to carry. Ordinary damaged or broken totes are replaced by the business.</small></article><article><span>03</span><h3>Somewhere else for the off-season.</h3><p>Dry, climate-controlled storage, with belongings on shelves rather than floors. The operating temperature target is 55–80°F, and the facility provides pest control.</p><small>Pack clean, completely dry belongings and leave food and pest-attracting contents at home.</small></article></div></section>
      <section className="college-section section-pad" id="college-storage"><div className="college-copy"><p className="eyebrow">CAMPUS OUT. SUMMER ON.</p><h2>Going home for summer?<br /><em>Skip the dorm-room shuffle.</em></h2><p>Pack up the everyday dorm things you’ll want back next term. We can collect packed totes at the doorstep or driveway, keep them in climate-controlled storage, and arrange a return before classes start.</p><p>We don’t enter dorms or homes. Pickup and return need at least 72 hours’ notice and a confirmed appointment. Ask about address and calendar availability before planning a move.</p><button className="button button-primary" type="button" onClick={() => startInquiry({ plan: 'undecided', source: 'summer', context: 'summer' })}>Ask about summer storage <span aria-hidden="true">→</span></button></div><div className="college-art"><img src={apartmentToteImage} alt="Illustration of everyday kitchen belongings packed into a teal storage tote" loading="lazy" /></div></section>

      <section className="seasonal-renders" aria-label="Examples of tote contents for different seasons"><figure><img src={christmasToteImage} alt="Illustration of holiday decorations packed in a tote" loading="lazy" /><figcaption>Holiday decorations, packed for the off-season</figcaption></figure><figure><img src={halloweenToteImage} alt="Illustration of Halloween decorations packed in a tote" loading="lazy" /><figcaption>Halloween gear, ready for next October</figcaption></figure></section>

      <p className="size-dimensions-note">Lifestyle scenes are illustrative; containers shown may differ from our storage totes.</p><section className="belongings-section section-pad" id="packing-guidelines"><div className="belongings-heading"><p className="eyebrow">WHAT BELONGS HERE</p><h2>The garland. The lights.<br /><em>The extra blankets.</em></h2><p>We’re a good home for everyday things you can replace. Holiday decorations, seasonal clothing, spare bedding, and clean, dry camping gear are welcome. Keep Grandma’s china, collectible treasures, and irreplaceable keepsakes close to home.</p><p className="tote-value-limit">Store everyday belongings, even if their combined value exceeds $250. Our liability for loss or damage is limited to actual contents value, up to $250 per tote, subject to the <Link to="/policies/storage-agreement">storage agreement</Link>. Value above that limit is at your risk.</p><small>Subject to the storage agreement and applicable law. This is not insurance or an automatic $250 payment. Separately registered bulky items have their own $250 limit under the agreement.</small></div><div className="packing-callout"><span className="packing-icon" aria-hidden="true">✳</span><h3>Pack the lights. Leave the batteries.</h3><p>Clean, dry, and ready for their next season. Remove batteries from decorations and leave food, fuel, weapons, and hazardous materials out of your totes. Do not pack devices with built-in batteries.</p><details className="packing-details"><summary>Read the full packing guidelines</summary><div className="packing-guidelines-copy"><p><Link to="/policies/packing">Read the full Packing and Prohibited Items policy</Link>.</p><h4>Not accepted</h4><ul><li>Heirlooms or items with significant sentimental value.</li><li>Antiques, valuable collectibles, collectible figurines, fine china, valuable fragile items, jewelry, cash, securities, important original documents, or other irreplaceable belongings.</li><li>Food, beverages, pet food, perishables, plants, or anything that can spoil, leak, attract pests, or grow mold.</li><li>Firearms, ammunition, explosives, fireworks, weapons, fuel, propane cylinders, compressed-gas cartridges, lighter fluid, or other flammable or hazardous substances. Camping equipment must be empty of fuel. Fuel containers and cartridges are not accepted.</li><li>Loose batteries, power banks, portable power stations, automotive batteries, e-bike or scooter batteries. Remove all removable batteries, including from holiday lights and decorations, and do not put them in the tote.</li><li>Damaged, swollen, leaking, defective, or recalled batteries or devices containing them. Items with built-in, nonremovable batteries are prohibited.</li></ul><p>All belongings must be clean and completely dry before packing. These same restrictions apply to oversized items. A separate oversized quote does not override prohibited-content rules. Contact us before packing anything you are unsure about.</p></div></details></div></section>

      <section className="oversized-section section-pad" id="oversized"><div className="oversized-art"><img className="oversized-illustration" src={oversizedStoriesImage} alt="Illustration of packed oversized items including a long gear bag and disassembled skeleton decoration" loading="lazy" /></div><div className="oversized-copy"><p className="eyebrow">SEPARATELY QUOTED BULKY ITEMS</p><h2>Items that don’t fit in a tote.<br /><em>Quote them separately.</em></h2><p>An XL tote is a standardized container that uses two credits. This section is for items outside the tote system, like a bagged artificial tree or disassembled large decoration. These items do not automatically use tote credits.</p><p className="personality-line">Twelve feet of skeleton. Considerably less skeleton when packed.</p><div className="pricing-explainer"><h3>Bulky storage, without the guesswork</h3><p>Annual Large includes one standard bulky item on that package’s included visits, with no extra trip allowance. Other standard items are {formatUsd(POLICY.bulky.addOnAnnualPrice)}/year as an add-on with tote appointments, or {formatUsd(POLICY.bulky.standaloneAnnualPrice)}/year standalone including one collection and one return.</p><p>Standard packed envelope: 54 × 24 × 24 inches. Handling approval is required. Items outside those limits need a custom quote. The agreement states a separate $250 liability limit per registered bulky item, subject to actual proven compensable loss and the stated legal exceptions.</p></div><div className="tree-guidance"><img src={treeBagImage} alt="Artificial tree branches disassembled beside a zipped tree storage bag" loading="lazy" /><div><h3>Trees welcome. Rockefeller Center, call first.</h3><p>Standard tree storage accommodates one disassembled artificial tree in a fully zipped bag, up to {SERVICE_CONFIG.standardTreeBag.maxLengthInches} × {SERVICE_CONFIG.standardTreeBag.maxWidthInches} × {SERVICE_CONFIG.standardTreeBag.maxHeightInches} inches outside. Items outside the standard envelope need a custom quote; additional standard bags are priced separately. Provide the item type and packed measurements for review before pickup.</p><small>Each bag is registered separately. Handling must be approved; all packing restrictions apply.</small></div></div><p className="oversized-method">Describe the item and its packed measurements in your inquiry. Approved separately quoted items can travel with an included scheduled visit. A separate trip costs extra. An item quote does not add tote credits or override prohibited-content rules.</p><button type="button" className="button button-primary" onClick={() => startInquiry({ plan: 'bulky', source: 'bulky', context: 'bulky' })}>Request an oversized-item quote <span aria-hidden="true">→</span></button></div></section>

      <section className="area-section"><div className="area-mark" aria-hidden="true"><span>⌖</span><i /><i /><i /></div><div><p className="eyebrow">LOCAL ROUTES, PLANNED WITH CARE</p><h2>A little more room to breathe, <em>right here in Central Texas.</em></h2><p>Serving Buda, Kyle, South Austin and surrounding approved ZIPs. Availability also depends on plan capacity and scheduling.</p><p>Eligibility is based on our active approved ZIP list. ZIPs overlapping Hays County north of the Blanco River or Travis County south of the Colorado River qualify in full. Plan capacity and confirmed appointments are separate.</p></div><button type="button" className="button button-light" onClick={() => startInquiry({ plan: 'undecided', source: 'service-area', context: 'service-area' })}>Ask about service in my area <span>→</span></button></section>

      <section className="faq-section section-pad" id="faq"><div className="faq-title"><p className="eyebrow">GOOD TO KNOW</p><h2>A few things<br /><em>you might wonder.</em></h2><p>Clear answers, before anything leaves your doorstep.</p></div><div className="faq-list">{FAQS.map(([question, answer]) => <details className="faq-item" key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>

      <section className="interest-section section-pad" id="interest"><div><p className="eyebrow">GET MY STORAGE PLAN</p><h2>Your garage called. <em>It wants its floor back.</em></h2><p>A few details now. A little more room later. Tell Blake what you want to store, and we'll work out the right fit together.</p><p>Prefer to talk? Email <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a> or call <a href={OWNER.phoneHref}>{OWNER.phone}</a>.</p></div><InquiryForm selection={inquirySelection} focusRequest={focusRequest} onPlanChange={plan => setInquirySelection(previous => ({ ...previous, plan }))} /></section>
    </main>
    <footer className="site-footer"><Brand light /><p>We’ll hang onto that for you.</p><nav aria-label="Footer navigation"><a href="#how-it-works">How it works</a><a href="#plans">Plans</a><a href="#what-we-store">What we store</a><a href="#care">How we care</a><a href="#faq">FAQ</a><Link to="/plans">Plans &amp; details</Link></nav><PolicyLinks /><span className="footer-service-area">Serving Buda, Kyle, South Austin and surrounding approved ZIPs. {POLICY.geography.boundary}</span></footer>
  </>
}
