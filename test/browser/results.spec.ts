import { expect, test } from '@playwright/test'
import type { LifecycleSnapshot } from '../../src/lib/defifa-lifecycle'
import { EXAMPLE_MARKET } from '../../src/lib/example'
import { marketRanges, validateMarket } from '../../src/domain/market'
import { buildObservationPreset } from '../../src/domain/observation-presets'

const account = '0x1111111111111111111111111111111111111111'
const definition = validateMarket({ ...EXAMPLE_MARKET, rangeCount: 3, rangeWidth: 1, rangeBoundaries: undefined, source: buildObservationPreset('ETH-USD', '1d').source })
const snapshot: LifecycleSnapshot = {
  market: { chainId: 8453, projectId: '27', hook: account, governor: account, definition, ranges: marketRanges(definition),
    phase: 3, stage: 'settlement', blockNumber: '100', blockTimestamp: definition.resolvesAt + 1, potWei: '4000000000000',
    tiers: [1, 2, 3].map(tierId => ({ tierId, supply: '2', entrySupply: '2', priceWei: definition.unitPriceWei, remainingSupply: '999999999' })),
    ratifiedScorecardId: null, ratifiedWeights: null, cashOutWeightTotal: '1000000000000000000', commitmentsFulfilled: false, noContestTriggered: false },
  account: null, inventory: { tokens: [], totalOwned: '0', totalCandidates: '0', nextCursor: null, complete: true }, delegates: [],
  scorecards: [], scorecardsNextCursor: '50', scorecardsComplete: false, attestationGraceSeconds: 86400, timelockSeconds: 3600,
  noContestAfter: definition.resolvesAt + 1000000, canSubmitScorecard: true, canDelegate: false, canFulfill: false, canTriggerNoContest: false, cashOutMode: null,
}

test('with nothing proposed, proposing comes first and the observed result is one click', async ({ page }) => {
  await page.route('**/api.coinbase.com/**', route => route.abort())
  // The rule's candles: 2000 at observation start, 1980 at its end, so -1%.
  await page.route('**/api.exchange.coinbase.com/products/ETH-USD/candles?*', route => {
    const start = Date.parse(new URL(route.request().url()).searchParams.get('start')!) / 1000
    return route.fulfill({ json: [[start, 1, 1, start === definition.entryClosesAt ? 2000 : 1980, 1, 1]] })
  })
  await page.route('**/api/markets/8453/27/play?*', route => route.fulfill({ json: snapshot }))
  await page.goto('/markets/8453/27')
  await page.getByRole('tab', { name: /^Results/ }).click()
  const payouts = page.getByRole('textbox', { name: /^Proposed payout for/ })
  await expect(payouts.first()).toBeVisible()
  // The proposal form sits above the older-results button.
  const form = await payouts.first().boundingBox(), more = await page.getByRole('button', { name: 'Load more results', exact: true }).boundingBox()
  expect(form!.y).toBeLessThan(more!.y)
  await page.getByRole('button', { name: /^Use the observed result: -1%, / }).click()
  await expect(payouts.nth(0)).toHaveValue('100')
  await expect(payouts.nth(1)).toHaveValue('0')
  // The chart marks the final outcome, not a live one.
  await page.getByRole('tab', { name: /^Market/ }).click()
  await expect(page.locator('.chart-now text').first()).toHaveText(/^Ended -1% \| 2 positions here$/)
})

test('a result shows its quorum and why it cannot be ratified yet', async ({ page }) => {
  await page.route('**/api.coinbase.com/**', route => route.abort())
  await page.route('**/api.exchange.coinbase.com/**', route => route.abort())
  const id = '60529520722568114638999594129076250273058889415093720637770115388098871508689'
  await page.route('**/api/markets/8453/27/play?*', route => route.fulfill({ json: { ...snapshot, scorecardsNextCursor: null, scorecardsComplete: true,
    scorecards: [{ scorecardId: id, weights: [{ tierId: 1, weight: '1000000000000000000' }], submitter: account, state: 1, stateName: 'Active',
      submittedAt: definition.resolvesAt + 1, attestationsBegin: definition.resolvesAt + 2, gracePeriodEnds: definition.resolvesAt + 86_402,
      attestationCount: '12396763389', quorum: '19999999999', accountWeight: null, hasAttested: false, canAttest: false, canRevoke: false, canRatify: false }] } }))
  await page.goto('/markets/8453/27')
  await page.getByRole('tab', { name: /^Results/ }).click()
  const card = page.locator('details.scorecard')
  await expect(card.locator('summary')).toContainText('Result 6052…8689 | Active')
  await card.locator('summary').click()
  await expect(card).toContainText('12,396,763,389 of 19,999,999,999 needed')
  await expect(card).toContainText('Needs 7,603,236,610 more attestation weight')
})
