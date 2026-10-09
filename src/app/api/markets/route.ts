import { listMarkets } from '@/lib/defifa'

export async function GET(request: Request) {
  try {
    const chainId = Number(new URL(request.url).searchParams.get('chainId') || 8453)
    return Response.json(await listMarkets(chainId), { headers: { 'Cache-Control': 'no-store' } })
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : 'Markets unavailable.' }, { status: 503 })
  }
}
