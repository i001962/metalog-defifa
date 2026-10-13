import { describe, expect, it, vi } from 'vitest'
import { createHookMetadata, hookMetadataId } from '@bananapus/nana-sdk-core'
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, zeroAddress, type Address, type Hex, type PublicClient } from 'viem'
import { allocatePositions } from '../src/domain/allocation'
import type { Coefficients } from '../src/domain/distribution'
import { marketRanges, type MarketDefinition } from '../src/domain/market'
import { DEFIFA_ABI, deploymentForChain, NATIVE_TOKEN, type MarketSnapshot } from '../src/lib/defifa'
import { readEntry, readEntryHistory } from '../src/lib/entries'

const chainId = 8453
const d = deploymentForChain(chainId)
const account = '0x0000000000000000000000000000000000000123' as Address
const hook = '0x0000000000000000000000000000000000000456' as Address
const number = BigInt(d.deployerBlock) + 1_000n
const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as Hex
const definition: MarketDefinition = { schemaVersion: 1, settlement: 'defifa-scorecard', prompt: 'BTC change?', source: 'Source',
  resolutionRule: 'Ratified scorecard', entryOpensAt: 100, entryClosesAt: 1_000, resolvesAt: 2_000,
  rangeCount: 3, rangeWidth: 1, unitPriceWei: '1000' }
const ranges = marketRanges(definition)
const market = { chainId, projectId: '27', hook, definition, ranges, blockNumber: number.toString(), blockTimestamp: 200 } as MarketSnapshot
const coefficients: Coefficients = [0, 1, 0, 0, 0, 0]
const allocation = allocatePositions(coefficients, ranges, 10)
const ids = allocation.tierIds.flatMap((id, index) => Array<number>(allocation.quantities[index]).fill(id))

function fixture(options: { mode?: 'manual'; memo?: string; missingMint?: boolean; target?: Address; outsiderMint?: boolean; transactions?: number; malformedReceipt?: boolean; wrongDelegate?: boolean } = {}) {
  const transactions = options.transactions ?? 1
  const all = Array.from({ length: transactions }, (_, txIndex) => {
    const tierIds = options.mode === 'manual' ? [1, 1, 3] : ids
    const metadata = createHookMetadata([hookMetadataId(d.implementation, 'pay')], [encodeAbiParameters([{ type: 'address' }, { type: 'uint16[]' }], [options.wrongDelegate ? hook : account, tierIds])])
    const memo = options.memo ?? JSON.stringify(options.mode === 'manual'
      ? { schema: 'metalog.entry.v2', units: 'percentage-points', coefficients, mode: 'manual', quantities: [2, 0, 1], count: 3 }
      : { schema: 'metalog.entry.v1', units: 'percentage-points', coefficients, count: 10 })
    const transactionHash = hash(txIndex + 1)
    const blockHash = hash(100)
    const minted = tierIds.map((tierId, index) => ({
      address: hook, data: '0x', topics: encodeEventTopics({ abi: DEFIFA_ABI.DefifaHook, eventName: 'Transfer', args: {
        from: zeroAddress, to: options.outsiderMint && index === 0 ? hook : account,
        tokenId: BigInt(tierId) * 1_000_000_000n + BigInt(index + txIndex * 10 + 1),
      } }), blockNumber: number, blockHash, transactionHash, transactionIndex: txIndex, logIndex: index, removed: false,
    }))
    const transaction = { hash: transactionHash, blockHash, blockNumber: number, transactionIndex: txIndex, from: account,
      to: options.target ?? d.terminal, value: BigInt(tierIds.length) * 1000n,
      input: encodeFunctionData({ abi: DEFIFA_ABI.JBMultiTerminal, functionName: 'pay', args: [27n, NATIVE_TOKEN,
        BigInt(tierIds.length) * 1000n, account, 0n, memo, metadata] }) }
    const receipt = { status: 'success', from: account, to: transaction.to, blockNumber: number,
      blockHash: options.malformedReceipt ? hash(999) : blockHash, transactionHash, transactionIndex: txIndex,
      logs: options.missingMint ? minted.slice(1) : minted }
    return { transaction, receipt, minted }
  })
  const getLogs = vi.fn(async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
    expect(toBlock - fromBlock + 1n).toBeLessThanOrEqual(500n)
    return number >= fromBlock && number <= toBlock ? all.flatMap(item => item.minted) : []
  })
  const client = { getChainId: vi.fn(async () => chainId), getLogs,
    getBlock: vi.fn(async ({ blockNumber }: { blockNumber: bigint }) => ({ number: blockNumber, hash: hash(100), timestamp: blockNumber >= number ? 200n : 99n })),
    getTransaction: vi.fn(async ({ hash: requested }: { hash: Hex }) => all.find(item => item.transaction.hash === requested)!.transaction),
    getTransactionReceipt: vi.fn(async ({ hash: requested }: { hash: Hex }) => all.find(item => item.transaction.hash === requested)!.receipt) }
  return { client: client as unknown as PublicClient, mocks: client }
}

describe('public entry receipt evidence', () => {
  it('authenticates a direct curve and exact mint quantities without reading current ownership', async () => {
    const { client, mocks } = fixture()
    const page = await readEntryHistory(client, market)
    expect(page.entries[0]).toMatchObject({ status: 'verified-curve', coefficients, quantities: allocation.quantities,
      account, beneficiary: account, stakeWei: '10000', timestamp: 200, blockNumber: number.toString() })
    expect(page.entries[0].tokenIds).toHaveLength(10)
    expect(page.complete).toBe(true)
    expect(mocks.getLogs).toHaveBeenCalledOnce()
  })
  it('authenticates manual quantities while retaining coefficients only as reference', async () => {
    const page = await readEntryHistory(fixture({ mode: 'manual' }).client, market)
    expect(page.entries[0]).toMatchObject({ status: 'verified-manual', quantities: [2, 0, 1], coefficients, stakeWei: '3000' })
  })
  it.each([{ memo: '{"schema":"metalog.entry.v1"}' }, { missingMint: true }])('never authenticates malformed curve or incomplete mints %j', async options => {
    const page = await readEntryHistory(fixture(options).client, market)
    expect(page.entries[0].status).toBe('invalid')
    expect(page.entries[0].coefficients).toBeNull()
  })
  it('rejects a spoofed curve whose claimed coefficients disagree with the actual mints', async () => {
    const memo = JSON.stringify({ schema: 'metalog.entry.v1', units: 'percentage-points', coefficients: [0, 5], count: 10 })
    expect((await readEntryHistory(fixture({ memo }).client, market)).entries[0].status).toBe('invalid')
  })
  it('rejects wrong native delegation metadata instead of relying only on a memo', async () => {
    expect((await readEntryHistory(fixture({ wrongDelegate: true }).client, market)).entries[0].status).toBe('invalid')
  })
  it('rejects extra mints to a different recipient even when reviewed allocation subset matches', async () => {
    expect((await readEntryHistory(fixture({ outsiderMint: true }).client, market)).entries[0].status).toBe('invalid')
  })
  it('shows direct unknown memos as unrecognized, not a claimed curve', async () => {
    expect((await readEntryHistory(fixture({ memo: 'hello' }).client, market)).entries[0]).toMatchObject({ status: 'unrecognized', coefficients: null, stakeWei: '10000' })
  })
  it('shows wrapped effects without attributing outer value to an entry stake', async () => {
    expect((await readEntryHistory(fixture({ target: hook }).client, market)).entries[0]).toMatchObject({ status: 'unsupported', coefficients: null, stakeWei: null })
  })
  it('fails the page on noncanonical receipts and provider failures', async () => {
    await expect(readEntryHistory(fixture({ malformedReceipt: true }).client, market)).rejects.toThrow('canonical')
    const { client, mocks } = fixture()
    mocks.getTransactionReceipt.mockRejectedValueOnce(new Error('provider down'))
    await expect(readEntryHistory(client, market)).rejects.toThrow('provider down')
  })
  it('continues within a dense block without losing or repeating transactions', async () => {
    const { client } = fixture({ transactions: 10 })
    const page = await readEntryHistory(client, market)
    expect(page.entries.map(entry => entry.transactionHash)).toEqual([10, 9, 8, 7, 6, 5, 4, 3].map(hash))
    expect(page.nextCursor).toBe(`${number}:2`)
    const second = await readEntryHistory(client, market, page.nextCursor!)
    expect(second.entries.map(entry => entry.transactionHash)).toEqual([2, 1].map(hash))
    expect(second.complete).toBe(true)
  })
  it('bounds empty pages to four 500-block windows and reports remaining coverage', async () => {
    const { client, mocks } = fixture()
    const late = { ...market, blockNumber: (number + 10_000n).toString() }
    const page = await readEntryHistory(client, late)
    expect(page.entries).toEqual([])
    expect(page.complete).toBe(false)
    expect(page.scannedFromBlock).toBe((number + 8_001n).toString())
    expect(page.nextCursor).toBe(`${number + 8_000n}:2147483647`)
    expect(mocks.getLogs).toHaveBeenCalledTimes(4)
  })
  it('excludes post-entry blocks from older settled snapshots', async () => {
    const { client, mocks } = fixture()
    mocks.getBlock.mockImplementation(async ({ blockNumber }) => ({ number: blockNumber, hash: hash(100),
      timestamp: blockNumber < number ? 99n : blockNumber < number + 1_000n ? 200n : 1_000n }))
    const settled = { ...market, blockNumber: (number + 5_000n).toString(), blockTimestamp: 2_000 }
    const page = await readEntryHistory(client, settled)
    expect(page.entries[0].status).toBe('verified-curve')
    expect(page.scannedToBlock).toBe((number + 999n).toString())
    expect(mocks.getLogs).toHaveBeenCalledTimes(2)
  })
  it('rejects cursors outside the snapshot and does not turn missing logs into history completion', async () => {
    const { client, mocks } = fixture()
    await expect(readEntryHistory(client, market, `${number + 1n}:0`)).rejects.toThrow('outside')
    mocks.getLogs.mockRejectedValueOnce(new Error('rate limit'))
    await expect(readEntryHistory(client, market)).rejects.toThrow('rate limit')
  })
  it('looks up one entry by transaction with the same checks as history pages', async () => {
    const { client } = fixture()
    const [listed] = (await readEntryHistory(client, market)).entries
    expect(await readEntry(client, market, hash(1))).toEqual(listed)
    const { client: noMints } = fixture({ missingMint: true, transactions: 1 })
    const receipt = await noMints.getTransactionReceipt({ hash: hash(1) })
    ;(receipt.logs as unknown[]).length = 0
    await expect(readEntry(noMints, market, hash(1))).rejects.toThrow('did not mint')
  })
})
