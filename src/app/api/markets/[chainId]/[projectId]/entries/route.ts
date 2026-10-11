import { projectNumber, readMarketAt } from '@/lib/defifa'
import { readEntryHistory } from '@/lib/entries'
import { chainForId, publicClientForChain } from '@/lib/wallet'
import { assertChain } from '@/lib/defifa-deployment'
import { densityBuckets } from '@/domain/distribution'
import { positionDensities } from '@/domain/allocation'

export async function GET(request: Request, { params }: { params: Promise<{ chainId: string; projectId: string }> }) {
  const { chainId, projectId } = await params
  const query = new URL(request.url).searchParams
  const blockNumber = query.get('blockNumber')
  const cursor = query.get('cursor')
  // Public read-only evidence; this does not admit an origin to wallet or pin APIs.
  const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }
  try {
    if (!/^\d{1,10}$/.test(chainId)) throw new Error('This network is not supported.')
    chainForId(Number(chainId))
    projectNumber(projectId)
    if (blockNumber !== null && (!/^\d{1,78}$/.test(blockNumber) || BigInt(blockNumber) >= 2n ** 256n)) throw new Error('The snapshot block is invalid.')
    if (cursor !== null && (!/^\d{1,78}:\d{1,10}$/.test(cursor) || !blockNumber)) throw new Error('Entry pagination requires a valid cursor and original snapshot block.')
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : 'Invalid entry request.' }, { status: 400, headers })
  }
  try {
    const client = publicClientForChain(Number(chainId))
    await assertChain(client, Number(chainId))
    const block = await client.getBlock(blockNumber === null ? undefined : { blockNumber: BigInt(blockNumber) })
    const market = await readMarketAt(client, Number(chainId), projectId, block.number, Number(block.timestamp))
    const evidence = await readEntryHistory(client, market, cursor ?? undefined)
    const finite = market.ranges.filter(range => range.lower !== null && range.upper !== null)
    const low = finite[0]!.lower!, high = finite.at(-1)!.upper!
    const entries = evidence.entries.map(entry => {
      if (!entry.coefficients || !['verified-curve', 'verified-manual'].includes(entry.status)) return { ...entry, chart: null }
      try {
        return { ...entry, chart: { ...densityBuckets(entry.coefficients, 600, { low, high }),
          positions: positionDensities(market.ranges, entry.quantities) } }
      } catch {
        // A display precision limit must not discard authenticated receipts.
        return { ...entry, chart: null, chartError: 'This range layout cannot be drawn at chart precision. See the exact counts and receipt.' }
      }
    })
    return Response.json({ ...evidence, entries, hook: market.hook, ranges: market.ranges, snapshotBlockHash: block.hash }, { headers })
  } catch {
    return Response.json({ error: 'Entry history could not be verified. Try again.', }, { status: 503, headers })
  }
}
