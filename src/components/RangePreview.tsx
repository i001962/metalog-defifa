'use client'

import { useEffect, useRef, useState } from 'react'
import { formatPercentage, RANGE_DECIMAL_PLACES, MAX_RANGE_BOUNDARY, type RangeBin } from '@/domain/ranges'

type Props = {
  ranges: readonly RangeBin[]; stale: boolean; invalidBoundaries: { index: number; value: number | null }[]; selected: number | null; boundary: number | null
  onSelect: (tier: number) => void; onBoundaryFocus: (index: number) => void
  onBoundaryChange?: (index: number, value: string) => void
}

export function RangePreview({ ranges, stale, invalidBoundaries, selected, boundary, onSelect, onBoundaryFocus, onBoundaryChange }: Props) {
  const plot = useRef<HTMLDivElement>(null)
  const [plotWidth, setPlotWidth] = useState(0)
  useEffect(() => {
    if (!plot.current) return
    const observer = new ResizeObserver(entries => setPlotWidth(entries[0].contentRect.width))
    observer.observe(plot.current)
    return () => observer.disconnect()
  }, [ranges.length])
  const [drag, setDrag] = useState<{ index: number; minimum: number; maximum: number; left: number; width: number } | null>(null)
  if (ranges.length < 3) return null
  const first = ranges[0], last = ranges[ranges.length - 1]
  const padding = (last.lower! - first.upper!) * .1
  const minimum = drag?.minimum ?? first.upper! - padding
  const maximum = drag?.maximum ?? last.lower! + padding
  const span = maximum - minimum
  const cutoffs = ranges.slice(0, -1).map(range => range.upper!)
  const active = ranges.find(range => range.tierId === selected)
  const name = (range: RangeBin) => `Range ${range.tierId}: ${range.label}`
  const x = (value: number) => (value - minimum) / span * 100
  const minimumBoundary = -MAX_RANGE_BOUNDARY
  const editable = Boolean(onBoundaryChange) && !stale
  function move(index: number, value: number) {
    onBoundaryChange?.(index, String(Number(Math.min(MAX_RANGE_BOUNDARY, Math.max(-MAX_RANGE_BOUNDARY, value)).toFixed(RANGE_DECIMAL_PLACES))))
  }
  return <figure className="range-preview" aria-label="Range visualization">
    <div className="range-preview-heading"><span>{ranges.length} ranges | numbered by tier</span>{stale && <span>Last valid ranges</span>}</div>
    <div className="range-preview-map">
      <button type="button" className="range-overflow" aria-label={name(first)} aria-pressed={selected === first.tierId} onFocus={() => onSelect(first.tierId)} onMouseEnter={() => onSelect(first.tierId)} onClick={() => onSelect(first.tierId)}>1 ←<span>{first.label}</span></button>
      <div className="range-preview-finite" ref={plot}>
        <svg viewBox="0 0 1000 44" preserveAspectRatio="none" aria-label="Finite ranges to scale">
          {ranges.slice(1, -1).map(range => <rect key={range.tierId} role="button" tabIndex={0} aria-label={name(range)} aria-pressed={selected === range.tierId} data-invalid={invalidBoundaries.some(item => item.index === range.tierId - 2 || item.index === range.tierId - 1)}
            x={x(range.lower!) * 10} y={0} width={(range.upper! - range.lower!) / span * 1000} height={44}
            onFocus={() => onSelect(range.tierId)} onMouseEnter={() => !drag && onSelect(range.tierId)} onClick={event => { onSelect(range.tierId); event.currentTarget.focus() }}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(range.tierId) } }} />)}
        </svg>
        <div className="range-preview-numbers" aria-hidden="true">{ranges.slice(1, -1).map(range => ((range.upper! - range.lower!) / span * plotWidth > 22 || selected === range.tierId) && <span key={range.tierId} style={{ left: `${x((range.lower! + range.upper!) / 2)}%` }}>{range.tierId}</span>)}</div>
        {cutoffs.map((value, index) => <button key={index} type="button" className="range-handle" role="slider" aria-label={`Boundary ${index + 1}`} aria-valuenow={value} aria-valuetext={formatPercentage(value, RANGE_DECIMAL_PLACES)}
          aria-valuemin={minimumBoundary} aria-valuemax={MAX_RANGE_BOUNDARY}
          aria-disabled={!editable} data-active={boundary === index || selected === index + 1 || selected === index + 2} style={{ left: `${x(value)}%` }}
          onFocus={() => onBoundaryFocus(index)}
          onPointerDown={event => {
            if (!editable) return
            event.preventDefault()
            event.currentTarget.focus()
            event.currentTarget.setPointerCapture(event.pointerId)
            const box = event.currentTarget.parentElement!.getBoundingClientRect()
            setDrag({ index, minimum, maximum, left: box.left, width: box.width })
          }}
          onPointerMove={event => { if (drag?.index === index) move(index, drag.minimum + Math.max(0, Math.min(1, (event.clientX - drag.left) / drag.width)) * (drag.maximum - drag.minimum)) }}
          onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)} onLostPointerCapture={() => setDrag(null)}
          onKeyDown={event => {
            if (!editable || !['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'].includes(event.key)) return
            event.preventDefault()
            move(index, value + (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1) * (event.shiftKey ? 1 : .01))
          }} />)}
        {invalidBoundaries.map(item => item.value !== null && <span key={item.index} className="range-invalid-marker" aria-label={`Invalid boundary ${item.index + 1}`} style={{ left: `${Math.max(0, Math.min(100, x(item.value)))}%` }}>!</span>)}
        <div className="range-preview-axis" aria-label="Percentage change axis">{[0, .25, .5, .75, 1].map(fraction => <span key={fraction} style={{ left: `${fraction * 100}%` }}>{formatPercentage(minimum + fraction * span, RANGE_DECIMAL_PLACES)}</span>)}</div>
        <div className="range-preview-axis-label">Percentage change (%)</div>
      </div>
      <button type="button" className="range-overflow" aria-label={name(last)} aria-pressed={selected === last.tierId} onFocus={() => onSelect(last.tierId)} onMouseEnter={() => onSelect(last.tierId)} onClick={() => onSelect(last.tierId)}>{last.tierId} →<span>{last.label}</span></button>
    </div>
    <figcaption>{boundary !== null && invalidBoundaries.some(item => item.index === boundary) ? `Edge between ranges ${boundary + 1} and ${boundary + 2} needs attention. Chart shows the last valid ranges.` : boundary !== null && cutoffs[boundary] !== undefined ? `Edge between ranges ${boundary + 1} and ${boundary + 2}: ${formatPercentage(cutoffs[boundary], RANGE_DECIMAL_PLACES)}` : active ? `${name(active)}${active.lower === null || active.upper === null ? ' | Overflow' : ''}` : 'Select a range to highlight its boundaries.'}</figcaption>
    <p className="hint">{onBoundaryChange ? 'Drag a boundary. Unfixed boundaries recalibrate automatically. Arrow keys adjust by 0.01%; Shift adjusts by 1%.' : 'Choose Advanced to drag individual boundaries. Your Simple settings are preserved.'}</p>
  </figure>
}
