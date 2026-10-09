'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { SUPPORTED_CHAINS } from '@/lib/wallet'
import type { MarketSnapshot } from '@/lib/defifa'

export function Markets() {
  const [chainId, setChainId] = useState(8453)
  const [projectId, setProjectId] = useState('')
  const router = useRouter()
  const query = useQuery({ queryKey: ['markets', chainId], queryFn: async ({ signal }) => {
    const response = await fetch(`/api/markets?chainId=${chainId}`, { signal })
    if (!response.ok) throw new Error('Markets could not be loaded.')
    return response.json() as Promise<{ markets: MarketSnapshot[]; errors: string[] }>
  }, staleTime: 30_000 })
  return <>
    <div className="row"><h1>Markets</h1><Link className="button primary" href="/create">Create market</Link></div>
    <div className="grid">
      <label className="field"><span>Network</span><select value={chainId} onChange={event => setChainId(Number(event.target.value))}>{SUPPORTED_CHAINS.map(chain => <option key={chain.id} value={chain.id}>{chain.name}</option>)}</select></label>
      <form className="field" onSubmit={event => { event.preventDefault(); if (/^[1-9]\d{0,76}$/.test(projectId)) router.push(`/markets/${chainId}/${projectId}`) }}>
        <label htmlFor="project-id"><span>Open a game</span></label><div className="inline"><input id="project-id" inputMode="numeric" placeholder="Project ID" value={projectId} onChange={event => setProjectId(event.target.value)} pattern="[1-9][0-9]{0,76}" required /><button type="submit">Open</button></div>
      </form>
    </div>
    {query.isPending && <p className="hint" role="status">Loading markets…</p>}
    {query.error && <p className="error" role="alert">{query.error.message} <button onClick={() => query.refetch()}>Retry</button></p>}
    {query.data?.errors.map((error, index) => <p className="error" key={index}>{error}</p>)}
    {query.data?.markets.map(market => <Link className="market-row" key={market.projectId} href={`/markets/${market.chainId}/${market.projectId}`}><strong>{market.definition.prompt}</strong><small>{market.stage} / Game {market.projectId}</small></Link>)}
    {query.data && query.data.markets.length === 0 && query.data.errors.length === 0 && <p className="muted">No markets listed on this network yet.</p>}
    <Link className="market-row" href="/markets/example"><strong>What will Bitcoin’s price change be over 24 hours?</strong><small>Example / Try the curve editor</small></Link>
  </>
}
