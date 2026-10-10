import { listMarkets, PUBLIC_MARKET_ERROR } from '@/lib/defifa'

export async function GET(request: Request) {
  try {
    const chainId = Number(new URL(request.url).searchParams.get('chainId') || 8453)
    return Response.json(await listMarkets(chainId), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: PUBLIC_MARKET_ERROR }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
