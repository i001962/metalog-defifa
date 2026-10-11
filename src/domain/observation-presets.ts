export const ASSET_PRESETS = [
  { id: 'BTC-USD', label: 'Bitcoin (BTC/USD)' },
  { id: 'ETH-USD', label: 'Ethereum (ETH/USD)' },
  { id: 'SOL-USD', label: 'Solana (SOL/USD)' },
] as const

export const WINDOW_PRESETS = [
  { id: '15m', label: '15 minutes', seconds: 900 },
  { id: '1h', label: '1 hour', seconds: 3_600 },
  { id: '1d', label: '1 day', seconds: 86_400 },
] as const

/** Observation templates only: no price fetching or availability guarantee. */
export function buildObservationPreset(assetId: string, windowId: string) {
  const asset = ASSET_PRESETS.find(preset => preset.id === assetId)
  const window = WINDOW_PRESETS.find(preset => preset.id === windowId)
  if (!asset) throw new Error('Choose a supported asset preset.')
  if (!window) throw new Error('Choose a supported observation window.')
  return {
    prompt: `What will ${asset.label}'s percentage price change be over ${window.label}?`,
    source: `Coinbase Exchange ${asset.id} 60-second candles: https://api.exchange.coinbase.com/products/${asset.id}/candles?granularity=60`,
    resolutionRule: `Use the Coinbase Exchange ${asset.id} candles with granularity=60. Observation start and end must be exact UTC minute boundaries. Select each candle whose time field exactly equals the market's observation start or end timestamp; do not rely on response order. Start and end values are those candles' open prices (the first trade in each minute). Percentage change = 100 × (end value / start value − 1). Use the full precision supplied by the source; do not round before assigning the result to a range. If the source or either exact candle is unavailable, or a price is not positive, the result cannot be established from this source. Do not invent a price, substitute another source or use a nearby candle. The ratified result controls payouts. This preset specifies an observation rule; it does not fetch prices, guarantee availability or settle automatically.`,
    durationSeconds: window.seconds,
  }
}
