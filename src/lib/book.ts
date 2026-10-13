import type { MarketSnapshot } from './defifa'
import type { RangeBook } from '@/domain/book'

export type BookRead = { books: RangeBook[]; sample: boolean }

/**
 * The order book for a game in play. No trading venue is connected yet, so production has no book.
 * `next dev` alone gets a labeled sample, priced near the crowd, so the design can be judged.
 */
export function readBook(market: MarketSnapshot): BookRead | null {
  if (process.env.NODE_ENV !== 'development') return null
  const supplies = market.tiers.map(tier => BigInt(tier.supply))
  const total = supplies.reduce((sum, supply) => sum + supply, 0n)
  const pot = BigInt(market.potWei)
  if (total === 0n || pot === 0n) return null
  // ponytail: a fixed sample, fair price = crowd share x pot / range supply = pot / total, skewed per range so odds differ from the crowd.
  const books = market.tiers.map((tier, index) => {
    const supply = supplies[index]
    if (supply === 0n) return { tierId: tier.tierId, bids: [], asks: [] }
    const fair = pot * BigInt(100 + ((index * 37) % 60) - 30) / (total * 100n)
    const level = (bps: bigint, quantity: number) => ({ priceWei: fair * bps / 10_000n, quantity })
    return { tierId: tier.tierId, bids: [level(9_600n, 2), level(9_100n, 5), level(8_500n, 3)], asks: [level(10_400n, 1), level(10_900n, 4), level(11_600n, 2)] }
  })
  return { books, sample: true }
}
