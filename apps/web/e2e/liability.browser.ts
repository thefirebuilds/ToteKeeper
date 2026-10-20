import { expect, test } from '@playwright/test'

test('discloses liability without restricting permitted contents or requiring inquiry acceptance', async ({ page }) => {
  await page.route('**/api/inquiries/csrf/', route => route.fulfill({ json: { csrfToken: 'test-csrf' } }))
  await page.goto('/')
  await expect(page.locator('.tote-value-limit')).toHaveText('Store everyday belongings, even if their combined value exceeds $250. Our liability for loss or damage is limited to actual contents value, up to $250 per tote, subject to the storage agreement. Value above that limit is at your risk.')
  await expect(page.locator('#packing-guidelines')).not.toContainText('Any tote with combined contents valued over')
  const faq = page.locator('.faq-item').filter({ hasText: 'What is the proposed liability limit?' })
  await faq.locator('summary').click()
  await expect(faq).toContainText('actual compensable loss, up to $250 per tote')
  await expect(faq).toContainText('Ask your homeowners or renters insurer whether')
  await expect(page.locator('#oversized')).toContainText('separate $250 liability limit per registered bulky item')
  await expect(page.locator('#interest input[type="checkbox"]')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('$200')
})
