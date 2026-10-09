'use client'

import { useMemo, useState } from 'react'
import { formatEther } from 'viem'
import { coefficientsFromMoments, coefficientsFromPercentiles, coefficientsFromQuantilePoints, parseCoefficientFields, quantile, type Coefficients } from '@/domain/distribution'
import type { MarketDefinition } from '@/domain/market'
import { createRanges } from '@/domain/ranges'
import type { MarketSnapshot } from '@/lib/defifa'
import { downloadJson, forecastPreview, positionsForBudget } from '@/lib/forecast'
import { forecastSIPmath } from '@/lib/sipmath'
import { useWallet } from '@/providers/Providers'
import { useTransactions } from '@/providers/Transactions'
import { PositionChart } from './PositionChart'

const COEFFICIENT_LABELS = ['Median', 'Base spread', 'Tail asymmetry', 'Middle spread', 'Shape asymmetry', 'Tail spread']
type EditorMode = 'moments' | 'coefficients' | 'ranges' | 'percentiles' | 'quantiles'
const formatEstimate = (value: number) => value.toFixed(2)

export function ForecastEditor({ definition, market, onSubmitted }: {
  definition: MarketDefinition
  market?: MarketSnapshot
  onSubmitted?: () => void
}) {
  const [mean, setMean] = useState('0')
  const [sigma, setSigma] = useState('2')
  const initialBudget = formatEther(BigInt(definition.unitPriceWei) * 100n)
  const [budgets, setBudgets] = useState({ moments: initialBudget, coefficients: initialBudget, percentiles: initialBudget, quantiles: initialBudget })
  const [coefficientFields, setCoefficientFields] = useState(() => coefficientsFromMoments(0, 2).map(String))
  const [expressiveInitialized, setExpressiveInitialized] = useState(false)
  const [percentilesInitialized, setPercentilesInitialized] = useState(false)
  const [percentileFields, setPercentileFields] = useState(() => {
    const initialCurve = coefficientsFromMoments(0, 2)
    return [0.1, 0.5, 0.9].map(probability => formatEstimate(quantile(initialCurve, probability)))
  })
  const [quantileSeed, setQuantileSeed] = useState(() => coefficientsFromMoments(0, 2))
  const [quantileFields, setQuantileFields] = useState([{ id: 1, probability: '50', outcome: '0' }])
  const [nextQuantileId, setNextQuantileId] = useState(2)
  const [quantilesInitialized, setQuantilesInitialized] = useState(false)
  const [mode, setMode] = useState<EditorMode>('moments')
  const [quantities, setQuantities] = useState<string[] | null>(null)
  const [referenceCurve, setReferenceCurve] = useState(() => coefficientsFromMoments(0, 2))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const { address, isSigna, connect } = useWallet()
  const transactions = useTransactions()
  const manual = mode === 'ranges'
  const budget = mode === 'coefficients' ? budgets.coefficients : mode === 'percentiles' ? budgets.percentiles : mode === 'quantiles' ? budgets.quantiles : budgets.moments
  const curve = useMemo(() => {
    try {
      if (mode === 'moments' && (mean.trim() === '' || sigma.trim() === '')) throw new Error('Enter a mean and standard deviation.')
      if (mode === 'percentiles' && percentileFields.some(value => value.trim() === '')) throw new Error('Enter all three outcome estimates.')
      if (mode === 'quantiles' && quantileFields.some(point => point.probability.trim() === '' || point.outcome.trim() === '')) throw new Error('Complete every probability and outcome.')
      const coefficients = mode === 'ranges' ? referenceCurve
        : mode === 'moments' ? coefficientsFromMoments(Number(mean), Number(sigma))
          : mode === 'percentiles' ? coefficientsFromPercentiles(...percentileFields.map(Number) as [number, number, number])
            : mode === 'quantiles' ? coefficientsFromQuantilePoints(quantileFields.map(point => ({
              probability: Number(point.probability) / 100,
              outcome: Number(point.outcome),
            })), quantileSeed)
              : parseCoefficientFields(coefficientFields)
      return { coefficients, error: null }
    } catch (cause) {
      return { coefficients: null, error: cause instanceof Error ? cause.message : 'Check your curve.' }
    }
  }, [mean, sigma, coefficientFields, percentileFields, quantileFields, quantileSeed, mode, referenceCurve])
  const [lastValidCurves, setLastValidCurves] = useState<Partial<Record<EditorMode, Coefficients>>>({})
  if (curve.coefficients && curve.coefficients !== lastValidCurves[mode]) setLastValidCurves({ ...lastValidCurves, [mode]: curve.coefficients })
  const displayedCurve = curve.coefficients ?? lastValidCurves[mode]!
  const ranges = useMemo(() => createRanges(definition.rangeCount, definition.rangeWidth), [definition.rangeCount, definition.rangeWidth])
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
  const quantileFit = useMemo(() => {
    if (!curve.coefficients || !quantileFields.every(point => point.probability.trim() && point.outcome.trim())) return null
    const errors = quantileFields.map(point => Math.abs(quantile(curve.coefficients!, Number(point.probability) / 100) - Number(point.outcome)))
    return { maximumError: Math.max(...errors), exact: quantileFields.length <= 6 }
  }, [curve.coefficients, quantileFields])
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
    if (next === 'percentiles' && !percentilesInitialized) {
      setPercentileFields([0.1, 0.5, 0.9].map(probability => formatEstimate(quantile(displayedCurve, probability))))
      setBudgets(previous => ({ ...previous, percentiles: model.preview && !manual ? budget : tablePreview ? formatEther(BigInt(tablePreview.payment.valueWei)) : initialBudget }))
      setPercentilesInitialized(true)
    }
    if (next === 'quantiles' && !quantilesInitialized) {
      setQuantileSeed(displayedCurve)
      setBudgets(previous => ({ ...previous, quantiles: model.preview && !manual ? budget : tablePreview ? formatEther(BigInt(tablePreview.payment.valueWei)) : initialBudget }))
      setQuantilesInitialized(true)
    }
    setMode(next)
  }
  function changeCurve(value: Coefficients) {
    if (mode === 'moments') {
      setMean(String(value[0]))
      setSigma(String(value[1] * Math.PI / Math.sqrt(3)))
    } else if (mode === 'percentiles') {
      setPercentileFields([0.1, 0.5, 0.9].map(probability => formatEstimate(quantile(value, probability))))
    } else if (mode === 'quantiles') {
      setQuantileFields(previous => previous.map(point => ({
        ...point,
        outcome: formatEstimate(quantile(value, Number(point.probability) / 100)),
      })))
    } else setCoefficientFields(value.map(String))
  }
  function addQuantile() {
    const probabilities = quantileFields.map(point => Number(point.probability)).filter(value => value > 0 && value < 100 && Number.isFinite(value)).sort((a, b) => a - b)
    const bounds = [0, ...probabilities, 100]
    let lower = bounds[0], upper = bounds[1]
    for (let index = 1; index < bounds.length - 1; index++) {
      if (bounds[index + 1] - bounds[index] > upper - lower) {
        lower = bounds[index]
        upper = bounds[index + 1]
      }
    }
    const probability = (lower + upper) / 2
    if (probability === lower || probability === upper) {
      setError('No distinct probability values remain between 0% and 100%.')
      return
    }
    const seed = curve.coefficients ?? displayedCurve
    setQuantileFields(previous => [...previous, {
      id: nextQuantileId,
      probability: String(probability),
      outcome: formatEstimate(quantile(seed, probability / 100)),
    }])
    setNextQuantileId(value => value + 1)
    setError('')
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
        <button type="button" aria-pressed={mode === 'percentiles'} onClick={() => selectMode('percentiles')}>Low / middle / high</button>
        <button type="button" aria-pressed={mode === 'quantiles'} onClick={() => selectMode('quantiles')}>Quantiles</button>
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
    </> : mode === 'percentiles' ? <>
      <div className="percentile-fields">
        {[
          { label: 'Low outcome · 10th percentile', hint: 'Only 1 in 10 outcomes should be lower.' },
          { label: 'Middle outcome · median', hint: 'Half of outcomes should be lower, half higher.' },
          { label: 'High outcome · 90th percentile', hint: 'Only 1 in 10 outcomes should be higher.' },
        ].map(({ label, hint }, index) => <label className="field" key={label}>
          <span>{label} (%)</span>
          <input aria-label={`${label} (%)`} inputMode="decimal" spellCheck={false}
            aria-invalid={curve.error !== null} aria-describedby={curve.error ? 'forecast-error' : undefined}
            value={percentileFields[index]} onChange={event => {
              const updated = [...percentileFields]
              updated[index] = event.target.value
              setPercentileFields(updated)
            }} />
          <small>{hint}</small>
        </label>)}
      </div>
      <p className="hint">The curve passes through all three estimates; its shape between and beyond them is fitted with a three-term Metalog.</p>
    </> : mode === 'quantiles' ? <>
      <div className="quantile-rows" role="group" aria-label="Quantile probability and outcome points">
        {quantileFields.map((point, index) => <div className="quantile-row" role="group" aria-label={`Quantile ${index + 1}`} key={point.id}>
          <label className="field"><span>Probability (%)</span><input aria-label={`Probability for quantile ${index + 1}`} inputMode="decimal"
            aria-invalid={curve.error !== null} aria-describedby={curve.error ? 'forecast-error' : undefined}
            value={point.probability} onChange={event => setQuantileFields(previous => previous.map(item => item.id === point.id ? { ...item, probability: event.target.value } : item))} /></label>
          <label className="field"><span>Outcome (%)</span><input aria-label={`Outcome for quantile ${index + 1}`} inputMode="decimal"
            aria-invalid={curve.error !== null} aria-describedby={curve.error ? 'forecast-error' : undefined}
            value={point.outcome} onChange={event => setQuantileFields(previous => previous.map(item => item.id === point.id ? { ...item, outcome: event.target.value } : item))} /></label>
          {quantileFit && <small className="quantile-fit">Curve: {quantile(curve.coefficients!, Number(point.probability) / 100).toFixed(2)}%</small>}
          <button type="button" aria-label={`Remove quantile ${index + 1}`} disabled={quantileFields.length === 1}
            onClick={() => setQuantileFields(previous => previous.filter(item => item.id !== point.id))}>Remove</button>
        </div>)}
      </div>
      <div className="quantile-actions">
        <button type="button" onClick={addQuantile}>Add quantile</button>
        {quantileFields.length === 1
          ? <small>One point sets the curve’s location; its shape uses the starting estimate.</small>
          : quantileFit?.exact
            ? <small>The curve passes through every entered point.</small>
            : quantileFit && <small>Six-term fit · maximum difference {quantileFit.maximumError.toFixed(2)} percentage points.</small>}
      </div>
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
      {market && <button className="primary" disabled={!model.preview || Boolean(closed) || submitting || transactions.busy || Boolean(transactions.pending)} onClick={submit}>
        {submitting ? 'Preparing entry…' : !address ? 'Connect to enter' : isSigna ? 'Use external wallet to enter' : 'Review entry'}
      </button>}
      <button disabled={!model.preview} onClick={() => model.preview && downloadJson(model.preview, 'metalog-forecast.json')}>Download draft</button>
      <button disabled={!model.preview} onClick={downloadSIPmath}>Download SIPmath</button>
    </div>
    {closed && <p className="hint" style={{ marginTop: 12 }}>{market.stage === 'countdown' ? 'Entry has not opened.' : 'Entry is closed.'}</p>}
    {!market && <p className="hint" style={{ marginTop: 12 }}>Example only. No positions are minted.</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>
}
