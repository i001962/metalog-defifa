import { describe, expect, it, vi } from 'vitest'
import type { Address, Hex, TransactionReceipt } from 'viem'
import {
  executeTransaction, readPendingTransaction, recoverTransaction, TRANSACTION_STORAGE_KEY,
  type PreparedTransaction, type TransactionRuntime, type WalletIdentity,
} from '../src/lib/transaction'

const account = '0x0000000000000000000000000000000000000011' as Address
const to = '0x0000000000000000000000000000000000000022' as Address
const hash = `0x${'ab'.repeat(32)}` as Hex
const blockHash = `0x${'cd'.repeat(32)}` as Hex
const request: PreparedTransaction = { chainId: 8453, account, to, data: '0x12345678', value: 7n, title: 'Enter market', details: [{ label: 'Positions', value: '7' }], verifyReceipt: () => {} }

function harness() {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  const wallet: WalletIdentity = { address: account, chainId: 8453, connectorUid: 'injected-1', isSigna: false }
  const receipt = { from: account, to, transactionHash: hash, blockHash, blockNumber: 11n, status: 'success' } as TransactionReceipt
  const client = {
    chain: { id: 8453 }, request: vi.fn(async () => '0x'), estimateGas: vi.fn(async () => 100n), getBlockNumber: vi.fn(async () => 10n),
    getBlock: vi.fn(async () => ({ hash: blockHash })),
    getTransaction: vi.fn(async () => ({ chainId: 8453, hash, from: account, to, input: request.data, value: request.value })),
    getTransactionReceipt: vi.fn(async () => receipt), waitForTransactionReceipt: vi.fn(async () => receipt),
  }
  const runtime: TransactionRuntime = { storage, client: client as unknown as TransactionRuntime['client'], identity: () => wallet,
    review: vi.fn(async () => true), switchChain: vi.fn(async chainId => { wallet.chainId = chainId }),
    send: vi.fn(async () => hash), onStatus: vi.fn() }
  return { runtime, storage, client, receipt, wallet, values }
}

describe('reviewed transaction boundary', () => {
  it('saves uncertainty before invoking the wallet and checks exact receipt effects', async () => {
    const h = harness()
    h.runtime.send = vi.fn(async sent => {
      expect(readPendingTransaction(h.storage)).toMatchObject({ account, to, data: request.data, value: '7', phase: 'unknown' })
      expect(sent).toMatchObject({ account, to, data: request.data, value: 7n, gas: 200n })
      return hash
    })
    const verifyReceipt = vi.fn()
    expect(await executeTransaction({ ...request, verifyReceipt }, h.runtime)).toEqual(h.receipt)
    expect(verifyReceipt).toHaveBeenCalledWith(h.receipt)
    expect(readPendingTransaction(h.storage)).toBeNull()
  })

  it('never sends a declined review or failed simulation', async () => {
    const cancelled = harness()
    cancelled.runtime.review = async () => false
    await expect(executeTransaction(request, cancelled.runtime)).rejects.toThrow()
    expect(cancelled.runtime.send).not.toHaveBeenCalled()
    expect(readPendingTransaction(cancelled.storage)).toBeNull()
    const failed = harness()
    failed.client.request.mockRejectedValue(new Error('entry closed'))
    await expect(executeTransaction(request, failed.runtime)).rejects.toThrow('entry closed')
    expect(failed.runtime.send).not.toHaveBeenCalled()
  })

  it.each(['address', 'chainId', 'connectorUid', 'isSigna'] as const)('rechecks %s after durable preparation and clears only the unsent record', async field => {
    const h = harness()
    h.client.getBlockNumber.mockImplementation(async () => {
      Object.assign(h.wallet, { [field]: field === 'address' ? to : field === 'chainId' ? 1 : field === 'connectorUid' ? 'injected-2' : true })
      return 10n
    })
    await expect(executeTransaction(request, h.runtime)).rejects.toThrow(/changed/)
    expect(h.runtime.send).not.toHaveBeenCalled()
    expect(readPendingTransaction(h.storage)).toBeNull()
  })

  it('keeps ambiguous submissions locked across reload and only observes recovery', async () => {
    const h = harness()
    h.runtime.send = vi.fn(async () => { throw new Error('wallet response timed out') })
    await expect(executeTransaction(request, h.runtime)).rejects.toThrow('timed out')
    expect(readPendingTransaction(h.storage)?.phase).toBe('unknown')
    await expect(executeTransaction(request, h.runtime)).rejects.toThrow('pending transaction')
    await expect(recoverTransaction(h.runtime, undefined, request)).rejects.toThrow('original transaction hash')
    expect(await recoverTransaction(h.runtime, hash, request)).toEqual(h.receipt)
    expect(h.runtime.send).toHaveBeenCalledTimes(1)
    expect(readPendingTransaction(h.storage)).toBeNull()
  })

  it('releases the record only for explicit wallet rejection', async () => {
    const h = harness()
    h.runtime.send = async () => { throw Object.assign(new Error('Rejected'), { code: 4001 }) }
    await expect(executeTransaction(request, h.runtime)).rejects.toThrow('Rejected')
    expect(readPendingTransaction(h.storage)).toBeNull()
  })

  it('preserves known hashes when confirmation is unavailable and never resends', async () => {
    const h = harness()
    h.client.waitForTransactionReceipt.mockRejectedValue(new Error('offline'))
    h.client.getTransactionReceipt.mockRejectedValue(new Error('offline'))
    await expect(executeTransaction(request, h.runtime)).rejects.toThrow('confirmation tracking')
    expect(readPendingTransaction(h.storage)).toMatchObject({ phase: 'pending', hash })
    h.client.waitForTransactionReceipt.mockResolvedValue(h.receipt)
    await recoverTransaction(h.runtime, undefined, request)
    expect(h.runtime.send).toHaveBeenCalledTimes(1)
  })

  it.each(['calldata', 'account', 'value', 'network', 'block', 'old receipt'])('refuses incorrect %s evidence while retaining its record', async kind => {
    const h = harness()
    if (kind === 'calldata') h.client.getTransaction.mockResolvedValue({ chainId: 8453, hash, from: account, to, input: '0x9999', value: 7n })
    if (kind === 'account') h.client.getTransaction.mockResolvedValue({ chainId: 8453, hash, from: to, to, input: request.data, value: 7n })
    if (kind === 'value') h.client.getTransaction.mockResolvedValue({ chainId: 8453, hash, from: account, to, input: request.data, value: 8n })
    if (kind === 'network') h.client.getTransaction.mockResolvedValue({ chainId: 1, hash, from: account, to, input: request.data, value: 7n })
    if (kind === 'block') h.client.getBlock.mockResolvedValue({ hash })
    if (kind === 'old receipt') h.client.waitForTransactionReceipt.mockResolvedValue({ ...h.receipt, blockNumber: 10n })
    await expect(executeTransaction(request, h.runtime)).rejects.toThrow(/receipt/)
    expect(readPendingTransaction(h.storage)?.hash).toBe(hash)
  })

  it('retains the exact call when its Defifa effect verifier cannot establish success', async () => {
    const h = harness()
    const verifyReceipt = vi.fn(() => { throw new Error('Expected mints are missing') })
    await expect(executeTransaction({ ...request, verifyReceipt }, h.runtime)).rejects.toThrow('mints')
    expect(readPendingTransaction(h.storage)?.hash).toBe(hash)
    await expect(recoverTransaction(h.runtime, hash, { ...request, value: 8n })).rejects.toThrow('differs')
    await expect(recoverTransaction(h.runtime, hash)).rejects.toThrow('effect verifier')
    const restored = { ...request, verifyReceipt: vi.fn(() => { throw new Error('Recovered mints are missing') }) }
    await expect(recoverTransaction(h.runtime, hash, restored)).rejects.toThrow('Recovered mints')
    expect(restored.verifyReceipt).toHaveBeenCalledWith(h.receipt)
    expect(readPendingTransaction(h.storage)?.hash).toBe(hash)
    const verified = { ...request, verifyReceipt: vi.fn() }
    await recoverTransaction(h.runtime, hash, verified)
    expect(verified.verifyReceipt).toHaveBeenCalledWith(h.receipt)
    expect(readPendingTransaction(h.storage)).toBeNull()
  })

  it('refuses to send an action without a deterministic effect check', async () => {
    const h = harness()
    await expect(executeTransaction({ ...request, verifyReceipt: undefined }, h.runtime)).rejects.toThrow('effect verifier')
    expect(h.runtime.send).not.toHaveBeenCalled()
  })

  it('fails before sending when durable storage is unavailable or corrupt', async () => {
    const h = harness()
    h.storage.setItem = () => { throw new Error('Storage full') }
    await expect(executeTransaction(request, h.runtime)).rejects.toThrow('Storage full')
    expect(h.runtime.send).not.toHaveBeenCalled()
    h.values.set(TRANSACTION_STORAGE_KEY, '{broken')
    await expect(executeTransaction(request, h.runtime)).rejects.toThrow('saved transaction cannot be read')
    expect(h.runtime.send).not.toHaveBeenCalled()
  })

  it('does not offer arbitrary transaction authority to a Signa connection', async () => {
    const h = harness()
    h.wallet.isSigna = true
    await expect(executeTransaction(request, h.runtime)).rejects.toThrow('external wallet')
    expect(h.runtime.review).not.toHaveBeenCalled()
    expect(h.runtime.send).not.toHaveBeenCalled()
  })
})
