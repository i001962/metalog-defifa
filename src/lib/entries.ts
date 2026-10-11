import { decodeFunctionData, getAbiItem, parseEventLogs, zeroAddress, type Address, type Hex, type PublicClient, type TransactionReceipt } from 'viem'
import type { Coefficients } from '../domain/distribution'
import { decodeEntryMemo, NATIVE_TOKEN, projectNumber, verifyRecordedEntry, type MarketSnapshot } from './defifa'
import { assertChain, DEFIFA_ABI, deploymentForChain, sameAddress, TOKEN_MULTIPLIER } from './defifa-deployment'
import { firstBlockAtTimestamp, MAX_LOG_BLOCKS } from './history-blocks'

export type EntryHistoryEntry = {
  status: 'verified-curve' | 'verified-manual' | 'unrecognized' | 'unsupported' | 'invalid'
  transactionHash: Hex
  blockNumber: string
  timestamp: number
  account: Address
  beneficiary: Address | null
  stakeWei: string | null
  tokenIds: string[]
  quantities: number[]
  coefficients: Coefficients | null
  reason?: string
}
export type EntryHistoryPage = {
  schema: 'metalog.entries.v1'
  chainId: number
  projectId: string
  blockNumber: string
  entries: EntryHistoryEntry[]
  scannedFromBlock: string | null
  scannedToBlock: string | null
  complete: boolean
  nextCursor: string | null
}
const MAX_ENTRIES = 8
const MAX_LOGS = 2_000
const FIRST_TRANSACTION = 2_147_483_647

type Mint = { from: Address; to: Address; tokenId: bigint }
function receiptMints(market: MarketSnapshot, receipt: TransactionReceipt) {
  return parseEventLogs({ abi: DEFIFA_ABI.DefifaHook, logs: receipt.logs, eventName: 'Transfer', strict: true })
    .filter(log => sameAddress(log.address, market.hook) && sameAddress((log.args as Mint).from, zeroAddress))
    .map(log => log.args as Mint)
}

/** Public history proves original mint effects, never later ownership or a sale price. */
export async function readEntryHistory(client: PublicClient, market: MarketSnapshot, cursor?: string): Promise<EntryHistoryPage> {
  await assertChain(client, market.chainId)
  const d = deploymentForChain(market.chainId)
  const head = BigInt(market.blockNumber)
  const page: EntryHistoryPage = { schema: 'metalog.entries.v1', chainId: market.chainId, projectId: market.projectId,
    blockNumber: market.blockNumber, entries: [], scannedFromBlock: null, scannedToBlock: null, complete: true, nextCursor: null }
  if (market.blockTimestamp < market.definition.entryOpensAt) return page
  const first = await firstBlockAtTimestamp(client, market, market.definition.entryOpensAt)
  const last = market.blockTimestamp < market.definition.entryClosesAt ? head
    : (await firstBlockAtTimestamp(client, market, market.definition.entryClosesAt)) - 1n
  let end = last
  let before = FIRST_TRANSACTION
  if (cursor !== undefined) {
    if (!/^\d{1,78}:\d{1,10}$/.test(cursor)) throw new Error('The entry cursor is invalid.')
    const [block, index] = cursor.split(':')
    end = BigInt(block); before = Number(index)
    if (end < first || end > last || !Number.isSafeInteger(before) || before > FIRST_TRANSACTION) {
      throw new Error('The entry cursor is outside this snapshot.')
    }
  }
  if (end < first) return page
  const event = getAbiItem({ abi: DEFIFA_ABI.DefifaHook, name: 'Transfer' })
  if (!event || event.type !== 'event') throw new Error('The mint event ABI is unavailable.')
  let span = MAX_LOG_BLOCKS
  for (let request = 0; request < 4 && end >= first; request++) {
    const start = end - first + 1n > span ? end - span + 1n : first
    const rawLogs = await client.getLogs({ address: market.hook, event, args: { from: zeroAddress }, fromBlock: start, toBlock: end, strict: true })
    const logs = parseEventLogs({ abi: DEFIFA_ABI.DefifaHook, logs: rawLogs, eventName: 'Transfer', strict: true })
    if (logs.length !== rawLogs.length || logs.some(log => !sameAddress((log.args as Mint).from, zeroAddress))) {
      throw new Error('The history response contains invalid mint logs.')
    }
    if (logs.length > MAX_LOGS) {
      if (span === 1n) throw new Error('A block exceeds the entry history read limit.')
      span = span / 2n || 1n
      continue
    }
    page.scannedToBlock ??= end.toString()
    page.scannedFromBlock = start.toString()
    for (const log of logs) {
      if (log.removed || log.blockNumber === null || log.transactionIndex === null || !log.transactionHash
        || !log.blockHash || !sameAddress(log.address, market.hook) || log.blockNumber < start || log.blockNumber > end) {
        throw new Error('The entry logs do not match the requested history.')
      }
    }
    const candidates = [...new Map(logs.filter(log => log.blockNumber! < end || log.transactionIndex! < before)
      .map(log => [log.transactionHash!, log])).values()]
      .sort((a, b) => a.blockNumber === b.blockNumber ? b.transactionIndex! - a.transactionIndex! : a.blockNumber! > b.blockNumber! ? -1 : 1)
    for (const log of candidates.slice(0, MAX_ENTRIES)) {
      const [receipt, transaction, block] = await Promise.all([
        client.getTransactionReceipt({ hash: log.transactionHash! }), client.getTransaction({ hash: log.transactionHash! }),
        client.getBlock({ blockNumber: log.blockNumber! }),
      ])
      if (receipt.status !== 'success' || receipt.blockNumber !== log.blockNumber || receipt.blockHash !== log.blockHash
        || block.number !== log.blockNumber || block.hash !== log.blockHash || transaction.hash !== log.transactionHash || receipt.transactionHash !== log.transactionHash
        || transaction.blockHash !== block.hash || transaction.blockNumber !== block.number || transaction.transactionIndex !== log.transactionIndex
        || receipt.transactionIndex !== log.transactionIndex || !sameAddress(receipt.from, transaction.from)
        || receipt.to?.toLowerCase() !== transaction.to?.toLowerCase()) {
        throw new Error('The entry receipt is not canonical for this snapshot.')
      }
      const timestamp = Number(block.timestamp)
      if (timestamp < market.definition.entryOpensAt || timestamp >= market.definition.entryClosesAt) {
        throw new Error('The entry receipt falls outside the entry period.')
      }
      const mints = receiptMints(market, receipt)
      const tokenIds = mints.map(mint => mint.tokenId.toString())
      if (!mints.length || mints.length > MAX_LOGS || new Set(tokenIds).size !== tokenIds.length
        || !mints.some(mint => mint.tokenId === (log.args as Mint).tokenId)) {
        throw new Error('The entry receipt does not prove its discovered mint.')
      }
      const quantities = market.ranges.map(range => mints.filter(mint => mint.tokenId / TOKEN_MULTIPLIER === BigInt(range.tierId)).length)
      const entry: EntryHistoryEntry = { status: 'unsupported', transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber.toString(), timestamp, account: transaction.from,
        beneficiary: mints.every(mint => sameAddress(mint.to, mints[0].to)) ? mints[0].to : null, stakeWei: null, tokenIds, quantities, coefficients: null }
      page.entries.push(entry)
      if (!sameAddress(transaction.to, d.terminal)) {
        entry.reason = 'Wrapped calls are not decoded. Mint effects are shown; outer transaction value is not an attributed entry stake.'
        continue
      }
      let call: { functionName: string; args?: readonly unknown[] }
      try { call = decodeFunctionData({ abi: DEFIFA_ABI.JBMultiTerminal, data: transaction.input }) }
      catch { entry.reason = 'The terminal call is not a supported direct payment.'; continue }
      if (call.functionName !== 'pay') { entry.reason = 'The terminal call is not a direct payment.'; continue }
      const [id, token, amount, beneficiary, minimum, memoText, metadata] = call.args as readonly [bigint, Address, bigint, Address, bigint, string, Hex]
      if (id !== projectNumber(market.projectId) || !sameAddress(token, NATIVE_TOKEN) || amount !== transaction.value
        || minimum !== 0n || quantities.reduce((sum, quantity) => sum + quantity, 0) !== mints.length
        || mints.some(mint => !sameAddress(mint.to, beneficiary) || mint.tokenId % TOKEN_MULTIPLIER === 0n)) {
        entry.status = 'invalid'; entry.reason = 'The payment and minted positions do not match this market.'; continue
      }
      entry.beneficiary = beneficiary
      entry.stakeWei = amount.toString()
      if (!sameAddress(beneficiary, transaction.from)) {
        entry.reason = 'Payments for another beneficiary are not supported as Metalog curve evidence.'; continue
      }
      if (memoText.length > 1_024 || metadata.length > 14_000) {
        entry.reason = 'The entry memo or metadata exceeds the supported audit limit.'; continue
      }
      let json: unknown
      try { json = JSON.parse(memoText) }
      catch { entry.status = 'unrecognized'; entry.reason = 'This entry has no recognized Metalog curve memo.'; continue }
      const schema = json && typeof json === 'object' && 'schema' in json ? json.schema : null
      if (schema !== 'metalog.entry.v1' && schema !== 'metalog.entry.v2') {
        entry.status = 'unrecognized'; entry.reason = 'This entry has no recognized Metalog curve memo.'; continue
      }
      try {
        const memo = decodeEntryMemo(memoText, metadata)
        const verified = verifyRecordedEntry(market, d.implementation, beneficiary, amount, memo, metadata, receipt)
        entry.coefficients = verified.coefficients
        entry.status = verified.allocation.mode === 'curve' ? 'verified-curve' : 'verified-manual'
      } catch {
        entry.status = 'invalid'; entry.reason = 'The recorded curve or manual allocation does not match the payment and minted positions.'
      }
    }
    if (candidates.length > MAX_ENTRIES) {
      const final = candidates[MAX_ENTRIES - 1]
      page.scannedFromBlock = final.blockNumber!.toString()
      page.complete = false; page.nextCursor = `${final.blockNumber}:${final.transactionIndex}`
      return page
    }
    end = start - 1n; before = FIRST_TRANSACTION
    if (candidates.length) break
  }
  if (page.scannedFromBlock === null) throw new Error('Entry history could not be read within its request limit.')
  page.complete = end < first
  page.nextCursor = page.complete ? null : `${end}:${FIRST_TRANSACTION}`
  return page
}
