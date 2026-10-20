import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { selectionFromSearch } from '../marketing/inquiryContext'
import { enrollmentLink } from '../../config/customerPortal'
export function LegacyInquiryRedirect() {
  const target = enrollmentLink(selectionFromSearch(useLocation().search).plan)
  useEffect(() => { window.location.replace(target) }, [target])
  return <main className="section-wrap"><h1>Continue to your customer account</h1><a href={target}>Continue to enrollment</a></main>
}
