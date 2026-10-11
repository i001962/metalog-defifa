import { expect, test } from '@playwright/test'
import { nativeCreationRequest } from '../fixtures/transaction-requests'

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

test('an earlier uncertain transaction permits a separate new market intent and remains recoverable', async ({ page }) => {
  await page.addInitScript(native => localStorage.setItem('metalog:transaction:v1', JSON.stringify({
    ...native, version: 1, id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', createdAt: 1, afterBlock: '1', phase: 'unknown',
    account: '0x1111111111111111111111111111111111111111', title: 'Create market', details: [],
  })), { ...nativeCreationRequest, value: nativeCreationRequest.value.toString() })
  const writes: string[] = []
  page.on('request', request => {
    if (request.method() === 'POST' && /eth_send|wallet_send/.test(request.postData() ?? '')) writes.push(request.url())
  })
  await page.goto('/create')
  await expect(page.getByRole('button', { name: 'Connect to create', exact: true })).toBeEnabled()
  await expect(page.locator('form .section').getByRole('status')).toContainText('pending transaction')
  const recovery = page.locator('form .section').getByRole('link', { name: 'View pending transaction', exact: true })
  await expect(recovery).toBeVisible()
  await recovery.click()
  const panel = page.getByRole('complementary', { name: 'Transaction status', exact: true })
  await expect(panel).toBeFocused()
  await expect(page.getByRole('button', { name: 'Check transaction', exact: true })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Connect to create', exact: true })).toBeEnabled()
  await page.getByRole('combobox', { name: 'Asset preset', exact: true }).selectOption('BTC-USD')
  await page.getByRole('combobox', { name: 'Time preset', exact: true }).selectOption('1h')
  await page.getByRole('button', { name: 'Apply market preset', exact: true }).click()
  await page.getByRole('combobox', { name: 'Network', exact: true }).selectOption('84532')
  await page.getByRole('button', { name: 'Connect to create', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('metalog:transaction:v1')!).id)).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  expect(writes).toEqual([])
})


test('selecting a separate pending creation preserves each record and resets its recovery hash draft', async ({ page }) => {
  await page.addInitScript(native => {
    const record = { ...native, version: 1, createdAt: 1, afterBlock: '1', phase: 'unknown',
      account: '0x1111111111111111111111111111111111111111', title: 'Create market', details: [] }
    localStorage.setItem('metalog:transaction:v1', JSON.stringify({ ...record, id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }))
    localStorage.setItem('metalog:transaction-intents:v1', JSON.stringify({ 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb': { ...record, id: 'cccccccc-cccc-cccc-cccc-cccccccccccc' } }))
  }, { ...nativeCreationRequest, value: nativeCreationRequest.value.toString() })
  await page.goto('/create')
  const original = page.getByLabel('Original transaction hash', { exact: true })
  await original.fill(`0x${'ab'.repeat(32)}`)
  await page.getByLabel('Pending transaction', { exact: true }).selectOption('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
  await expect(original).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Connect to create', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => [localStorage.getItem('metalog:transaction:v1'), localStorage.getItem('metalog:transaction-intents:v1')].every(Boolean))).toBe(true)
})
