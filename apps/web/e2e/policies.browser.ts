import { expect, test } from '@playwright/test'

test('footer navigates all three policy drafts, with working section links and mobile layout', async ({ page }) => {
  await page.route('**/api/inquiries/csrf/', route => route.fulfill({ json: { csrfToken: 'test-csrf' } }))
  await page.goto('/')
  const links = page.getByRole('navigation', { name: 'Policies' })
  await expect(links.getByRole('link')).toHaveCount(3)
  await links.getByRole('link', { name: 'Storage Agreement / Terms of Service', exact: true }).click()
  for (const [slug, title] of [['storage-agreement', 'Storage Agreement / Terms of Service'], ['packing', 'Packing and Prohibited Items'], ['privacy', 'Privacy Notice']]) {
    if (slug !== 'storage-agreement') await page.locator('footer').getByRole('link', { name: `${title}${slug === 'privacy' ? ' (draft)' : ''}`, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/policies/${slug}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    if (slug !== 'privacy') {
      await expect(page.locator('.policy-draft-banner')).toHaveCount(0)
      await expect(page.locator('.policy-version')).toContainText('2026-10-19.3')
      await expect(page.locator('.policy-version')).toContainText('Effective date: October 19, 2026')
    } else {
      await expect(page.locator('.policy-draft-banner')).toContainText('DRAFT — NOT APPROVED OR EFFECTIVE')
    }
    await expect(page.locator('main input[type="checkbox"]')).toHaveCount(0)
    const brokenAnchors = await page.locator('a[href^="#"]').evaluateAll(anchors => anchors.map(a => a.getAttribute('href')!).filter(href => !document.getElementById(href.slice(1))))
    expect(brokenAnchors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
})

test('owner-supplied agreement preserves pricing, liability, cancellation and acceptance terms', async ({ page }, testInfo) => {
  await page.goto('/policies/storage-agreement')
  const agreement = page.getByRole('article')
  await expect(agreement.getByRole('row')).toHaveCount(4)
  await expect(agreement).toContainText('$14.95')
  await expect(agreement).toContainText('$399')
  await expect(agreement).toContainText('$50 total for both legs')
  await expect(agreement).toContainText('$250 PER SEPARATELY REGISTERED BULKY ITEM')
  await expect(agreement).toContainText('Each approved ZIP qualifies in full')
  await expect(agreement).toContainText('fair market value immediately before loss')
  await expect(agreement).toContainText('30-day opt-out')
  await expect(page.locator('#cancellation')).toContainText('30 calendar days')
  await expect(page.locator('#acceptance li')).toHaveCount(4)
  await expect(page.getByRole('button', { name: /accept|pay|checkout/i })).toHaveCount(0)
  await page.goto('/policies/privacy')
  await expect(page.getByRole('article')).toContainText('Google Fonts')
  await expect(page.getByRole('article')).toContainText('Gmail API over HTTPS')
  await expect(page.getByRole('article')).toContainText('No approved retention schedule')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy Notice')
  await page.screenshot({ path: testInfo.outputPath('policy.png') })
})
