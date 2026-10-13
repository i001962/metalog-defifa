'use client'

import { useEffect, useState } from 'react'
import type { MarketSnapshot } from '@/lib/defifa'

const STEP: Record<MarketSnapshot['stage'], number> = { countdown: -1, entry: 0, refund: 0, trading: 1, settlement: 2, complete: 3, 'no-contest': 3 }

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
  // Each lamp is a stage, dated by when it starts, so no two lamps share a date.
  const lamps = [
    { label: market.stage === 'refund' ? 'Refunds' : 'Enter', note: 'Pay to play', date: shortTime(entryOpensAt),
      countdown: market.stage === 'countdown' ? `opens in ${remaining(entryOpensAt - now)}` : market.stage === 'entry' ? `closes in ${remaining(entryClosesAt - now)}` : '' },
    { label: 'Start', note: 'Entries locked', date: shortTime(entryClosesAt), countdown: market.stage === 'trading' ? `ends in ${remaining(resolvesAt - now)}` : '' },
    { label: 'Results', note: 'Decide outcome', date: shortTime(resolvesAt), countdown: '' },
    { label: market.stage === 'no-contest' ? 'No contest' : 'Claims', note: 'Collect earnings', date: '', countdown: '' },
  ]
  return <ol className="lamps" aria-label="Game stages" data-stage={market.stage}>
    {lamps.map((lamp, index) => <li key={index} className="lamp" data-state={index < step ? 'past' : index === step ? 'current' : 'future'}
      aria-current={index === step ? 'step' : undefined}>
      <svg viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="9" /></svg>
      <strong>{lamp.label}</strong>
      <span className="lamp-note">{lamp.note}</span>
      {lamp.countdown && <em>{lamp.countdown}</em>}
      {lamp.date && <small>{lamp.date}</small>}
    </li>)}
  </ol>
}
