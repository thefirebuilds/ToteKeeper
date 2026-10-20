import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/inquiries/csrf/', route => route.fulfill({ json: { csrfToken: 'test-csrf' } }))
})

async function headingClearsHeader(page: import('@playwright/test').Page, id: string) {
  const heading = page.locator(`#${id}`)
  await expect(heading).toBeFocused()
  const top = (await heading.boundingBox())!.y
  const header = (await page.locator('.site-header').boundingBox())!
  expect(top).toBeGreaterThanOrEqual(header.y + header.height)
  expect(top).toBeLessThan(page.viewportSize()!.height / 2)
}

test('homepage cards link to the matching plan, with matching prices and real portal enrollment links', async ({ page }) => {
  for (const [id, name, price] of [['small', 'Small', '$125'], ['medium', 'Medium', '$225'], ['big', 'Large', '$399']]) {
    await page.goto('/#plans')
    const card = page.locator('.plan-card').filter({ has: page.getByRole('heading', { name, exact: true }) })
    await expect(card).toContainText(price)
    await expect(card).toContainText('billed annually')
    await expect(card).toContainText('$50 for both legs')
    await expect(card).not.toContainText('storage credits')
    await card.getByRole('link', { name: `Learn more about ${name}` }).click()
    await expect(page).toHaveURL(new RegExp(`/plans#${id}$`))
    await headingClearsHeader(page, id)
    const plan = page.getByRole('article', { name, exact: true })
    await expect(plan).toContainText(price)
    await expect(plan.getByRole('link', { name: /Get my storage plan/ })).toHaveAttribute('href', `http://127.0.0.1:8000/enroll/?plan=${id}&billing=year`)
  }
})

test('direct anchors, comparison, image placeholders and help-me-decide work on every viewport', async ({ page }, info) => {
  await page.goto('/plans#big')
  await headingClearsHeader(page, 'big')
  await page.reload()
  await headingClearsHeader(page, 'big')
  await expect(page.getByRole('table', { name: 'Annual plan comparison' })).toContainText('Small')
  await expect(page.getByRole('table', { name: 'Annual plan comparison' })).toContainText('10 Large or 5 XL')
  await expect(page.getByRole('table', { name: 'Month-to-month billing' })).toContainText('$14.95/month')
  await expect(page.getByRole('table', { name: 'Month-to-month billing' })).toContainText('$75')
  await expect(page.locator('.plan-visual')).toHaveCount(8)
  await expect(page.getByText('Image coming soon.', { exact: true })).toHaveCount(8)
  await expect(page.locator('.plan-visual img')).toHaveCount(0)
  for (const visual of await page.locator('.plan-visual').all()) {
    const frame = (await visual.locator('.plan-visual-frame').boundingBox())!
    expect(frame.height).toBeGreaterThan(100)
    await expect(visual.locator('figcaption')).not.toBeEmpty()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.locator('.plans-contents').getByRole('link', { name: 'Meet the totes' }).click()
  await headingClearsHeader(page, 'meet-totes')
  await page.screenshot({ path: info.outputPath('plans.png') })
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true)
  await page.locator('#get-plan').scrollIntoViewIfNeeded()
  await page.locator('.detail-contact').getByRole('link', { name: 'Help me decide', exact: true }).click()
  await expect(page.getByLabel('Plan interest')).toHaveValue('undecided')
  expect(page.url()).not.toMatch(/email|address|phone/)
  await expect(page.locator('main a[href^="/portal"], main a[href^="/billing"]')).toHaveCount(0)
})
