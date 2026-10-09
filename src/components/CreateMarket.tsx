'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseEther } from 'viem'
import { validateMarket } from '@/domain/market'
import { createRanges, DEFAULT_RANGE_COUNT, DEFAULT_RANGE_WIDTH, MIN_RANGE_COUNT, MAX_RANGE_COUNT, MIN_RANGE_WIDTH, MAX_RANGE_WIDTH } from '@/domain/ranges'
import { SUPPORTED_CHAINS } from '@/lib/wallet'
import { downloadJson } from '@/lib/forecast'
import { useWallet } from '@/providers/Providers'
import { useTransactions } from '@/providers/Transactions'

const dateInput = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 16)
const seconds = (value: string) => Math.floor(Date.parse(`${value}Z`) / 1000)

export function CreateMarket({ now }: { now: number }) {
  const [prompt, setPrompt] = useState('')
  const [source, setSource] = useState('')
  const [rule, setRule] = useState('Percentage change = 100 × (end value / start value − 1). Use the specified source at the observation start and end. Payouts follow the ratified Defifa scorecard.')
  const [open, setOpen] = useState(dateInput(now + 600))
  const [close, setClose] = useState(dateInput(now + 24 * 3600))
  const [end, setEnd] = useState(dateInput(now + 48 * 3600))
  const [rangeCount, setRangeCount] = useState(String(DEFAULT_RANGE_COUNT))
  const [rangeWidth, setRangeWidth] = useState(String(DEFAULT_RANGE_WIDTH))
  const [price, setPrice] = useState('0.000001')
  const [chainId, setChainId] = useState(8453)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showValidation, setShowValidation] = useState(false)
  const router = useRouter()
  const wallet = useWallet()
  const transactions = useTransactions()
  const draft = useMemo(() => {
    try {
      if (!/^(?:\d+(?:\.\d{0,18})?|\.\d{1,18})$/.test(price)) throw new Error('Enter an ETH price with up to 18 decimal places.')
      const definition = validateMarket({ schemaVersion: 1, settlement: 'defifa-scorecard', prompt, source, resolutionRule: rule,
        entryOpensAt: seconds(open), entryClosesAt: seconds(close), resolvesAt: seconds(end), rangeCount: Number(rangeCount), rangeWidth: Number(rangeWidth), unitPriceWei: parseEther(price).toString() })
      return { definition, error: null }
    } catch (cause) { return { definition: null, error: cause instanceof Error ? cause.message : 'Check the market details.' } }
  }, [prompt, source, rule, open, close, end, rangeCount, rangeWidth, price])
  const ranges = useMemo(() => { try { return createRanges(Number(rangeCount), Number(rangeWidth)) } catch { return [] } }, [rangeCount, rangeWidth])
  async function create(event: React.FormEvent) {
    event.preventDefault()
    setShowValidation(true)
    if (!draft.definition) return
    if (!wallet.address) { wallet.connect(); return }
    if (wallet.isSigna) { wallet.connect({ externalOnly: true }); return }
    setBusy(true)
    setError('')
    try {
      const { prepareCreateMarket, createdMarketId } = await import('@/lib/defifa')
      const prepared = await prepareCreateMarket(draft.definition, chainId, wallet.address)
      const receipt = await transactions.execute(prepared)
      if (receipt) {
        const projectId = createdMarketId(receipt)
        if (!projectId) throw new Error('The transaction was confirmed, but its game ID could not be read. Check the transaction before creating again.')
        router.push(`/markets/${chainId}/${projectId}`)
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Market could not be prepared.') }
    finally { setBusy(false) }
  }
  return <form className="form-narrow" onSubmit={create}>
    <h1>Create market</h1>
    <label className="field"><span>Question</span><input placeholder="What will Bitcoin’s price change be over 24 hours?" maxLength={280} required value={prompt} onChange={event => setPrompt(event.target.value)} /></label>
    <div className="grid">
      <label className="field"><span>Entry opens (UTC)</span><input type="datetime-local" required value={open} onChange={event => setOpen(event.target.value)} /></label>
      <label className="field"><span>Entry closes / observation starts (UTC)</span><input type="datetime-local" required value={close} onChange={event => setClose(event.target.value)} /></label>
    </div>
    <label className="field"><span>Observation ends (UTC)</span><input type="datetime-local" required value={end} onChange={event => setEnd(event.target.value)} /></label>
    <label className="field"><span>Observation source</span><input placeholder="Source, instrument and exact observation to use" maxLength={500} required value={source} onChange={event => setSource(event.target.value)} /></label>
    <label className="field"><span>Observation rule</span><textarea maxLength={2000} required value={rule} onChange={event => setRule(event.target.value)} /><small>Specify timestamps, precision and what to do if the source is unavailable.</small></label>
    <div className="forecast-moments">
      <label className="field"><span>Ranges</span><input type="number" min={MIN_RANGE_COUNT} max={MAX_RANGE_COUNT} step={2} required value={rangeCount} onChange={event => setRangeCount(event.target.value)} /></label>
      <label className="field"><span>Range width (%)</span><input type="number" min={MIN_RANGE_WIDTH} max={MAX_RANGE_WIDTH} step={MIN_RANGE_WIDTH} required value={rangeWidth} onChange={event => setRangeWidth(event.target.value)} /></label>
      <label className="field"><span>Price per position (ETH)</span><input inputMode="decimal" required value={price} onChange={event => setPrice(event.target.value)} /></label>
    </div>
    <p className="hint">Equal-width ranges centered on 0%, plus one overflow range at each end.</p>
    <details><summary>View ranges</summary><div className="table-wrap"><table><thead><tr><th>NFT tier</th><th>Range</th></tr></thead><tbody>{ranges.map(range => <tr key={range.tierId}><td>{range.tierId}</td><td>{range.label}</td></tr>)}</tbody></table></div></details>
    <div className="section">
      <label className="field"><span>Network</span><select value={chainId} onChange={event => setChainId(Number(event.target.value))}>{SUPPORTED_CHAINS.map(chain => <option key={chain.id} value={chain.id}>{chain.name}</option>)}</select></label>
      <p className="hint">Payouts follow the ratified Defifa scorecard. Entry can be refunded while minting is open.</p>
      <div className="actions">
        <button type="submit" className="primary" disabled={busy || transactions.busy || Boolean(transactions.pending)}>{busy ? 'Preparing market…' : !wallet.address ? 'Connect to create' : wallet.isSigna ? 'Use external wallet to create' : 'Review market'}</button>
        <button type="button" disabled={!draft.definition} onClick={() => draft.definition && downloadJson(draft.definition, 'metalog-market.json')}>Download definition</button>
      </div>
      {(error || (showValidation && draft.error)) && <p className="error" role="alert" style={{ marginTop: 14 }}>{error || draft.error}</p>}
    </div>
  </form>
}
