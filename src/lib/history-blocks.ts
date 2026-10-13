import type { PublicClient } from 'viem'
import { deploymentForChain } from './defifa-deployment'
import type { MarketSnapshot } from './defifa'

export const MAX_LOG_BLOCKS = 500n

// ponytail: per-process memo, cleared whole when large; a shared cache if instances multiply.
const found = new Map<string, bigint>()

/** Bounded search near the game, avoiding unrelated ancient RPC reads. */
export async function firstBlockAtTimestamp(client: PublicClient, market: MarketSnapshot, timestamp: number): Promise<bigint> {
  const key = `${market.chainId}:${timestamp}`
  const known = found.get(key)
  if (known !== undefined && known <= BigInt(market.blockNumber)) return known
  const floor = BigInt(deploymentForChain(market.chainId).deployerBlock)
  let high = BigInt(market.blockNumber)
  if (floor > high) throw new Error('The requested snapshot precedes the configured Defifa deployment.')
  let low = floor
  let distance = 1n
  let reads = 0
  // Start near this game, not at deployment. Pruned public RPCs can serve a new game
  // while rejecting an unrelated years-old midpoint of deployment→head.
  while (high > floor && reads < 64) {
    const probe = BigInt(market.blockNumber) - distance > floor ? BigInt(market.blockNumber) - distance : floor
    const block = await client.getBlock({ blockNumber: probe })
    reads++
    if (Number(block.timestamp) < timestamp) { low = probe + 1n; break }
    high = probe
    if (probe === floor) { low = floor; break }
    distance *= 2n
  }
  for (; low < high && reads < 64; reads++) {
    const middle = (low + high) / 2n
    const block = await client.getBlock({ blockNumber: middle })
    if (Number(block.timestamp) < timestamp) low = middle + 1n
    else high = middle
  }
  if (low !== high) throw new Error('The history range could not be resolved within its read limit.')
  // Only an answer below the snapshot head is final; at the head, the block may not exist yet.
  if (low < BigInt(market.blockNumber)) {
    if (found.size > 1_000) found.clear()
    found.set(key, low)
  }
  return low
}
