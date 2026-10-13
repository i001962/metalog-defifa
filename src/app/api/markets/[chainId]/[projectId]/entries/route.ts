import { projectNumber, readMarketAt } from '@/lib/defifa'
import { readEntry, readEntryHistory, type EntryHistoryEntry } from '@/lib/entries'
import type { MarketSnapshot } from '@/lib/defifa'
import { chainForId, publicClientForChain } from '@/lib/wallet'
import { assertChain } from '@/lib/defifa-deployment'
import { densityBuckets } from '@/domain/distribution'
import { positionDensities } from '@/domain/allocation'

export async function GET(request: Request, { params }: { params: Promise<{ chainId: string; projectId: string }> }) {
  const { chainId, projectId } = await params
  const query = new URL(request.url).searchParams
  const blockNumber = query.get('blockNumber')
  const cursor = query.get('cursor')
  const tx = query.get('tx')
  // Public read-only evidence; this does not admit an origin to wallet or pin APIs.
  const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }
  try {
    if (!/^\d{1,10}$/.test(chainId)) throw new Error('This network is not supported.')
    chainForId(Number(chainId))
    projectNumber(projectId)
    if (blockNumber !== null && (!/^\d{1,78}$/.test(blockNumber) || BigInt(blockNumber) >= 2n ** 256n)) throw new Error('The snapshot block is invalid.')
    if (cursor !== null && (!/^\d{1,78}:\d{1,10}$/.test(cursor) || !blockNumber)) throw new Error('Entry pagination requires a valid cursor and original snapshot block.')
    if (tx !== null && !/^0x[0-9a-fA-F]{64}$/.test(tx)) throw new Error('The transaction hash is invalid.')
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : 'Invalid entry request.' }, { status: 400, headers })
  }
  try {
    const client = publicClientForChain(Number(chainId))
    await assertChain(client, Number(chainId))
    const block = await client.getBlock(blockNumber === null ? undefined : { blockNumber: BigInt(blockNumber) })
    const market = await readMarketAt(client, Number(chainId), projectId, block.number, Number(block.timestamp))
    if (tx !== null) return Response.json({ entry: withChart(market, await readEntry(client, market, tx as `0x${string}`)), hook: market.hook, ranges: market.ranges }, { headers })
    const evidence = await readEntryHistory(client, market, cursor ?? undefined)
    return Response.json({ ...evidence, entries: evidence.entries.map(entry => withChart(market, entry)), hook: market.hook, ranges: market.ranges, snapshotBlockHash: block.hash }, { headers })
  } catch {
    return Response.json({ error: 'Entry history could not be verified. Try again.', }, { status: 503, headers })
  }
}

function withChart(market: MarketSnapshot, entry: EntryHistoryEntry) {
  const finite = market.ranges.filter(range => range.lower !== null && range.upper !== null)
  const low = finite[0]!.lower!, high = finite.at(-1)!.upper!
  if (!entry.coefficients || !['verified-curve', 'verified-manual'].includes(entry.status)) return { ...entry, chart: null }
  try {
    return { ...entry, chart: { ...densityBuckets(entry.coefficients, 600, { low, high }),
      positions: positionDensities(market.ranges, entry.quantities) } }
  } catch {
    // A display precision limit must not discard authenticated receipts.
    return { ...entry, chart: null, chartError: 'This range layout cannot be drawn at chart precision. See the exact counts and receipt.' }
  }
}
