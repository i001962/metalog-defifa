import { expect, test } from '@playwright/test'

test('creation reports native validation at the action and opens wallets for a valid applied template', async ({ page }) => {
  const writes: string[] = []
  page.on('request', request => {
    if (request.method() === 'POST' && /eth_send|wallet_send/.test(request.postData() ?? '')) writes.push(request.url())
  })
  await page.goto('/create')
  const create = page.getByRole('button', { name: 'Connect to create', exact: true })
  await create.click()
  await expect(page.locator('form .section').getByRole('alert')).toContainText('Question')
  await page.getByRole('combobox', { name: 'Asset preset', exact: true }).selectOption('BTC-USD')
  await page.getByRole('combobox', { name: 'Time preset', exact: true }).selectOption('1h')
  await page.getByRole('button', { name: 'Apply market preset', exact: true }).click()
  const opens = page.getByLabel('Entry opens (UTC)', { exact: true })
  const originalOpen = await opens.inputValue()
  await opens.fill('')
  await create.click()
  await expect(page.locator('form .section').getByRole('alert')).toContainText('Entry opens (UTC)')
  await opens.fill(originalOpen)
  await page.getByRole('combobox', { name: 'Network', exact: true }).selectOption('84532')
  await create.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('form .section').getByRole('alert')).toHaveCount(0)
  expect(writes).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('a saved uncertain transaction visibly explains why creation is blocked and is not resent', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('metalog:transaction:v1', JSON.stringify({
    version: 1, id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', createdAt: 1, afterBlock: '1', phase: 'unknown',
    chainId: 8453, account: '0x1111111111111111111111111111111111111111', to: '0x2222222222222222222222222222222222222222',
    data: '0x', value: '0', title: 'Create market', details: [],
  })))
  const writes: string[] = []
  page.on('request', request => {
    if (request.method() === 'POST' && /eth_send|wallet_send/.test(request.postData() ?? '')) writes.push(request.url())
  })
  await page.goto('/create')
  await expect(page.getByRole('button', { name: 'Connect to create', exact: true })).toBeDisabled()
  await expect(page.locator('form .section').getByRole('status')).toContainText('pending transaction')
  await expect(page.getByRole('button', { name: 'Check transaction', exact: true })).toBeVisible()
  expect(writes).toEqual([])
})
