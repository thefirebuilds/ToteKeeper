import { Navigate, useLocation } from 'react-router-dom'
import { legacyInquiryTarget } from '../marketing/inquiryContext'
export function LegacyInquiryRedirect() {
  return <Navigate to={legacyInquiryTarget(useLocation().search)} replace />
}
