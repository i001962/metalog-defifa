'use client'

import { useQuery } from '@tanstack/react-query'
import type { CrowdEvidence } from './entries'
import type { MarketSnapshot } from './defifa'

export type CrowdCurve = Pick<CrowdEvidence, 'components' | 'covered' | 'minted' | 'complete'>

/** The crowd's verified entry curves, weighted by the positions each one minted. */
export function useCrowdCurve(market: MarketSnapshot | undefined) {
  return useQuery({
    queryKey: ['market-crowd', market?.chainId, market?.projectId],
    enabled: !!market && market.blockTimestamp >= market.definition.entryOpensAt,
    staleTime: 60_000, retry: 1,
    queryFn: async ({ signal }): Promise<CrowdCurve> => {
      const response = await fetch(`/api/markets/${market!.chainId}/${market!.projectId}/crowd`, { signal })
      const data = await response.json() as CrowdEvidence & { error?: string }
      if (!response.ok) throw new Error(data.error || 'The crowd curve could not be read.')
      return data
    },
  })
}
