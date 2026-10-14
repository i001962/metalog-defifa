import { describe, expect, it } from 'vitest'
import { impliedChance, orderReturns, payoutPerPosition, type RangeBook } from '../src/domain/book'

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

describe('payoutPerPosition', () => {
  it('shares the range weight of the pot across its positions', () => {
    expect(payoutPerPosition(10n ** 18n, 10)).toBe(10n ** 17n)
    expect(payoutPerPosition(10n ** 18n, 10, 6n * 10n ** 17n)).toBe(6n * 10n ** 16n)
    expect(payoutPerPosition(10n ** 18n, 0)).toBeNull()
    expect(payoutPerPosition(0n, 10)).toBeNull()
  })
})

describe('orderReturns', () => {
  it('pays the pot after your order to the range it lands in, weighted by your curve for the expectation', () => {
    // Pot 10, crowd 4 and 1 positions; you buy 1 in each range for 2 total.
    const { collect, best, expectedWei } = orderReturns(10n ** 19n, [4, 1], [1, 1], 2n * 10n ** 18n, [.25, .75])
    expect(collect).toEqual([12n * 10n ** 18n / 5n, 12n * 10n ** 18n / 2n])
    expect(best).toBe(6n * 10n ** 18n)
    expect(Number(expectedWei) / 1e18).toBeCloseTo(.25 * 2.4 + .75 * 6, 9)
    // A range you hold nothing in pays you nothing.
    expect(orderReturns(10n ** 19n, [4, 1], [0, 2], 10n ** 18n, [1, 0]).expectedWei).toBe(0n)
  })
})
