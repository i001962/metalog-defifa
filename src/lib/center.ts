import { JBCENTER_DEFAULT_URL } from '@bananapus/nana-sdk-core/jbcenter'

/** One Center configuration for RPC, IPFS publication and gateway reads. */
export function centerBaseUrl(): string {
  return process.env.NEXT_PUBLIC_JBCENTER_URL || JBCENTER_DEFAULT_URL
}

export function centerAppOrigin(): string {
  return new URL(process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:3020' : 'https://metalog.money')).origin
}

/** Browsers supply their real Origin; server requests identify this deployment. */
export function centerFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof window !== 'undefined') return window.fetch(input, init)
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  headers.set('Origin', centerAppOrigin())
  return fetch(input, { ...init, headers })
}
