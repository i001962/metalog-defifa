'use client'

import { useEffect, useState } from 'react'
import type { MarketSnapshot } from '@/lib/defifa'

const FLAME = 'M20 2C23 9 27 12 30 15C33 10 36 8 38 7C37 15 33 23 20 25C7 23 3 15 2 7C4 8 7 10 10 15C13 12 17 9 20 2Z'
const STEP: Record<MarketSnapshot['stage'], number> = { countdown: 0, entry: 1, refund: 1, trading: 2, settlement: 3, complete: 4, 'no-contest': 4 }

export function shortTime(seconds: number) {
  return new Intl.DateTimeFormat('en', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(seconds * 1000) + ' UTC'
}

export function remaining(seconds: number) {
  if (seconds <= 0) return 'any moment'
  const d = Math.floor(seconds / 86_400), h = Math.floor(seconds % 86_400 / 3_600), m = Math.floor(seconds % 3_600 / 60)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m ${Math.floor(seconds % 60)}s` : `${Math.floor(seconds)}s`
}

/** Gas lamps along the top of the stage: lit up to the game's current stage, with the next boundary counting down. */
export function StageLamps({ market }: { market: MarketSnapshot }) {
  const { entryOpensAt, entryClosesAt, resolvesAt } = market.definition
  const [now, setNow] = useState(market.blockTimestamp)
  useEffect(() => {
    // ponytail: wall clock drives the countdown only; the stage itself always comes from the chain snapshot.
    const tick = () => setNow(Date.now() / 1000)
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])
  const step = STEP[market.stage]
  const lamps = [
    { label: 'Opens', date: shortTime(entryOpensAt), countdown: market.stage === 'countdown' ? `opens in ${remaining(entryOpensAt - now)}` : '' },
    { label: market.stage === 'refund' ? 'Refunds' : 'Entry', date: `until ${shortTime(entryClosesAt)}`, countdown: market.stage === 'entry' ? `closes in ${remaining(entryClosesAt - now)}` : '' },
    { label: 'Observation', date: `until ${shortTime(resolvesAt)}`, countdown: market.stage === 'trading' ? `ends in ${remaining(resolvesAt - now)}` : '' },
    { label: 'Results', date: `from ${shortTime(resolvesAt)}`, countdown: '' },
    { label: market.stage === 'no-contest' ? 'No contest' : 'Claims', date: '', countdown: '' },
  ]
  return <ol className="lamps" aria-label="Game stages" data-stage={market.stage}>
    {lamps.map((lamp, index) => <li key={index} className="lamp" data-state={index < step ? 'past' : index === step ? 'current' : 'future'}
      aria-current={index === step ? 'step' : undefined}>
      <svg viewBox="0 0 40 26" aria-hidden="true"><path d={FLAME} /></svg>
      <strong>{lamp.label}</strong>
      {lamp.countdown && <em>{lamp.countdown}</em>}
      {lamp.date && <small>{lamp.date}</small>}
    </li>)}
  </ol>
}
