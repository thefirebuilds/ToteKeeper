import { useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Brand } from '../../components/Brand'
import { policyDocuments } from './documents'
import './policies.css'

export function PolicyLinks() {
  return <nav className="policy-links" aria-label="Policies">
    {policyDocuments.map(document => <Link key={document.slug} to={`/policies/${document.slug}`}>{document.title}{document.effectiveDate ? '' : ' (draft)'}</Link>)}
  </nav>
}

export function PolicyPage() {
  const { slug } = useParams()
  const document = policyDocuments.find(item => item.slug === slug)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const previousTitle = window.document.title
    window.document.title = `${document?.title ?? 'Policy not found'}${document?.effectiveDate ? '' : ' — DRAFT'} | My Tote Keeper`
    window.scrollTo(0, 0)
    heading.current?.focus({ preventScroll: true })
    return () => { window.document.title = previousTitle }
  }, [document])
  return <>
    <a className="policy-skip" href="#policy-main">Skip to policy</a>
    <header className="site-header"><div className="header-inner"><Brand /><Link className="text-link" to="/">Back to the website</Link></div></header>
    <main id="policy-main" className="policy-page">
      {!document ? <><h1 ref={heading} tabIndex={-1}>Policy not found</h1><p>Choose a draft below or return to the website.</p><PolicyLinks /></> : <>
        <p className="eyebrow">{document.effectiveDate ? 'SERVICE POLICIES' : 'OWNER & TEXAS ATTORNEY REVIEW'}</p>
        <h1 ref={heading} tabIndex={-1}>{document.title}</h1>
        {!document.effectiveDate && <p className="policy-draft-banner"><strong>DRAFT — NOT APPROVED OR EFFECTIVE.</strong> No binding acceptance or payment is enabled by this document. It is not represented as attorney-approved or enforceable.</p>}
        <p className="policy-version">Document version: <strong>{document.version}</strong> · Updated October 19, 2026 · Effective date: {document.effectiveDate ?? 'not assigned'}</p>
        <p>{document.summary}</p>
        {document.intro?.map((line, index) => <p key={index}>{line}</p>)}
        <nav className="policy-toc" aria-label="On this page"><h2>On this page</h2><ol>{document.sections.map(section => <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>)}</ol></nav>
        <article aria-label={document.title}>{document.sections.map(section => <section className="policy-section" key={section.id} id={section.id}>
          <h2>{section.title}</h2>
          {section.table && <div style={{ overflowX: 'auto' }}><table><caption>Package pricing</caption><thead><tr>{section.table.headers.map(header => <th scope="col" key={header}>{header}</th>)}</tr></thead><tbody>{section.table.rows.map(row => <tr key={row[0]}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody></table></div>}
          {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          {section.items && <ul>{section.items.map(item => <li key={item}>{item}</li>)}</ul>}
          {section.review && <aside className="policy-review"><strong>OWNER / LEGAL REVIEW REQUIRED:</strong> {section.review}</aside>}
        </section>)}</article>
        <section className="policy-section"><h2>Version history</h2><p>{document.effectiveDate ? '2026-10-19.3: current document presented for enrollment, with the effective date stated above. Earlier review drafts are retained in Git history.' : <>{document.version}: whole-ZIP enrollment eligibility update, prepared October 19, 2026. Prior review drafts: draft-2026-10-18-v1 and draft-2026-10-18-v2. No approved operative version is established by these pages.</>}</p></section>
        <p><Link to="/#interest">Ask about storage</Link> — no agreement acceptance or payment is required to submit an inquiry.</p>
      </>}
    </main>
    <footer className="site-footer"><Brand light /><PolicyLinks /><Link to="/">Back to the website</Link></footer>
  </>
}
