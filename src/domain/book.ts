import { SCORECARD_WEIGHT_TOTAL } from './scorecard'

/** What one position collects: the pot times the range's scorecard weight, shared by the range's positions. */
export function payoutPerPosition(potWei: bigint, supply: number, weight: bigint = SCORECARD_WEIGHT_TOTAL): bigint | null {
  if (supply <= 0 || potWei <= 0n) return null
  return potWei * weight / (SCORECARD_WEIGHT_TOTAL * BigInt(supply))
}

/** One price level: ETH per position and how many positions rest at it. */
export type BookLevel = { priceWei: bigint; quantity: number }
/** A range's resting orders: bids best (highest) first, asks best (lowest) first. */
export type RangeBook = { tierId: number; bids: BookLevel[]; asks: BookLevel[] }

/**
 * Book-implied chance for a range: a position's price over what it would collect if this range took
 * the whole pot (pot / positions in the range). Uses the bid/ask midpoint; null without both sides.
 * Weighted scorecards can split the pot, so this reads as the chance of the range taking it all.
 */
export function impliedChance(book: RangeBook | undefined, supply: number, potWei: bigint): number | null {
  const bid = book?.bids[0]?.priceWei, ask = book?.asks[0]?.priceWei
  const whole = payoutPerPosition(potWei, supply)
  if (bid === undefined || ask === undefined || !whole) return null
  const chance = Number((bid + ask) * 10_000n / (2n * whole)) / 10_000
  return Math.min(1, Math.max(0, chance))
}
