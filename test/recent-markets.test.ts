import { describe, expect, it } from 'vitest'
import { readRecentMarkets, RECENT_MARKETS_KEY, rememberMarket } from '../src/lib/recent-markets'

function storage(initial: string | null = null) {
  let value = initial
  return { getItem: () => value, setItem: (_key: string, next: string) => { value = next } }
}

describe('recent market navigation', () => {
  it('keeps at most 20 distinct chain/project references in recency order', () => {
    const local = storage()
    for (let id = 1; id <= 25; id++) rememberMarket(8453, String(id), local)
    expect(readRecentMarkets(local)).toHaveLength(20)
    expect(readRecentMarkets(local).at(-1)).toEqual({ chainId: 8453, projectId: '6' })
    rememberMarket(8453, '10', local)
    rememberMarket(84532, '10', local)
    expect(readRecentMarkets(local).slice(0, 2)).toEqual([{ chainId: 84532, projectId: '10' }, { chainId: 8453, projectId: '10' }])
    expect(readRecentMarkets(local).filter(item => item.chainId === 8453 && item.projectId === '10')).toHaveLength(1)
  })

  it('rejects unsupported chains and invalid IDs and never trusts stored market details', () => {
    const local = storage(JSON.stringify([
      { chainId: 8453, projectId: '7', prompt: 'Unverified title', stage: 'complete' },
      { chainId: 8453, projectId: '7' },
      { chainId: 137, projectId: '1' },
      { chainId: '8453', projectId: '1' },
      { chainId: 8453, projectId: '../create' },
      { chainId: 8453, projectId: (1n << 256n).toString() },
      { chainId: 8453, projectId: '0' },
      null,
    ]))
    expect(readRecentMarkets(local)).toEqual([{ chainId: 8453, projectId: '7' }])
    rememberMarket(137, '1', local)
    rememberMarket(8453, '-2', local)
    expect(readRecentMarkets(local)).toEqual([{ chainId: 8453, projectId: '7' }])
    rememberMarket(8453, ((1n << 256n) - 1n).toString(), local)
    expect(readRecentMarkets(local)[0].projectId).toBe(((1n << 256n) - 1n).toString())
    expect(local.getItem()).not.toContain('Unverified title')
  })

  it('tolerates malformed history and blocked or full browser storage', () => {
    for (const value of ['{', '{}', 'x'.repeat(8193)]) expect(readRecentMarkets(storage(value))).toEqual([])
    const blocked = { getItem: () => { throw new Error('Blocked') }, setItem: () => { throw new Error('Full') } }
    expect(readRecentMarkets(blocked)).toEqual([])
    expect(() => rememberMarket(8453, '7', blocked)).not.toThrow()
    const local = storage('{')
    rememberMarket(8453, '7', local)
    expect(JSON.parse(local.getItem()!)).toEqual([{ chainId: 8453, projectId: '7' }])
    expect(RECENT_MARKETS_KEY).toBe('metalog:recent-markets:v1')
  })
})
