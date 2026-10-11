'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatEther, formatUnits, getAddress, isAddress } from 'viem'
import { MAX_POSITIONS } from '@/domain/allocation'
import { scorecardWeightsFromPercentages } from '@/domain/scorecard'
import type { LifecycleAction, LifecycleSnapshot } from '@/lib/defifa-lifecycle'
import { chainForId } from '@/lib/wallet'
import { useWallet } from '@/providers/Providers'
import { useTransactions } from '@/providers/Transactions'
import { utcTime } from './MarketFacts'

export function MarketLifecycle({ lifecycle, current, loading, error, onRefresh, onPage, inventoryPaged, scorecardsPaged }: {
  lifecycle: LifecycleSnapshot
  current: boolean
  loading: boolean
  error?: string
  onRefresh: () => void
  onPage: (kind: 'inventory' | 'scorecards', cursor?: string) => void
  inventoryPaged: boolean
  scorecardsPaged: boolean
}) {
  const { address, isSigna, connect } = useWallet()
  const transactions = useTransactions()
  const { market, inventory } = lifecycle
  const [selections, setSelections] = useState<Record<string, Record<string, number>>>({})
  const [recipient, setRecipient] = useState('')
  const [delegatee, setDelegatee] = useState('')
  const [percentages, setPercentages] = useState(() => market.ranges.map(() => '0'))
  const [scoreTouched, setScoreTouched] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [actionError, setActionError] = useState('')
  const walletKey = address?.toLowerCase() ?? ''
  const selected = selections[walletKey] ?? {}
  const tokenIds = Object.keys(selected).sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1)
  const tierIds = [...new Set(Object.values(selected))].sort((a, b) => a - b)
  const matchingWallet = !!address && lifecycle.account?.toLowerCase() === walletKey
  const busy = preparing || transactions.busy || !!transactions.pending
  const canAct = current && matchingWallet && !isSigna && !busy
  const explorer = chainForId(market.chainId).blockExplorers.default.url
  const scoreDraft = useMemo(() => {
    try { return { weights: scorecardWeightsFromPercentages(market.ranges, percentages), error: null } }
    catch (cause) { return { weights: null, error: cause instanceof Error ? cause.message : 'Check the proposed percentages.' } }
  }, [market.ranges, percentages])
  const quote = useQuery({
    queryKey: ['cash-out-quote', market.chainId, market.projectId, market.blockNumber, walletKey, tokenIds.join(',')],
    queryFn: async () => {
      const { readCashOutQuote } = await import('@/lib/defifa-lifecycle')
      return readCashOutQuote(market, tokenIds, address!)
    },
    enabled: current && matchingWallet && !!lifecycle.cashOutMode && tokenIds.length > 0 && tokenIds.length <= MAX_POSITIONS,
    retry: false, staleTime: 0,
  })
  const quoteReady = current && matchingWallet && !!quote.data && !quote.isFetching && !quote.error
  const cashOutLabel = lifecycle.cashOutMode === 'cash-out' ? 'Claim payout' : 'Refund'

  function changeSelection(tokenId: string, tierId: number, checked: boolean) {
    setSelections(previous => {
      const next = { ...(previous[walletKey] ?? {}) }
      if (checked && !next[tokenId] && Object.keys(next).length >= MAX_POSITIONS) return previous
      if (checked) next[tokenId] = tierId
      else delete next[tokenId]
      return { ...previous, [walletKey]: next }
    })
  }
  function selectShown() {
    if (!current || !matchingWallet || busy) return
    setSelections(previous => {
      const next = { ...(previous[walletKey] ?? {}) }
      let count = Object.keys(next).length
      for (const token of inventory.tokens) {
        if (count >= MAX_POSITIONS) break
        if (!next[token.tokenId]) { next[token.tokenId] = token.tierId; count++ }
      }
      return { ...previous, [walletKey]: next }
    })
  }
  async function act(action: LifecycleAction) {
    if (!canAct || !address) return
    setActionError('')
    setPreparing(true)
    try {
      const { prepareLifecycleAction } = await import('@/lib/defifa-lifecycle')
      const prepared = await prepareLifecycleAction(market, action, address)
      const receipt = await transactions.execute(prepared)
      if (receipt) {
        const removed = action.kind === 'transfer' ? [action.tokenId] : action.kind === 'cash-out' ? action.tokenIds : []
        if (removed.length) setSelections(previous => {
          const next = { ...(previous[walletKey] ?? {}) }
          for (const tokenId of removed) delete next[tokenId]
          return { ...previous, [walletKey]: next }
        })
        onRefresh()
      }
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'The transaction could not be prepared.') }
    finally { setPreparing(false) }
  }

  return <>
    <section aria-labelledby="your-nfts">
      <div className="row"><h2 id="your-nfts">Your NFTs</h2><button type="button" disabled={loading || busy} onClick={onRefresh}>Refresh</button></div>
      {loading && <p className="hint" role="status">Updating market and wallet positions…</p>}
      {error && <p className="error" role="alert">{error} Showing the last available market data. Refresh to enable actions.</p>}
      {preparing && <p role="status">Preparing transaction…</p>}
      {actionError && <p className="error" role="alert">{actionError}</p>}
      {!address ? <button type="button" onClick={() => connect()}>Connect to view your NFTs</button>
        : !matchingWallet ? <p role="status">{error ? 'Positions for this wallet are unavailable.' : 'Loading positions for this wallet…'}</p>
          : <>
            <p className="hint">{inventory.totalOwned} owned · {inventory.tokens.length} shown · block {market.blockNumber}</p>
            {!inventory.complete && <p className="hint">This is a partial inventory. Load more to check the remaining positions.</p>}
            {inventory.tokens.length === 0 ? <p>{inventory.complete && inventory.totalOwned === '0' ? 'You do not own any NFTs in this game.' : 'No owned NFTs on this page.'}</p>
              : <div className="table-wrap"><table className="inventory-table"><thead><tr><th>Select</th><th>NFT</th><th>Range</th></tr></thead><tbody>
                {inventory.tokens.map(token => <tr key={token.tokenId}>
                  <td><input type="checkbox" aria-label={`Select NFT #${token.tokenId}`} checked={!!selected[token.tokenId]}
                    disabled={!current || busy || (!selected[token.tokenId] && tokenIds.length >= MAX_POSITIONS)} onChange={event => changeSelection(token.tokenId, token.tierId, event.target.checked)} /></td>
                  <td>#{token.tokenId}</td><td>{market.ranges.find(range => range.tierId === token.tierId)?.label}</td>
                </tr>)}
              </tbody></table></div>}
            <div className="actions">
              <span className="hint">{tokenIds.length} / {MAX_POSITIONS} selected</span>
              <button type="button" disabled={!current || busy || tokenIds.length >= MAX_POSITIONS || inventory.tokens.every(token => !!selected[token.tokenId])} onClick={selectShown}>Select shown</button>
              {inventoryPaged && <button type="button" disabled={loading || busy} onClick={() => onPage('inventory')}>First positions</button>}
              {inventory.nextCursor && <button type="button" disabled={loading || busy} onClick={() => onPage('inventory', inventory.nextCursor!)}>Load more positions</button>}
              {tokenIds.length > 0 && <button type="button" disabled={busy} onClick={() => setSelections(previous => ({ ...previous, [walletKey]: {} }))}>Clear selection ({tokenIds.length})</button>}
            </div>
          </>}
      {isSigna && <p className="hint">Use an external wallet for game transactions. <button type="button" onClick={() => connect({ externalOnly: true })}>Use external wallet</button></p>}
      <details><summary>Transfer an NFT</summary>
        <p className="hint">Select one NFT. Its ownership and payout rights move to the recipient.</p>
        <label className="field"><span>Transfer recipient</span><input value={recipient} spellCheck={false} autoComplete="off" placeholder="0x…" onChange={event => setRecipient(event.target.value)} /></label>
        <button type="button" disabled={!canAct || tokenIds.length !== 1 || !isAddress(recipient)}
          onClick={() => void act({ kind: 'transfer', tokenId: tokenIds[0], to: getAddress(recipient) })}>Review transfer</button>
      </details>
      {lifecycle.cashOutMode && <div className="section">
        <h3>{cashOutLabel}</h3>
        <p className="hint">Select the NFTs to burn. {lifecycle.cashOutMode === 'cash-out' ? 'The ratified result determines their payout.' : 'Refunding returns their available value.'}</p>
        {tokenIds.length > 0 && matchingWallet && <>
          {quote.isFetching && <p role="status">Checking the selected NFTs and payout…</p>}
          {quote.error && <p className="error" role="alert">{quote.error.message}</p>}
          {quoteReady && quote.data && <dl className="facts">
            <dt>NFTs burned</dt><dd>{tokenIds.length}</dd>
            <dt>Minimum ETH received</dt><dd>{formatEther(BigInt(quote.data.reclaimWei))} ETH</dd>
            {BigInt(quote.data.defifaTokenWei) > 0n && <><dt>Defifa token reward</dt><dd>{formatEther(BigInt(quote.data.defifaTokenWei))} <a href={`${explorer}/token/${quote.data.defifaToken}`} target="_blank" rel="noreferrer">View token</a></dd></>}
            {BigInt(quote.data.baseProtocolTokenWei) > 0n && <><dt>Protocol token reward</dt><dd>{formatEther(BigInt(quote.data.baseProtocolTokenWei))} <a href={`${explorer}/token/${quote.data.baseProtocolToken}`} target="_blank" rel="noreferrer">View token</a></dd></>}
            <dt>Quote block</dt><dd>{quote.data.blockNumber}</dd>
          </dl>}
        </>}
        <div className="actions"><button type="button" disabled={!canAct || !quoteReady || !quote.data || tokenIds.length === 0 || tokenIds.length > MAX_POSITIONS}
          onClick={() => quote.data && void act({ kind: 'cash-out', tokenIds, minReclaimedWei: quote.data.reclaimWei })}>Review {cashOutLabel.toLowerCase()}</button></div>
      </div>}
      <details><summary>Voting delegation</summary>
        <p className="hint">Select NFTs above to choose ranges. Delegation applies to every NFT you hold in those ranges.</p>
        {!lifecycle.canDelegate && <p className="hint">Delegation can change only while entry is open.</p>}
        <label className="field"><span>Voting delegate</span><input value={delegatee} spellCheck={false} autoComplete="off" placeholder="0x…" onChange={event => setDelegatee(event.target.value)} /></label>
        <div className="actions">
          {address && <button type="button" onClick={() => setDelegatee(address)}>Use my wallet</button>}
          <button type="button" disabled={!canAct || !lifecycle.canDelegate || tierIds.length === 0 || !isAddress(delegatee)}
            onClick={() => void act({ kind: 'delegate', tierIds, delegatee: getAddress(delegatee) })}>Review delegation</button>
        </div>
        {matchingWallet && lifecycle.delegates.length > 0 && <div className="table-wrap"><table><thead><tr><th>Range</th><th>Delegate</th></tr></thead><tbody>
          {lifecycle.delegates.map(item => <tr key={item.tierId}><td>{market.ranges.find(range => range.tierId === item.tierId)?.label}</td><td><code>{item.delegate}</code></td></tr>)}
        </tbody></table></div>}
      </details>
    </section>
    <section aria-labelledby="scorecards">
      <h2 id="scorecards">Results</h2>
      <p className="hint">The ratified result controls payouts. Attestation grace is {duration(lifecycle.attestationGraceSeconds)}; the ratification timelock is {duration(lifecycle.timelockSeconds)}.</p>
      {lifecycle.scorecards.length === 0 && <p>{lifecycle.scorecardsComplete ? 'No results have been proposed.' : 'No results on this page.'}</p>}
      {lifecycle.scorecards.map(card => <details key={card.scorecardId} className="scorecard">
        <summary>Result <code>{card.scorecardId}</code> · {card.stateName}</summary>
        <dl className="facts">
          <dt>Submitted</dt><dd>{utcTime(card.submittedAt)}</dd>
          <dt>Proposed by</dt><dd><code>{card.submitter}</code></dd>
          <dt>Attestations begin</dt><dd>{utcTime(card.attestationsBegin)}</dd>
          <dt>Grace ends</dt><dd>{utcTime(card.gracePeriodEnds)}</dd>
          <dt>Attestation weight</dt><dd>{card.attestationCount}</dd>
          {matchingWallet && card.accountWeight !== null && <><dt>Your voting weight</dt><dd>{card.accountWeight}</dd></>}
          {matchingWallet && <><dt>Your attestation</dt><dd>{card.hasAttested ? 'Attested' : 'Not attested'}</dd></>}
        </dl>
        {matchingWallet && card.accountWeight === '0' && <p className="hint">This wallet has no voting weight for this proposal. Weight uses balances and delegation before submission and discounts payout ranges.</p>}
        <div className="table-wrap"><table><thead><tr><th>Range</th><th>Proposed payout</th></tr></thead><tbody>
          {card.weights.filter(item => BigInt(item.weight) > 0n).map(item => <tr key={item.tierId}><td>{market.ranges.find(range => range.tierId === item.tierId)?.label}</td><td>{formatUnits(BigInt(item.weight), 16)}%</td></tr>)}
        </tbody></table></div>
        <div className="actions">
          <button type="button" aria-label={`Attest result ${card.scorecardId}`} disabled={!canAct || !card.canAttest}
            onClick={() => void act({ kind: 'attest', scorecardId: card.scorecardId })}>Attest</button>
          <button type="button" aria-label={`Revoke attestation for result ${card.scorecardId}`} disabled={!canAct || !card.canRevoke}
            onClick={() => void act({ kind: 'revoke', scorecardId: card.scorecardId })}>Revoke attestation</button>
          <button type="button" aria-label={`Ratify result ${card.scorecardId}`} disabled={!canAct || !card.canRatify}
            onClick={() => void act({ kind: 'ratify', weights: card.weights })}>Ratify</button>
        </div>
      </details>)}
      <div className="actions">
        {scorecardsPaged && <button type="button" disabled={loading || busy} onClick={() => onPage('scorecards')}>First results</button>}
        {lifecycle.scorecardsNextCursor && <button type="button" disabled={loading || busy} onClick={() => onPage('scorecards', lifecycle.scorecardsNextCursor!)}>Load more results</button>}
      </div>
      {!lifecycle.scorecardsComplete && <p className="hint">Only part of the results history is shown.</p>}
      <details><summary>Propose a result</summary>
        <label className="field"><span>Propose one range</span><select value="" onChange={event => {
          if (!event.target.value) return
          setPercentages(market.ranges.map(range => String(range.tierId) === event.target.value ? '100' : '0'))
          setScoreTouched(true)
        }}><option value="">Choose a range to assign 100%</option>
          {market.ranges.filter(range => BigInt(market.tiers.find(tier => tier.tierId === range.tierId)?.supply ?? '0') > 0n).map(range => <option key={range.tierId} value={range.tierId}>{range.label}</option>)}
        </select></label>
        <p className="hint">This fills a proposal. Edit its percentages below; holders still decide whether to ratify it.</p>
        <div className="table-wrap"><table><thead><tr><th>Range</th><th>Proposed payout (%)</th></tr></thead><tbody>
          {market.ranges.map((range, index) => <tr key={range.tierId}><td>{range.label}</td><td><input className="quantity-input" inputMode="decimal" aria-label={`Proposed payout for ${range.label} (%)`}
            value={percentages[index]} onChange={event => { setPercentages(previous => previous.map((value, i) => i === index ? event.target.value : value)); setScoreTouched(true) }} /></td></tr>)}
        </tbody></table></div>
        {scoreTouched && scoreDraft.error && <p className="error" role="alert">{scoreDraft.error}</p>}
        {matchingWallet && !lifecycle.canSubmitScorecard && <p className="hint">Result proposals are unavailable in this phase.</p>}
        <div className="actions"><button type="button" disabled={!canAct || !lifecycle.canSubmitScorecard || !scoreDraft.weights}
          onClick={() => scoreDraft.weights && void act({ kind: 'submit-scorecard', weights: scoreDraft.weights })}>Review result</button></div>
      </details>
      {lifecycle.canFulfill && <div className="actions"><button type="button" disabled={!canAct} onClick={() => void act({ kind: 'fulfill' })}>Review commitment fulfillment</button></div>}
      {!market.noContestTriggered && !market.ratifiedScorecardId && <details><summary>No contest</summary>
        <p className="hint">The native timeout is {utcTime(lifecycle.noContestAfter)}. A no-contest refund becomes available only when the game permits it.</p>
        <button type="button" disabled={!canAct || !lifecycle.canTriggerNoContest} onClick={() => void act({ kind: 'no-contest' })}>Review no contest</button>
      </details>}
    </section>
  </>
}

function duration(seconds: number) {
  if (seconds % 86_400 === 0) return `${seconds / 86_400} day${seconds === 86_400 ? '' : 's'}`
  if (seconds % 3_600 === 0) return `${seconds / 3_600} hour${seconds === 3_600 ? '' : 's'}`
  return `${seconds} seconds`
}
