import { arbitrum, arbitrumSepolia, base, baseSepolia, mainnet, optimism, optimismSepolia, sepolia } from '@bananapus/nana-sdk-core/chains'
import { createJBCenterRpcProvider, createPacedJBCenterLimiter } from '@bananapus/nana-sdk-core/jbcenter'
import { createPublicClient, custom, http, type PublicClient, type Transport } from 'viem'

export const SUPPORTED_CHAINS = [base, baseSepolia, mainnet, optimism, arbitrum, sepolia, optimismSepolia, arbitrumSepolia] as const
export const SIGNA_ISSUER = 'https://signa.center'
export const SIGNA_AUDIENCE = 'https://api.signa.center'
const limiter = createPacedJBCenterLimiter()
const clients = new Map<number, PublicClient>()

export function chainForId(chainId: number) {
  const chain = SUPPORTED_CHAINS.find(item => item.id === chainId)
  if (!chain) throw new Error('This network is not supported.')
  return chain
}

/** One transport policy for the wallet, market evidence and receipt recovery. */
export function rpcTransport(chainId: number): Transport {
  const chain = chainForId(chainId)
  const baseUrl = process.env.NEXT_PUBLIC_JBCENTER_URL
  if (!baseUrl) return http(chain.rpcUrls.default.http[0], { retryCount: 1, timeout: 15_000 })
  return custom(createJBCenterRpcProvider(chainId, {
    baseUrl,
    timeoutMs: 15_000,
    limiter: typeof window === 'undefined' ? undefined : limiter,
    fetch: (input, init) => {
      if (typeof window !== 'undefined') return window.fetch(input, init)
      const headers = new Headers(init?.headers)
      headers.set('Origin', process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3020')
      return fetch(input, { ...init, headers })
    },
  }), { retryCount: 1 })
}

export function publicClientForChain(chainId: number): PublicClient {
  let client = clients.get(chainId)
  if (!client) {
    client = createPublicClient({ chain: chainForId(chainId), transport: rpcTransport(chainId), batch: { multicall: true } }) as PublicClient
    clients.set(chainId, client)
  }
  return client
}

export function walletReturnPath(value: string): string {
  if (value.length > 1024 || !/^\/(?:[a-zA-Z0-9_.:@-]+(?:\/[a-zA-Z0-9_.:@-]+)*\/?)?$/.test(value) ||
    value.startsWith('/center/') || value.split('/').some(segment => segment === '.' || segment === '..')) {
    throw new Error('The original page is unavailable.')
  }
  return value
}

/** Avoid loading the Signa runtime during reconnect unless this tab holds its connection. */
export function hasSavedSignaConnection(storage: Pick<Storage, 'getItem'>, origin: string): boolean {
  return !!storage.getItem(`center.wallet.connection.v1:${SIGNA_ISSUER}:${origin}/center/callback`)
}
