'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { positionDensities } from '@/domain/allocation'
import { densityBuckets, type Coefficients } from '@/domain/distribution'
import { binForOutcome, formatPercentage, type RangeBin } from '@/domain/ranges'

const HEIGHT = 290, LEFT = 48, RIGHT = 18, TOP = 24, BOTTOM = 51

export function PositionChart({ ranges, quantities, coefficients, onChange, readOnly = false, reference = false, submitted = false }: {
  ranges: RangeBin[]
  quantities: number[]
  coefficients: Coefficients
  onChange?: (value: Coefficients) => void
  readOnly?: boolean
  reference?: boolean
  submitted?: boolean
}) {
  const element = useRef<SVGSVGElement>(null)
  const descriptionId = useId()
  const [width, setWidth] = useState(860)
  const [selectedTier, setSelectedTier] = useState<number | null>(null)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(300, entry.contentRect.width)))
    if (element.current) observer.observe(element.current)
    return () => observer.disconnect()
  }, [])
  const drag = useRef<{ x: number; y: number; width: number; moved: boolean; coefficients: Coefficients } | null>(null)
  const interactive = !readOnly && !submitted && onChange !== undefined
  const positions = useMemo(() => {
    try { return positionDensities(ranges, quantities) }
    catch { return null }
  }, [ranges, quantities])
  const finiteRanges = ranges.filter(range => range.lower !== null && range.upper !== null)
  const low = finiteRanges[0]?.lower ?? -1, high = finiteRanges.at(-1)?.upper ?? 1
  const span = high - low
  const density = useMemo(() => {
    try {
      const result = densityBuckets(coefficients, 600, { low, high })
      return Number.isFinite(result.peak) ? result : null
    } catch { return null }
  }, [coefficients, low, high])
  const finite = positions?.filter(position => position.density !== null) ?? []
  const peak = Math.max(density?.peak ?? 0, ...finite.map(position => position.density!)) || 1
  const plotWidth = width - LEFT - RIGHT, plotHeight = HEIGHT - TOP - BOTTOM
  const axis = HEIGHT - BOTTOM
  const x = (value: number) => LEFT + (value - low) / span * plotWidth
  const y = (value: number) => axis - value / peak * plotHeight
  // Interval averages preserve narrow spikes without inventing extra probability mass.
  const line = density?.buckets.map((bucket, index) => `${index ? 'L' : 'M'}${x(bucket.lower)},${y(bucket.density)} L${x(bucket.upper)},${y(bucket.density)}`).join(' ') ?? ''
  const selected = finite.find(position => position.range.tierId === selectedTier) ?? finite[Math.floor(finite.length / 2)]
  const describe = (position: NonNullable<typeof positions>[number]) => `${position.range.label}: ${position.quantity} NFTs (${(position.share * 100).toFixed(2)}%)`
  const instruction = submitted ? 'Submitted curve and minted positions.' : readOnly ? 'Showing the last valid allocation while you edit.'
    : interactive ? 'Drag to move the curve. Drag up to widen, down to narrow.' : 'Edit NFT counts in By range.'
  const ticks = width < 520 ? [0, .5, 1] : [0, .25, .5, .75, 1]

  function selectAt(clientX: number) {
    const bounds = element.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0 || !positions) return
    const outcome = low + ((clientX - bounds.left) / bounds.width * width - LEFT) / plotWidth * span
    const range = binForOutcome(ranges, outcome)
    const position = finite.find(item => item.range.tierId === range.tierId)
    if (position) setSelectedTier(position.range.tierId)
  }
  function transform(original: Coefficients, shift: number, scale: number) {
    if (!interactive || !onChange) return
    onChange(original.map((value, index) => index === 0 ? value + shift : value * scale) as unknown as Coefficients)
  }

  return <>
    <svg ref={element} className="chart" style={interactive ? undefined : { cursor: 'default', touchAction: 'auto', userSelect: 'auto' }}
      viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={submitted ? 'Submitted curve and minted positions' : 'Your probability distribution'} tabIndex={0} aria-describedby={descriptionId}
      onPointerDown={event => {
        selectAt(event.clientX)
        if (!interactive || event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { x: event.clientX, y: event.clientY, width: event.currentTarget.getBoundingClientRect().width, moved: false, coefficients }
      }}
      onPointerMove={event => {
        const start = drag.current
        if (!start) { selectAt(event.clientX); return }
        if (!interactive) { drag.current = null; return }
        if (!start.moved && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) return
        start.moved = true
        const shift = (event.clientX - start.x) / start.width * span
        const scale = Math.exp(Math.max(-2, Math.min(2, (start.y - event.clientY) / 140)))
        transform(start.coefficients, shift, scale)
      }}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
      onLostPointerCapture={() => { drag.current = null }}
      onKeyDown={event => {
        if (!interactive || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
        event.preventDefault()
        if (event.shiftKey || ['ArrowUp', 'ArrowDown'].includes(event.key)) transform(coefficients, 0, ['ArrowUp', 'ArrowRight'].includes(event.key) ? 1.05 : 1 / 1.05)
        else transform(coefficients, span * (event.key === 'ArrowLeft' ? -.015 : .015), 1)
      }}>
      <title>{submitted ? 'Submitted curve and minted positions' : 'Your probability distribution'}</title>
      <desc id={descriptionId}>{`Bars show NFT share divided by range width; the line shows ${reference ? 'reference ' : ''}curve density. Focus or tap a range for its exact count and share. ${interactive ? 'Drag to move or widen the curve. Arrow keys move; Shift and arrow keys change spread.' : instruction}`}</desc>
      {finite.map(position => {
        const { range } = position
        const height = position.density! / peak * plotHeight
        return <rect key={range.tierId} x={x(range.lower!)} y={axis - height}
          width={x(range.upper!) - x(range.lower!)} height={height} fill="#384fc4"
          fillOpacity={selected?.range.tierId === range.tierId ? '.4' : '.2'} stroke="white" strokeWidth="1"
          tabIndex={0} aria-label={describe(position)} onFocus={() => setSelectedTier(range.tierId)}>
          <title>{describe(position)}</title>
        </rect>
      })}
      <path d={line} stroke="#384fc4" strokeWidth="2.4" fill="none" pointerEvents="none" />
      <line x1={LEFT} x2={width - RIGHT} y1={axis} y2={axis} stroke="#bbb" />
      <line x1={LEFT} x2={LEFT} y1={TOP} y2={axis} stroke="#bbb" />
      {[0, .5, 1].map(fraction => <text key={fraction} x={LEFT - 8} y={axis - fraction * plotHeight + 4} textAnchor="end">
        {fraction ? (peak * fraction).toPrecision(2) : '0'}
      </text>)}
      {ticks.map(fraction => <text key={fraction} x={LEFT + fraction * plotWidth} y={HEIGHT - 28}
        textAnchor={fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle'}>
        {formatPercentage(low + span * fraction, 3)}
      </text>)}
      <text x={LEFT + plotWidth / 2} y={HEIGHT - 6} textAnchor="middle">Outcome (%)</text>
    </svg>
    <div className="distribution-legend">
      <span className="distribution-line">{reference ? 'Reference curve' : 'Curve'}</span>
      <span className="distribution-bars">NFT positions</span>
      <span>Density per percentage point</span>
    </div>
    <div className="distribution-selection" role="status" aria-label="Selected range">
      {selected ? describe(selected) : 'NFT quantities cannot be displayed.'}
    </div>
    <div className="distribution-overflow" role="region" aria-label="Overflow positions">
      <span>Overflow</span>
      {positions?.filter(position => position.density === null).map(position => <span key={position.range.tierId}>{describe(position)}</span>)}
    </div>
    {!density && <p className="hint" role="status">The curve cannot be displayed at this precision.</p>}
    <p className="hint" style={{ minHeight: '3em' }}>{instruction}</p>
  </>
}
