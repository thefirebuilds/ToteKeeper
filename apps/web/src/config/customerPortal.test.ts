import { describe, expect, it } from 'vitest'
import { customerPortalOrigin, enrollmentLink } from './customerPortal'

describe('customer portal navigation', () => {
  it('routes the deployed website to the real portal and local development to Django', () => {
    expect(customerPortalOrigin('https://162-243-163-103.sslip.io')).toBe('https://portal.162-243-163-103.sslip.io')
    expect(customerPortalOrigin('http://127.0.0.1:5187')).toBe('http://127.0.0.1:8000')
    expect(customerPortalOrigin('https://portal.example.com')).toBe('https://portal.example.com')
  })
  it('passes only a recognized plan hint, without customer data or arbitrary redirects', () => {
    expect(enrollmentLink('medium', 'https://example.com')).toBe('https://portal.example.com/enroll/?plan=medium&billing=year')
    expect(enrollmentLink('https://evil.example', 'https://example.com')).toBe('https://portal.example.com/enroll/')
  })
})
