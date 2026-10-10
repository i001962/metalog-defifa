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
import { MarketFacts, utcTime } from './MarketFacts'
import { MarketLifecycle } from './MarketLifecycle'

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
  const [lastResult, setLastResult] = useState<LifecycleSnapshot | null>(null)
  if (query.data && !query.isPlaceholderData && query.data !== lastResult) setLastResult(query.data)
  const previous = lastResult?.market.chainId === chainId && lastResult.market.projectId === projectId ? lastResult : null
  const result = query.data?.market.chainId === chainId && query.data.market.projectId === projectId ? query.data : null
  const lifecycle = result ?? previous
  function refresh() {
    setPagination({ scope })
    void queryClient.invalidateQueries({ queryKey: ['market-play', chainId, projectId] })
  }
  if (!lifecycle && (query.isPending || query.isFetching)) return <p role="status">Loading market…</p>
  if (!lifecycle) return <><h1>Market unavailable</h1><p className="error" role="alert">{query.error?.message || 'No market data was returned.'}</p><button onClick={refresh}>Retry</button></>
  const market = lifecycle.market
  const current = !query.isPlaceholderData && !query.error && !query.isFetching && !!query.data
  const data = marketData(market)
  const distribution = data.positionDistribution
  return <><span className="eyebrow">{market.stage} / Game {market.projectId}</span><h1>{market.definition.prompt}</h1>
    <p className="muted">{utcTime(market.definition.entryClosesAt)} → {utcTime(market.definition.resolvesAt)}</p>
    <MarketFacts definition={market.definition} />
    <ForecastEditor key={`${chainId}:${projectId}`} definition={market.definition} market={market} onSubmitted={refresh} />
    <MarketLifecycle key={`play:${chainId}:${projectId}`} lifecycle={lifecycle} current={current}
      loading={query.isFetching} error={query.error?.message} onRefresh={refresh}
      onPage={(kind, cursor) => setPagination({ ...page, blockNumber: market.blockNumber, [kind === 'inventory' ? 'tokenCursor' : 'scorecardCursor']: cursor })}
      inventoryPaged={!!page.tokenCursor} scorecardsPaged={!!page.scorecardCursor} />
    <section><div className="row"><h2>Stake-weighted positions</h2><div className="inline">
      <a href={`/api/markets/${chainId}/${projectId}`}>JSON</a>
      <a href={`/api/markets/${chainId}/${projectId}?format=sipmath`}>SIPmath</a>
    </div></div>
      <p className="muted">{distribution.totalSupply} circulating NFTs / {formatEther(BigInt(market.potWei))} ETH in the pot</p>
      {distribution.probabilities === null ? <p>No positions yet.</p> : <div className="table-wrap"><table><thead><tr><th>Range</th><th>Positions</th><th>Share</th></tr></thead><tbody>
        {market.ranges.map((range, index) => <tr key={range.tierId}><td>{range.label}</td><td>{market.tiers[index].supply}</td><td>{(distribution.probabilities![index] * 100).toFixed(2)}%</td></tr>)}
      </tbody></table></div>}
      <p className="hint" style={{ marginTop: 16 }}>Supply at block {market.blockNumber}. Refunds and redemptions change circulating supply.</p>
    </section>
    <section><h2>Settlement</h2>
      <p className="muted">Payouts follow the ratified scorecard.</p>
      {market.ratifiedScorecardId && <p>Ratified scorecard: <code>{market.ratifiedScorecardId}</code></p>}
      {market.ratifiedWeights && data.ratifiedPayoutShares && <div className="table-wrap"><table><thead><tr><th>Range</th><th>Ratified payout share</th></tr></thead><tbody>
        {market.ratifiedWeights.map((weight, index) => <tr key={weight.tierId}><td>{market.ranges.find(range => range.tierId === weight.tierId)?.label}</td><td>{(data.ratifiedPayoutShares![index] * 100).toFixed(2)}%</td></tr>)}
      </tbody></table></div>}
      <a href={`${chainForId(chainId).blockExplorers.default.url}/address/${market.hook}`} target="_blank" rel="noreferrer">View game contract</a>
    </section>
  </>
}
