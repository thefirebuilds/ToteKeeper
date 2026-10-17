import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { LandingPage } from '../features/marketing/LandingPage'
import { Portal } from '../features/portal/Portal'
import { DEMO_PORTAL_ENABLED } from '../config/business'

function App() {
  return <BrowserRouter><Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/portal/*" element={DEMO_PORTAL_ENABLED ? <Portal /> : <LandingPage />} />
    <Route path="*" element={<LandingPage />} />
  </Routes></BrowserRouter>
}

export default App