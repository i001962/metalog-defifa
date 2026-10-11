import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ readMarketAt: vi.fn(), readEntryHistory: vi.fn(), assertChain: vi.fn(), getBlock: vi.fn() }))
vi.mock('../src/lib/defifa', async importOriginal => ({ ...await importOriginal<typeof import('../src/lib/defifa')>(), readMarketAt: mocks.readMarketAt }))
vi.mock('../src/lib/entries', () => ({ readEntryHistory: mocks.readEntryHistory }))
vi.mock('../src/lib/defifa-deployment', async importOriginal => ({ ...await importOriginal<typeof import('../src/lib/defifa-deployment')>(), assertChain: mocks.assertChain }))
vi.mock('../src/lib/wallet', async importOriginal => ({ ...await importOriginal<typeof import('../src/lib/wallet')>(), publicClientForChain: () => ({ getBlock: mocks.getBlock }) }))
import { marketRanges } from '../src/domain/market'
import { EXAMPLE_MARKET } from '../src/lib/example'
import { GET } from '../src/app/api/markets/[chainId]/[projectId]/entries/route'

const get = (query = '', chainId = '8453', projectId = '27') => GET(new Request(`https://metalog.money/api/markets/${chainId}/${projectId}/entries${query}`), { params: Promise.resolve({ chainId, projectId }) })

describe('entry evidence endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getBlock.mockResolvedValue({ number: 100n, timestamp: 500n, hash: '0xabc' })
    mocks.assertChain.mockResolvedValue(undefined)
    mocks.readMarketAt.mockResolvedValue({ blockNumber: '100', hook: '0x123', ranges: marketRanges(EXAMPLE_MARKET) })
    mocks.readEntryHistory.mockResolvedValue({ entries: [], complete: false, nextCursor: '80:5' })
  })
  it('pins continuation to the original block and preserves incomplete history', async () => {
    const response = await get('?blockNumber=100&cursor=80:5')
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.getBlock).toHaveBeenCalledWith({ blockNumber: 100n })
    expect(mocks.readEntryHistory).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ blockNumber: '100' }), '80:5')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(await response.json()).toMatchObject({ entries: [], complete: false, nextCursor: '80:5', hook: '0x123', snapshotBlockHash: '0xabc', ranges: marketRanges(EXAMPLE_MARKET) })
  })
  it('renders density evidence only for authenticated curve or manual records', async () => {
    const quantities = marketRanges(EXAMPLE_MARKET).map((_, i) => i === 10 ? 4 : 0)
    mocks.readEntryHistory.mockResolvedValueOnce({ entries: [
      { status: 'verified-manual', coefficients: [0, 1], quantities },
      { status: 'unrecognized', coefficients: null, quantities },
    ] })
    const response = await get()
    expect(response.status).toBe(200)
    const { entries } = await response.json()
    expect(entries[0].chart.buckets).toHaveLength(600)
    expect(entries[0].chart.positions[10].quantity).toBe(4)
    expect(entries[0].chart.positions[10].share).toBe(1)
    expect(entries[1].chart).toBeNull()
  })
  it('preserves verified receipts when valid cutoffs exceed chart display precision', async () => {
    const ranges = [
      { tierId: 1, label: 'Lower tail', lower: null, upper: 100000000000 },
      { tierId: 2, label: 'Narrow', lower: 100000000000, upper: 100000000000.0001 },
      { tierId: 3, label: 'Upper tail', lower: 100000000000.0001, upper: null },
    ]
    mocks.readMarketAt.mockResolvedValueOnce({ blockNumber: '100', hook: '0x123', ranges })
    mocks.readEntryHistory.mockResolvedValueOnce({ entries: [{ status: 'verified-curve', coefficients: [0, 1], quantities: [4, 0, 0] }] })
    const response = await get()
    expect(response.status).toBe(200)
    expect((await response.json()).entries[0]).toMatchObject({ status: 'verified-curve', quantities: [4, 0, 0], chart: null, chartError: expect.stringContaining('chart precision') })
  })
  it('rejects invalid or unpinned cursors before making RPC requests', async () => {
    for (const query of ['?cursor=80:5', '?blockNumber=-1', '?blockNumber=100&cursor=bad', '?blockNumber=100&cursor=-1:0', `?blockNumber=${2n ** 256n}`]) expect((await get(query)).status).toBe(400)
    expect((await get('', '999')).status).toBe(400)
    expect((await get('', '8453', '0')).status).toBe(400)
    expect(mocks.getBlock).not.toHaveBeenCalled()
  })
  it('reports provider failure without leaking credentials or inventing an empty history', async () => {
    mocks.readEntryHistory.mockRejectedValueOnce(new Error('RPC https://private.example/secret unavailable'))
    const response = await get()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Entry history could not be verified. Try again.' })
  })
})
