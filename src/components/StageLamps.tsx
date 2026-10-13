'use client'

import { useEffect, useState } from 'react'
import { useEthUsd, usdText } from '@/lib/eth-usd'
import { formatEther } from 'viem'
import type { MarketSnapshot } from '@/lib/defifa'
import { ChainIcon } from './ChainIcon'

const STEP: Record<MarketSnapshot['stage'], number> = { countdown: -1, entry: 0, refund: 0, trading: 1, settlement: 2, complete: 3, 'no-contest': 3 }

export function shortTime(seconds: number) {
  return new Intl.DateTimeFormat('en', { timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(seconds * 1000) + ' UTC'
}

/** Whole days, hours and minutes, skipping zero parts. */
function span(seconds: number) {
  const d = Math.floor(seconds / 86_400), h = Math.floor(seconds % 86_400 / 3_600), m = Math.floor(seconds % 3_600 / 60)
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ') || '0m'
}

export function remaining(seconds: number) {
  if (seconds <= 0) return 'any moment'
  const d = Math.floor(seconds / 86_400), h = Math.floor(seconds % 86_400 / 3_600), m = Math.floor(seconds % 3_600 / 60)
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m ${Math.floor(seconds % 60)}s` : `${Math.floor(seconds)}s`
}

/** What the pot can do in each stage: grow, be refunded, sit locked, or pay out. */
const POT: Record<MarketSnapshot['stage'], { state: 'open' | 'locked' | 'claimable'; label: string; note: string }> = {
  countdown: { state: 'open', label: 'Opens soon', note: 'Fills as people enter' },
  entry: { state: 'open', label: 'Open', note: 'Grows with each entry' },
  refund: { state: 'open', label: 'Refundable', note: 'Entries can still be refunded' },
  trading: { state: 'locked', label: 'Locked', note: 'Until a result is ratified' },
  settlement: { state: 'locked', label: 'Locked', note: 'Until a result is ratified' },
  complete: { state: 'claimable', label: 'Claimable', note: 'Paid out by the ratified result' },
  'no-contest': { state: 'claimable', label: 'Refundable', note: 'No contest, entries refunded' },
}

/** Gas lamps along the top of the stage: lit up to the game's current stage, with the next boundary counting down. */
/** The stage each lamp previews. */
const LAMP_STAGE: MarketSnapshot['stage'][] = ['entry', 'trading', 'settlement', 'complete']

export function StageLamps({ market, positions, liveStage, onPreview }: {
  market: MarketSnapshot
  positions: string
  /** The chain's stage while another one is previewed. */
  liveStage?: MarketSnapshot['stage']
  onPreview?: (stage: MarketSnapshot['stage']) => void
}) {
  const { entryOpensAt, entryClosesAt, resolvesAt } = market.definition
  const [now, setNow] = useState(market.blockTimestamp)
  useEffect(() => {
    // ponytail: wall clock drives the progress only; the stage itself always comes from the chain snapshot.
    const tick = () => setNow(Date.now() / 1000)
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])
  const step = STEP[market.stage]
  // Each lamp is a stage, dated by when it starts, so no two lamps share a date.
  const lamps = [
    { label: market.stage === 'refund' ? 'Refunds' : 'Enter', note: 'Pay to play', date: shortTime(entryOpensAt) },
    { label: 'Start', note: 'Entries locked', date: shortTime(entryClosesAt) },
    { label: 'Results', note: 'Decide outcome', date: shortTime(resolvesAt) },
    { label: market.stage === 'no-contest' ? 'No contest' : 'Claims', note: 'Collect earnings', date: '' },
  ]
  // The wire fills between the two lamps the game is moving between.
  const moving = market.stage === 'entry' ? { segment: 0, from: entryOpensAt, to: entryClosesAt }
    : market.stage === 'trading' ? { segment: 1, from: entryClosesAt, to: resolvesAt } : null
  const progress = moving && { segment: moving.segment, fraction: Math.min(1, Math.max(0, (now - moving.from) / Math.max(1, moving.to - moving.from))) }
  const gaps = [span(entryClosesAt - entryOpensAt), span(resolvesAt - entryClosesAt), 'awaits ratification']
  const pot = POT[market.stage]
  const eth = formatEther(BigInt(market.potWei))
  const ethUsd = useEthUsd()
  const usd = ethUsd === undefined ? null : Number(eth) * ethUsd
  return <div className="stage-bar" data-pot={pot.state}>
    <div className="pot">
      <span className="pot-head"><span className="pot-label">Pot</span><span className="pip" aria-hidden="true">|</span>
        <ChainIcon chainId={market.chainId} /><span>Game {market.projectId}</span></span>
      <strong>{usd === null ? `${eth} ETH` : usdText(usd)}</strong>
      <span className="pot-amounts">{eth} ETH <span className="pip" aria-hidden="true">|</span> {positions} positions</span>
      <span className="pot-state">
        <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="8" rx="1.5" />
          <path d={pot.state === 'locked' ? 'M5.5 7V5a2.5 2.5 0 0 1 5 0v2' : 'M5.5 7V5a2.5 2.5 0 0 1 5 0'} /></svg>
        {pot.label}
      </span>
      <span>{pot.note}</span>
    </div>
    <ol className="lamps" aria-label="Game stages" data-stage={market.stage}>
    {lamps.map((lamp, index) => <li key={index} className="lamp" data-state={index < step ? 'past' : index === step ? 'current' : 'future'}
      aria-current={index === step ? 'step' : undefined} data-live={liveStage !== undefined && STEP[liveStage] === index}>
      {onPreview && <button type="button" className="lamp-pick" aria-label={`Preview ${lamp.label}`} aria-pressed={index === step}
        onClick={() => onPreview(index === STEP[liveStage ?? market.stage] ? liveStage ?? market.stage : LAMP_STAGE[index])} />}
      <strong>{lamp.label}</strong>
      <span className="lamp-note">{lamp.note}</span>
      <svg viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="9" /></svg>
      <small>{lamp.date}</small>
      {gaps[index] && <span className="lamp-gap"><span>{gaps[index]}</span></span>}
      {/* Finished segments stay filled; the running one grows from its lamp toward the next. */}
      {index < 3 && (index < step || progress?.segment === index) && <span className="lamp-progress" data-segment={index}
        {...progress?.segment === index ? { role: 'progressbar', 'aria-label': index === 0 ? 'Entry progress' : 'Game progress',
          'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(progress.fraction * 100) } : { 'aria-hidden': true }}>
        <span style={{ width: `${(progress?.segment === index ? progress.fraction : 1) * 100}%` }} /></span>}
    </li>)}
  </ol>
  </div>
}
