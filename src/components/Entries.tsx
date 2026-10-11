'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatEther } from 'viem'
import type { MarketSnapshot } from '@/lib/defifa'
import type { EntryHistoryEntry, EntryHistoryPage } from '@/lib/entries'
import { chainForId } from '@/lib/wallet'
import { downloadJson } from '@/lib/forecast'
import { PositionChart } from './PositionChart'
import { utcTime } from './MarketFacts'

const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

export function Entries({ market }: { market: MarketSnapshot }) {
  const [opened, setOpened] = useState(false)
  const [page, setPage] = useState<{ blockNumber?: string; cursor?: string }>({})
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['market-entries', market.chainId, market.projectId, page.blockNumber, page.cursor], enabled: opened,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams(page)
      const response = await fetch(`/api/markets/${market.chainId}/${market.projectId}/entries?${params}`, { signal })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Entry history could not be verified.')
      return data as EntryHistoryPage
    }, staleTime: Infinity, refetchOnWindowFocus: false,
  })
  const explorer = chainForId(market.chainId).blockExplorers.default.url
  function refresh() {
    if (page.blockNumber || page.cursor) {
      void queryClient.invalidateQueries({ queryKey: ['market-entries', market.chainId, market.projectId, undefined, undefined], exact: true, refetchType: 'none' })
      setPage({})
    }
    else void query.refetch()
  }
  return <section aria-labelledby="entries-heading">
    <div className="row"><h2 id="entries-heading">Entries</h2>{opened && <button type="button" disabled={query.isFetching} onClick={refresh}>Refresh entries</button>}</div>
    <p className="hint">Submitted curves and their minted positions. Transfers do not change the original entry.</p>
    {!opened ? <button type="button" onClick={() => setOpened(true)}>View entries</button> : <>
      {query.isFetching && <p role="status">Checking entry receipts…</p>}
      {query.error && <div className="actions"><p className="error" role="alert">{query.error.message}</p><button type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry entries</button></div>}
      {query.data && <>
        <p className="hint">Snapshot at block {query.data.blockNumber}.{query.data.scannedFromBlock !== null && <> Checked blocks {query.data.scannedFromBlock}–{query.data.scannedToBlock}.</>}</p>
        {!query.data.entries.length && <p>{query.data.scannedFromBlock === null ? 'No entries yet.' : query.data.complete ? 'No entries in this part of the entry period.' : 'No entries in these blocks. Older blocks remain to be checked.'}</p>}
        {query.data.entries.map(entry => <Entry key={entry.transactionHash} entry={entry} market={market} explorer={explorer} />)}
        <div className="actions">
          {query.data.nextCursor && <button type="button" disabled={query.isFetching} onClick={() => setPage({ blockNumber: query.data!.blockNumber, cursor: query.data!.nextCursor! })}>Load older entries</button>}
          <button type="button" onClick={() => downloadJson(query.data, `metalog-${market.chainId}-${market.projectId}-entries.json`)}>Download page JSON</button>
        </div>
        <p className="hint">{query.data.scannedFromBlock === null ? 'The entry period has not started at this snapshot.' : query.data.complete ? 'Reached the start of the entry period.' : 'History is incomplete. Load older entries to continue.'}</p>
      </>}
    </>}
  </section>
}

function Entry({ entry, market, explorer }: { entry: EntryHistoryEntry; market: MarketSnapshot; explorer: string }) {
  const recognized = entry.status === 'verified-curve' || entry.status === 'verified-manual'
  const label = entry.status === 'verified-curve' ? 'Curve entry' : entry.status === 'verified-manual' ? 'By range entry' : 'Curve unavailable'
  return <details className="entry-record">
    <summary>{utcTime(entry.timestamp)} | {shortAddress(entry.account)} | {entry.stakeWei === null ? 'Stake unavailable' : `${formatEther(BigInt(entry.stakeWei))} ETH`} | {label}</summary>
    <div className="row"><a href={`${explorer}/tx/${entry.transactionHash}`} target="_blank" rel="noreferrer">View mint receipt</a><button type="button" onClick={() => downloadJson(entry, `metalog-entry-${entry.transactionHash}.json`)}>Download entry JSON</button></div>
    <dl className="facts">
      <dt>Account</dt><dd><a href={`${explorer}/address/${entry.account}`} target="_blank" rel="noreferrer">{entry.account}</a></dd>
      <dt>Recipient</dt><dd>{entry.beneficiary ?? 'Multiple recipients; see the receipt.'}</dd>
      <dt>Block</dt><dd>{entry.blockNumber}</dd>
      <dt>Minted NFTs</dt><dd>{entry.tokenIds.length}</dd>
    </dl>
    {recognized && entry.coefficients ? <>
      <PositionChart ranges={market.ranges} quantities={entry.quantities} coefficients={entry.coefficients} submitted reference={entry.status === 'verified-manual'} />
      {entry.status === 'verified-manual' && <p className="hint">The counts were set by range; the curve is reference evidence.</p>}
      <p className="entry-coefficients">a-coefficients: <code>{JSON.stringify(entry.coefficients)}</code></p>
    </> : <p className="hint">{entry.reason || 'This transaction has no supported Metalog curve record.'}</p>}
    <div className="table-wrap"><table><thead><tr><th>Range</th><th>Minted NFTs</th></tr></thead><tbody>{market.ranges.map((range, index) => <tr key={range.tierId}><td>{range.label}</td><td>{entry.quantities[index]}</td></tr>)}</tbody></table></div>
    <details><summary>Minted token IDs</summary><p className="entry-coefficients">{entry.tokenIds.join(', ')}</p></details>
  </details>
}
