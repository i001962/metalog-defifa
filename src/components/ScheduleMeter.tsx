'use client'

import { useEffect, useState } from 'react'
import type { MarketDefinition } from '@/domain/market'
import { remaining, shortTime } from './StageLamps'

/** Entry and observation as one bar, sized by duration, filled up to now. */
export function ScheduleMeter({ definition }: { definition: MarketDefinition }) {
  const { entryOpensAt: open, entryClosesAt: close, resolvesAt: end } = definition
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now() / 1000)
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])
  const at = (time: number) => (time - open) / (end - open) * 100
  const progress = now === null ? 0 : Math.min(100, Math.max(0, at(now)))
  const status = now === null ? '' : now < open ? `Entry opens in ${remaining(open - now)}` : now < close ? `Entry closes in ${remaining(close - now)}`
    : now < end ? `Observation ends in ${remaining(end - now)}` : 'Observation ended'
  return <div className="schedule-meter">
    <div className="schedule-track" role="meter" aria-label="Market schedule" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-valuetext={status}>
      <span className="schedule-segment" style={{ width: `${at(close)}%` }}>Entry</span>
      <span className="schedule-segment" style={{ width: `${100 - at(close)}%` }}>Observation</span>
      <span className="schedule-fill" style={{ width: `${progress}%` }} />
      {now !== null && <span className="schedule-now" style={{ left: `${progress}%` }} data-edge={progress > 85 ? 'end' : progress < 15 ? 'start' : undefined}>{status}</span>}
    </div>
    <div className="schedule-dates">
      <span style={{ left: 0 }}>{shortTime(open)}</span>
      <span style={{ left: `${at(close)}%` }}>{shortTime(close)}</span>
      <span style={{ left: '100%' }}>{shortTime(end)}</span>
    </div>
  </div>
}
