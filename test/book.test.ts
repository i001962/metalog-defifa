import { describe, expect, it } from 'vitest'
import { impliedChance, type RangeBook } from '../src/domain/book'

const book = (bid?: bigint, ask?: bigint): RangeBook => ({ tierId: 1, bids: bid === undefined ? [] : [{ priceWei: bid, quantity: 1 }], asks: ask === undefined ? [] : [{ priceWei: ask, quantity: 1 }] })

describe('impliedChance', () => {
  it('prices the midpoint against the pot a range would take', () => {
    // 10 positions, pot 1 ETH: a winner collects 0.1 ETH, so a 0.03 ETH midpoint implies 30%.
    expect(impliedChance(book(20_000_000_000_000_000n, 40_000_000_000_000_000n), 10, 10n ** 18n)).toBe(.3)
  })
  it('needs both sides, supply and a pot', () => {
    expect(impliedChance(book(1n), 10, 10n ** 18n)).toBeNull()
    expect(impliedChance(book(undefined, 1n), 10, 10n ** 18n)).toBeNull()
    expect(impliedChance(undefined, 10, 10n ** 18n)).toBeNull()
    expect(impliedChance(book(1n, 2n), 0, 10n ** 18n)).toBeNull()
    expect(impliedChance(book(1n, 2n), 10, 0n)).toBeNull()
  })
  it('clamps prices above what a range could collect', () => {
    expect(impliedChance(book(10n ** 18n, 10n ** 18n), 10, 10n ** 18n)).toBe(1)
  })
})
