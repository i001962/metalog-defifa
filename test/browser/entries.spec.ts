import { expect, test } from '@playwright/test'
import type { LifecycleSnapshot } from '../../src/lib/defifa-lifecycle'
import type { EntryHistoryEntry, EntryHistoryPage } from '../../src/lib/entries'
import { EXAMPLE_MARKET } from '../../src/lib/example'
import { marketRanges, validateMarket } from '../../src/domain/market'

const definition = validateMarket({ ...EXAMPLE_MARKET, rangeCount: 3, rangeWidth: 1, rangeBoundaries: undefined })
const account = '0x1111111111111111111111111111111111111111'
const hash = `0x${'ab'.repeat(32)}` as const
const market: LifecycleSnapshot = {
  market: { chainId: 8453, projectId: '27', hook: account, governor: account, definition, ranges: marketRanges(definition),
    phase: 3, stage: 'settlement', blockNumber: '100', blockTimestamp: definition.resolvesAt + 1, potWei: '4000000000000',
    tiers: [1, 2, 3].map(tierId => ({ tierId, supply: tierId === 2 ? '2' : '1', entrySupply: tierId === 2 ? '2' : '1', priceWei: definition.unitPriceWei, remainingSupply: '999999999' })),
    ratifiedScorecardId: null, ratifiedWeights: null, cashOutWeightTotal: '1000000000000000000', commitmentsFulfilled: false, noContestTriggered: false },
  account: null, inventory: { tokens: [], totalOwned: '0', totalCandidates: '0', nextCursor: null, complete: true }, delegates: [],
  scorecards: [], scorecardsNextCursor: null, scorecardsComplete: true, attestationGraceSeconds: 86400, timelockSeconds: 3600,
  noContestAfter: definition.resolvesAt + 1000000, canSubmitScorecard: false, canDelegate: false, canFulfill: false, canTriggerNoContest: false, cashOutMode: null,
}
const entry: EntryHistoryEntry = { status: 'verified-curve', transactionHash: hash, blockNumber: '95', timestamp: definition.entryOpensAt + 600,
  account, beneficiary: account, stakeWei: '4000000000000', tokenIds: ['1000000001', '2000000001', '2000000002', '3000000001'], quantities: [1, 2, 1], coefficients: [0, 1, 0, 0, 0, 0] }
const history: EntryHistoryPage = { schema: 'metalog.entries.v1', chainId: 8453, projectId: '27', blockNumber: '100', entries: [entry],
  scannedFromBlock: '91', scannedToBlock: '100', complete: false, nextCursor: '90:2147483647' }

test('entries are lazy, auditable, pinned when paginating, and refresh to a new snapshot', async ({ page }) => {
  let reads = 0
  const requests: URL[] = []
  await page.route('**/api/markets/8453/27/play?*', route => route.fulfill({ json: market }))
  await page.route('**/api/markets/8453/27/entries?*', route => {
    const url = new URL(route.request().url()); requests.push(url); reads++
    if (url.searchParams.has('cursor')) {
      expect(url.searchParams.get('blockNumber')).toBe('100')
      expect(url.searchParams.get('cursor')).toBe('90:2147483647')
      return route.fulfill({ json: { ...history, entries: [{ ...entry, status: 'verified-manual', transactionHash: `0x${'cd'.repeat(32)}`, tokenIds: ['2000000001', '2000000002', '2000000003', '2000000004'], quantities: [0, 4, 0] }], scannedFromBlock: '80', scannedToBlock: '90', nextCursor: null, complete: true } })
    }
    return route.fulfill({ json: { ...history, blockNumber: reads === 1 ? '100' : '101' } })
  })
  await page.goto('/markets/8453/27')
  await expect(page.getByRole('heading', { name: definition.prompt, exact: true })).toBeVisible()
  expect(reads).toBe(0)
  await page.getByRole('button', { name: 'View entries', exact: true }).click()
  const section = page.getByRole('region', { name: 'Entries', exact: true })
  await expect(section.getByText('Snapshot at block 100.', { exact: false })).toBeVisible()
  await section.locator('.entry-record > summary').click()
  await expect(section.getByRole('img', { name: 'Submitted curve and minted positions' })).toBeVisible()
  await expect(section.getByText('a-coefficients:', { exact: false })).toContainText('[0,1,0,0,0,0]')
  await expect(section.getByRole('link', { name: 'View mint receipt' })).toHaveAttribute('href', `https://basescan.org/tx/${hash}`)
  await expect(section.getByText('Showing the last valid allocation while you edit.', { exact: true })).toHaveCount(0)
  await section.getByText('Minted token IDs', { exact: true }).click()
  await expect(section.getByText(entry.tokenIds.join(', '), { exact: true })).toBeVisible()
  await section.getByRole('button', { name: 'Load older entries', exact: true }).click()
  await section.locator('.entry-record > summary').click()
  await expect(section.getByText('The counts were set by range; the curve is reference evidence.', { exact: true })).toBeVisible()
  await expect(section.getByText('Reference curve', { exact: true })).toBeVisible()
  await expect(section.getByText('Reached the start of the entry period.', { exact: true })).toBeVisible()
  await section.getByRole('button', { name: 'Refresh entries', exact: true }).click()
  await expect(section.getByText('Snapshot at block 101.', { exact: false })).toBeVisible()
  expect(requests.at(-1)!.searchParams.has('cursor')).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('missing curves and read failures are explicit and never replaced with fabricated forecasts', async ({ page }) => {
  let reads = 0
  await page.route('**/api/markets/8453/27/play?*', route => route.fulfill({ json: market }))
  await page.route('**/api/markets/8453/27/entries?*', route => ++reads <= 2
    ? route.fulfill({ status: 503, json: { error: 'Entry history could not be verified. Try again.' } })
    : route.fulfill({ json: { ...history, entries: [{ ...entry, status: 'unsupported', coefficients: null, beneficiary: null, stakeWei: null, reason: 'Wrapped calls are not decoded.' }] } }))
  await page.goto('/markets/8453/27')
  await page.getByRole('button', { name: 'View entries', exact: true }).click()
  const section = page.getByRole('region', { name: 'Entries', exact: true })
  await expect(section.getByRole('alert')).toHaveText('Entry history could not be verified. Try again.')
  await expect(section.getByText('No entries yet.', { exact: true })).toHaveCount(0)
  await section.getByRole('button', { name: 'Retry entries', exact: true }).click()
  await expect(section.locator('.entry-record > summary')).toContainText('Stake unavailable')
  await section.locator('.entry-record > summary').click()
  await expect(section.getByText('Wrapped calls are not decoded.', { exact: true })).toBeVisible()
  await expect(section.getByRole('img')).toHaveCount(0)
  await expect(section.getByText('Multiple recipients; see the receipt.', { exact: true })).toBeVisible()
})
