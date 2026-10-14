import { useQuery } from '@tanstack/react-query'
import type { MarketDefinition } from '@/domain/market'
import { percentChange, presetProduct } from '@/domain/observation-presets'

const EXCHANGE = 'https://api.exchange.coinbase.com/products'

/**
 * Where a preset market's outcome stands now: the start candle's open against the latest trade.
 * An estimate for display only; the ratified result settles.
 */
export function useLiveOutcome(definition: MarketDefinition, active: boolean): number | undefined {
  const product = presetProduct(definition.source)
  const start = definition.entryClosesAt
  const enabled = active && product !== null
  const open = useQuery({
    queryKey: ['candle-open', product, start], enabled, staleTime: Infinity, retry: 1,
    queryFn: async () => {
      const at = (seconds: number) => new Date(seconds * 1000).toISOString()
      const response = await fetch(`${EXCHANGE}/${product}/candles?granularity=60&start=${at(start)}&end=${at(start + 60)}`)
      if (!response.ok) throw new Error('Start candle unavailable')
      const candle = (await response.json() as number[][]).find(row => row[0] === start)
      if (!candle || !(candle[3] > 0)) throw new Error('Start candle unavailable')
      return candle[3]
    },
  }).data
  const price = useQuery({
    queryKey: ['ticker', product], enabled, refetchInterval: 15_000, retry: 1,
    queryFn: async () => {
      const response = await fetch(`${EXCHANGE}/${product}/ticker`)
      const value = Number(response.ok ? (await response.json()).price : NaN)
      if (!(value > 0)) throw new Error('Price unavailable')
      return value
    },
  }).data
  return open && price ? percentChange(open, price) : undefined
}
