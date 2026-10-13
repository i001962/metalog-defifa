import { expect, test } from '@playwright/test'
import type { LifecycleSnapshot } from '../../src/lib/defifa-lifecycle'

const opening = Math.floor(Date.now() / 1000) - 90_000
const snapshot: LifecycleSnapshot = {
  market: {
    chainId: 84532, projectId: '47', hook: '0x1111111111111111111111111111111111111111', governor: '0x2222222222222222222222222222222222222222',
    definition: {
      schemaVersion: 1, settlement: 'defifa-scorecard', prompt: 'Preview market', source: 'Test source', resolutionRule: 'Observe it.',
      entryOpensAt: opening, entryClosesAt: opening + 86_400, resolvesAt: opening + 172_800, rangeCount: 3, rangeWidth: 1, unitPriceWei: '1000000000000',
    },
    ranges: [{ tierId: 1, lower: null, upper: -.5, label: '< -0.5%' }, { tierId: 2, lower: -.5, upper: .5, label: '-0.5% to < +0.5%' }, { tierId: 3, lower: .5, upper: null, label: '≥ +0.5%' }],
    phase: 3, stage: 'trading', blockNumber: '100', blockTimestamp: opening + 90_000, potWei: '0',
    tiers: [1, 2, 3].map(tierId => ({ tierId, supply: '0', entrySupply: null, priceWei: '1000000000000', remainingSupply: '999999999' })),
    ratifiedScorecardId: null, ratifiedWeights: null, cashOutWeightTotal: '1000000000000000000', commitmentsFulfilled: false, noContestTriggered: false,
  },
  account: null, inventory: { tokens: [], totalOwned: '0', totalCandidates: '0', nextCursor: null, complete: true }, delegates: [],
  scorecards: [], scorecardsNextCursor: null, scorecardsComplete: true, attestationGraceSeconds: 86400, timelockSeconds: 3600,
  noContestAfter: opening + 606300, canSubmitScorecard: false, canDelegate: false, canFulfill: false, canTriggerNoContest: false, cashOutMode: null,
}

test('previewing another stage restyles the page and disables every action until back to live', async ({ page }) => {
  await page.route('**/api.coinbase.com/**', route => route.abort())
  await page.route('**/api/markets/84532/47/play?*', route => route.fulfill({ json: snapshot }))
  await page.goto('/markets/84532/47')
  const lamps = page.getByRole('list', { name: 'Game stages', exact: true }).getByRole('listitem')
  const entry = page.getByRole('button', { name: 'Connect to enter', exact: true })
  await expect(lamps.nth(1)).toHaveAttribute('aria-current', 'step')
  await expect(page.getByText('Locked', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Preview Claims', exact: true }).click()
  await expect(page.getByText('nothing can be sent', { exact: false })).toBeVisible()
  await expect(lamps.nth(3)).toHaveAttribute('aria-current', 'step')
  await expect(lamps.nth(1)).toHaveAttribute('data-live', 'true')
  await expect(page.getByText('Claimable', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Preview Enter', exact: true }).click()
  await expect(page.getByText('Open', { exact: true })).toBeVisible()
  // The entry form appears as it would during entry, but a preview can never send it.
  await expect(entry).toBeVisible()
  await expect(entry).toBeDisabled()
  await page.getByRole('button', { name: 'Preview Start', exact: true }).click()
  await expect(page.getByText('nothing can be sent', { exact: false })).toHaveCount(0)
  await expect(entry).toHaveCount(0)
  await page.getByRole('button', { name: 'Preview Enter', exact: true }).click()
  await page.getByRole('button', { name: 'Back to live', exact: true }).click()
  await expect(lamps.nth(1)).toHaveAttribute('aria-current', 'step')
  await expect(entry).toHaveCount(0)
})
