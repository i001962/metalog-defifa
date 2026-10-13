'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { positionDensities } from '@/domain/allocation'
import { densityBuckets, type Coefficients } from '@/domain/distribution'
import { binForOutcome, formatPercentage, type RangeBin } from '@/domain/ranges'

const LEFT = 8, RIGHT = 8, TOP = 24, BOTTOM = 51, TAIL = 34, TAIL_GAP = 10

export function PositionChart({ ranges, quantities, coefficients, crowd, onChange, onPick, readOnly = false, reference = false, submitted = false }: {
  ranges: RangeBin[]
  quantities: number[]
  /** Circulating NFTs per range, drawn as a step line in the same density units as your bars. */
  crowd?: number[]
  coefficients: Coefficients
  onChange?: (value: Coefficients) => void
  /** A tap or click on a range, without dragging. */
  onPick?: (tierId: number) => void
  readOnly?: boolean
  reference?: boolean
  submitted?: boolean
}) {
  const element = useRef<SVGSVGElement>(null)
  const descriptionId = useId()
  const [width, setWidth] = useState(860)
  const HEIGHT = width < 700 ? 290 : 380
  const [selectedTier, setSelectedTier] = useState<number | null>(null)
  const [callout, setCallout] = useState(false)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(300, entry.contentRect.width)))
    if (element.current) observer.observe(element.current)
    return () => observer.disconnect()
  }, [])
  const picked = useRef<number | undefined>(undefined)
  const drag = useRef<{ x: number; y: number; width: number; moved: boolean; coefficients: Coefficients } | null>(null)
  const interactive = !readOnly && !submitted && onChange !== undefined
  const positions = useMemo(() => {
    try { return positionDensities(ranges, quantities) }
    catch { return null }
  }, [ranges, quantities])
  const finiteRanges = ranges.filter(range => range.lower !== null && range.upper !== null)
  const low = finiteRanges[0]?.lower ?? -1, high = finiteRanges.at(-1)?.upper ?? 1
  const span = high - low
  const firstWidth = (finiteRanges[0]?.upper ?? high) - low, lastWidth = high - (finiteRanges.at(-1)?.lower ?? low)
  const density = useMemo(() => {
    try {
      const result = densityBuckets(coefficients, 600, { low, high })
      return Number.isFinite(result.peak) ? result : null
    } catch { return null }
  }, [coefficients, low, high])
  const finite = positions?.filter(position => position.density !== null) ?? []
  const crowdAll = useMemo(() => {
    try { return crowd?.some(supply => supply > 0) ? positionDensities(ranges, crowd) : [] }
    catch { return [] }
  }, [ranges, crowd])
  const crowdFinite = crowdAll.filter(position => position.density !== null)
  // Overflow ranges have no width, so their tail columns borrow the neighboring range's width; the callout gives the exact share.
  const tails = (positions ?? []).filter(position => position.density === null).map(position => {
    const low = position.range.upper !== null
    return { position, side: low ? 'low' as const : 'high' as const, density: position.share / (low ? firstWidth : lastWidth) }
  })
  const hasLow = tails.some(tail => tail.side === 'low'), hasHigh = tails.some(tail => tail.side === 'high')
  const peak = Math.max(density?.peak ?? 0, ...finite.map(position => position.density!), ...crowdFinite.map(position => position.density!), ...tails.map(tail => tail.density)) || 1
  const plotLeft = LEFT + (hasLow ? TAIL + TAIL_GAP : 0), plotRight = width - RIGHT - (hasHigh ? TAIL + TAIL_GAP : 0)
  const plotWidth = plotRight - plotLeft, plotHeight = HEIGHT - TOP - BOTTOM
  const axis = HEIGHT - BOTTOM
  const x = (value: number) => plotLeft + (value - low) / span * plotWidth
  const tailX = (side: 'low' | 'high') => side === 'low' ? LEFT : width - RIGHT - TAIL
  const barTop = (position: NonNullable<typeof positions>[number]) => axis - (position.density ?? tails.find(tail => tail.position === position)?.density ?? 0) / peak * plotHeight
  const barCenter = (position: NonNullable<typeof positions>[number]) => position.density !== null
    ? (x(position.range.lower!) + x(position.range.upper!)) / 2 : tailX(position.range.upper !== null ? 'low' : 'high') + TAIL / 2
  const y = (value: number) => axis - value / peak * plotHeight
  // Interval averages preserve narrow spikes without inventing extra probability mass.
  const line = density?.buckets.map((bucket, index) => `${index ? 'L' : 'M'}${x(bucket.lower)},${y(bucket.density)} L${x(bucket.upper)},${y(bucket.density)}`).join(' ') ?? ''
  const selected = positions?.find(position => position.range.tierId === selectedTier) ?? finite[Math.floor(finite.length / 2)]
  const describe = (position: NonNullable<typeof positions>[number]) => `${position.range.label}: ${position.quantity} NFTs (${(position.share * 100).toFixed(2)}%)`
  const instruction = submitted ? 'Submitted curve and minted positions.' : readOnly ? 'Showing the last valid allocation while you edit.'
    : interactive ? 'Drag to move the curve. Drag up to widen, down to narrow.' : 'Edit NFT counts in By range.'
  const ticks = width < 520 ? [0, .5, 1] : [0, .25, .5, .75, 1]

  function selectAt(clientX: number) {
    const bounds = element.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0 || !positions) return
    const outcome = low + ((clientX - bounds.left) / bounds.width * width - plotLeft) / plotWidth * span
    const range = binForOutcome(ranges, outcome)
    const position = positions.find(item => item.range.tierId === range.tierId)
    if (position) setSelectedTier(position.range.tierId)
    setCallout(true)
    return position?.range.tierId
  }
  function transform(original: Coefficients, shift: number, scale: number) {
    if (!interactive || !onChange) return
    onChange(original.map((value, index) => index === 0 ? value + shift : value * scale) as unknown as Coefficients)
  }

  const crowdShare = (tierId: number) => crowdAll.find(position => position.range.tierId === tierId)?.share
  return <>
    <div className="chart-frame">
    <svg ref={element} className="chart" style={interactive ? undefined : { cursor: 'default', touchAction: 'auto', userSelect: 'auto' }}
      viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={submitted ? 'Submitted curve and minted positions' : 'Your probability distribution'} tabIndex={0} aria-describedby={descriptionId}
      onPointerLeave={event => { if (event.pointerType === 'mouse' && !drag.current) setCallout(false) }}
      onPointerDown={event => {
        picked.current = selectAt(event.clientX)
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
      onPointerUp={() => {
        if (!drag.current?.moved && picked.current !== undefined) onPick?.(picked.current)
        drag.current = null
      }} onPointerCancel={() => { drag.current = null }}
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
          width={x(range.upper!) - x(range.lower!)} height={height} className="chart-bar"
          data-selected={selected?.range.tierId === range.tierId}
          tabIndex={0} aria-label={describe(position)} onFocus={() => { setSelectedTier(range.tierId); setCallout(true) }}>
          <title>{describe(position)}</title>
        </rect>
      })}
      {tails.map(({ position, side }) => {
        const left = tailX(side), top = barTop(position)
        // Polygons, not rects: rects are the finite ranges.
        return <polygon key={position.range.tierId} className="chart-bar chart-tail" data-selected={selected?.range.tierId === position.range.tierId}
          points={`${left},${axis} ${left},${top} ${left + TAIL},${top} ${left + TAIL},${axis}`}
          tabIndex={0} aria-label={describe(position)} onFocus={() => { setSelectedTier(position.range.tierId); setCallout(true) }}>
          <title>{describe(position)}</title>
        </polygon>
      })}
      {tails.map(({ position, side }) => <text key={`label-${position.range.tierId}`} x={tailX(side) + TAIL / 2} y={HEIGHT - 28} textAnchor="middle">
        {side === 'low' ? '<' : '≥'}</text>)}
      {crowdFinite.length > 0 && <polyline className="chart-crowd" pointerEvents="none"
        points={crowdFinite.map(position => `${x(position.range.lower!)},${y(position.density!)} ${x(position.range.upper!)},${y(position.density!)}`).join(' ')} />}
      <path d={line} className="chart-curve" pointerEvents="none" />
      <line x1={LEFT} x2={width - RIGHT} y1={axis} y2={axis} className="chart-axis" />
      {ticks.map(fraction => <text key={fraction} x={plotLeft + fraction * plotWidth} y={HEIGHT - 28}
        textAnchor={fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle'}>
        {formatPercentage(low + span * fraction, 3)}
      </text>)}
      <text x={plotLeft + plotWidth / 2} y={HEIGHT - 6} textAnchor="middle">Outcome (%)</text>
    </svg>
    {callout && selected && <div className="chart-callout" aria-hidden="true" style={{
      left: `${Math.min(88, Math.max(12, barCenter(selected) / width * 100))}%`,
      top: `${Math.max(0, barTop(selected) / HEIGHT * 100)}%`,
    }}>
      <strong>{selected.range.label}</strong>
      <span><b>{selected.quantity}</b> NFTs, {(selected.share * 100).toFixed(1)}%</span>
      {crowdShare(selected.range.tierId) !== undefined && <span className="callout-crowd">Crowd {(crowdShare(selected.range.tierId)! * 100).toFixed(1)}%</span>}
      {onPick && <em>Click to edit</em>}
    </div>}
    </div>
    <div className="distribution-legend">
      <span className="distribution-line">{reference ? 'Reference curve' : 'Curve'}</span>
      <span className="distribution-bars">NFT positions</span>
      {crowdFinite.length > 0 && <span className="distribution-crowd">Crowd</span>}
    </div>
    <div className="distribution-selection" role="status" aria-label="Selected range">
      {selected ? describe(selected) : 'NFT quantities cannot be displayed.'}
    </div>
    <div className="distribution-overflow sr-only" role="region" aria-label="Overflow positions">
      <span>Overflow</span>
      {positions?.filter(position => position.density === null).map(position => <span key={position.range.tierId}>{describe(position)}</span>)}
    </div>
    {!density && <p className="hint" role="status">The curve cannot be displayed at this precision.</p>}
    <p className="hint" style={{ minHeight: '3em' }}>{instruction}</p>
  </>
}
