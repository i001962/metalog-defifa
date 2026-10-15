import { projectNumber, readMarketAt } from '@/lib/defifa'
import { readResultVoters } from '@/lib/defifa-lifecycle'
import { chainForId, publicClientForChain } from '@/lib/wallet'
import { assertChain } from '@/lib/defifa-deployment'

export async function GET(request: Request, { params }: { params: Promise<{ chainId: string; projectId: string }> }) {
  const { chainId, projectId } = await params
  const query = new URL(request.url).searchParams
  const blockNumber = query.get('blockNumber'), scorecard = query.get('scorecard'), submittedAt = query.get('submittedAt')
  const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }
  try {
    if (!/^\d{1,10}$/.test(chainId)) throw new Error('This network is not supported.')
    chainForId(Number(chainId))
    projectNumber(projectId)
    if (!blockNumber || !/^\d{1,78}$/.test(blockNumber)) throw new Error('The snapshot block is invalid.')
    if (!scorecard || !/^\d{1,78}$/.test(scorecard)) throw new Error('The result is invalid.')
    if (!submittedAt || !/^\d{1,12}$/.test(submittedAt)) throw new Error('The submission time is invalid.')
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : 'Invalid voters request.' }, { status: 400, headers })
  }
  try {
    const client = publicClientForChain(Number(chainId))
    await assertChain(client, Number(chainId))
    const block = await client.getBlock({ blockNumber: BigInt(blockNumber) })
    if (Number(submittedAt) > Number(block.timestamp)) throw new Error('The result was submitted after this snapshot.')
    const market = await readMarketAt(client, Number(chainId), projectId, block.number, Number(block.timestamp))
    return Response.json(await readResultVoters(client, market, BigInt(scorecard), Number(submittedAt)), { headers })
  } catch (cause) {
    const message = cause instanceof Error && /^Voters are listed|submitted after/.test(cause.message) ? cause.message : 'Voters could not be read. Try again.'
    return Response.json({ error: message }, { status: 503, headers })
  }
}
