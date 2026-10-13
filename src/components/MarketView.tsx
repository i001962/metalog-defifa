'use client'

import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatEther } from 'viem'
import type { LifecycleSnapshot } from '@/lib/defifa-lifecycle'
import { marketData } from '@/lib/market-data'
import { rememberMarket } from '@/lib/recent-markets'
import { chainForId } from '@/lib/wallet'
import { useWallet } from '@/providers/Providers'
import { ForecastEditor } from './ForecastEditor'
import { MarketFacts } from './MarketFacts'
import { MarketLifecycle } from './MarketLifecycle'
import { Entries } from './Entries'
import { CrowdChart } from './CrowdChart'
import { Activity } from './Activity'
import { StageLamps } from './StageLamps'
import { ChainIcon } from './ChainIcon'
import type { MarketSnapshot } from '@/lib/defifa'

type Tab = 'view' | 'crowd' | 'nfts' | 'results' | 'entries' | 'rules'
/** The one panel that matters most in each stage. */
const FOCUS: Record<MarketSnapshot['stage'], Tab> = { countdown: 'view', entry: 'view', refund: 'nfts', trading: 'crowd', settlement: 'results', complete: 'crowd', 'no-contest': 'nfts' }

export function MarketView({ chainId, projectId }: { chainId: number; projectId: string }) {
  const { address } = useWallet()
  const queryClient = useQueryClient()
  const scope = `${chainId}:${projectId}:${address?.toLowerCase() ?? ''}`
  const [pagination, setPagination] = useState<{ scope: string; blockNumber?: string; tokenCursor?: string; scorecardCursor?: string }>({ scope })
  const page = pagination.scope === scope ? pagination : { scope }
  const query = useQuery({ queryKey: ['market-play', chainId, projectId, address?.toLowerCase(), page.blockNumber, page.tokenCursor, page.scorecardCursor], queryFn: async ({ signal }) => {
    const params = new URLSearchParams()
    if (address) params.set('account', address)
    if (page.blockNumber) params.set('blockNumber', page.blockNumber)
    if (page.tokenCursor) params.set('tokenCursor', page.tokenCursor)
    if (page.scorecardCursor) params.set('scorecardCursor', page.scorecardCursor)
    const response = await fetch(`/api/markets/${chainId}/${projectId}/play?${params}`, { signal })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Market could not be read.')
    return data as LifecycleSnapshot
  }, placeholderData: keepPreviousData, staleTime: 15_000, refetchInterval: page.blockNumber ? false : 30_000, refetchIntervalInBackground: false })
  useEffect(() => {
    if (query.data && !query.isPlaceholderData && query.data.market.chainId === chainId && query.data.market.projectId === projectId) rememberMarket(chainId, projectId)
  }, [query.data, query.isPlaceholderData, chainId, projectId])
  // The first snapshot picks the panel; a refresh that moves the stage lights its tab but never yanks an open panel away.
  const [tab, setTab] = useState<Tab | null>(null)
  const [lastResult, setLastResult] = useState<LifecycleSnapshot | null>(null)
  if (query.data && !query.isPlaceholderData && query.data !== lastResult) setLastResult(query.data)
  const previous = lastResult?.market.chainId === chainId && lastResult.market.projectId === projectId ? lastResult : null
  const result = query.data?.market.chainId === chainId && query.data.market.projectId === projectId ? query.data : null
  const lifecycle = result ?? previous
  function refresh() {
    setPagination({ scope })
    void queryClient.invalidateQueries({ queryKey: ['market-play', chainId, projectId] })
    void queryClient.invalidateQueries({ queryKey: ['market-entries', chainId, projectId] })
  }
  if (!lifecycle && (query.isPending || query.isFetching)) return <p role="status">Loading market…</p>
  if (!lifecycle) return <><h1>Market unavailable</h1><p className="error" role="alert">{query.error?.message || 'No market data was returned.'}</p><button onClick={refresh}>Retry</button></>
  const market = lifecycle.market
  const current = !page.blockNumber && !query.isPlaceholderData && !query.error && !!query.data
  const data = marketData(market)
  const distribution = data.positionDistribution
  const supplies = market.tiers.map(tier => Number(tier.supply))
  const mine: Record<number, number> = {}
  for (const token of lifecycle.account?.toLowerCase() === address?.toLowerCase() ? lifecycle.inventory.tokens : []) mine[token.tierId] = (mine[token.tierId] ?? 0) + 1
  const owned = Object.keys(mine).length > 0
  // Holders in a finished game go straight to claiming; everyone else sees how it paid out.
  const focus = market.stage === 'complete' && owned ? 'nfts' : FOCUS[market.stage]
  if (tab === null) setTab(focus)
  const shown = tab ?? focus
  const tabs: { id: Tab; label: string; count?: string }[] = [
    { id: 'view', label: 'Contribute' },
    { id: 'crowd', label: 'Crowd', count: distribution.totalSupply },
    { id: 'nfts', label: 'Your NFTs', count: address && lifecycle.account?.toLowerCase() === address.toLowerCase() ? lifecycle.inventory.totalOwned : undefined },
    { id: 'results', label: 'Results', count: lifecycle.scorecards.length ? String(lifecycle.scorecards.length) : undefined },
    { id: 'entries', label: 'Entries' },
    { id: 'rules', label: 'Rules' },
  ]
  return <div className="market">
    <header className="market-hero">
      <StageLamps market={market} />
      <div className="market-title">
        <div><h1>{market.definition.prompt}</h1>
          <p className="market-meta"><span>Game {market.projectId}</span><ChainIcon chainId={chainId} /></p></div>
        <p className="pot"><strong>{formatEther(BigInt(market.potWei))}</strong><span>ETH pot, {distribution.totalSupply} positions</span></p>
      </div>
    </header>
    {!current && <div className="actions" role="status">
      <span className="hint">{page.blockNumber ? `Historical snapshot at block ${page.blockNumber}.` : query.isFetching ? 'Checking latest market data…' : 'Latest market data is unavailable.'} Refresh to enable entry and market actions.</span>
      <button type="button" disabled={query.isFetching} onClick={refresh}>Refresh to latest</button>
    </div>}
    <div className="tabs" role="tablist" aria-label="Market" onKeyDown={event => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
      const next = tabs[(tabs.findIndex(item => item.id === shown) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].id
      setTab(next)
      document.getElementById(`tab-${next}`)?.focus()
    }}>
      {tabs.map(item => <button key={item.id} type="button" role="tab" id={`tab-${item.id}`} aria-controls={`panel-${item.id}`}
        aria-selected={shown === item.id} tabIndex={shown === item.id ? 0 : -1} data-focus={focus === item.id} onClick={() => setTab(item.id)}>
        {item.label}{item.count !== undefined && <span className="tab-count">{item.count}</span>}
      </button>)}
    </div>
    <div role="tabpanel" id="panel-view" aria-labelledby="tab-view" hidden={shown !== 'view'}>
      <ForecastEditor key={`${chainId}:${projectId}`} definition={market.definition} market={market} current={current} onSubmitted={refresh} crowd={supplies} />
    </div>
    <div role="tabpanel" id="panel-crowd" aria-labelledby="tab-crowd" hidden={shown !== 'crowd'}>
      <section aria-labelledby="crowd-heading">
        <div className="row"><h2 id="crowd-heading">Stake-weighted positions</h2><div className="inline">
          <a href={`/api/markets/${chainId}/${projectId}`}>JSON</a>
          <a href={`/api/markets/${chainId}/${projectId}?format=sipmath`}>SIPmath</a>
          <a href={`${chainForId(chainId).blockExplorers.default.url}/address/${market.hook}`} target="_blank" rel="noreferrer">Contract</a>
        </div></div>
        <div className="crowd-legend"><span className="legend-crowd">Crowd stake</span>
          {data.ratifiedPayoutShares && <span className="legend-payout">Ratified payout</span>}
          {owned && <span className="legend-mine">Your NFTs</span>}</div>
        <CrowdChart ranges={market.ranges} supplies={supplies} payoutShares={data.ratifiedPayoutShares} mine={mine} />
        {lifecycle.cashOutMode && <div className="actions"><button type="button" className="primary" onClick={() => setTab('nfts')}>
          {lifecycle.cashOutMode === 'cash-out' ? 'Claim payout' : 'Refund'} with your NFTs</button></div>}
        <div className="table-wrap crowd-table"><table><thead><tr><th>Range</th><th>Positions</th><th>Share</th>{data.ratifiedPayoutShares && <th>Payout</th>}</tr></thead><tbody>
          {market.ranges.map((range, index) => <tr key={range.tierId}><td>{range.label}</td><td>{market.tiers[index].supply}</td>
            <td>{distribution.probabilities ? `${(distribution.probabilities[index] * 100).toFixed(2)}%` : '—'}</td>
            {data.ratifiedPayoutShares && <td>{(data.ratifiedPayoutShares[index] * 100).toFixed(2)}%</td>}</tr>)}
        </tbody></table></div>
        <Activity market={market} active={shown === 'crowd'} />
      </section>
    </div>
    <MarketLifecycle key={`play:${chainId}:${projectId}`} lifecycle={lifecycle} current={current}
      panel={shown === 'nfts' || shown === 'results' ? shown : null}
      loading={query.isFetching} error={query.error?.message} onRefresh={refresh}
      onPage={(kind, cursor) => setPagination({ ...page, blockNumber: market.blockNumber, [kind === 'inventory' ? 'tokenCursor' : 'scorecardCursor']: cursor })}
      inventoryPaged={!!page.tokenCursor} scorecardsPaged={!!page.scorecardCursor} />
    <div role="tabpanel" id="panel-entries" aria-labelledby="tab-entries" hidden={shown !== 'entries'}>
      <Entries key={`entries:${chainId}:${projectId}`} market={market} />
    </div>
    <div role="tabpanel" id="panel-rules" aria-labelledby="tab-rules" hidden={shown !== 'rules'}>
      <MarketFacts definition={market.definition} open />
    </div>
  </div>
}
