'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  const gaps = [span(entryClosesAt - entryOpensAt), span(resolvesAt - entryClosesAt), 'awaits ratification']
  const pot = POT[market.stage]
  const eth = formatEther(BigInt(market.potWei))
  // ponytail: Coinbase spot for display only; the pot itself is ETH, so a failed read just shows ETH.
  const ethUsd = useQuery({
    queryKey: ['eth-usd'],
    queryFn: async () => {
      const response = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot')
      if (!response.ok) throw new Error('ETH price unavailable')
      const price = Number((await response.json()).data.amount)
      if (!(price > 0)) throw new Error('ETH price unavailable')
      return price
    },
    staleTime: 60_000, refetchInterval: 60_000, retry: 1,
  }).data
  const usd = ethUsd === undefined ? null : Number(eth) * ethUsd
  return <div className="stage-bar" data-pot={pot.state}>
    <div className="pot">
      <span className="pot-head"><span className="pot-label">Pot</span><span className="pip" aria-hidden="true">|</span>
        <ChainIcon chainId={market.chainId} /><span>Game {market.projectId}</span></span>
      <strong>{usd === null ? `${eth} ETH` : `$${usd.toLocaleString('en-US', { minimumFractionDigits: usd < 1000 ? 2 : 0, maximumFractionDigits: usd < 1000 ? 2 : 0 })}`}</strong>
      <span>{eth} ETH <span className="pip" aria-hidden="true">|</span> {positions} positions</span>
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
      {lamp.countdown && <em>{lamp.countdown}</em>}
      {gaps[index] && <span className="lamp-gap"><span>{gaps[index]}</span></span>}
    </li>)}
  </ol>
  </div>
}
