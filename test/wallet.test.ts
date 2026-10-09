import { describe, expect, it, vi } from 'vitest'
import { chainForId, hasSavedSignaConnection, SIGNA_ISSUER, SUPPORTED_CHAINS, walletReturnPath } from '../src/lib/wallet'
import { clearCallbackLocation } from '../src/providers/wallet-callback'

describe('wallet boundaries', () => {
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
