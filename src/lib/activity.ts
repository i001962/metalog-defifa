import { getAbiItem, parseEventLogs, zeroAddress, type Address, type Hex, type PublicClient } from 'viem'
import type { MarketSnapshot } from './defifa'
import { assertChain, DEFIFA_ABI, sameAddress, TOKEN_MULTIPLIER } from './defifa-deployment'
import { firstBlockAtTimestamp, MAX_LOG_BLOCKS } from './history-blocks'

export type ActivityEvent = {
  kind: 'entry' | 'exit'
  transactionHash: Hex
  blockNumber: string
  timestamp: number
  account: Address
  /** NFTs minted (entry) or burned (exit) per range, in market range order. */
  quantities: number[]
}
export type ActivityPage = {
  schema: 'metalog.activity.v1'
  blockNumber: string
  events: ActivityEvent[]
  complete: boolean
  nextCursor: string | null
}
const MAX_EVENTS = 20
const MAX_REQUESTS = 4

type Transfer = { from: Address; to: Address; tokenId: bigint }

/** Mints and burns, newest first. Effects only: no stake, curve or payout amounts are attributed here. */
export async function readActivity(client: PublicClient, market: MarketSnapshot, cursor?: string): Promise<ActivityPage> {
  await assertChain(client, market.chainId)
  const head = BigInt(market.blockNumber)
  const page: ActivityPage = { schema: 'metalog.activity.v1', blockNumber: market.blockNumber, events: [], complete: true, nextCursor: null }
  if (market.blockTimestamp < market.definition.entryOpensAt) return page
  const first = await firstBlockAtTimestamp(client, market, market.definition.entryOpensAt)
  let end = head
  if (cursor !== undefined) {
    if (!/^\d{1,78}$/.test(cursor) || BigInt(cursor) > head || BigInt(cursor) < first) throw new Error('The activity cursor is outside this snapshot.')
    end = BigInt(cursor)
  }
  const event = getAbiItem({ abi: DEFIFA_ABI.DefifaHook, name: 'Transfer' })
  if (!event || event.type !== 'event') throw new Error('The transfer event ABI is unavailable.')
  const transfers = new Map<Hex, { blockNumber: bigint; timestamp?: bigint; logs: Transfer[] }>()
  for (let request = 0; request < MAX_REQUESTS && end >= first && transfers.size < MAX_EVENTS; request++) {
    const start = end - first + 1n > MAX_LOG_BLOCKS ? end - MAX_LOG_BLOCKS + 1n : first
    const rawLogs = await client.getLogs({ address: market.hook, event, fromBlock: start, toBlock: end, strict: true })
    const logs = parseEventLogs({ abi: DEFIFA_ABI.DefifaHook, logs: rawLogs, eventName: 'Transfer', strict: true })
    if (logs.length !== rawLogs.length) throw new Error('The activity response contains invalid transfer logs.')
    for (const log of logs.toReversed()) {
      if (log.removed || log.blockNumber === null || !log.transactionHash || !sameAddress(log.address, market.hook)
        || log.blockNumber < start || log.blockNumber > end) throw new Error('The activity logs do not match the requested history.')
      const args = log.args as Transfer
      if (!sameAddress(args.from, zeroAddress) && !sameAddress(args.to, zeroAddress)) continue
      // Center logs carry blockTimestamp; other providers fall back to one block read per block.
      const item = transfers.get(log.transactionHash) ?? { blockNumber: log.blockNumber, timestamp: (log as { blockTimestamp?: bigint }).blockTimestamp, logs: [] }
      item.logs.push(args)
      transfers.set(log.transactionHash, item)
    }
    end = start - 1n
  }
  // ponytail: a page ends on a window boundary, so one transaction is never split across pages.
  const blocks = new Map<bigint, number>()
  for (const { blockNumber, timestamp } of transfers.values()) {
    if (timestamp !== undefined) blocks.set(blockNumber, Number(timestamp))
    else if (!blocks.has(blockNumber)) blocks.set(blockNumber, Number((await client.getBlock({ blockNumber })).timestamp))
  }
  for (const [transactionHash, { blockNumber, logs }] of transfers) {
    for (const kind of ['entry', 'exit'] as const) {
      const moved = logs.filter(log => sameAddress(kind === 'entry' ? log.from : log.to, zeroAddress))
      if (!moved.length) continue
      page.events.push({ kind, transactionHash, blockNumber: blockNumber.toString(), timestamp: blocks.get(blockNumber)!,
        account: kind === 'entry' ? moved[0].to : moved[0].from,
        quantities: market.ranges.map(range => moved.filter(log => log.tokenId / TOKEN_MULTIPLIER === BigInt(range.tierId)).length) })
    }
  }
  page.complete = end < first
  page.nextCursor = page.complete ? null : end.toString()
  return page
}
