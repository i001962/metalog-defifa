'use client'

import { useEffect, useMemo, useState } from 'react'
import { binForOutcome, type RangeBin } from '@/domain/ranges'
import { coinbaseObservationFeed } from '@/domain/observation-feed'
import type { MarketDefinition } from '@/domain/market'

type Candle = [number, number, number, number, number, number]
type FeedState = 'loading' | 'waiting' | 'live' | 'reconnecting' | 'unavailable'

function startCandleUrl(productId: string, timestamp: number) {
  const query = new URLSearchParams({
    granularity: '60',
    start: new Date(timestamp * 1000).toISOString(),
    end: new Date((timestamp + 60) * 1000).toISOString(),
  })
  return `https://api.exchange.coinbase.com/products/${productId}/candles?${query}`
}

function finitePositive(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(number) && number > 0 ? number : null
}

function RangeMarker({ ranges, outcome }: { ranges: readonly RangeBin[]; outcome: number }) {
  const finite = ranges.filter((range): range is RangeBin & { lower: number; upper: number } => range.lower !== null && range.upper !== null)
  const currentBin = binForOutcome(ranges, outcome)
  const minimum = finite[0]?.lower
  const maximum = finite.at(-1)?.upper
  const span = maximum !== undefined && minimum !== undefined ? maximum - minimum : 0
  const weights = ranges.map(range => range.lower === null || range.upper === null
    ? 12 : span > 0 ? (range.upper - range.lower) / span * 76 : 76 / Math.max(1, finite.length))
  const marker = minimum === undefined || maximum === undefined || span <= 0 ? 50
    : outcome < minimum ? 6 : outcome >= maximum ? 94 : 12 + (outcome - minimum) / span * 76
  return <div className="observation-scale" aria-label="Current estimated outcome range">
    <div className="observation-scale-track">
      {ranges.map((range, index) => <span key={range.tierId} className="observation-scale-range"
        style={{ width: `${weights[index]}%` }} title={range.label} aria-label={range.label}
        data-current={range.tierId === currentBin.tierId} />)}
      <span className="observation-scale-marker" style={{ left: `${marker}%` }} aria-hidden="true"><i /></span>
    </div>
    <div className="observation-scale-ends"><span>{ranges[0]?.label}</span><span>{ranges.at(-1)?.label}</span></div>
  </div>
}

export function ObservationTracker({ definition, ranges, supplies, owned, onOutcomeChange }: {
  definition: MarketDefinition
  ranges: readonly RangeBin[]
  supplies: readonly number[]
  owned: Readonly<Record<number, number>>
  onOutcomeChange: (outcome: number | null) => void
}) {
  const feed = useMemo(() => coinbaseObservationFeed(definition), [definition.entryClosesAt, definition.resolvesAt, definition.resolutionRule, definition.source])
  const [startPrice, setStartPrice] = useState<number | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [state, setState] = useState<FeedState>('loading')

  useEffect(() => {
    if (!feed) return
    const controller = new AbortController()
    setState('loading')
    void fetch(startCandleUrl(feed.productId, definition.entryClosesAt), { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Coinbase candle request failed')
        const rows: unknown = await response.json()
        if (!Array.isArray(rows)) throw new Error('Coinbase returned invalid candle data')
        const row = rows.find((item): item is Candle => Array.isArray(item) && item[0] === definition.entryClosesAt)
        const open = row && finitePositive(row[3])
        if (open === null || open === undefined) throw new Error('Exact observation start candle is unavailable')
        setStartPrice(open)
        setState('waiting')
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('unavailable')
      })
    return () => controller.abort()
  }, [definition.entryClosesAt, feed])

  useEffect(() => {
    if (!feed || startPrice === null) return
    let active = true
    let socket: WebSocket | null = null
    let reconnect: ReturnType<typeof setTimeout> | undefined
    const connect = () => {
      if (!active) return
      setState(previous => previous === 'live' ? 'reconnecting' : 'waiting')
      socket = new WebSocket('wss://ws-feed.exchange.coinbase.com')
      socket.onopen = () => socket?.send(JSON.stringify({ type: 'subscribe', product_ids: [feed.productId], channels: ['ticker'] }))
      socket.onmessage = event => {
        try {
          const message: unknown = JSON.parse(String(event.data))
          if (typeof message !== 'object' || message === null) return
          const ticker = message as { type?: unknown; product_id?: unknown; price?: unknown }
          if (ticker.type !== 'ticker' || ticker.product_id !== feed.productId) return
          const nextPrice = finitePositive(ticker.price)
          if (nextPrice !== null) {
            setPrice(nextPrice)
            setState('live')
          }
        } catch { /* Ignore malformed feed messages and keep waiting for the next ticker. */ }
      }
      socket.onerror = () => socket?.close()
      socket.onclose = () => {
        if (active) {
          setState('reconnecting')
          reconnect = setTimeout(connect, 5_000)
        }
      }
    }
    connect()
    return () => {
      active = false
      if (reconnect) clearTimeout(reconnect)
      socket?.close()
    }
  }, [feed, startPrice])

  const outcome = startPrice !== null && price !== null ? (price / startPrice - 1) * 100 : null
  const bin = outcome === null ? null : binForOutcome(ranges, outcome)
  const positionIndex = bin ? ranges.findIndex(range => range.tierId === bin.tierId) : -1
  const ownedHere = bin ? owned[bin.tierId] ?? 0 : 0
  useEffect(() => {
    onOutcomeChange(outcome)
    return () => onOutcomeChange(null)
  }, [onOutcomeChange, outcome])
  if (!feed) return null
  const status = state === 'loading' ? 'Loading exact start candle…'
    : state === 'waiting' ? 'Waiting for live Coinbase trades…'
      : state === 'reconnecting' ? 'Reconnecting to Coinbase…'
        : state === 'unavailable' ? 'Exact start candle or live feed is unavailable.' : 'Live Coinbase estimate'
  const priceText = price === null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 }).format(price)
  const outcomeText = outcome === null ? '—' : `${outcome >= 0 ? '+' : ''}${outcome.toFixed(2)}%`
  return <section className="observation-tracker" aria-label="Live observation tracker">
    <div className="observation-tracker-heading">
    <div><h3>Observation in progress</h3><p>{feed.productId.replace('-', '/')} · provisional until the exact end candle</p></div>
      <span className="observation-live-state" data-live={state === 'live'}>{status}</span>
    </div>
    <div className="observation-tracker-reading">
      <strong>{outcomeText}</strong><span>{priceText}</span>
    </div>
    {outcome !== null && bin && <>
      <RangeMarker ranges={ranges} outcome={outcome} />
      <p className="observation-scale-note">The bar maps percentage change to outcome ranges; it is not time, probability, or trading volume. Finite segment widths follow their percentage-point ranges; the two overflow ends are compressed.</p>
      <p className="observation-current-range"><strong>Currently in:</strong> {bin.label}
        {bin.lower !== null && bin.upper !== null && <> <span className="pip" aria-hidden="true">|</span> width {formatWidth(bin.upper - bin.lower)}</>}
        {positionIndex >= 0 && <> <span className="pip" aria-hidden="true">|</span> {supplies[positionIndex] ?? 0} positions in this range</>}
        {ownedHere > 0 && <> <span className="pip" aria-hidden="true">|</span> You hold {ownedHere}</>}
      </p>
    </>}
    <small>The live ticker is an estimate, not a result or payout. Settlement follows the market rule and ratified scorecard.</small>
  </section>
}

function formatWidth(width: number) {
  return `${Number(width.toFixed(4))} percentage points`
}
