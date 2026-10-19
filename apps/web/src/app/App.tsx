import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { LandingPage } from '../features/marketing/LandingPage'
import { Portal } from '../features/portal/Portal'
import { DEMO_PORTAL_ENABLED } from '../config/business'
import { LegacyInquiryRedirect } from '../features/enrollment/LegacyInquiryRedirect'
import { SandboxBilling } from '../features/billing/SandboxBilling'
import { PolicyPage } from '../features/policies/PolicyPage'
import { PlansPage } from '../features/plans/PlansPage'

function App() {
  return <BrowserRouter><Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/plans" element={<PlansPage />} />
    <Route path="/enroll" element={<LegacyInquiryRedirect />} />
    <Route path="/policies/:slug" element={<PolicyPage />} />
    <Route path="/billing/return" element={<SandboxBilling />} />
    <Route path="/portal/*" element={DEMO_PORTAL_ENABLED ? <Portal /> : <LandingPage />} />
    <Route path="*" element={<LandingPage />} />
  </Routes></BrowserRouter>
}

export default App
