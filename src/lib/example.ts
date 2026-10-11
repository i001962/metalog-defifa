import type { MarketDefinition } from '@/domain/market'

/** A fixed example is reproducible and is never an onchain market or a send target. */
export const EXAMPLE_MARKET: MarketDefinition = {
  schemaVersion: 1,
  prompt: 'What will Bitcoin’s price change be over 24 hours?',
  source: 'Coinbase BTC-USD hourly candles',
  resolutionRule: 'Compare the opening prices of the UTC hourly candles at the observation start and end. Percentage change = 100 × (end / start − 1). The ratified result controls payouts.',
  entryOpensAt: Date.UTC(2026, 9, 8) / 1000,
  entryClosesAt: Date.UTC(2026, 9, 10) / 1000,
  resolvesAt: Date.UTC(2026, 9, 11) / 1000,
  rangeCount: 21,
  rangeWidth: 1,
  unitPriceWei: '1000000000000',
  settlement: 'defifa-scorecard',
}
