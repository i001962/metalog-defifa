'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { getAccount, getWalletClient, switchChain } from '@wagmi/core'
import { useAccount } from 'wagmi'
import { type Hex, type TransactionReceipt, type WalletClient } from 'viem'
import { TransactionReviewCancelledError, transactionMessage } from '@bananapus/nana-sdk-core/review'
import {
  executeTransaction, matchesPrepared, readPendingTransaction, recoverTransaction, TRANSACTION_STORAGE_KEY,
  type PendingTransaction, type PreparedTransaction, type TransactionRuntime, type TransactionStatus,
} from '@/lib/transaction'
import { chainForId, publicClientForChain } from '@/lib/wallet'
import { TransactionReview } from '@/components/TransactionReview'
import { wagmiConfig } from './Providers'

type TransactionContextValue = {
  execute: (prepared: PreparedTransaction) => Promise<TransactionReceipt | null>
  recover: (hash?: Hex, prepared?: PreparedTransaction) => Promise<TransactionReceipt | null>
  pending: PendingTransaction | null
  status: TransactionStatus
  error: string | null
  busy: boolean
}
const TransactionContext = createContext<TransactionContextValue | null>(null)

export function useTransactions() {
  const value = useContext(TransactionContext)
  if (!value) throw new Error('Transactions must be inside Providers.')
  return value
}

const identity = () => {
  const current = getAccount(wagmiConfig)
  return { address: current.address, chainId: current.chainId, connectorUid: current.connector?.uid, isSigna: current.connector?.id === 'juicebox-center' }
}

/** Native cross-tab locks and the durable record prevent a second send during uncertainty. */
async function withTransactionLock<T>(action: () => Promise<T>): Promise<T> {
  if (!navigator.locks) throw new Error('This browser cannot preserve transaction coordination. Use a current browser to transact.')
  return navigator.locks.request('metalog:transaction', { ifAvailable: true }, lock => {
    if (!lock) throw new Error('Another Metalog tab is handling a transaction. Continue there.')
    return action()
  })
}

export function Transactions({ children }: PropsWithChildren) {
  const [pending, setPending] = useState<PendingTransaction | null>(null)
  const [status, setStatus] = useState<TransactionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState<{ request: PreparedTransaction; gas: bigint } | null>(null)
  const [recoveryHash, setRecoveryHash] = useState('')
  const deciding = useRef<((approved: boolean) => void) | null>(null)
  const locked = useRef(false)
  const preparedRef = useRef<PreparedTransaction | undefined>(undefined)
  const [lastSent, setLastSent] = useState<{ hash: Hex; chainId: number } | null>(null)
  const reviewIdentity = useRef<ReturnType<typeof identity> | null>(null)
  const { address, chainId, connector } = useAccount()

  const decide = useCallback((approved: boolean) => {
    const resolve = deciding.current
    const expected = reviewIdentity.current
    const current = identity()
    deciding.current = null
    reviewIdentity.current = null
    setReview(null)
    resolve?.(approved && !!expected && current.address === expected.address && current.chainId === expected.chainId && current.connectorUid === expected.connectorUid)
  }, [])

  useEffect(() => {
    const expected = reviewIdentity.current
    if (expected && (address !== expected.address || chainId !== expected.chainId || connector?.uid !== expected.connectorUid)) decide(false)
  }, [address, chainId, connector?.uid, decide])
  useEffect(() => () => { deciding.current?.(false); deciding.current = null }, [])
  useEffect(() => {
    const restore = () => {
      try {
        const saved = readPendingTransaction(window.localStorage)
        setPending(saved)
        if (!locked.current) setStatus(saved?.phase ?? 'idle')
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'The saved transaction is unavailable.'); setStatus('error') }
    }
    restore()
    const changed = (event: StorageEvent) => { if (event.key === TRANSACTION_STORAGE_KEY || event.key === null) restore() }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [])

  const onStatus = useCallback((next: TransactionStatus, saved?: PendingTransaction | null) => {
    setStatus(next)
    if (saved !== undefined) setPending(saved)
    if (saved?.hash) setLastSent({ hash: saved.hash, chainId: saved.chainId })
  }, [])

  async function run(action: () => Promise<TransactionReceipt>): Promise<TransactionReceipt | null> {
    if (locked.current) return null
    locked.current = true
    setBusy(true)
    setError(null)
    try { return await withTransactionLock(action) }
    catch (cause) {
      if (cause instanceof TransactionReviewCancelledError) setStatus('idle')
      else setError(transactionMessage(cause instanceof Error ? cause.message : 'The transaction could not be checked.'))
      try {
        const saved = readPendingTransaction(window.localStorage)
        setPending(saved)
        if (!(cause instanceof TransactionReviewCancelledError)) setStatus(saved?.phase ?? 'error')
      } catch { setStatus('error') }
      return null
    } finally { locked.current = false; setBusy(false) }
  }

  async function execute(prepared: PreparedTransaction) {
    return run(async () => {
      preparedRef.current = prepared
      setLastSent(null)
      let wallet: WalletClient | undefined
      const runtime: TransactionRuntime = {
        storage: window.localStorage,
        client: publicClientForChain(prepared.chainId),
        identity,
        review: (request, gas) => new Promise(resolve => {
          reviewIdentity.current = identity()
          deciding.current = resolve
          setReview({ request, gas })
        }),
        switchChain: async target => {
          if (getAccount(wagmiConfig).chainId !== target) await switchChain(wagmiConfig, { chainId: chainForId(target).id })
          wallet = await getWalletClient(wagmiConfig, { chainId: chainForId(target).id })
        },
        send: request => {
          if (!wallet) throw new Error('Reconnect your wallet before sending.')
          return wallet.sendTransaction({ account: request.account, chain: chainForId(request.chainId), to: request.to, data: request.data, value: request.value, gas: request.gas })
        },
        onStatus,
      }
      return executeTransaction(prepared, runtime)
    })
  }

  async function recover(hash?: Hex, prepared?: PreparedTransaction) {
    return run(async () => {
      const saved = readPendingTransaction(window.localStorage)
      if (!saved) throw new Error('There is no pending transaction.')
      if (prepared && !matchesPrepared(saved, prepared)) throw new Error('This action differs from the saved transaction.')
      let verifier = prepared ?? (preparedRef.current && matchesPrepared(saved, preparedRef.current) ? preparedRef.current : undefined)
      if (!verifier?.verifyReceipt) {
        const { verifyDefifaTransactionReceipt } = await import('@/lib/defifa')
        const request = { chainId: saved.chainId, account: saved.account, to: saved.to, data: saved.data,
          value: BigInt(saved.value), title: saved.title, details: saved.details }
        verifier = { ...request, verifyReceipt: receipt => verifyDefifaTransactionReceipt(request, receipt) }
      }
      return recoverTransaction({ storage: window.localStorage, client: publicClientForChain(saved.chainId), onStatus }, hash, verifier)
    })
  }

  const messages: Partial<Record<TransactionStatus, string>> = {
    simulating: 'Checking transaction…', signing: 'Confirm in your wallet…', pending: busy ? 'Checking confirmation…' : 'Submitted. Check confirmation.',
    unknown: 'Submission is unconfirmed. Check the original transaction before sending again.', success: 'Transaction confirmed.',
  }
  const shownHash = pending?.hash ?? lastSent?.hash
  const shownChain = pending?.chainId ?? lastSent?.chainId
  const explorer = shownChain ? chainForId(shownChain).blockExplorers.default.url : undefined
  return <TransactionContext.Provider value={{ execute, recover, pending, status, error, busy }}>
    {children}
    {review && <TransactionReview request={review.request} gas={review.gas} decide={decide} />}
    {(pending || error || messages[status]) && <aside className="transaction-status" aria-label="Transaction status">
      {messages[status] && <p role="status">{messages[status]}</p>}
      {error && <p role="alert">{error}</p>}
      {shownHash && explorer && <p><a href={`${explorer}/tx/${shownHash}`} target="_blank" rel="noreferrer">View transaction</a></p>}
      {pending && !busy && <>
        {!shownHash && <label>Original transaction hash<input value={recoveryHash} onChange={event => setRecoveryHash(event.target.value)} autoComplete="off" spellCheck={false} /></label>}
        <button type="button" onClick={() => void recover(shownHash ?? (recoveryHash as Hex))}>Check transaction</button>
      </>}
    </aside>}
  </TransactionContext.Provider>
}
