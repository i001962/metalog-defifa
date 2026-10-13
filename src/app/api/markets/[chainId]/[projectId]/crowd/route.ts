import { projectNumber, readMarketAt } from '@/lib/defifa'
import { readCrowd, type CrowdEvidence } from '@/lib/entries'
import { chainForId, publicClientForChain } from '@/lib/wallet'

// Entries cannot change after entry closes, so a closed game's crowd is kept; an open game's for a minute.
const cache = new Map<string, { at: number; final: boolean; crowd: Promise<CrowdEvidence> }>()
const OPEN_TTL_MS = 60_000

export async function GET(_request: Request, { params }: { params: Promise<{ chainId: string; projectId: string }> }) {
  const { chainId, projectId } = await params
  const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }
  try {
    if (!/^\d{1,10}$/.test(chainId)) throw new Error('This network is not supported.')
    chainForId(Number(chainId))
    projectNumber(projectId)
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : 'Invalid crowd request.' }, { status: 400, headers })
  }
  const key = `${chainId}:${projectId}`
  try {
    let hit = cache.get(key)
    if (!hit || (!hit.final && Date.now() - hit.at > OPEN_TTL_MS)) {
      const client = publicClientForChain(Number(chainId))
      const block = await client.getBlock()
      const market = await readMarketAt(client, Number(chainId), projectId, block.number, Number(block.timestamp))
      hit = { at: Date.now(), final: market.blockTimestamp >= market.definition.entryClosesAt, crowd: readCrowd(client, market) }
      cache.set(key, hit)
      hit.crowd.catch(() => cache.delete(key))
    }
    return Response.json(await hit.crowd, { headers })
  } catch {
    return Response.json({ error: 'The crowd curve could not be verified. Try again.' }, { status: 503, headers })
  }
}
