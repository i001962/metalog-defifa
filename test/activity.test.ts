import { describe, expect, it, vi } from 'vitest'
import { encodeEventTopics, zeroAddress, type Address, type Hex, type PublicClient } from 'viem'
import { marketRanges, type MarketDefinition } from '../src/domain/market'
import { DEFIFA_ABI, deploymentForChain, type MarketSnapshot } from '../src/lib/defifa'
import { readActivity } from '../src/lib/activity'

const chainId = 8453
const hook = '0x0000000000000000000000000000000000000456' as Address
const alice = '0x0000000000000000000000000000000000000123' as Address
const head = BigInt(deploymentForChain(chainId).deployerBlock) + 2_000n
const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as Hex
const definition: MarketDefinition = { schemaVersion: 1, settlement: 'defifa-scorecard', prompt: 'BTC?', source: 'S', resolutionRule: 'R',
  entryOpensAt: 100, entryClosesAt: 1_000, resolvesAt: 2_000, rangeCount: 3, rangeWidth: 1, unitPriceWei: '1000' }
const market = { chainId, projectId: '27', hook, definition, ranges: marketRanges(definition), blockNumber: head.toString(), blockTimestamp: 3_000 } as MarketSnapshot
const transfer = (from: Address, to: Address, tierId: number, serial: number, block: bigint, tx: number, logIndex: number) => ({
  address: hook, data: '0x', topics: encodeEventTopics({ abi: DEFIFA_ABI.DefifaHook, eventName: 'Transfer', args: { from, to, tokenId: BigInt(tierId) * 1_000_000_000n + BigInt(serial) } }),
  blockNumber: block, blockHash: hash(Number(block)), transactionHash: hash(tx), transactionIndex: 0, logIndex, removed: false,
})

describe('readActivity', () => {
  it('reads entries and exits newest first, ignores holder transfers and reads bounded windows', async () => {
    const logs = [
      transfer(zeroAddress, alice, 2, 1, head - 10n, 1, 0), transfer(zeroAddress, alice, 2, 2, head - 10n, 1, 1), transfer(zeroAddress, alice, 3, 3, head - 10n, 1, 2),
      transfer(alice, hook, 2, 1, head - 5n, 2, 0),
      transfer(alice, zeroAddress, 3, 3, head - 1n, 3, 0),
    ]
    const getLogs = vi.fn(async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
      expect(toBlock - fromBlock + 1n).toBeLessThanOrEqual(500n)
      return logs.filter(log => log.blockNumber >= fromBlock && log.blockNumber <= toBlock)
    })
    const client = { getChainId: vi.fn(async () => chainId), getLogs,
      getBlock: vi.fn(async ({ blockNumber }: { blockNumber: bigint }) => ({ number: blockNumber, hash: hash(Number(blockNumber)), timestamp: blockNumber > head - 3_000n ? 200n : 50n })) }
    const page = await readActivity(client as unknown as PublicClient, market)
    expect(page.events.map(event => [event.kind, event.account, event.quantities])).toEqual([
      ['exit', alice, [0, 0, 1]],
      ['entry', alice, [0, 2, 1]],
    ])
    expect(getLogs).toHaveBeenCalledTimes(4)
    expect(page.complete).toBe(false)
    expect(BigInt(page.nextCursor!)).toBe(head - 2_000n)
  })
})
