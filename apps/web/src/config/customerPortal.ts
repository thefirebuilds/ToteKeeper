/** Public portal origin; contains no payment or server credentials. */
export function customerPortalOrigin(publicOrigin: string) {
  const configured = import.meta.env.VITE_CUSTOMER_PORTAL_URL
  if (configured) return new URL(configured).origin
  const url = new URL(publicOrigin)
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) url.port = '8000'
  else if (!url.hostname.startsWith('portal.')) url.hostname = `portal.${url.hostname.replace(/^www\./, '')}`
  return url.origin
}

function currentOrigin() {
  return typeof window === 'undefined' ? 'http://127.0.0.1:5173' : window.location.origin
}

export function customerPortalLink(path = '/enroll/', publicOrigin = currentOrigin()) {
  return new URL(path, customerPortalOrigin(publicOrigin)).toString()
}

export function enrollmentLink(plan?: string, publicOrigin = currentOrigin()) {
  const url = new URL('/enroll/', customerPortalOrigin(publicOrigin))
  if (plan && ['small', 'medium', 'big'].includes(plan)) {
    url.searchParams.set('plan', plan)
    url.searchParams.set('billing', 'year')
  }
  return url.toString()
}
