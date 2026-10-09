'use client'

import { useQuery } from '@tanstack/react-query'
import { formatEther } from 'viem'
import type { MarketSnapshot } from '@/lib/defifa'
import { marketData } from '@/lib/market-data'
import { chainForId } from '@/lib/wallet'
import { ForecastEditor } from './ForecastEditor'
import { MarketFacts, utcTime } from './MarketFacts'

export function MarketView({ chainId, projectId }: { chainId: number; projectId: string }) {
  const query = useQuery({ queryKey: ['market', chainId, projectId], queryFn: async ({ signal }) => {
    const response = await fetch(`/api/markets/${chainId}/${projectId}`, { signal })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Market could not be read.')
    return data as MarketSnapshot
  }, staleTime: 15_000, refetchInterval: 30_000, refetchIntervalInBackground: false })
  if (query.isPending) return <p role="status">Loading market…</p>
  if (query.error || !query.data) return <><h1>Market unavailable</h1><p className="error" role="alert">{query.error?.message || 'No market data was returned.'}</p><button onClick={() => query.refetch()}>Retry</button></>
  const market = query.data
  const data = marketData(market)
  const distribution = data.positionDistribution
  return <><span className="eyebrow">{market.stage} / Game {market.projectId}</span><h1>{market.definition.prompt}</h1>
    <p className="muted">{utcTime(market.definition.entryClosesAt)} → {utcTime(market.definition.resolvesAt)}</p>
    <MarketFacts definition={market.definition} />
    <ForecastEditor key={`${chainId}:${projectId}`} definition={market.definition} market={market} onSubmitted={() => { void query.refetch() }} />
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
    <section><h2>Trading &amp; settlement</h2><p>No trading price feed is connected.</p>
      <p className="muted">Payouts follow the ratified Defifa scorecard.</p>
      {market.ratifiedScorecardId && <p>Ratified scorecard: <code>{market.ratifiedScorecardId}</code></p>}
      {market.ratifiedWeights && data.ratifiedPayoutShares && <div className="table-wrap"><table><thead><tr><th>Range</th><th>Ratified payout share</th></tr></thead><tbody>
        {market.ratifiedWeights.map((weight, index) => <tr key={weight.tierId}><td>{market.ranges.find(range => range.tierId === weight.tierId)?.label}</td><td>{(data.ratifiedPayoutShares![index] * 100).toFixed(2)}%</td></tr>)}
      </tbody></table></div>}
      <a href={`${chainForId(chainId).blockExplorers.default.url}/address/${market.hook}`} target="_blank" rel="noreferrer">View game contract</a>
    </section>
  </>
}
