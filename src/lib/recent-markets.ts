import { projectNumber } from './defifa'
import { chainForId } from './wallet'

export const RECENT_MARKETS_KEY = 'metalog:recent-markets:v1'
const MAX_RECENT_MARKETS = 20
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>
export type RecentMarket = { chainId: number; projectId: string }

function reference(value: unknown): RecentMarket | null {
  if (!value || typeof value !== 'object') return null
  const { chainId, projectId } = value as Partial<RecentMarket>
  if (typeof chainId !== 'number' || typeof projectId !== 'string') return null
  try {
    chainForId(chainId)
    projectNumber(projectId)
    return { chainId, projectId }
  } catch { return null }
}

/** Navigation history only; prompts and lifecycle state must come from verified chain reads. */
export function readRecentMarkets(storage?: Storage): RecentMarket[] {
  try {
    const text = (storage ?? window.localStorage).getItem(RECENT_MARKETS_KEY)
    if (!text || text.length > 8192) return []
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    const recent: RecentMarket[] = []
    for (const value of parsed.slice(0, MAX_RECENT_MARKETS)) {
      const market = reference(value)
      if (market && !recent.some(item => item.chainId === market.chainId && item.projectId === market.projectId)) recent.push(market)
    }
    return recent
  } catch { return [] }
}

export function rememberMarket(chainId: number, projectId: string, storage?: Storage): void {
  const market = reference({ chainId, projectId })
  if (!market) return
  try {
    const target = storage ?? window.localStorage
    const recent = readRecentMarkets(target)
    if (recent[0]?.chainId === chainId && recent[0]?.projectId === projectId) return
    const next = [market, ...recent.filter(item => item.chainId !== chainId || item.projectId !== projectId)]
    target.setItem(RECENT_MARKETS_KEY, JSON.stringify(next.slice(0, MAX_RECENT_MARKETS)))
  } catch { /* Unavailable browser history must not interrupt a confirmed creation or navigation. */ }
}
