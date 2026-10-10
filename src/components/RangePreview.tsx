'use client'

import { useState } from 'react'
import { formatPercentage, RANGE_DECIMAL_PLACES, type RangeBin } from '@/domain/ranges'

export function RangePreview({ ranges, stale }: { ranges: readonly RangeBin[]; stale: boolean }) {
  const [selected, setSelected] = useState<number | null>(null)
  if (ranges.length < 3) return null
  const first = ranges[0]
  const last = ranges[ranges.length - 1]
  const minimum = first.upper!
  const maximum = last.lower!
  const span = maximum - minimum
  const active = ranges.find(range => range.tierId === selected)
  const name = (range: RangeBin) => `Range ${range.tierId}: ${range.label}`
  return <figure className="range-preview" aria-label="Range visualization">
    <div className="range-preview-heading"><span>{ranges.length} ranges</span>{stale && <span>Last valid ranges</span>}</div>
    <div className="range-preview-map">
      <button type="button" className="range-overflow" aria-label={name(first)} aria-pressed={selected === first.tierId} onFocus={() => setSelected(first.tierId)} onMouseEnter={() => setSelected(first.tierId)} onClick={() => setSelected(first.tierId)}>←<span>{first.label}</span></button>
      <div className="range-preview-finite">
        <svg viewBox="0 0 1000 44" preserveAspectRatio="none" aria-label="Finite ranges to scale">
          {ranges.slice(1, -1).map(range => <rect key={range.tierId} role="button" tabIndex={0} aria-label={name(range)} aria-pressed={selected === range.tierId}
            x={(range.lower! - minimum) / span * 1000} y={0} width={(range.upper! - range.lower!) / span * 1000} height={44}
            onFocus={() => setSelected(range.tierId)} onMouseEnter={() => setSelected(range.tierId)} onClick={event => { setSelected(range.tierId); event.currentTarget.focus() }}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(range.tierId) } }}>
            <title>{name(range)}</title>
          </rect>)}
        </svg>
        <div className="range-preview-scale"><span>{formatPercentage(minimum, RANGE_DECIMAL_PLACES)}</span><span>{formatPercentage(maximum, RANGE_DECIMAL_PLACES)}</span></div>
      </div>
      <button type="button" className="range-overflow" aria-label={name(last)} aria-pressed={selected === last.tierId} onFocus={() => setSelected(last.tierId)} onMouseEnter={() => setSelected(last.tierId)} onClick={() => setSelected(last.tierId)}>→<span>{last.label}</span></button>
    </div>
    <figcaption>{active ? `${name(active)}${active.lower === null || active.upper === null ? ' · Overflow' : ''}` : 'Finite ranges shown to scale. Select a range to inspect it.'}</figcaption>
  </figure>
}
