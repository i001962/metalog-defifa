'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { RangeBin } from '@/domain/ranges'

const HEIGHT = 300, TOP = 18, BOTTOM = 34, GAP = 3

/** One column per range: crowd stake share as dotted bars, ratified payout share as a blue inset bar, your NFTs as dots below. */
export function CrowdChart({ ranges, supplies, payoutShares, mine }: {
  ranges: RangeBin[]
  supplies: number[]
  payoutShares: number[] | null
  mine: Record<number, number>
}) {
  const pattern = `dots${useId().replace(/\W/g, '')}`
  const element = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(1000)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(300, entry.contentRect.width)))
    if (element.current) observer.observe(element.current)
    return () => observer.disconnect()
  }, [])
  const total = supplies.reduce((sum, supply) => sum + supply, 0)
  const shares = supplies.map(supply => total ? supply / total : 0)
  const peak = Math.max(...shares, ...(payoutShares ?? [])) || 1
  const lead = payoutShares ?? shares
  const [selected, setSelected] = useState(() => Math.max(0, lead.indexOf(Math.max(...lead))))
  const columns = ranges.length, column = width / columns, plot = HEIGHT - TOP - BOTTOM
  const describe = (index: number) => `${ranges[index].label}: ${supplies[index]} NFTs, ${(shares[index] * 100).toFixed(2)}% of stake`
    + (payoutShares ? `, ${(payoutShares[index] * 100).toFixed(2)}% of payout` : '') + (mine[ranges[index].tierId] ? `, you hold ${mine[ranges[index].tierId]}` : '')
  return <figure className="crowd-chart">
    <svg ref={element} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label="Crowd stake by range">
      <defs><pattern id={pattern} width="7" height="7" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.7" className="dot-a" /><circle cx="5.5" cy="5" r="1.5" className="dot-b" /><circle cx="5" cy="1.5" r=".9" className="dot-c" />
      </pattern></defs>
      <line x1="0" x2={width} y1={HEIGHT - BOTTOM} y2={HEIGHT - BOTTOM} className="crowd-axis" />
      {ranges.map((range, index) => {
        const x = index * column, height = shares[index] / peak * plot, payout = payoutShares ? payoutShares[index] / peak * plot : 0
        return <g key={range.tierId} tabIndex={0} aria-label={describe(index)} data-selected={selected === index}
          onPointerEnter={() => setSelected(index)} onFocus={() => setSelected(index)} onClick={() => setSelected(index)}>
          <rect x={x} y={TOP} width={column} height={plot} className="crowd-hit" />
          <rect x={x + GAP / 2} y={HEIGHT - BOTTOM - height} width={column - GAP} height={height} fill={`url(#${pattern})`} className="crowd-bar" />
          {payoutShares && payout > 0 && <rect x={x + column * .3} y={HEIGHT - BOTTOM - payout} width={column * .4} height={payout} className="crowd-payout" />}
          {mine[range.tierId] > 0 && <circle cx={x + column / 2} cy={HEIGHT - BOTTOM + 14} r="5" className="crowd-mine" />}
        </g>
      })}
    </svg>
    <div className="crowd-scale" aria-hidden="true"><span>{ranges[0].label}</span><span>{ranges.at(-1)!.label}</span></div>
    <figcaption role="status" aria-label="Selected crowd range">{total ? describe(selected) : 'No positions yet.'}</figcaption>
  </figure>
}
