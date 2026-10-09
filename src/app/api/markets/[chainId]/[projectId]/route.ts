import { readMarket } from '@/lib/defifa'
import { marketData } from '@/lib/market-data'
import { marketSIPmath } from '@/lib/sipmath-market'
import { requestedExportFormat } from '@/lib/sipmath'

export async function GET(request: Request, { params }: { params: Promise<{ chainId: string; projectId: string }> }) {
  const selection = requestedExportFormat(request.url)
  if ('error' in selection) return Response.json(selection, { status: 400 })
  const { chainId, projectId } = await params
  try {
    const snapshot = await readMarket(Number(chainId), projectId)
    const headers = new Headers({ 'Cache-Control': 'no-store' })
    if (selection.format === 'sipmath') headers.set('Content-Disposition', 'attachment; filename="metalog-market.SIPmath"')
    return Response.json(selection.format === 'sipmath' ? marketSIPmath(snapshot) : marketData(snapshot), { headers })
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : 'Market unavailable.' }, { status: 503 })
  }
}
