import { expect, test } from '@playwright/test'

test('clicks leave no focus ring or native tooltip; keyboard focus still shows a ring', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Keyboard focus needs a physical keyboard.')
  await page.goto('/markets/example')
  const ring = () => page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)
  const chart = page.getByRole('img', { name: 'Your probability distribution', exact: true })
  await expect(chart.locator('title')).toHaveCount(0)
  await chart.click({ position: { x: 300, y: 150 } })
  expect(await ring()).toBe('none')
  await page.getByRole('button', { name: 'Expressive', exact: true }).click()
  expect(await ring()).toBe('none')
  await page.keyboard.press('Tab')
  expect(await ring()).toBe('solid')
})
