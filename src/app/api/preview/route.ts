import { forecastPreview } from '@/lib/forecast'
import { forecastSIPmath, requestedExportFormat } from '@/lib/sipmath'

/** Preview is stateless and never authorizes a wallet or sends a transaction. */
export async function POST(request: Request) {
  const selection = requestedExportFormat(request.url)
  if ('error' in selection) return Response.json(selection, { status: 400 })
  const reader = request.body?.getReader()
  if (!reader) return Response.json({ error: 'A JSON body is required.' }, { status: 400 })
  let body = '', length = 0
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > 32_768) {
        await reader.cancel()
        return Response.json({ error: 'Preview is limited to 32 KiB.' }, { status: 413 })
      }
      body += decoder.decode(value, { stream: true })
    }
    body += decoder.decode()
    const input = JSON.parse(body)
    return Response.json(selection.format === 'sipmath' ? forecastSIPmath(input) : forecastPreview(input), { headers: { 'Cache-Control': 'no-store' } })
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : 'Invalid preview.' }, { status: 400 })
  } finally { reader.releaseLock() }
}
