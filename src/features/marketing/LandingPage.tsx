import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Brand } from '../../components/Brand'
import { DEMO_PORTAL_ENABLED, formatUsd, SERVICE_CONFIG } from '../../config/business'
import storageScenesImage from '../../assets/images/storage-scenes.svg'
import oversizedStoriesImage from '../../assets/images/oversized-stories.svg'
import warehouseToteRackingImage from '../../assets/images/warehouse-tote-racking.png'

const plans = SERVICE_CONFIG.plans.map((plan) => ({
  ...plan,
  label: `${plan.totes} tote${plan.totes === 1 ? '' : 's'}`,
  yearly: formatUsd(plan.annualPrice),
  firstYear: formatUsd(plan.annualPrice),
  icon: String(plan.totes).padStart(2, '0'),
}))

function CategoryArt({ kind }: { kind: string }) {
  if (kind === 'camping') return <svg viewBox="0 0 100 72" aria-hidden="true"><path d="M12 59 43 14l18 27 9-13 20 31H12Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="m43 14 7 45m-8-12 12-1M27 60l8-12m35-8 7 20" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="80" cy="15" r="6" fill="currentColor" opacity=".5"/></svg>
  if (kind === 'clothes') return <svg viewBox="0 0 100 72" aria-hidden="true"><path d="M50 17c-8 0-10-10-3-12 6-2 10 5 6 9m-3 5-23 12 9 10 8-5v27h31V36l8 5 9-10-23-12c-3 9-19 9-22 0Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/></svg>
  if (kind === 'creature') return <svg viewBox="0 0 100 72" aria-hidden="true"><path d="M20 58h60M30 58V34l6-9h28l7 9v24M43 35h1m15 0h1m-17 8h15m-14 8 5-4 5 4 5-4 4 4M37 25l4-9m21 9-4-9M31 34l-9-8m48 8 9-8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="m51 56 0 8m-11-1-7 4m18-3 0 4m11-5 7 3" fill="none" stroke="currentColor" strokeWidth="3"/></svg>
  if (kind === 'occasional') return <svg viewBox="0 0 100 72" aria-hidden="true"><path d="M22 31h56v35H22zM17 22h66v11H17zM50 22v44M50 22c-18 0-20-14-10-15 7-1 10 15 10 15Zm0 0c18 0 20-14 10-15-7-1-10 15-10 15Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="M34 43h7m18 0h7" stroke="currentColor" strokeWidth="3"/></svg>
  return <svg viewBox="0 0 100 72" aria-hidden="true"><path d="m50 7 27 52H23L50 7Zm0 12v36m-14-18h28m-21 9h14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="M50 7v52" stroke="currentColor" strokeWidth="1.5"/></svg>
}

const FAQS = [
  ['Who supplies the totes?', `We supply standardized totes. With annual prepayment, they’re provided for use at no added charge. Month-to-month storage requires a ${formatUsd(SERVICE_CONFIG.toteTerms.monthlyDepositPerTote)} deposit per tote. Totes remain ours and must be returned when storage ends. We’ll confirm deposit return conditions before signup.`],
  ['What can I store?', 'Seasonal clothing, winter sports gear, clean and dry camping gear, holiday décor, party supplies, and other occasional-use belongings may be a fit. Our packing and acceptance guidelines are still being finalized, so ask us before packing anything you are unsure about.'],
  ['How do pickup and return work?', 'We arrange a scheduled local route and meet you at the doorstep or driveway. Request all your totes or just the ones you need. We confirm each appointment before anything moves.'],
  ['Can I request only some totes?', 'Yes. Request just the totes you want returned. Your items stay yours, and each move is arranged with you.'],
  ['Does anyone enter my house?', 'No. Handoffs happen at the doorstep or driveway. Nobody needs to enter your home.'],
  ['Are requested dates guaranteed?', 'We’ll do our very best to accommodate your preferred date and time, even during the peakiest stretches of the season. Your appointment isn’t confirmed until we confirm it with you.'],
  ['What about trees, snowboards, and giant skeletons?', 'A packed Christmas tree, snowboard bag, or a 12-foot skeleton disassembled for storage are example items with illustrative annual estimates on this page. Acceptance and final price depend on packed dimensions and handling. Tell us what you have before booking.'],
  ['How do numbered ties work?', 'We plan to use a numbered tamper-evident tie on stored totes and record its number in your inventory. A tie can show visible signs if it is broken or missing. It is not a guarantee against access.'],
  ['Can I visit the storage facility?', 'The service is arranged through confirmed doorstep or driveway handoffs, not customer facility visits. Contact us before booking if you need a different arrangement.'],
  ['What does the annual price include?', 'One collection and one return delivery each service year. With annual prepayment, standardized totes are provided for use at no added charge. Totes remain ours and must be returned when storage ends.'],
  ['What if I need another pickup or delivery?', 'Additional visits cost extra. We’ll confirm the cost before arranging an extra trip. Oversized items can travel with an included scheduled visit; a separate trip costs extra.'],
]

export function LandingPage() {
  const [selectedPlan, setSelectedPlan] = useState('')
  const [notice, setNotice] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  function choosePlan(plan: string) {
    setSelectedPlan(plan)
    document.getElementById('interest')?.scrollIntoView({ behavior: 'smooth' })
  }

  function submitInterest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity()
      return
    }
    setNotice('Demo only: nothing was sent or saved. No business submission was made.')
  }

  return <>
    <header className="site-header">
      <div className="header-inner"><Brand />
        <button className="menu-toggle" aria-expanded={menuOpen} aria-label="Toggle navigation" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
        <nav className={menuOpen ? 'main-nav nav-open' : 'main-nav'} aria-label="Main navigation">
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a><a href="#plans" onClick={() => setMenuOpen(false)}>Plans</a><a href="#what-we-store" onClick={() => setMenuOpen(false)}>What we store</a><a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
          <a className="login-link" href="#plans" onClick={() => setMenuOpen(false)}>Find my breathing room <span aria-hidden="true">↗</span></a>
          <Link className="top-login-link" to="/portal" onClick={() => setMenuOpen(false)}>Login <span aria-hidden="true">↗</span></Link>
        </nav>
      </div>
    </header>
    <main>
      <section className="hero section-wrap">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> YOUR STUFF. SOMEWHERE ELSE.</p>
          <h1>Keep the things.<br /><em>Reclaim the space.</em></h1>
          <p className="hero-text">Holiday decorations. Camping gear. That skeleton with absolutely no business being twelve feet tall.</p>
          <p className="hero-text hero-text-second">We pick up your packed totes and approved oversized items, store them, and bring them back when you need them. Start small. Add space as life happens.</p>
          <div className="hero-actions"><a className="button button-primary" href="#plans">Find my breathing room <span aria-hidden="true">↗</span></a><a className="text-link" href="#how-it-works">How it works <span aria-hidden="true">↓</span></a></div>
          <p className="service-note"><span aria-hidden="true">⌖</span> Serving Central Texas</p>
        </div>
        <div className="hero-art hero-art-photo">
          <img className="warehouse-photo" src={warehouseToteRackingImage} alt="An example of organized storage with teal flip-top totes on warehouse pallet racking" fetchPriority="high" />
          <span className="warehouse-caption">A tidy place for your things to wait.</span>
        </div>
      </section>

      <section className="proof-strip"><div><strong>DOORSTEP PICKUP &amp; DELIVERY</strong><span>Scheduled local handoffs</span></div><i /><div><strong>START WITH ONE TOTE</strong><span>Add space as life happens</span></div><i /><div><strong>NO HOME ENTRY</strong><span>Your door stays yours</span></div></section>

      <section className="how-section section-pad" id="how-it-works">
        <div className="section-heading"><p className="eyebrow">LESS STUFF UNDERFOOT. LESS RUNNING AROUND.</p><h2>You pack. <em>We’ll take it from here.</em></h2></div>
        <div className="steps-grid">
          {[
            ['01', 'Pack up the things taking over.', 'Fill your totes with the things you want to keep, just somewhere else. Label them so future-you knows which one has the lights. A future customer account will let you keep a photo inventory, too.'],
            ['02', 'Meet us at the door.', 'We collect your packed totes and approved larger items from your doorstep or driveway. No home entry. No hauling everything to a storage unit.'],
            ['03', 'Call your stuff home.', 'Request all your totes or just the ones you need. We’ll confirm a return appointment and bring them back.'],
          ].map(([number, title, body]) => <article className="step" key={number}><span className="step-number">{number}</span><div className="step-icon" aria-hidden="true">{number === '01' ? '▧' : number === '02' ? '↗' : '⌂'}</div><h3>{title}</h3><p>{body}</p></article>)}
        </div>
        <p className="route-note">Pickup and delivery happen on scheduled local routes. Your preferred date is a request. We confirm every appointment before anything moves.</p>
      </section>

      <section className="plans-section section-pad" id="plans">
        <div className="section-heading"><p className="eyebrow">A LITTLE SPACE. A SENSIBLE PLAN.</p><h2>Storage that grows <em>one tote at a time.</em></h2><p>Annual service includes one collection and one return delivery.</p></div>
        <div className="plans-grid">{plans.map((plan) => <article className={`plan-card${plan.featured ? ' plan-featured' : ''}`} key={plan.totes}>
          {plan.featured && <span className="popular-tag">MOST ROOM TO START</span>}<span className="plan-count">{plan.icon} <small>STANDARD TOTES</small></span><h3>{plan.label}</h3><p className="plan-note">{plan.note}</p><div className="plan-price">{plan.yearly}<small> / year</small></div><p className="plan-renewal">{plan.firstYear} first year <span>·</span> {plan.yearly}/year renewal</p><button type="button" className={plan.featured ? 'button button-primary' : 'button button-outline'} onClick={() => choosePlan(plan.label)}>Ask about this plan <span aria-hidden="true">→</span></button>
        </article>)}</div>
        <div className="plans-details"><p><strong>Annual prepay:</strong> standardized totes are provided for use at no added charge. Totes remain ours and must be returned when storage ends.</p><p><strong>Month-to-month:</strong> a {formatUsd(SERVICE_CONFIG.toteTerms.monthlyDepositPerTote)} deposit is required per tote. Deposit return conditions are confirmed before signup. One collection and one return delivery are included per service year. Additional visits cost extra.</p></div>
      </section>

      <section className="who-section section-pad" id="what-we-store"><div className="who-art"><img className="scene-illustration" src={storageScenesImage} alt="Illustration of a camping tent, a numbered storage tote, and a sleeping bag" loading="lazy" /></div><div className="who-copy"><p className="eyebrow">GOOD STUFF. BAD ROOMMATES.</p><h2>Some things don’t need <em>year-round square footage.</em></h2><p>Keep what you use sometimes. Give it somewhere else to wait.</p><div className="storage-examples">
          {[
            ['holiday', 'Holiday décor', 'Christmas gets a season. It doesn’t need the whole garage.'],
            ['camping', 'Camping & winter sports gear', 'Tents and clean, dry camping gear, plus skis, snowboards, and the rest of winter’s long-haul kit.'],
            ['clothes', 'Seasonal clothing', 'Coats, ski clothes, and the Texas winter wardrobe you wear twice.'],
            ['creature', 'Halloween creatures', 'Your skeleton can spend the off-season somewhere other than the guest room.'],
            ['occasional', 'Occasional-use things', 'Party supplies, hobby gear, and other things worth keeping. Just less immediately around.'],
          ].map(([kind, title, body]) => <article className="storage-example" key={kind}><span className="category-art"><CategoryArt kind={kind} /></span><span><strong>{title}</strong><small>{body}</small></span></article>)}
        </div><small className="acceptance-note">Items must meet our packing and acceptance guidelines. Larger items need approval before pickup.</small></div></section>

      <section className="oversized-section section-pad" id="oversized"><div className="oversized-art"><img className="oversized-illustration" src={oversizedStoriesImage} alt="Illustration of a canoe carrying a packed tree bag, a long gear bag, and a disassembled skeleton decoration" loading="lazy" /></div><div className="oversized-copy"><p className="eyebrow">DOESN’T FIT IN A TOTE?</p><h2>Big decorations.<br /><em>Manageable storage.</em></h2><p>Artificial trees, snowboard bags, canoes, and disassembled Halloween creatures may qualify for oversized storage. Tell us what you have and its packed dimensions. We’ll confirm acceptance and pricing before pickup.</p><p className="personality-line">Twelve feet of skeleton. Considerably less skeleton when packed.</p><div className="pricing-explainer"><h3>Illustrative annual storage pricing</h3><dl>{SERVICE_CONFIG.oversizedEstimates.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.estimate}</dd></div>)}</dl><small>Estimates only. Final pricing depends on packed size and handling and is confirmed before booking. The skeleton example applies to a 12-foot item disassembled for storage, not every giant skeleton.</small></div><p className="oversized-method">Pricing considers packed dimensions, storage footprint, stackability, weight, and handling, not assembled height. A tree bag is packaging, not a universal size category. Oversized items can travel with included scheduled visits; a separate trip costs extra.</p><button type="button" className="button button-primary" onClick={() => choosePlan('Oversized items')}>Ask about a larger item <span aria-hidden="true">→</span></button></div></section>

      <section className="area-section"><div className="area-mark" aria-hidden="true"><span>⌖</span><i /><i /><i /></div><div><p className="eyebrow">LOCAL ROUTES, PLANNED WITH CARE</p><h2>A little more room to breathe, <em>right here in Hays County.</em></h2><p>We serve Central Texas, with pickup and delivery routes in Buda and Kyle. Small enough to know the route. Practical enough to make every stop count.</p><p>Not sure if we serve your address? Leave your ZIP code. It helps us confirm availability and plan routes.</p></div><a href="#interest" className="button button-light">Check my ZIP code <span>→</span></a></section>

      <section className="faq-section section-pad" id="faq"><div className="faq-title"><p className="eyebrow">GOOD TO KNOW</p><h2>A few things<br /><em>you might wonder.</em></h2><p>Clear answers, before anything leaves your doorstep.</p></div><div className="faq-list">{FAQS.map(([question, answer]) => <details className="faq-item" key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>

      <section className="interest-section section-pad" id="interest"><div><p className="eyebrow">MAKE SOME ROOM</p><h2>Your garage called. <em>It wants its floor back.</em></h2><p>Tell us what you’d like out of the way. We’ll help you find the right amount of storage.</p></div><form className="interest-form" onSubmit={submitInterest} noValidate>
        <label>Your name<input name="name" required minLength={2} autoComplete="name" /></label><label>Email address<input name="email" type="email" required autoComplete="email" /></label><div className="form-row"><label>ZIP code<input name="zip" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} required autoComplete="postal-code" /></label><label>Plan interest<select name="plan" value={selectedPlan} onChange={(event) => setSelectedPlan(event.target.value)}><option value="">Not sure</option>{plans.map((plan) => <option key={plan.totes} value={plan.label}>{plan.label}</option>)}<option value="Oversized items">Oversized items</option></select></label></div><label>What are you thinking of storing? <span className="optional-label">optional</span><textarea name="description" rows={3} maxLength={300} placeholder="A few words about what you’d like out of the way" /></label><button className="button button-primary" type="submit">Check form <span>→</span></button>{notice && <p className="form-notice" role="status">{notice}</p>}<p className="form-disclaimer">This preview doesn’t send or save your information.</p>
      </form></section>
    </main>
    <footer className="site-footer"><Brand light /><p>We’ll hang onto that for you.</p><nav aria-label="Footer navigation"><a href="#how-it-works">How it works</a><a href="#plans">Plans</a><a href="#what-we-store">What we store</a><a href="#faq">FAQ</a></nav>{DEMO_PORTAL_ENABLED && <Link to="/portal">Demo portal ↗</Link>}</footer>
  </>
}