import { Link } from 'react-router-dom'
import { BRAND } from '../config/business'

export function Brand({ light = false }: { light?: boolean }) {
  return <Link className={`brand${light ? ' brand-light' : ''}`} to="/" aria-label="My Tote Keeper home">
    <svg className="brand-mark" viewBox="0 0 48 48" role="img" aria-label="">
      <path d="M7 17.5 24 10l17 7.5v20L24 45 7 37.5z" fill="currentColor" opacity=".14" />
      <path d="m7 17.5 17 8 17-8M24 25.5v19.2M7 17.5v20l17 7.2 17-7.2v-20L24 10 7 17.5Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M18 22v-5.2a6 6 0 0 1 12 0V22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
    <span className="brand-wordmark"><strong>{BRAND.name.toLowerCase()}</strong><small>LOCAL TOTE STORAGE</small></span>
  </Link>
}