'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { chainForId, SUPPORTED_CHAINS } from '@/lib/wallet'
import { projectNumber, type MarketSnapshot } from '@/lib/defifa'
import { readRecentMarkets, rememberMarket } from '@/lib/recent-markets'

export function Markets() {
  const [chainId, setChainId] = useState(8453)
  const [projectId, setProjectId] = useState('')
  const [openError, setOpenError] = useState('')
  const router = useRouter()
  const recent = useQuery({ queryKey: ['recent-markets'], queryFn: () => readRecentMarkets(), staleTime: 0 }).data ?? []
  const query = useQuery({ queryKey: ['markets', chainId], queryFn: async ({ signal }) => {
    const response = await fetch(`/api/markets?chainId=${chainId}`, { signal })
    if (!response.ok) throw new Error('Markets could not be loaded.')
    return response.json() as Promise<{ markets: MarketSnapshot[]; errors: string[] }>
  }, staleTime: 30_000 })
  return <>
    <h1>Markets</h1>
    <div className="grid">
      <label className="field"><span>Network</span><select className="network-select" value={chainId} onChange={event => setChainId(Number(event.target.value))}>{SUPPORTED_CHAINS.map(chain => <option key={chain.id} value={chain.id}>{chain.name}</option>)}</select></label>
      <form className="field" onSubmit={event => {
        event.preventDefault()
        try {
          projectNumber(projectId)
          setOpenError('')
          rememberMarket(chainId, projectId)
          router.push(`/markets/${chainId}/${projectId}`)
        } catch { setOpenError('Enter a valid project ID.') }
      }}>
        <label htmlFor="project-id"><span>Open a game</span></label><div className="inline"><input className="project-id-input" id="project-id" inputMode="numeric" placeholder="Project ID" value={projectId} onChange={event => { setProjectId(event.target.value); setOpenError('') }} maxLength={78} required /><button type="submit">Open</button></div>
        {openError && <small className="error" role="alert">{openError}</small>}
      </form>
    </div>
    {recent.length > 0 && <section aria-labelledby="recent-markets"><h2 id="recent-markets">Recently opened</h2><div className="actions">
      {recent.map(market => <Link key={`${market.chainId}:${market.projectId}`} href={`/markets/${market.chainId}/${market.projectId}`} prefetch={false} style={{ overflowWrap: 'anywhere' }}>{chainForId(market.chainId).name} / Game {market.projectId}</Link>)}
    </div></section>}
    {query.isPending && <p className="hint" role="status">Loading markets…</p>}
    {query.error && <p className="error" role="alert">{query.error.message} <button onClick={() => query.refetch()}>Retry</button></p>}
    {query.data?.errors.map((error, index) => <p className="error" key={index}>{error}</p>)}
    {query.data?.markets.map(market => <Link className="market-row" key={market.projectId} href={`/markets/${market.chainId}/${market.projectId}`}><strong>{market.definition.prompt}</strong><small>{market.stage} / Game {market.projectId}</small></Link>)}
    {query.data && query.data.markets.length === 0 && query.data.errors.length === 0 && <p className="muted">No markets listed on this network yet.</p>}
    <Link className="market-row" href="/markets/example"><strong>What will Bitcoin’s price change be over 24 hours?</strong><small>Example / Try the curve editor</small></Link>
  </>
}
