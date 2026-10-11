import { expect, test } from '@playwright/test'

test('short testnet schedule is explicit and preserves the rest of the draft', async ({ page }) => {
  await page.goto('/create')
  const opens = page.getByLabel('Entry opens (UTC)', { exact: true })
  const closes = page.getByLabel('Entry closes / observation starts (UTC)', { exact: true })
  const ends = page.getByLabel('Observation ends (UTC)', { exact: true })
  const network = page.getByRole('combobox', { name: 'Network', exact: true })
  const preset = page.getByRole('button', { name: 'Use short test schedule', exact: true })
  await page.getByLabel('Question', { exact: true }).fill('Does the test draft survive?')
  await page.getByLabel('Observation source', { exact: true }).fill('Test source')
  const original = await Promise.all([opens.inputValue(), closes.inputValue(), ends.inputValue()])
  await expect(preset).toHaveCount(0)
  await network.selectOption('84532')
  await expect(preset).toBeVisible()
  expect(await Promise.all([opens.inputValue(), closes.inputValue(), ends.inputValue()])).toEqual(original)
  const before = Date.now()
  await preset.click()
  const selected = await Promise.all([opens.inputValue(), closes.inputValue(), ends.inputValue()])
  const [start, close, end] = selected.map(value => Date.parse(`${value}Z`))
  expect(start - before).toBeGreaterThanOrEqual(119_000)
  expect(start - before).toBeLessThanOrEqual(181_000)
  expect(close - start).toBe(600_000)
  expect(end - close).toBe(Date.parse(`${original[2]}Z`) - Date.parse(`${original[1]}Z`))
  await expect(page.getByText('Results still take at least 1 day to settle.', { exact: false })).toBeVisible()
  await network.selectOption('8453')
  await expect(preset).toHaveCount(0)
  expect(await Promise.all([opens.inputValue(), closes.inputValue(), ends.inputValue()])).toEqual(selected)
  await expect(page.getByLabel('Question', { exact: true })).toHaveValue('Does the test draft survive?')
  await expect(page.getByLabel('Observation source', { exact: true })).toHaveValue('Test source')
})

test('recent IDs reopen without trusting cached prompts or status', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('metalog:recent-markets:v1', JSON.stringify([
    { chainId: 8453, projectId: '7', prompt: 'Unverified cached prompt', stage: 'complete' },
    { chainId: 137, projectId: '8' },
  ])))
  await page.route('**/api/markets**', route => {
    const listing = new URL(route.request().url()).pathname === '/api/markets'
    return route.fulfill({ status: listing ? 200 : 503, contentType: 'application/json', body: JSON.stringify(listing ? { markets: [], errors: [] } : { error: 'Test RPC unavailable.' }) })
  })
  await page.goto('/')
  const recent = page.getByRole('region', { name: 'Recently opened', exact: true })
  await expect(recent.getByRole('link', { name: 'Base / Game 7', exact: true })).toHaveAttribute('href', '/markets/8453/7')
  await expect(recent.getByRole('link')).toHaveCount(1)
  await expect(page.getByText('Unverified cached prompt', { exact: true })).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Network', exact: true }).selectOption('84532')
  await page.getByLabel('Open a game', { exact: true }).fill('17')
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page).toHaveURL(/\/markets\/84532\/17$/)
  await expect(page.getByRole('heading', { name: 'Market unavailable', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Metalog', exact: true }).click()
  await expect(recent.getByRole('link', { name: 'Base Sepolia / Game 17', exact: true })).toHaveAttribute('href', '/markets/84532/17')
})
