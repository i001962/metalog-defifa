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
  if (bid === undefined || ask === undefined || supply <= 0 || potWei <= 0n) return null
  const chance = Number((bid + ask) * BigInt(supply) * 10_000n / (2n * potWei)) / 10_000
  return Math.min(1, Math.max(0, chance))
}
