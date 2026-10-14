import type { MarketDefinition } from './market'

export type CoinbaseObservationFeed = { productId: string }

/** Only recognize the explicit, exact-minute Coinbase rule written by our templates. */
export function coinbaseObservationFeed(definition: MarketDefinition): CoinbaseObservationFeed | null {
  const match = definition.source.match(/https:\/\/api\.exchange\.coinbase\.com\/products\/([A-Z0-9]{2,10}-USD)\/candles\?granularity=60(?:\s|$)/)
  if (!match || !definition.resolutionRule.includes(`Use the Coinbase Exchange ${match[1]} candles with granularity=60.`)
    || !definition.resolutionRule.includes('whose time field exactly equals the market\'s observation start or end timestamp')
    || !definition.resolutionRule.includes('Start and end values are those candles\' open prices')) return null
  if (definition.entryClosesAt % 60 !== 0 || definition.resolvesAt % 60 !== 0) return null
  return { productId: match[1] }
}
