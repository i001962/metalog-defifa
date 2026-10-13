'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { positionDensities } from '@/domain/allocation'
import { densityBuckets, type Coefficients } from '@/domain/distribution'
import { binForOutcome, formatPercentage, type RangeBin } from '@/domain/ranges'

const LEFT = 8, RIGHT = 8, TOP = 24, BOTTOM = 51, TAIL_GAP = 10, TAIL_SHARE = .38

export function PositionChart({ ranges, quantities, coefficients, crowd, payout, mine = true, onChange, onPick, readOnly = false, reference = false, submitted = false }: {
  ranges: RangeBin[]
  quantities: number[]
  /** Circulating NFTs per range, drawn as dotted bars behind your order in the same density units. */
  crowd?: number[]
  /** Ratified payout share per range, drawn as thin blue bars. */
  payout?: number[] | null
  /** False hides your curve and order, leaving the crowd and payout. */
  mine?: boolean
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
  const dots = `dots${useId().replace(/\W/g, '')}`
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
  const interactive = mine && !readOnly && !submitted && onChange !== undefined
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
  const crowdAll = useMemo(() => {
    try { return crowd?.some(supply => supply > 0) ? positionDensities(ranges, crowd) : [] }
    catch { return [] }
  }, [ranges, crowd])
  // Selection, callouts and overflow columns follow your order, or the crowd when your order is hidden.
  const basis = mine ? positions : crowdAll.length ? crowdAll : null
  const mineShown = mine ? positions ?? [] : []
  const finite = mineShown.filter(position => position.density !== null)
  // Overflow ranges have no width, so their tail columns borrow the neighboring range's width; the callout gives the exact share.
  const sideOf = (range: RangeBin) => range.upper !== null ? 'low' as const : 'high' as const
  const columnDensity = (range: RangeBin, share: number) => range.lower !== null && range.upper !== null
    ? share / (range.upper - range.lower) : share / (sideOf(range) === 'low' ? firstWidth : lastWidth)
  const tails = mineShown.filter(position => position.density === null).map(position => ({ position, side: sideOf(position.range), density: columnDensity(position.range, position.share) }))
  const overflow = ranges.filter(range => range.lower === null || range.upper === null)
  const hasLow = overflow.some(range => sideOf(range) === 'low'), hasHigh = overflow.some(range => sideOf(range) === 'high')
  const peak = Math.max(mine ? density?.peak ?? 0 : 0, ...mineShown.map(position => columnDensity(position.range, position.share)),
    ...crowdAll.map(position => columnDensity(position.range, position.share)),
    ...(payout ?? []).map((share, index) => columnDensity(ranges[index], share))) || 1
  // Each overflow column is 38% as wide as a finite range: solve tail = share * plotWidth / n with the tails taken out of the plot.
  const sides = Number(hasLow) + Number(hasHigh)
  const TAIL = TAIL_SHARE * (width - LEFT - RIGHT - sides * TAIL_GAP) / (Math.max(1, finiteRanges.length) + TAIL_SHARE * sides)
  const plotLeft = LEFT + (hasLow ? TAIL + TAIL_GAP : 0), plotRight = width - RIGHT - (hasHigh ? TAIL + TAIL_GAP : 0)
  const plotWidth = plotRight - plotLeft, plotHeight = HEIGHT - TOP - BOTTOM
  const axis = HEIGHT - BOTTOM
  const x = (value: number) => plotLeft + (value - low) / span * plotWidth
  const tailX = (side: 'low' | 'high') => side === 'low' ? LEFT : width - RIGHT - TAIL
  const column = (range: RangeBin) => range.lower !== null && range.upper !== null
    ? { left: x(range.lower), right: x(range.upper) } : { left: tailX(sideOf(range)), right: tailX(sideOf(range)) + TAIL }
  const tallest = (range: RangeBin, index: number) => Math.max(
    mine ? columnDensity(range, positions?.[index]?.share ?? 0) : 0, columnDensity(range, crowdAll[index]?.share ?? 0), columnDensity(range, payout?.[index] ?? 0))
  const barTop = (position: NonNullable<typeof positions>[number]) => axis - tallest(position.range, ranges.indexOf(position.range)) / peak * plotHeight
  const barCenter = (position: NonNullable<typeof positions>[number]) => (column(position.range).left + column(position.range).right) / 2
  const y = (value: number) => axis - value / peak * plotHeight
  // Interval averages preserve narrow spikes without inventing extra probability mass.
  const line = density?.buckets.map((bucket, index) => `${index ? 'L' : 'M'}${x(bucket.lower)},${y(bucket.density)} L${x(bucket.upper)},${y(bucket.density)}`).join(' ') ?? ''
  const basisFinite = basis?.filter(position => position.density !== null) ?? []
  const selected = basis?.find(position => position.range.tierId === selectedTier) ?? basisFinite[Math.floor(basisFinite.length / 2)]
  const describe = (position: NonNullable<typeof positions>[number]) => `${position.range.label}: ${position.quantity} NFTs (${(position.share * 100).toFixed(2)}%)`
  const instruction = submitted ? 'Submitted curve and minted positions.' : readOnly ? 'Showing the last valid allocation while you edit.'
    : interactive ? 'Drag to move the curve. Drag up to widen, down to narrow.' : 'Edit NFT counts in By range.'
  const ticks = width < 520 ? [0, .5, 1] : [0, .25, .5, .75, 1]

  function selectAt(clientX: number) {
    const bounds = element.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0 || !basis) return
    const outcome = low + ((clientX - bounds.left) / bounds.width * width - plotLeft) / plotWidth * span
    const range = binForOutcome(ranges, outcome)
    const position = basis.find(item => item.range.tierId === range.tierId)
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
      <desc id={descriptionId}>{`Bars show NFT share divided by range width; the line shows ${reference ? 'reference ' : ''}curve density. Focus or tap a range for its exact count and share. ${interactive ? 'Drag to move or widen the curve. Arrow keys move; Shift and arrow keys change spread.' : instruction}`}</desc>
      <defs><pattern id={dots} width="7" height="7" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.7" className="dot-a" /><circle cx="5.5" cy="5" r="1.5" className="dot-b" /><circle cx="5" cy="1.5" r=".9" className="dot-c" />
      </pattern></defs>
      {crowdAll.map((position, index) => {
        const { left, right } = column(position.range), top = axis - columnDensity(position.range, position.share) / peak * plotHeight
        // Polygons keep rects for your order alone.
        return <polygon key={`crowd-${position.range.tierId}`} className="chart-crowd-bar" fill={`url(#${dots})`} pointerEvents="none"
          data-selected={selected?.range.tierId === position.range.tierId} data-index={index}
          points={`${left + 1},${axis} ${left + 1},${top} ${right - 1},${top} ${right - 1},${axis}`} />
      })}
      {payout?.map((share, index) => {
        if (!share) return null
        const { left, right } = column(ranges[index]), top = axis - columnDensity(ranges[index], share) / peak * plotHeight, mid = (left + right) / 2, half = Math.max(3, (right - left) * .12)
        return <polygon key={`payout-${ranges[index].tierId}`} className="chart-payout" pointerEvents="none"
          points={`${mid - half},${axis} ${mid - half},${top} ${mid + half},${top} ${mid + half},${axis}`} />
      })}
      {finite.map(position => {
        const { range } = position
        const height = position.density! / peak * plotHeight
        const left = x(range.lower!), full = x(range.upper!) - left
        return <rect key={range.tierId} x={left + 1} y={axis - height}
          width={Math.max(0, full - 2)} height={height} className="chart-bar"
          data-selected={selected?.range.tierId === range.tierId}
          tabIndex={0} aria-label={describe(position)} onFocus={() => { setSelectedTier(range.tierId); setCallout(true) }}>
        </rect>
      })}
      {tails.map(({ position, side }) => {
        const left = tailX(side) + 1, right = tailX(side) + TAIL - 1, top = axis - columnDensity(position.range, position.share) / peak * plotHeight
        // Polygons, not rects: rects are the finite ranges.
        return <polygon key={position.range.tierId} className="chart-bar chart-tail" data-selected={selected?.range.tierId === position.range.tierId}
          points={`${left},${axis} ${left},${top} ${right},${top} ${right},${axis}`}
          tabIndex={0} aria-label={describe(position)} onFocus={() => { setSelectedTier(position.range.tierId); setCallout(true) }}>
        </polygon>
      })}
      {crowdAll.map((position, index) => position.quantity > 0 && <text key={`chance-${position.range.tierId}`} className="chart-chance"
        x={barCenter(position)} y={axis - tallest(position.range, index) / peak * plotHeight - 6} textAnchor="middle">
        {position.share < .01 ? '<1%' : `${Math.round(position.share * 100)}%`}</text>)}
      {overflow.map(range => <text key={`label-${range.tierId}`} x={tailX(sideOf(range)) + TAIL / 2} y={HEIGHT - 28} textAnchor="middle">
        {sideOf(range) === 'low' ? '<' : '≥'}</text>)}
      {mine && <path d={line} className="chart-curve" pointerEvents="none" />}
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
      {mine && <span>Yours <b>{selected.quantity}</b> NFTs, {(selected.share * 100).toFixed(1)}%</span>}
      {crowdShare(selected.range.tierId) !== undefined && <span className="callout-crowd">Crowd {crowdAll[ranges.indexOf(selected.range)].quantity} NFTs, {(crowdShare(selected.range.tierId)! * 100).toFixed(1)}%</span>}
      {payout && <span className="callout-payout">Payout {(payout[ranges.indexOf(selected.range)] * 100).toFixed(1)}%</span>}
      {onPick && <em>Click to edit</em>}
    </div>}
    </div>
    <div className="distribution-legend">
      {mine && <span className="distribution-line">{reference ? 'Reference curve' : 'Curve'}</span>}
      {mine && <span className={crowdAll.length ? 'distribution-bars distribution-order' : 'distribution-bars'}>{crowdAll.length ? 'Your order' : 'NFT positions'}</span>}
      {crowdAll.length > 0 && (mine || payout) && <span className="distribution-crowd">Crowd</span>}
      {payout && <span className="distribution-payout">Ratified payout</span>}
    </div>
    <div className="distribution-selection" role="status" aria-label="Selected range">
      {selected ? describe(selected) : 'NFT quantities cannot be displayed.'}
    </div>
    <div className="distribution-overflow sr-only" role="region" aria-label="Overflow positions">
      <span>Overflow</span>
      {basis?.filter(position => position.density === null).map(position => <span key={position.range.tierId}>{describe(position)}</span>)}
    </div>
    {!density && <p className="hint" role="status">The curve cannot be displayed at this precision.</p>}
    {mine && <p className="hint" style={{ minHeight: '3em' }}>{instruction}</p>}
  </>
}
