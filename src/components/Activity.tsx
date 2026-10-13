'use client'

import { useEffect } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import type { MarketSnapshot } from '@/lib/defifa'
import type { ActivityPage } from '@/lib/activity'
import { chainForId } from '@/lib/wallet'
import { RangeStrip } from './RangeStrip'

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`
const ago = (seconds: number) => {
  const elapsed = Math.max(0, Date.now() / 1000 - seconds)
  return elapsed < 3_600 ? `${Math.max(1, Math.round(elapsed / 60))}m ago` : elapsed < 86_400 ? `${Math.round(elapsed / 3_600)}h ago` : `${Math.round(elapsed / 86_400)}d ago`
}

/** Entries and exits, newest first, read only once the panel is open. */
export function Activity({ market, active }: { market: MarketSnapshot; active: boolean }) {
  const explorer = chainForId(market.chainId).blockExplorers.default.url
  const query = useInfiniteQuery({
    queryKey: ['market-activity', market.chainId, market.projectId, market.blockNumber], enabled: active,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({ blockNumber: market.blockNumber, ...(pageParam ? { cursor: pageParam } : {}) })
      const response = await fetch(`/api/markets/${market.chainId}/${market.projectId}/activity?${params}`, { signal })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Activity could not be read.')
      return data as ActivityPage
    },
    getNextPageParam: last => last.nextCursor ?? undefined, staleTime: Infinity, refetchOnWindowFocus: false,
  })
  const events = query.data?.pages.flatMap(page => page.events) ?? []
  const pages = query.data?.pages.length ?? 0
  const { hasNextPage, isFetching, fetchNextPage } = query
  // Quiet stretches return empty pages; keep reading back a little before asking.
  useEffect(() => {
    if (active && pages && pages < 8 && !events.length && hasNextPage && !isFetching) void fetchNextPage()
  }, [active, pages, events.length, hasNextPage, isFetching, fetchNextPage])
  return <section aria-labelledby="activity-heading" className="activity">
    <h3 id="activity-heading">Activity</h3>
    {query.error && <p className="error" role="alert">{query.error.message} <button type="button" onClick={() => void query.refetch()}>Retry</button></p>}
    {query.isPending && active && <p className="hint" role="status">Reading activity…</p>}
    <ol className="activity-feed">
      {events.map(event => {
        const count = event.quantities.reduce((sum, quantity) => sum + quantity, 0)
        return <li key={`${event.transactionHash}:${event.kind}`} data-kind={event.kind}>
          <RangeStrip values={event.quantities} />
          <span><a href={`${explorer}/address/${event.account}`} target="_blank" rel="noreferrer">{short(event.account)}</a>
            {event.kind === 'entry' ? ' entered with ' : ' exited with '}<strong>{count}</strong> NFT{count === 1 ? '' : 's'}</span>
          <a className="activity-time" href={`${explorer}/tx/${event.transactionHash}`} target="_blank" rel="noreferrer">{ago(event.timestamp)}</a>
        </li>
      })}
    </ol>
    {query.data && !events.length && !query.hasNextPage && <p className="hint">No entries or exits yet.</p>}
    {query.hasNextPage && <button type="button" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
      {query.isFetchingNextPage ? 'Reading…' : events.length ? 'Older activity' : 'Check earlier blocks'}</button>}
  </section>
}
