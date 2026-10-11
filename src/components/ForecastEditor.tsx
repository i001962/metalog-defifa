'use client'

import { useMemo, useState } from 'react'
import { formatEther } from 'viem'
import { coefficientsFromMoments, parseCoefficientFields, type Coefficients } from '@/domain/distribution'
import { marketRanges, type MarketDefinition } from '@/domain/market'
import type { MarketSnapshot } from '@/lib/defifa'
import { downloadJson, forecastPreview, positionsForBudget } from '@/lib/forecast'
import { forecastSIPmath } from '@/lib/sipmath'
import { useWallet } from '@/providers/Providers'
import { useTransactions } from '@/providers/Transactions'
import { PositionChart } from './PositionChart'

const COEFFICIENT_LABELS = ['Median', 'Base spread', 'Tail asymmetry', 'Middle spread', 'Shape asymmetry', 'Tail spread']
type EditorMode = 'moments' | 'coefficients' | 'ranges'

export function ForecastEditor({ definition, market, current = true, onSubmitted }: {
  definition: MarketDefinition
  market?: MarketSnapshot
  current?: boolean
  onSubmitted?: () => void
}) {
  const [mean, setMean] = useState('0')
  const [sigma, setSigma] = useState('2')
  const initialBudget = formatEther(BigInt(definition.unitPriceWei) * 100n)
  const [budgets, setBudgets] = useState({ moments: initialBudget, coefficients: initialBudget })
  const [coefficientFields, setCoefficientFields] = useState(() => coefficientsFromMoments(0, 2).map(String))
  const [expressiveInitialized, setExpressiveInitialized] = useState(false)
  const [mode, setMode] = useState<EditorMode>('moments')
  const [quantities, setQuantities] = useState<string[] | null>(null)
  const [referenceCurve, setReferenceCurve] = useState(() => coefficientsFromMoments(0, 2))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const { address, isSigna, connect } = useWallet()
  const transactions = useTransactions()
  const manual = mode === 'ranges'
  const budget = mode === 'coefficients' ? budgets.coefficients : budgets.moments
  const curve = useMemo(() => {
    try {
      if (mode === 'moments' && (mean.trim() === '' || sigma.trim() === '')) throw new Error('Enter a mean and standard deviation.')
      const coefficients = mode === 'ranges' ? referenceCurve : mode === 'moments' ? coefficientsFromMoments(Number(mean), Number(sigma)) : parseCoefficientFields(coefficientFields)
      return { coefficients, error: null }
    } catch (cause) {
      return { coefficients: null, error: cause instanceof Error ? cause.message : 'Check your curve.' }
    }
  }, [mean, sigma, coefficientFields, mode, referenceCurve])
  const [lastValidCurves, setLastValidCurves] = useState<Partial<Record<EditorMode, Coefficients>>>({})
  if (curve.coefficients && curve.coefficients !== lastValidCurves[mode]) setLastValidCurves({ ...lastValidCurves, [mode]: curve.coefficients })
  const displayedCurve = curve.coefficients ?? lastValidCurves[mode]!
  const ranges = useMemo(() => marketRanges(definition), [definition])
  const automatic = useMemo(() => {
    try {
      if (!curve.coefficients) throw new Error(curve.error || 'Check your curve.')
      const payment = positionsForBudget(budget, definition.unitPriceWei)
      const preview = forecastPreview({ market: definition, coefficients: curve.coefficients, positions: payment.count })
      return { payment, preview, error: null }
    } catch (cause) {
      return { payment: null, preview: null, error: cause instanceof Error ? cause.message : 'Check your stake.' }
    }
  }, [curve, budget, definition])
  const manualCounts = useMemo(() => quantities?.every(value => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)))
    ? quantities.map(Number) : null, [quantities])
  const model = useMemo(() => {
    if (!manual) return automatic
    try {
      if (!curve.coefficients) throw new Error(curve.error || 'Check your curve.')
      if (!manualCounts) throw new Error('Enter a whole NFT count of zero or more for every range.')
      const preview = forecastPreview({ market: definition, coefficients: curve.coefficients, quantities: manualCounts })
      return { preview, payment: { valueWei: BigInt(preview.payment.valueWei), remainderWei: 0n }, error: null }
    } catch (cause) {
      return { preview: null, payment: null, error: cause instanceof Error ? cause.message : 'Check your NFT counts.' }
    }
  }, [manual, manualCounts, automatic, curve, definition])
  // Retained evidence is display-only. Submission and export always use the current model.
  const [lastValidModels, setLastValidModels] = useState<Partial<Record<EditorMode, typeof model>>>({})
  if (model.preview && model !== lastValidModels[mode]) setLastValidModels({ ...lastValidModels, [mode]: model })
  const displayedModel = model.preview ? model : lastValidModels[mode]
  const tablePreview = displayedModel?.preview
  const positionColumnSize = Math.ceil((tablePreview?.ranges.length ?? 0) / 2)
  function selectMode(next: EditorMode) {
    if (next === 'coefficients' && !expressiveInitialized) {
      setCoefficientFields(displayedCurve.map(String))
      setBudgets(previous => ({ ...previous, coefficients: model.preview && !manual ? budget : tablePreview ? formatEther(BigInt(tablePreview.payment.valueWei)) : initialBudget }))
      setExpressiveInitialized(true)
    }
    if (next === 'ranges' && !quantities && tablePreview) {
      setQuantities(tablePreview.allocation.quantities.map(String))
      setReferenceCurve(tablePreview.distribution.coefficients)
    }
    setMode(next)
  }
  function changeCurve(value: Coefficients) {
    if (mode === 'moments') {
      setMean(String(value[0]))
      setSigma(String(value[1] * Math.PI / Math.sqrt(3)))
    } else setCoefficientFields(value.map(String))
  }
  function downloadSIPmath() {
    if (!model.preview) return
    setError('')
    try {
      const { market, distribution, allocation } = model.preview
      downloadJson(forecastSIPmath({ market, coefficients: distribution.coefficients,
        ...(allocation.mode === 'manual' ? { quantities: allocation.quantities } : { positions: allocation.count }),
      }), 'metalog-forecast.SIPmath')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Export could not be prepared.') }
  }
  async function submit() {
    if (!current) return
    if (!address) { connect(); return }
    if (isSigna) { connect({ externalOnly: true }); return }
    if (!market || !model.preview || !curve.coefficients) return
    setError('')
    setSubmitting(true)
    try {
      const { prepareEntry } = await import('@/lib/defifa')
      const prepared = await prepareEntry(market, model.preview.allocation, address, curve.coefficients)
      const receipt = await transactions.execute(prepared)
      if (receipt) onSubmitted?.()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Entry could not be prepared.') }
    finally { setSubmitting(false) }
  }
  const closed = market && market.stage !== 'entry'
  return <section aria-labelledby="your-view">
    <h2 id="your-view">Your view</h2>
    <div className="forecast-controls">
      <div className="mode-toggle" role="group" aria-label="Curve controls">
        <button type="button" aria-pressed={mode === 'moments'} onClick={() => selectMode('moments')}>Simple</button>
        <button type="button" aria-pressed={mode === 'coefficients'} onClick={() => selectMode('coefficients')}>Expressive</button>
        <button type="button" aria-pressed={manual} onClick={() => selectMode('ranges')}>By range</button>
      </div>
    </div>
    {mode === 'moments' ? <div className="forecast-moments">
      <label className="field"><span>Mean (%)</span><input aria-label="Mean (%)" inputMode="decimal" value={mean} onChange={event => setMean(event.target.value)} /></label>
      <label className="field"><span>Standard deviation (%)</span><input aria-label="Standard deviation (%)" inputMode="decimal" value={sigma} onChange={event => setSigma(event.target.value)} /></label>
    </div> : mode === 'coefficients' ? <>
      <div className="coefficient-fields">{COEFFICIENT_LABELS.map((label, index) => <label className="field" key={label}>
        <span>a<sub>{index + 1}</sub> · {label}</span>
        <input aria-label={`a${index + 1} · ${label}`} inputMode="decimal" spellCheck={false}
          aria-invalid={curve.error !== null} aria-describedby={curve.error ? 'forecast-error' : undefined}
          value={coefficientFields[index]}
          onChange={event => {
            const updated = [...coefficientFields]
            updated[index] = event.target.value
            setCoefficientFields(updated)
          }} />
      </label>)}</div>
      <p className="hint">Values in percentage points. Shape terms work together.</p>
    </> : <div className="table-wrap positions-table range-editor" role="region" aria-label="NFT counts" tabIndex={0}>
      <table><thead><tr><th>Range</th><th>NFTs</th></tr></thead><tbody>
        {ranges.map((range, index) => <tr key={range.tierId}><td>{range.label}</td><td>
          <input className="quantity-input" aria-label={`NFTs for ${range.label}`} inputMode="numeric"
            aria-invalid={model.error !== null} aria-describedby={model.error ? 'forecast-error' : undefined}
            value={quantities?.[index] ?? ''} onChange={event => {
              const updated = [...(quantities ?? ranges.map(() => '0'))]
              updated[index] = event.target.value
              setQuantities(updated)
            }} />
        </td></tr>)}
      </tbody></table>
    </div>}
    <PositionChart ranges={ranges} quantities={(manual && manualCounts) || tablePreview?.allocation.quantities || []}
      coefficients={displayedCurve} reference={manual} onChange={manual ? undefined : changeCurve}
      readOnly={!model.preview && (!manual || !manualCounts)} />
    <div className="grid">
      <label className="field"><span>Stake (ETH)</span><input className="stake-input" inputMode="decimal" readOnly={manual} value={manual ? (model.payment ? formatEther(model.payment.valueWei) : '') : budget} onChange={event => setBudgets(previous => ({ ...previous, [mode]: event.target.value }))} /><small>{formatEther(BigInt(definition.unitPriceWei))} ETH per position</small></label>
      {displayedModel?.preview && displayedModel.payment && <div className="field" style={{ alignContent: 'center' }}>
        <span>{displayedModel.preview.allocation.count} positions for {formatEther(displayedModel.payment.valueWei)} ETH</span>
        <small>{!model.preview ? 'Last valid preview' : `${manual ? 'Difference from reference curve' : 'Rounding difference'}: ${(displayedModel.preview.allocation.totalVariationError * 100).toFixed(2)}%`}</small>
        {displayedModel.payment.remainderWei > 0n && <small>{formatEther(displayedModel.payment.remainderWei)} ETH stays in your wallet.</small>}
      </div>}
    </div>
    {model.error && <p id="forecast-error" className="error" role="alert">{model.error}</p>}
    {tablePreview && <div className="positions"><h3>Positions ({tablePreview.allocation.count}){!model.preview && <small> · Last valid preview</small>}</h3>
      <div className="positions-columns" role="region" aria-label="Positions">
        {[0, positionColumnSize].map((offset, column) => <table key={column} aria-label={`Positions, ${column === 0 ? 'first' : 'second'} half`}>
          <thead><tr><th>Range</th><th>{manual ? 'Reference curve' : 'Your curve'}</th><th>NFTs</th><th>Your positions</th></tr></thead><tbody>
            {tablePreview.ranges.slice(offset, offset + positionColumnSize).map((range, row) => {
              const index = offset + row
              return <tr key={range.tierId}>
                <td>{range.label}</td><td>{(tablePreview.allocation.probabilities[index] * 100).toFixed(2)}%</td>
                <td>{tablePreview.allocation.quantities[index]}</td><td>{model.preview ? `${(model.preview.allocation.actualProbabilities[index] * 100).toFixed(2)}%` : '—'}</td>
              </tr>
            })}
          </tbody>
        </table>)}
      </div>
    </div>}
    <div className="actions">
      {market && <button className="primary" disabled={!current || !model.preview || Boolean(closed) || submitting || transactions.busy || Boolean(transactions.pending)} onClick={submit}>
        {submitting ? 'Preparing entry…' : !address ? 'Connect to enter' : isSigna ? 'Use external wallet to enter' : 'Review entry'}
      </button>}
      <button disabled={!model.preview} onClick={() => model.preview && downloadJson(model.preview, 'metalog-forecast.json')}>Download draft</button>
      <button disabled={!model.preview} onClick={downloadSIPmath}>Download SIPmath</button>
    </div>
    {current && closed && <p className="hint" style={{ marginTop: 12 }}>{market.stage === 'countdown' ? 'Entry has not opened.' : 'Entry is closed.'}</p>}
    {!market && <p className="hint" style={{ marginTop: 12 }}>Example only. No positions are minted.</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>
}
