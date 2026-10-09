import { isAddress, isHash, type Address, type Hex, type PublicClient, type TransactionReceipt } from 'viem'
import {
  gasWithHeadroom,
  simulateStateChangingTransaction,
  submitReviewedContractWrite,
  TransactionReviewCancelledError,
  waitForTrackedReceipt,
} from '@bananapus/nana-sdk-core/review'
import { chainForId } from './wallet'

/** A product adapter owns calldata, current-state checks and its receipt effects. */
export type PreparedTransaction = {
  chainId: number
  account: Address
  to: Address
  data: Hex
  value: bigint
  title: string
  details: readonly { label: string; value: string }[]
  reverify?: () => Promise<void>
  verifyReceipt?: (receipt: TransactionReceipt) => void | Promise<void>
}

export type TransactionStatus = 'idle' | 'review' | 'simulating' | 'signing' | 'pending' | 'unknown' | 'success' | 'error'

/** Only serializable evidence crosses a reload; callbacks are never authority. */
export type PendingTransaction = Omit<PreparedTransaction, 'value' | 'reverify' | 'verifyReceipt'> & {
  version: 1
  id: string
  value: string
  createdAt: number
  afterBlock: string
  phase: 'unknown' | 'pending'
  hash?: Hex
}

export const TRANSACTION_STORAGE_KEY = 'metalog:transaction:v1'
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>
type Reader = Pick<PublicClient, 'chain' | 'request' | 'estimateGas' | 'getBlockNumber' | 'getBlock' | 'getTransaction' | 'getTransactionReceipt' | 'waitForTransactionReceipt'>
export type WalletIdentity = { address?: Address; chainId?: number; connectorUid?: string; isSigna?: boolean }

const same = (a: string | undefined | null, b: string | undefined | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
const uint = (value: unknown) => typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(value) && BigInt(value) < 2n ** 256n

function validateCall(value: Omit<PendingTransaction, 'version' | 'id' | 'createdAt' | 'phase' | 'hash' | 'afterBlock'>) {
  if (!Number.isSafeInteger(value.chainId) || value.chainId <= 0 || !isAddress(value.account) || !isAddress(value.to) ||
    BigInt(value.to) === 0n || typeof value.data !== 'string' || !/^0x(?:[a-f0-9]{2})*$/i.test(value.data) ||
    value.data.length > 262_146 || !uint(value.value) || typeof value.title !== 'string' || !value.title || value.title.length > 240 ||
    !Array.isArray(value.details) || value.details.length > 150 || value.details.some(detail =>
      !detail || typeof detail.label !== 'string' || detail.label.length > 160 || typeof detail.value !== 'string' || detail.value.length > 2000)) {
    throw new Error('The prepared transaction is invalid.')
  }
  chainForId(value.chainId)
}

/** A malformed saved record blocks writes; treating it as empty could duplicate a payment. */
export function readPendingTransaction(storage: Storage): PendingTransaction | null {
  const raw = storage.getItem(TRANSACTION_STORAGE_KEY)
  if (raw === null) return null
  try {
    if (raw.length > 524_288) throw new Error()
    const value = JSON.parse(raw) as PendingTransaction
    validateCall(value)
    if (value.version !== 1 || !/^[a-f0-9-]{36}$/.test(value.id) || !Number.isSafeInteger(value.createdAt) || value.createdAt <= 0 ||
      !uint(value.afterBlock) || !['unknown', 'pending'].includes(value.phase) ||
      (value.hash !== undefined && !isHash(value.hash)) || (value.phase === 'pending' && !value.hash)) throw new Error()
    return value
  } catch {
    throw new Error('The saved transaction cannot be read. Preserve browser storage and check your wallet activity before sending again.')
  }
}

function writePending(storage: Storage, value: PendingTransaction, previousId: string | null) {
  const current = readPendingTransaction(storage)
  if ((current?.id ?? null) !== previousId) throw new Error('Another transaction is pending. Check it before sending again.')
  const raw = JSON.stringify(value)
  storage.setItem(TRANSACTION_STORAGE_KEY, raw)
  if (storage.getItem(TRANSACTION_STORAGE_KEY) !== raw) throw new Error('The transaction could not be saved. Nothing more will be sent.')
}

function clearPending(storage: Storage, id: string) {
  if (readPendingTransaction(storage)?.id !== id) throw new Error('The saved transaction changed. Check its original record.')
  storage.removeItem(TRANSACTION_STORAGE_KEY)
  if (storage.getItem(TRANSACTION_STORAGE_KEY) !== null) throw new Error('The confirmed transaction record could not be cleared.')
}

export function matchesPrepared(record: PendingTransaction, request: PreparedTransaction): boolean {
  return record.chainId === request.chainId && same(record.account, request.account) && same(record.to, request.to) &&
    same(record.data, request.data) && BigInt(record.value) === request.value
}

/** Runs synchronously immediately before the SDK invokes the wallet writer. */
export function assertWalletIdentity(current: WalletIdentity, expected: WalletIdentity) {
  if (!same(current.address, expected.address) || current.chainId !== expected.chainId ||
    !expected.connectorUid || current.connectorUid !== expected.connectorUid || current.isSigna) {
    throw new Error('The wallet connection changed. Review the transaction again.')
  }
}

/** A successful outer receipt alone is insufficient: prove the exact reviewed call on its chain. */
export async function verifyTransactionReceipt(client: Reader, record: PendingTransaction, receipt: TransactionReceipt) {
  if (client.chain?.id !== record.chainId || receipt.blockNumber <= BigInt(record.afterBlock)) {
    throw new Error('This receipt does not belong to the saved transaction period and network.')
  }
  const [transaction, block] = await Promise.all([
    client.getTransaction({ hash: receipt.transactionHash }),
    client.getBlock({ blockNumber: receipt.blockNumber }),
  ])
  if (!same(block.hash, receipt.blockHash) || !same(transaction.hash, receipt.transactionHash) ||
    transaction.chainId !== record.chainId || !same(transaction.from, record.account) || !same(transaction.to, record.to) ||
    !same(transaction.input, record.data) || transaction.value !== BigInt(record.value) ||
    !same(receipt.from, record.account) || !same(receipt.to, record.to) ||
    (receipt.status !== 'success' && receipt.status !== 'reverted')) {
    throw new Error('The receipt does not prove the exact reviewed transaction. Keep its record and check again.')
  }
}

export type TransactionRuntime = {
  storage: Storage
  client: Reader
  identity: () => WalletIdentity
  review: (request: PreparedTransaction, gas: bigint) => Promise<boolean>
  switchChain: (chainId: number) => Promise<unknown>
  send: (request: { chainId: number; account: Address; to: Address; data: Hex; value: bigint; gas: bigint }) => Promise<Hex>
  onStatus: (status: TransactionStatus, pending?: PendingTransaction | null) => void
}

export async function recoverTransaction(runtime: Pick<TransactionRuntime, 'storage' | 'client' | 'onStatus'>, hash?: Hex, prepared?: PreparedTransaction) {
  const record = readPendingTransaction(runtime.storage)
  if (!record) throw new Error('There is no pending transaction.')
  if (prepared && !matchesPrepared(record, prepared)) throw new Error('This action differs from the saved transaction.')
  if (!prepared?.verifyReceipt) throw new Error('The saved transaction needs its Defifa effect verifier before it can be confirmed.')
  if (hash && (!isHash(hash) || (record.hash && !same(hash, record.hash)))) throw new Error('Use the original transaction hash.')
  const originalHash = record.hash ?? hash
  if (!originalHash) throw new Error('Copy the original transaction hash from your wallet to check it. Do not submit the action again.')
  runtime.onStatus('pending', record)
  const receipt = await waitForTrackedReceipt(runtime.client, originalHash, { attempts: 1 })
  await verifyTransactionReceipt(runtime.client, record, receipt)
  if (receipt.status === 'reverted') {
    clearPending(runtime.storage, record.id)
    runtime.onStatus('error', null)
    throw new Error('The transaction reverted. No action was completed; you can review it again.')
  }
  // Once proved, retain the actual hash even when an effect check needs another read.
  const observed: PendingTransaction = { ...record, phase: 'pending', hash: receipt.transactionHash }
  writePending(runtime.storage, observed, record.id)
  runtime.onStatus('pending', observed)
  await prepared.verifyReceipt(receipt)
  clearPending(runtime.storage, record.id)
  runtime.onStatus('success', null)
  return receipt
}

/** The SDK owns the review/simulate/send boundary; this adapter owns only Metalog's saved evidence. */
export async function executeTransaction(input: PreparedTransaction, runtime: TransactionRuntime) {
  if (readPendingTransaction(runtime.storage)) throw new Error('Check the pending transaction before sending another.')
  const request = Object.freeze({ ...input, details: input.details.map(detail => Object.freeze({ ...detail })) })
  validateCall({ ...request, value: request.value.toString() })
  if (!request.verifyReceipt) throw new Error('The transaction effect verifier is unavailable. Nothing was sent.')
  const before = runtime.identity()
  if (before.isSigna) throw new Error('Defifa transactions need an external wallet. Signa currently provides sign-in only.')
  if (!same(before.address, request.account) || !before.connectorUid) throw new Error('Connect the account that prepared this transaction.')
  if (runtime.client.chain?.id !== request.chainId) throw new Error('The transaction reader is on another network.')
  const expected = { ...before, chainId: request.chainId }
  runtime.onStatus('simulating')
  const gas = gasWithHeadroom(await runtime.client.estimateGas({ account: request.account, to: request.to, data: request.data, value: request.value }))
  let record: PendingTransaction | undefined
  const hash = await submitReviewedContractWrite({
    request,
    expectedAccount: request.account,
    currentAccount: () => runtime.identity().address,
    review: async reviewed => {
      if (!await runtime.review(reviewed, gas)) throw new TransactionReviewCancelledError()
    },
    switchChain: runtime.switchChain,
    reverify: request.reverify,
    simulate: async reviewed => {
      await simulateStateChangingTransaction(runtime.client, { from: reviewed.account, to: reviewed.to, data: reviewed.data, value: reviewed.value, gas })
      return { chainId: reviewed.chainId, account: reviewed.account, to: reviewed.to, data: reviewed.data, value: reviewed.value, gas }
    },
    beforeWrite: async () => {
      const afterBlock = await runtime.client.getBlockNumber({ cacheTime: 0 })
      record = { version: 1, id: crypto.randomUUID(), chainId: request.chainId, account: request.account, to: request.to,
        data: request.data, value: request.value.toString(), title: request.title, details: request.details,
        createdAt: Date.now(), afterBlock: afterBlock.toString(), phase: 'unknown' }
      writePending(runtime.storage, record, null)
      runtime.onStatus('signing', record)
    },
    beforeSend: () => assertWalletIdentity(runtime.identity(), expected),
    onBeforeWriteAborted: () => { if (record) clearPending(runtime.storage, record.id) },
    onWriteRejected: () => { if (record) clearPending(runtime.storage, record.id) },
    write: runtime.send,
    onPhase: status => runtime.onStatus(status),
  })
  if (!isHash(hash) || !record) throw new Error('The wallet did not return a transaction hash. Check its activity before sending again.')
  const submitted: PendingTransaction = { ...record, phase: 'pending', hash }
  runtime.onStatus('pending', submitted)
  try { writePending(runtime.storage, submitted, record.id) }
  catch { throw new Error(`Transaction ${hash} was submitted, but its hash could not be saved. Keep this hash and check the original transaction.`) }
  return recoverTransaction(runtime, undefined, request)
}
