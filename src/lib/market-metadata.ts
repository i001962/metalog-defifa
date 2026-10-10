import { createJBCenterClient, type JBCenterJsonObject } from '@bananapus/nana-sdk-core/jbcenter'
import { zeroHash, type Hex } from 'viem'
import { decodeMarketDefinition, marketRanges, validateMarket, type MarketDefinition } from '@/domain/market'
import { buildProjectMetadata, metadataCid, metadataMatches, validateProjectMetadata } from '@/domain/market-metadata'
import { centerBaseUrl, centerFetch } from './center'

export type PublishedMarketMetadata = {
  mode: 'ipfs' | 'embedded'
  definition: MarketDefinition
  projectUri: string
  contractUri: string
  tierUris: string[]
  encodedTierUris: Hex[]
}

export const MAX_MARKET_METADATA_BYTES = 32_768
const REQUEST_TIMEOUT_MS = 15_000

async function readJson(uri: string): Promise<unknown> {
  const cid = metadataCid(uri)
  for (let attempt = 0; ; attempt++) {
    const response = await centerFetch(`${centerBaseUrl()}/ipfs/${cid}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), redirect: 'error',
    })
    if ([404, 502, 503].includes(response.status) && attempt < 2) {
      await response.body?.cancel()
      await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 200 : 500))
      continue
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Center metadata read failed (${response.status}).`) }
    if (Number(response.headers.get('content-length')) > MAX_MARKET_METADATA_BYTES) {
      await response.body?.cancel()
      throw new Error('Market metadata exceeds the size limit.')
    }
    if (!response.body) throw new Error('Center returned empty metadata.')
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let length = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        length += value.byteLength
        if (length > MAX_MARKET_METADATA_BYTES) throw new Error('Market metadata exceeds the size limit.')
        chunks.push(value)
      }
    } finally { await reader.cancel(); reader.releaseLock() }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown }
    catch { throw new Error('Center metadata is not valid UTF-8 JSON.') }
  }
}

function published(definition: MarketDefinition, projectUri: string): PublishedMarketMetadata {
  // Defifa's native resolver generates each NFT's metadata from its onchain tier name.
  return { mode: 'ipfs', definition, projectUri, contractUri: projectUri, tierUris: [],
    encodedTierUris: marketRanges(definition).map(() => zeroHash) }
}

export async function publishMarketMetadata(input: MarketDefinition): Promise<PublishedMarketMetadata> {
  const definition = validateMarket(input)
  const center = createJBCenterClient({ baseUrl: centerBaseUrl(), fetch: centerFetch, maxResponseBytes: MAX_MARKET_METADATA_BYTES })
  const metadata = buildProjectMetadata(definition)
  const result = await center.pinJson(metadata as unknown as JBCenterJsonObject, { timeoutMs: 60_000 })
  const projectUri = `ipfs://${metadataCid(result.uri)}`
  if (result.cid !== metadataCid(projectUri)) throw new Error('Center pin returned inconsistent CID evidence.')
  if (!metadataMatches(await readJson(projectUri), metadata)) throw new Error('Pinned metadata does not match the reviewed market.')
  return published(definition, projectUri)
}

export async function loadMarketMetadata(uri: string): Promise<PublishedMarketMetadata> {
  if (uri.startsWith('data:')) {
    const definition = decodeMarketDefinition(uri)
    return { mode: 'embedded', definition, projectUri: uri, contractUri: uri, tierUris: [],
      encodedTierUris: marketRanges(definition).map(() => zeroHash) }
  }
  const metadata = validateProjectMetadata(await readJson(uri))
  return published(metadata.metalog.definition, uri)
}
