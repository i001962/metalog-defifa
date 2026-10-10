import { afterEach, describe, expect, it, vi } from 'vitest'
import { chainForId, hasSavedSignaConnection, rpcTransport, SIGNA_ISSUER, SUPPORTED_CHAINS, walletReturnPath } from '../src/lib/wallet'
import { clearCallbackLocation } from '../src/providers/wallet-callback'
import { centerAppOrigin, centerBaseUrl, centerFetch } from '../src/lib/center'

describe('wallet boundaries', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it('routes every supported network through Center with this deployment Origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_JBCENTER_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    vi.stubEnv('METALOG_RPC_URLS', '')
    const send = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      return Response.json({ jsonrpc: '2.0', id: body.id, result: '0x1' })
    })
    vi.stubGlobal('fetch', send)
    for (const chain of SUPPORTED_CHAINS) {
      const transport = rpcTransport(chain.id)({ chain })
      expect(transport.config.type).toBe('custom')
      expect(await transport.request({ method: 'eth_chainId' })).toBe('0x1')
      const [url, init] = send.mock.calls.at(-1)!
      expect(String(url)).toBe(`https://juicebox.center/v1/rpc/${chain.id}`)
      expect(new Headers(init?.headers).get('Origin')).toBe('https://metalog.money')
    }
    expect(send).toHaveBeenCalledTimes(8)
  })

  it('uses the configured Center and app origin without altering browser Origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_JBCENTER_URL', 'https://dev.juicebox.center')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://metalog.money/create')
    expect(centerBaseUrl()).toBe('https://dev.juicebox.center')
    expect(centerAppOrigin()).toBe('https://metalog.money')
    const browserFetch = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal('window', { fetch: browserFetch })
    const init = { headers: { Accept: 'application/json' } }
    await centerFetch('https://dev.juicebox.center/v1/ipfs/test', init)
    expect(browserFetch).toHaveBeenCalledExactlyOnceWith('https://dev.juicebox.center/v1/ipfs/test', init)
  })

  it('fails closed when Center refuses RPC instead of trying another provider', async () => {
    vi.stubEnv('NEXT_PUBLIC_JBCENTER_URL', '')
    vi.stubEnv('METALOG_RPC_URLS', '')
    const send = vi.fn(async (_input: RequestInfo | URL) => Response.json({ error: 'Origin is not allowed.' }, { status: 403 }))
    vi.stubGlobal('fetch', send)
    const transport = rpcTransport(8453)({ chain: chainForId(8453) })
    await expect(transport.request({ method: 'eth_chainId' })).rejects.toThrow()
    expect(send).toHaveBeenCalled()
    for (const call of send.mock.calls) {
      expect(String(call[0])).toBe('https://juicebox.center/v1/rpc/8453')
    }
  })

  it('identifies local development server requests with their own configured origin', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    expect(centerAppOrigin()).toBe('http://127.0.0.1:3020')
  })

  it('uses a configured server RPC exclusively and rejects invalid configuration', () => {
    vi.stubEnv('METALOG_RPC_URLS', '{"84532":"http://127.0.0.1:8545"}')
    const transport = rpcTransport(84532)({ chain: chainForId(84532) })
    expect(transport.config.type).toBe('http')
    expect(transport.value?.url).toBe('http://127.0.0.1:8545/')
    for (const configuration of ['{', '[]', '{"84532":false}', '{"84532":"file:///tmp/rpc"}',
      '{"84532":"https://publicnode.com"}', '{"84532":"http://evil.test"}',
      '{"84532":"http://localhost.evil.test"}', '{"84532":"http://user:password@localhost:8545"}']) {
      vi.stubEnv('METALOG_RPC_URLS', configuration)
      expect(() => rpcTransport(84532)).toThrow()
    }
  })
  it('shares eight explicit supported chains and refuses unknown readers', () => {
    expect(new Set(SUPPORTED_CHAINS.map(chain => chain.id)).size).toBe(8)
    expect(chainForId(8453).name).toBe('Base')
    expect(() => chainForId(123)).toThrow('not supported')
  })

  it('keeps callback credentials out of the address bar before SDK loading', () => {
    const replace = vi.fn()
    const callback = 'https://metalog.test/center/callback?code=one-time&state=bound'
    expect(clearCallbackLocation({ href: callback, replace })).toBe(callback)
    expect(replace).toHaveBeenCalledExactlyOnceWith('/center/callback')
    expect(clearCallbackLocation({ href: 'https://metalog.test/markets/1', replace })).toBeNull()
  })

  it('restores only the saved Signa connection for this exact callback origin', () => {
    const key = `center.wallet.connection.v1:${SIGNA_ISSUER}:https://metalog.test/center/callback`
    const storage = { getItem: (input: string) => input === key ? 'saved' : null }
    expect(hasSavedSignaConnection(storage, 'https://metalog.test')).toBe(true)
    expect(hasSavedSignaConnection(storage, 'https://other.test')).toBe(false)
  })

  it('limits the sign-in return destination to local product routes', () => {
    expect(walletReturnPath('/markets/8453:123')).toBe('/markets/8453:123')
    for (const input of ['//evil.test', 'https://evil.test', '/center/callback', '/markets/../center/callback', '/x?code=private', '/%2f%2fevil.test', '/x\\evil']) {
      expect(() => walletReturnPath(input)).toThrow()
    }
  })
})
