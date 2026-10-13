'use client'

import { Fragment, useState } from 'react'
import { formatEther } from 'viem'
import { impliedChance, payoutPerPosition, type RangeBook } from '@/domain/book'
import type { MarketSnapshot } from '@/lib/defifa'
import type { ScorecardSnapshot } from '@/lib/defifa-lifecycle'
import { shortTime } from './StageLamps'
import { useEthUsd, usdText } from '@/lib/eth-usd'

const NO_VENUE = 'No trading venue is connected yet.'

/** Bids and asks per range while the game plays out; the book closes when observation ends. */
export function OrderBook({ market, books, sample, owned, scorecards }: {
  market: MarketSnapshot
  /** Proposed results; the leading one prices each range until a result is ratified. */
  scorecards: ScorecardSnapshot[]
  books: RangeBook[] | null
  sample: boolean
  /** Positions this wallet holds per tier. */
  owned: Record<number, number>
}) {
  const [open, setOpen] = useState<number | null>(null)
  const ethUsd = useEthUsd()
  // Prices read in dollars like the pot, or in ETH until the ETH price loads.
  const price = (wei: bigint) => ethUsd === undefined
    ? `${Number(formatEther(wei)).toLocaleString('en-US', { maximumSignificantDigits: 3 })} ETH` : usdText(Number(formatEther(wei)) * ethUsd)
  const closed = market.stage !== 'trading'
  const pot = BigInt(market.potWei)
  // What a position pays: the ratified result, else the most-attested live proposal, else the range taking the whole pot.
  const leading = scorecards.filter(card => card.stateName !== 'Defeated')
    .reduce<ScorecardSnapshot | null>((best, card) => !best || BigInt(card.attestationCount) > BigInt(best.attestationCount) ? card : best, null)
  const weights = market.ratifiedWeights ?? leading?.weights ?? null
  const basis = market.ratifiedWeights ? 'under the ratified result' : leading ? `under proposal ${leading.scorecardId}, the most attested` : 'if this range wins the whole pot'
  return <section aria-labelledby="book-heading" className="order-book">
    <div className="row"><h3 id="book-heading">Order book</h3>
      <span className="hint">{closed ? 'Closed at observation end' : `Closes at observation end, ${shortTime(market.definition.resolvesAt)}`}
        {sample && <><span className="pip" aria-hidden="true">|</span>Sample book, development only</>}</span></div>
    <p className="hint">Pays is what one position collects {basis}.</p>
    <div className="table-wrap"><table className="book-table"><thead><tr><th>Range</th><th>Pays</th><th>Odds</th><th>Bid</th><th>Ask</th><th><span className="sr-only">Trade</span></th></tr></thead><tbody>
      {market.ranges.map((range, index) => {
        const book = books?.find(item => item.tierId === range.tierId)
        const bid = book?.bids[0], ask = book?.asks[0]
        const supply = Number(market.tiers[index].supply)
        const chance = impliedChance(book, supply, pot)
        const weight = weights ? BigInt(weights.find(item => item.tierId === range.tierId)?.weight ?? '0') : undefined
        const pays = payoutPerPosition(pot, supply, weight)
        const expanded = open === range.tierId
        return <Fragment key={range.tierId}><tr>
          <td><button type="button" className="book-range" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : range.tierId)}>{range.label}</button></td>
          <td className="book-pays">{pays === null ? '—' : price(pays)}</td>
          <td className="book-odds">{chance === null ? '—' : `${Math.round(chance * 100)}%`}</td>
          <td className="book-bid">{bid ? price(bid.priceWei) : '—'}</td>
          <td className="book-ask">{ask ? price(ask.priceWei) : '—'}</td>
          <td className="book-trade"><button type="button" disabled title={NO_VENUE}>Buy</button><button type="button" disabled title={NO_VENUE}>Sell</button></td>
        </tr>
        {expanded && <tr className="book-depth"><td colSpan={6}>
          <div className="book-sides">
            <div><h4>Bids</h4>{book?.bids.length ? <ol>{book.bids.map((level, i) => <li key={i}><span className="book-bid">{price(level.priceWei)}</span><span>{level.quantity}</span></li>)}</ol> : <p className="hint">No bids</p>}</div>
            <div><h4>Asks</h4>{book?.asks.length ? <ol>{book.asks.map((level, i) => <li key={i}><span className="book-ask">{price(level.priceWei)}</span><span>{level.quantity}</span></li>)}</ol> : <p className="hint">No asks</p>}</div>
          </div>
          <div className="book-forms">
            <fieldset disabled><legend>Place bid</legend>
              <label className="field"><span>Price per position (ETH)</span><input inputMode="decimal" placeholder="0.0" /></label>
              <label className="field"><span>Positions</span><input inputMode="numeric" placeholder="1" /></label>
              <button type="button">Review bid</button></fieldset>
            <fieldset disabled={!owned[range.tierId]}><legend>Place ask</legend>
              {owned[range.tierId] ? <>
                <label className="field"><span>Price per position (ETH)</span><input inputMode="decimal" placeholder="0.0" disabled /></label>
                <label className="field"><span>Positions (you hold {owned[range.tierId]})</span><input inputMode="numeric" placeholder="1" disabled /></label>
                <button type="button" disabled>Review ask</button></> : <p className="hint">You hold no positions in this range.</p>}
            </fieldset>
          </div>
          <p className="hint">{NO_VENUE}</p>
        </td></tr>}
        </Fragment>
      })}
    </tbody></table></div>
    {!books && <p className="hint">{NO_VENUE}</p>}
  </section>
}
