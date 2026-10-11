import { expect, test, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { parseEventLogs, zeroAddress, type Abi } from 'viem'
import type { LifecycleSnapshot } from '../../src/lib/defifa-lifecycle'
import DEFIFA_ABI from '../../src/lib/defifa-abi.json' with { type: 'json' }
import { injectForkWallet, startBrowserFork } from './lifecycle.harness'
import { nativeCreationRequest } from '../fixtures/transaction-requests'

test('the built website creates, enters, refunds, transfers, settles and claims on the native EVM', async ({ page }, testInfo) => {
  const environment = await startBrowserFork()
  const { fork, baseURL } = environment
  const wallet = await injectForkWallet(page, fork)
  const legacy = JSON.stringify({ ...nativeCreationRequest, value: nativeCreationRequest.value.toString(),
    version: 1, id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', createdAt: 1, afterBlock: '1', phase: 'unknown',
    account: fork.accounts[0], title: 'Earlier unresolved creation', details: [] })
  await page.addInitScript(record => {
    if (!localStorage.getItem('metalog:transaction:v1')) localStorage.setItem('metalog:transaction:v1', record)
  }, legacy)
  const pageErrors: string[] = []
  const evidence: { action: string; hash: string; blockNumber: string }[] = []
  page.on('pageerror', error => pageErrors.push(error.message))

  async function capture(name: string) {
    const path = testInfo.outputPath(`${name}.png`)
    await page.screenshot({ path, fullPage: true })
    await testInfo.attach(name, { path, contentType: 'image/png' })
  }

  async function transact(button: ReturnType<Page['getByRole']>, action: string) {
    const before = wallet.transactions.length
    await expect(button).toBeEnabled()
    await button.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Base Sepolia', { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Continue to wallet', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect.poll(() => wallet.transactions.length, { timeout: 90_000 }).toBe(before + 1)
    const hash = wallet.transactions[before]
    const receipt = await fork.client.waitForTransactionReceipt({ hash, timeout: 90_000 })
    expect(receipt.status).toBe('success')
    await expect(page.getByRole('complementary', { name: 'Transaction status' }).getByText('Submission is unconfirmed. Check the original transaction before sending again.', { exact: true })).toBeVisible({ timeout: 90_000 })
    expect(await page.evaluate(() => localStorage.getItem('metalog:transaction:v1'))).toBe(legacy)
    evidence.push({ action, hash, blockNumber: String(receipt.blockNumber) })
    console.info(`${action}: ${hash} at local block ${receipt.blockNumber}`)
    return receipt
  }
  const nfts = () => page.getByRole('region', { name: 'Your NFTs', exact: true })
  async function refresh() {
    const button = nfts().getByRole('button', { name: 'Refresh', exact: true })
    await expect(button).toBeEnabled()
    await button.click()
    await expect(button).toBeEnabled()
    await expect(nfts().getByText('Updating market and wallet positions…', { exact: true })).toBeHidden()
  }
  async function snapshot(): Promise<LifecycleSnapshot> {
    const pathname = new URL(page.url()).pathname
    const response = await page.request.get(`${baseURL}/api${pathname}/play?account=${fork.accounts[0]}`)
    expect(response.ok(), await response.text()).toBe(true)
    return response.json()
  }
  async function createMarket(question: string) {
    await page.goto(`${baseURL}/create`)
    const start = Math.ceil((Number((await fork.client.getBlock()).timestamp) + 180) / 60) * 60
    const date = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 16)
    await page.getByLabel('Question', { exact: true }).fill(question)
    await page.getByLabel('Observation source', { exact: true }).fill('Local Anvil fork browser qualification; no public transaction.')
    await page.getByLabel('Entry opens (UTC)', { exact: true }).fill(date(start))
    await page.getByLabel('Entry closes / observation starts (UTC)', { exact: true }).fill(date(start + 600))
    await page.getByLabel('Observation ends (UTC)', { exact: true }).fill(date(start + 900))
    await page.getByLabel('Ranges', { exact: true }).fill('3')
    await page.getByLabel('Price per position (ETH)', { exact: true }).fill('0.0001')
    await page.getByRole('combobox', { name: 'Network', exact: true }).selectOption('84532')
    const receipt = await transact(page.getByRole('button', { name: 'Review new market', exact: true }), 'Create market')
    await expect(page).toHaveURL(/\/markets\/84532\/\d+$/)
    await expect(page.getByRole('heading', { level: 1, name: question, exact: true })).toBeVisible()
    expect(receipt.logs.length).toBeGreaterThan(0)
    return { start, close: start + 600, end: start + 900 }
  }
  async function enter(quantities: number[]) {
    await page.getByRole('button', { name: 'By range', exact: true }).click()
    const counts = page.getByRole('region', { name: 'NFT counts', exact: true }).getByRole('textbox')
    await expect(counts).toHaveCount(3)
    for (let index = 0; index < quantities.length; index++) await counts.nth(index).fill(String(quantities[index]))
    const receipt = await transact(page.getByRole('button', { name: 'Review entry', exact: true }), 'Enter market')
    const minted = parseEventLogs({ abi: DEFIFA_ABI.DefifaHook as Abi, eventName: 'Transfer', logs: receipt.logs })
      .filter(log => (log.args as { from: string }).from === zeroAddress)
    expect(minted).toHaveLength(quantities.reduce((sum, count) => sum + count, 0))
    return receipt
  }

  try {
    await page.goto(`${baseURL}/create`)
    await page.getByRole('button', { name: 'Connect', exact: true }).click()
    await page.getByRole('button', { name: 'Local fork wallet', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Disconnect', exact: true })).toBeVisible()
    const schedule = await createMarket('Browser qualification: percentage change?')
    expect(wallet.chainSwitches).toEqual([84532])
    await expect(page.getByRole('button', { name: 'Review entry', exact: true })).toBeDisabled()
    await fork.advanceTo(schedule.start + 1)
    await refresh()
    await enter([2, 2, 2])
    await expect(nfts().getByText(/^6 owned \| 6 shown/)).toBeVisible()

    await nfts().getByRole('checkbox', { name: 'Select NFT #1000000001', exact: true }).check()
    await transact(nfts().getByRole('button', { name: 'Review refund', exact: true }), 'Refund one position')
    await expect(nfts().getByText(/^5 owned \| 5 shown/)).toBeVisible()
    await expect(nfts().getByRole('checkbox', { name: 'Select NFT #1000000001', exact: true })).toHaveCount(0)
    const afterRefund = await snapshot()
    expect(afterRefund.market.potWei).toBe('500000000000000')

    await nfts().getByRole('checkbox', { name: 'Select NFT #3000000002', exact: true }).check()
    await nfts().getByText('Transfer an NFT', { exact: true }).click()
    await page.getByLabel('Transfer recipient', { exact: true }).fill(fork.accounts[1])
    await transact(nfts().getByRole('button', { name: 'Review transfer', exact: true }), 'Transfer position')
    await expect(nfts().getByText(/^4 owned \| 4 shown/)).toBeVisible()
    await wallet.select(fork.accounts[1])
    await expect(nfts().getByText(/^1 owned \| 1 shown/)).toBeVisible()
    await expect(nfts().getByRole('checkbox', { name: 'Select NFT #3000000002', exact: true })).toBeVisible()
    await wallet.select(fork.accounts[0])
    await expect(nfts().getByText(/^4 owned \| 4 shown/)).toBeVisible()

    await fork.advanceTo(schedule.close + 2)
    await refresh()
    await expect(page.getByRole('button', { name: 'Review entry', exact: true })).toBeDisabled()
    await expect(nfts().getByRole('button', { name: 'Review refund', exact: true })).toHaveCount(0)
    await page.getByText('Propose a result', { exact: true }).click()
    const weights = page.getByRole('textbox', { name: /^Proposed payout for/ })
    for (const [index, value] of ['50', '30', '20'].entries()) await weights.nth(index).fill(value)
    await transact(page.getByRole('button', { name: 'Review result', exact: true }), 'Propose result')
    const proposal = (await snapshot()).scorecards[0]
    expect(proposal.stateName).toBe('Pending')
    const card = page.locator('details.scorecard').filter({ hasText: proposal.scorecardId })
    await card.locator('summary').click()
    const attest = card.getByRole('button', { name: `Attest result ${proposal.scorecardId}`, exact: true })
    const revoke = card.getByRole('button', { name: `Revoke attestation for result ${proposal.scorecardId}`, exact: true })
    const ratify = card.getByRole('button', { name: `Ratify result ${proposal.scorecardId}`, exact: true })
    await expect(attest).toBeDisabled()
    await fork.advanceTo(schedule.end + 2)
    await refresh()
    await transact(attest, 'Attest result')
    await expect(card.getByText('Attested', { exact: true })).toBeVisible()
    await transact(revoke, 'Revoke attestation')
    await expect(card.getByText('Not attested', { exact: true })).toBeVisible()
    await transact(attest, 'Reattest result')
    await wallet.select(fork.accounts[1])
    await expect(nfts().getByText(/^1 owned \| 1 shown/)).toBeVisible()
    await expect(card).toBeVisible()
    if (await card.getAttribute('open') === null) await card.locator('summary').click()
    await transact(attest, 'Recipient attests result')
    await wallet.select(fork.accounts[0])
    await expect(nfts().getByText(/^4 owned \| 4 shown/)).toBeVisible()
    if (await card.getAttribute('open') === null) await card.locator('summary').click()
    await expect(ratify).toBeDisabled()
    const attested = await snapshot()
    await fork.advanceTo(attested.scorecards[0].gracePeriodEnds + attested.timelockSeconds + 2)
    await refresh()
    await transact(ratify, 'Ratify result and fulfill commitments')
    await expect(page.getByRole('heading', { name: 'Claim payout', exact: true })).toBeVisible()
    await capture('owned-nfts-and-scorecard-desktop')
    await page.setViewportSize({ width: 390, height: 844 })
    await capture('owned-nfts-and-scorecard-mobile')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.setViewportSize({ width: 1280, height: 900 })
    await nfts().getByRole('button', { name: 'Select shown', exact: true }).click()
    await transact(nfts().getByRole('button', { name: 'Review claim payout', exact: true }), 'Claim payout and burn positions')
    await expect(nfts().getByText('You do not own any NFTs in this game.', { exact: true })).toBeVisible()
    const settled = await snapshot()
    expect(settled.market.ratifiedScorecardId).toBe(proposal.scorecardId)
    expect(settled.market.commitmentsFulfilled).toBe(true)
    expect(settled.inventory.totalOwned).toBe('0')
    await capture('settled-market')

    const timeoutSchedule = await createMarket('Browser qualification: timeout and refund?')
    await fork.advanceTo(timeoutSchedule.start + 1)
    await refresh()
    await enter([1, 1, 1])
    await expect(nfts().getByText(/^3 owned \| 3 shown/)).toBeVisible()
    const timeout = await snapshot()
    await fork.advanceTo(timeout.noContestAfter + 1)
    await refresh()
    await page.getByText('No contest', { exact: true }).click()
    await transact(page.getByRole('button', { name: 'Review no contest', exact: true }), 'Trigger native no contest')
    await fork.advanceTo(Number((await fork.client.getBlock()).timestamp) + 1)
    await refresh()
    await nfts().getByRole('button', { name: 'Select shown', exact: true }).click()
    await transact(nfts().getByRole('button', { name: 'Review refund', exact: true }), 'Refund no-contest positions')
    await expect(nfts().getByText('You do not own any NFTs in this game.', { exact: true })).toBeVisible()
    const refunded = await snapshot()
    expect(refunded.market.noContestTriggered).toBe(true)
    expect(refunded.market.potWei).toBe('0')
    expect(refunded.inventory.totalOwned).toBe('0')
    expect(pageErrors).toEqual([])
  } finally {
    const path = testInfo.outputPath('local-fork-evidence.json')
    await writeFile(path, JSON.stringify({ chainId: fork.chainId, fork: fork.anchor, metadataPins: wallet.metadataPins, transactions: evidence, pageErrors, serverLog: environment.diagnostic() }, null, 2))
    await testInfo.attach('local-fork-evidence', { path, contentType: 'application/json' })
    await environment.stop()
  }
})
