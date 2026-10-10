'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseEther } from 'viem'
import { parseDefaultDelegate, validateMarket } from '@/domain/market'
import { createRanges, createCustomRanges, parseRangeBoundaries, parseRangeBoundary, redistributeRangeBoundaries, rangeBoundaryIssues, DEFAULT_RANGE_COUNT, DEFAULT_RANGE_WIDTH, MIN_RANGE_COUNT, MAX_RANGE_COUNT, MIN_RANGE_WIDTH, MAX_RANGE_WIDTH, type RangeBin } from '@/domain/ranges'
import { SUPPORTED_CHAINS } from '@/lib/wallet'
import { downloadJson } from '@/lib/forecast'
import { rememberMarket } from '@/lib/recent-markets'
import { useWallet } from '@/providers/Providers'
import { useTransactions } from '@/providers/Transactions'
import { RangePreview } from './RangePreview'

const dateInput = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 16)
const seconds = (value: string) => Math.floor(Date.parse(`${value}Z`) / 1000)
type RangeMode = 'simple' | 'advanced'

export function CreateMarket({ now }: { now: number }) {
  const [prompt, setPrompt] = useState('')
  const [source, setSource] = useState('')
  const [rule, setRule] = useState('Percentage change = 100 × (end value / start value − 1). Use the specified source at the observation start and end. Payouts follow the ratified scorecard.')
  const [delegate, setDelegate] = useState('')
  const [open, setOpen] = useState(dateInput(now + 600))
  const [close, setClose] = useState(dateInput(now + 24 * 3600))
  const [end, setEnd] = useState(dateInput(now + 48 * 3600))
  const [rangeCount, setRangeCount] = useState(String(DEFAULT_RANGE_COUNT))
  const [rangeWidth, setRangeWidth] = useState(String(DEFAULT_RANGE_WIDTH))
  const [rangeMode, setRangeMode] = useState<RangeMode>('simple')
  const [selectedRange, setSelectedRange] = useState<number | null>(null)
  const [selectedBoundary, setSelectedBoundary] = useState<number | null>(null)
  const [fixedBoundaries, setFixedBoundaries] = useState<number[]>([])
  const [editFailure, setEditFailure] = useState<{ index: number; message: string } | null>(null)
  const [boundaries, setBoundaries] = useState<string[] | null>(null)
  const [lastRanges, setLastRanges] = useState<Partial<Record<RangeMode, RangeBin[]>>>(() => ({ simple: createRanges() }))
  const [price, setPrice] = useState('0.000001')
  const [chainId, setChainId] = useState(8453)
  const isTestnet = SUPPORTED_CHAINS.some(chain => chain.id === chainId && 'testnet' in chain && chain.testnet)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showValidation, setShowValidation] = useState(false)
  const router = useRouter()
  const wallet = useWallet()
  const transactions = useTransactions()
  const rangeDraft = useMemo(() => {
    try {
      if (rangeMode === 'advanced') {
        const rangeBoundaries = parseRangeBoundaries(boundaries ?? [])
        return { configuration: { rangeBoundaries }, ranges: createCustomRanges(rangeBoundaries), error: null }
      }
      return { configuration: { rangeCount: Number(rangeCount), rangeWidth: Number(rangeWidth) }, ranges: createRanges(Number(rangeCount), Number(rangeWidth)), error: null }
    } catch (cause) { return { configuration: null, ranges: null, error: cause instanceof Error ? cause.message : 'Check the range boundaries.' } }
  }, [rangeMode, boundaries, rangeCount, rangeWidth])
  if (rangeDraft.ranges && (rangeMode === 'simple' || !editFailure) && rangeDraft.ranges !== lastRanges[rangeMode]) setLastRanges({ ...lastRanges, [rangeMode]: rangeDraft.ranges })
  const ranges = (rangeMode === 'advanced' && editFailure ? null : rangeDraft.ranges) ?? lastRanges[rangeMode] ?? []
  const boundaryIssues = rangeMode === 'advanced' ? { ...rangeBoundaryIssues(boundaries ?? []), ...(editFailure ? { [editFailure.index]: editFailure.message } : {}) } : {}
  const rangeError = rangeMode === 'advanced' && editFailure ? editFailure.message : rangeDraft.error
  const delegateDraft = useMemo(() => {
    try { return { address: parseDefaultDelegate(delegate), error: null } }
    catch (cause) { return { address: undefined, error: cause instanceof Error ? cause.message : 'Enter a valid delegate address.' } }
  }, [delegate])
  const draft = useMemo(() => {
    try {
      if (!/^(?:\d+(?:\.\d{0,18})?|\.\d{1,18})$/.test(price)) throw new Error('Enter an ETH price with up to 18 decimal places.')
      if (rangeError || !rangeDraft.configuration) throw new Error(rangeError || 'Check the ranges.')
      if (delegateDraft.error) throw new Error(delegateDraft.error)
      const definition = validateMarket({ schemaVersion: 1, settlement: 'defifa-scorecard', prompt, source, resolutionRule: rule,
        entryOpensAt: seconds(open), entryClosesAt: seconds(close), resolvesAt: seconds(end), ...rangeDraft.configuration, defaultAttestationDelegate: delegateDraft.address, unitPriceWei: parseEther(price).toString() })
      return { definition, error: null }
    } catch (cause) { return { definition: null, error: cause instanceof Error ? cause.message : 'Check the market details.' } }
  }, [prompt, source, rule, open, close, end, rangeDraft, rangeError, delegateDraft, price])
  function selectRangeMode(next: RangeMode) {
    if (next === 'advanced' && boundaries === null) {
      const seed = rangeDraft.ranges ?? lastRanges.simple!
      setBoundaries(seed.slice(0, -1).map(range => String(range.upper)))
      setLastRanges(previous => ({ ...previous, advanced: seed }))
    }
    setSelectedRange(null)
    setSelectedBoundary(null)
    setRangeMode(next)
  }
  function editBoundary(index: number, text: string, anchors = fixedBoundaries) {
    const next = boundaries!.map((item, position) => position === index ? text : item)
    setBoundaries(next)
    try {
      const values = next.map((item, position) => parseRangeBoundary(item, position))
      if (editFailure && editFailure.index !== index) { parseRangeBoundaries(next) }
      const cached = lastRanges.advanced?.slice(0, -1).map(range => range.upper!)
      const base = cached?.length === next.length ? cached : parseRangeBoundaries(next)
      const fixed = [...new Set([...anchors, index])]
      const result = redistributeRangeBoundaries(base, index, values[index], fixed)
      setBoundaries(result.map((value, position) => position === index ? text : String(value)))
      setFixedBoundaries(fixed)
      setEditFailure(null)
    } catch (cause) {
      setEditFailure({ index, message: cause instanceof Error ? cause.message : 'Check this boundary.' })
    }
  }
  function setBoundaryFixed(index: number, fixed: boolean) {
    const nextFixed = fixed ? [...fixedBoundaries, index] : fixedBoundaries.filter(item => item !== index)
    setFixedBoundaries(nextFixed)
    if (!fixed && editFailure && editFailure.index !== index) {
      editBoundary(editFailure.index, boundaries![editFailure.index], nextFixed)
    } else if (!fixed && !rangeError) {
      const values = parseRangeBoundaries(boundaries!)
      setBoundaries(redistributeRangeBoundaries(values, 0, values[0], nextFixed).map(String))
    }
  }
  function removeBoundary(index: number) {
    const next = boundaries!.filter((_, position) => position !== index)
    const fixed = fixedBoundaries.filter(item => item !== index).map(item => item > index ? item - 1 : item)
    setFixedBoundaries(fixed)
    setEditFailure(null)
    setSelectedBoundary(null)
    setSelectedRange(null)
    try {
      const values = parseRangeBoundaries(next)
      setBoundaries(redistributeRangeBoundaries(values, 0, values[0], fixed).map(String))
    } catch { setBoundaries(next) }
  }
  function applyShortSchedule() {
    if (!isTestnet) return
    const starts = Math.ceil(Date.now() / 60_000) * 60 + 120
    setOpen(dateInput(starts))
    setClose(dateInput(starts + 600))
    setEnd(dateInput(starts + 1200))
  }
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
        rememberMarket(chainId, projectId)
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
    <label className="field"><span id="default-delegate-label">Oracle</span><input aria-labelledby="default-delegate-label" aria-describedby="default-delegate-help" placeholder="0x… (optional)" autoComplete="off" spellCheck={false} value={delegate} aria-invalid={Boolean(delegateDraft.error)} onChange={event => setDelegate(event.target.value)} /><small id="default-delegate-help">Receives voting power from market positions. Leave blank to keep it with position holders. Holders can change their voting address while entries are open.</small>{delegateDraft.error && <small className="error" role="alert">{delegateDraft.error}</small>}</label>
    <div className="forecast-controls"><div className="mode-toggle" role="group" aria-label="Range layout">
      <button type="button" aria-pressed={rangeMode === 'simple'} onClick={() => selectRangeMode('simple')}>Simple</button>
      <button type="button" aria-pressed={rangeMode === 'advanced'} onClick={() => selectRangeMode('advanced')}>Advanced</button>
    </div></div>
    <div className="forecast-moments">
      {rangeMode === 'simple' && <>
        <label className="field"><span>Ranges</span><input type="number" min={MIN_RANGE_COUNT} max={MAX_RANGE_COUNT} step={2} required value={rangeCount} onChange={event => setRangeCount(event.target.value)} /></label>
        <label className="field"><span>Range width (%)</span><input type="number" min={MIN_RANGE_WIDTH} max={MAX_RANGE_WIDTH} step={MIN_RANGE_WIDTH} required value={rangeWidth} onChange={event => setRangeWidth(event.target.value)} /></label>
      </>}
      <label className="field"><span>Price per position (ETH)</span><input inputMode="decimal" required value={price} onChange={event => setPrice(event.target.value)} /></label>
    </div>
    <div aria-live="polite">{rangeError && <p className="range-alert error" role="alert">{rangeError} Chart shows the last valid ranges.</p>}</div>
    <RangePreview ranges={ranges} stale={Boolean(rangeError)} invalidBoundaries={Object.keys(boundaryIssues).map(key => { const index = Number(key); const raw = boundaries?.[index]?.trim(); const value = raw ? Number(raw) : NaN; return { index, value: Number.isFinite(value) ? value : null } })} selected={selectedRange} boundary={selectedBoundary}
      onSelect={tier => { setSelectedRange(tier); setSelectedBoundary(null) }}
      onBoundaryFocus={index => { setSelectedBoundary(index); setSelectedRange(null) }}
      onBoundaryChange={rangeMode === 'advanced' ? (index, value) => editBoundary(index, value) : undefined} />
    <div>{rangeMode === 'advanced' ? <>
      <p className="hint">Edited boundaries stay fixed. Other boundaries spread evenly through the remaining space.</p>
      <div className="range-boundaries">{boundaries?.map((value, index) => <div className="field boundary-field" key={index} data-invalid={Boolean(boundaryIssues[index])} data-highlighted={selectedBoundary === index || selectedRange === index + 1 || selectedRange === index + 2}>
        <label htmlFor={`range-boundary-${index}`}><span>Boundary {index + 1} (%)</span></label>
        <div className="inline">
          <input id={`range-boundary-${index}`} onFocus={() => { setSelectedBoundary(index); setSelectedRange(null) }} inputMode="decimal" maxLength={24} required value={value} aria-invalid={Boolean(boundaryIssues[index])} aria-describedby={`range-boundary-help-${index} range-boundary-error-${index}`} onChange={event => editBoundary(index, event.target.value)} />
          <button className="remove-boundary" type="button" aria-label={`Remove boundary ${index + 1}`} disabled={boundaries.length <= MIN_RANGE_COUNT - 1} onClick={() => removeBoundary(index)}>×</button>
        </div>
        <small id={`range-boundary-help-${index}`}>Between ranges {index + 1} and {index + 2}</small>
        <label className="boundary-fixed"><input type="checkbox" aria-label={`Fix boundary ${index + 1}`} checked={index === 0 || index === boundaries.length - 1 || fixedBoundaries.includes(index)} disabled={index === 0 || index === boundaries.length - 1} onChange={event => setBoundaryFixed(index, event.target.checked)} />{index === 0 || index === boundaries.length - 1 ? 'Extent' : 'Fixed'}</label>
        <small id={`range-boundary-error-${index}`} className="error">{boundaryIssues[index]}</small>
      </div>)}</div>
      <button type="button" disabled={(boundaries?.length ?? 0) >= MAX_RANGE_COUNT - 1} onClick={() => { setFixedBoundaries(previous => [...new Set([...previous, boundaries!.length - 1])]); setBoundaries(previous => [...previous!, '']) }}>Add boundary</button>
    </> : <p className="hint">Equal-width ranges centered on 0%, plus one overflow range at each end.</p>}</div>
    <details><summary>View ranges</summary>{rangeError && <p className="hint">Showing the last valid ranges.</p>}<div className="table-wrap"><table><thead><tr><th>NFT tier</th><th>Range</th></tr></thead><tbody>{ranges.map(range => <tr key={range.tierId}><td>{range.tierId}</td><td>{range.label}</td></tr>)}</tbody></table></div></details>
    <div className="section">
      <label className="field"><span>Network</span><select className="network-select" value={chainId} onChange={event => setChainId(Number(event.target.value))}>{SUPPORTED_CHAINS.map(chain => <option key={chain.id} value={chain.id}>{chain.name}</option>)}</select></label>
      {isTestnet && <div className="field"><div><button type="button" onClick={applyShortSchedule}>Use short test schedule</button></div><small>Opens in 2–3 minutes, then 10 minutes each for entry and observation. Scorecards still take at least 1 day to settle.</small></div>}
      <p className="hint">Payouts follow the ratified scorecard. Entry can be refunded while minting is open.</p>
      <div className="actions">
        <button type="submit" className="primary" disabled={busy || transactions.busy || Boolean(transactions.pending) || Boolean(rangeError || delegateDraft.error)}>{busy ? 'Preparing market…' : !wallet.address ? 'Connect to create' : wallet.isSigna ? 'Use external wallet to create' : 'Review market'}</button>
        <button type="button" disabled={!draft.definition} onClick={() => draft.definition && downloadJson(draft.definition, 'metalog-market.json')}>Download definition</button>
      </div>
      {(error || (showValidation && draft.error && draft.error !== rangeError && draft.error !== delegateDraft.error)) && <p className="error" role="alert" style={{ marginTop: 14 }}>{error || draft.error}</p>}
    </div>
  </form>
}
