import { expect, test } from '@playwright/test'
import type { LifecycleSnapshot } from '../../src/lib/defifa-lifecycle'
import { EXAMPLE_MARKET } from '../../src/lib/example'
import { marketRanges, validateMarket } from '../../src/domain/market'

const account = '0x1111111111111111111111111111111111111111'
const delegate = '0x3333333333333333333333333333333333333333'
const now = Math.floor(Date.now() / 1000)
const definition = validateMarket({ ...EXAMPLE_MARKET, rangeCount: 3, rangeWidth: 1, rangeBoundaries: undefined, entryOpensAt: now - 60, entryClosesAt: now + 86_400, resolvesAt: now + 90_000 })
const snapshot: LifecycleSnapshot = {
  market: { chainId: 8453, projectId: '28', hook: account, governor: account, definition, ranges: marketRanges(definition),
    phase: 1, stage: 'entry', blockNumber: '100', blockTimestamp: now, potWei: '4000000000000',
    tiers: [1, 2, 3].map(tierId => ({ tierId, supply: '2', entrySupply: null, priceWei: definition.unitPriceWei, remainingSupply: '999999999' })),
    ratifiedScorecardId: null, ratifiedWeights: null, cashOutWeightTotal: '1000000000000000000', commitmentsFulfilled: false, noContestTriggered: false },
  account, inventory: { tokens: [{ tokenId: '1000000001', tierId: 1 }, { tokenId: '2000000001', tierId: 2 }], totalOwned: '2', totalCandidates: '2', nextCursor: null, complete: true },
  delegates: [{ tierId: 2, delegate }],
  scorecards: [], scorecardsNextCursor: null, scorecardsComplete: true, attestationGraceSeconds: 86400, timelockSeconds: 3600,
  noContestAfter: now + 1000000, canSubmitScorecard: false, canDelegate: true, canFulfill: false, canTriggerNoContest: false, cashOutMode: 'refund',
}

test('transfer and delegation open from each position menu, inline under that position', async ({ page }) => {
  await page.addInitScript(account => {
    const provider = {
      on() { return provider }, removeListener() { return provider },
      async request({ method }: { method: string }) {
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account]
        if (method === 'eth_chainId') return '0x2105'
        if (method === 'wallet_getPermissions' || method === 'wallet_requestPermissions') return [{ parentCapability: 'eth_accounts' }]
        if (method === 'wallet_getCapabilities') return {}
        throw new Error(`This presentation-only wallet cannot execute ${method}.`)
      },
    }
    Object.assign(window, { ethereum: provider })
  }, account)
  await page.route('**/api.coinbase.com/**', route => route.abort())
  await page.route('**/api/markets/8453/28/play?*', route => route.fulfill({ json: snapshot }))
  await page.route('**/api/markets/8453/28/activity*', route => route.fulfill({ json: { events: [], complete: true } }))
  await page.goto('/markets/8453/28')
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await page.getByRole('button', { name: 'Injected', exact: true }).click()
  await page.getByRole('tab', { name: /^Your position/ }).click()
  await expect(page.getByText('Transfer an position', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Voting delegation', { exact: true })).toHaveCount(0)

  await page.getByLabel('Actions for position #1000000001', { exact: true }).click()
  await page.getByRole('menuitem', { name: 'Transfer', exact: true }).click()
  await expect(page.getByRole('menu')).toBeHidden()
  const recipient = page.getByLabel('Transfer recipient', { exact: true })
  await expect(page.getByText('Ownership and payout rights of position #1000000001', { exact: false })).toBeVisible()
  const review = page.getByRole('button', { name: 'Review transfer', exact: true })
  await expect(review).toBeDisabled()
  await recipient.fill(delegate)
  await expect(review).toBeEnabled()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(recipient).toHaveCount(0)

  await page.getByLabel('Actions for position #2000000001', { exact: true }).click()
  await page.getByRole('menuitem', { name: 'Delegate votes', exact: true }).click()
  await expect(page.getByText(delegate, { exact: true })).toBeVisible()
  const delegation = page.getByRole('button', { name: 'Review delegation', exact: true })
  await expect(delegation).toBeDisabled()
  await page.getByRole('button', { name: 'Use my wallet', exact: true }).click()
  await expect(delegation).toBeEnabled()
})
