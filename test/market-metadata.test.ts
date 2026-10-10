import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bytes32ToCidV0 } from '@bananapus/nana-sdk-core'
import { zeroHash, type Hex } from 'viem'
import { encodeMarketDefinition, marketRanges, type MarketDefinition } from '../src/domain/market'
import { buildProjectMetadata, metadataCid, validateProjectMetadata } from '../src/domain/market-metadata'
import { loadMarketMetadata, MAX_MARKET_METADATA_BYTES, publishMarketMetadata } from '../src/lib/market-metadata'

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('../src/lib/center', () => ({ centerBaseUrl: () => 'https://juicebox.center', centerFetch: mocks.fetch }))
const definition: MarketDefinition = {
  schemaVersion: 1, settlement: 'defifa-scorecard', prompt: 'BTC change?', source: 'Named source',
  resolutionRule: 'Compare specified observations.', entryOpensAt: 1_800_000_100,
  entryClosesAt: 1_800_003_700, resolvesAt: 1_800_090_100, rangeBoundaries: [-2, 0, 4], unitPriceWei: '1000',
}
const documents = new Map<string, unknown>()
const json = (value: unknown) => Response.json(value)
let nextCid = 1
const cid = () => bytes32ToCidV0(`0x${(nextCid++).toString(16).padStart(64, '0')}` as Hex)!

beforeEach(() => {
  nextCid = 1
  documents.clear()
  mocks.fetch.mockReset().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/v1/pins/json')) {
      const value = JSON.parse(String(init?.body)) as unknown
      const identifier = cid()
      documents.set(identifier, value)
      return json({ cid: identifier, uri: `ipfs://${identifier}`, status: 'queued', gatewayUrl: `/ipfs/${identifier}` })
    }
    return documents.has(url.split('/').at(-1)!) ? json(documents.get(url.split('/').at(-1)!)) : new Response('', { status: 404 })
  })
})

describe('Center market metadata', () => {
  it('pins exactly one manifest for 21 ranges, verifies JSON, and reloads exact immutable metadata', async () => {
    const defaultDefinition = { ...definition, rangeBoundaries: undefined, rangeCount: 21, rangeWidth: 1 } as MarketDefinition
    const result = await publishMarketMetadata(defaultDefinition)
    expect(result.mode).toBe('ipfs')
    expect(result.contractUri).toBe(result.projectUri)
    expect(result.tierUris).toEqual([])
    expect(result.encodedTierUris).toEqual(Array.from({ length: 21 }, () => zeroHash))
    const stored = documents.get(metadataCid(result.projectUri))
    expect(stored).toEqual(buildProjectMetadata(defaultDefinition))
    expect((stored as ReturnType<typeof buildProjectMetadata>).metalog.tiers).toEqual(marketRanges(defaultDefinition))
    expect(mocks.fetch.mock.calls.filter(([url]) => url.endsWith('/v1/pins/json'))).toHaveLength(1)
    expect(await loadMarketMetadata(result.projectUri)).toEqual(result)
    expect(mocks.fetch.mock.calls.every(([, init]) => init?.method === 'POST' || init?.redirect === 'error')).toBe(true)
  })

  it('does not treat queued pins as available or accept mismatched project JSON', async () => {
    const original = mocks.fetch.getMockImplementation()!
    mocks.fetch.mockImplementation(async (url, init) => url.includes('/ipfs/') ? json({ name: 'Wrong' }) : original(url, init))
    await expect(publishMarketMetadata(definition)).rejects.toThrow('Pinned metadata does not match')
  })

  it('rejects modified range labels, geometry, project fields, and unknown envelope keys', async () => {
    const result = await publishMarketMetadata(definition)
    const project = documents.get(metadataCid(result.projectUri)) as ReturnType<typeof buildProjectMetadata>
    expect(() => validateProjectMetadata({ ...project, name: 'other question' })).toThrow('does not match')
    expect(() => validateProjectMetadata({ ...project, unexpected: true })).toThrow('does not match')
    expect(() => validateProjectMetadata({ ...project, metalog: { ...project.metalog, tiers: [] } })).toThrow('does not match')
    for (const change of [{ label: 'other range' }, { lower: -123 }, { tierId: 999 }]) {
      documents.set(metadataCid(result.projectUri), { ...project, metalog: { ...project.metalog,
        tiers: project.metalog.tiers.map((range, index) => index === 1 ? { ...range, ...change } : range) } })
      await expect(loadMarketMetadata(result.projectUri)).rejects.toThrow('does not match')
    }
  })

  it('permits only path-free canonical CIDv0 and cannot fetch arbitrary URLs', async () => {
    const identifier = cid()
    for (const uri of ['https://internal/metadata', `ipfs://${identifier}/file`, `ipfs://${identifier}?x`, 'ipfs://bafyfoobar', ` ipfs://${identifier}`]) {
      await expect(loadMarketMetadata(uri)).rejects.toThrow('canonical')
    }
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('fails closed for gateway errors, oversized headers and streamed bodies', async () => {
    const uri = `ipfs://${cid()}`
    mocks.fetch.mockResolvedValue(new Response('', { status: 403 }))
    await expect(loadMarketMetadata(uri)).rejects.toThrow('(403)')
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    mocks.fetch.mockResolvedValue(new Response('{}', { headers: { 'content-length': String(MAX_MARKET_METADATA_BYTES + 1) } }))
    await expect(loadMarketMetadata(uri)).rejects.toThrow('size limit')
    mocks.fetch.mockResolvedValue(new Response(' '.repeat(MAX_MARKET_METADATA_BYTES + 1)))
    await expect(loadMarketMetadata(uri)).rejects.toThrow('size limit')
  })

  it('retries transient gateway publication delay without repinning', async () => {
    const original = mocks.fetch.getMockImplementation()!
    let firstRead = true
    mocks.fetch.mockImplementation(async (url, init) => {
      if (url.includes('/ipfs/') && firstRead) { firstRead = false; return new Response('', { status: 404 }) }
      return original(url, init)
    })
    const result = await publishMarketMetadata(definition)
    expect(mocks.fetch.mock.calls.filter(([url]) => url.endsWith('/v1/pins/json'))).toHaveLength(1)
    expect(await loadMarketMetadata(result.projectUri)).toEqual(result)
  })

  it('loads embedded definitions without a network request or invented tier metadata', async () => {
    const uri = encodeMarketDefinition(definition)
    const result = await loadMarketMetadata(uri)
    expect(result).toEqual({ mode: 'embedded', definition, projectUri: uri, contractUri: uri, tierUris: [], encodedTierUris: [zeroHash, zeroHash, zeroHash, zeroHash] })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})
