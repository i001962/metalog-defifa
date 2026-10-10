import { describe, expect, it } from 'vitest'
import { ASSET_PRESETS, buildObservationPreset, WINDOW_PRESETS } from '../src/domain/observation-presets'
import { marketRanges, validateMarket } from '../src/domain/market'
import { binForOutcome } from '../src/domain/ranges'

describe('observation presets', () => {
  it('offers the specified assets and fixed observation durations', () => {
    expect(ASSET_PRESETS.map(asset => asset.id)).toEqual(['BTC-USD', 'ETH-USD', 'SOL-USD'])
    expect(WINDOW_PRESETS.map(window => [window.id, window.seconds])).toEqual([
      ['15m', 900], ['1h', 3_600], ['1d', 86_400],
    ])
    for (const asset of ASSET_PRESETS) for (const window of WINDOW_PRESETS) {
      const preset = buildObservationPreset(asset.id, window.id)
      expect(preset.prompt).toContain(asset.label)
      expect(preset.prompt).toContain(window.label)
      expect(preset.source).toContain(`/products/${asset.id}/candles?granularity=60`)
      expect(preset.durationSeconds).toBe(window.seconds)
      expect(preset.resolutionRule).toContain(`Coinbase Exchange ${asset.id}`)
    }
  })

  it('refuses unknown assets or durations instead of silently selecting a different market', () => {
    for (const id of ['', 'BTC', 'BTC-EUR', 'custom']) {
      expect(() => buildObservationPreset(id, '1h')).toThrow('asset')
    }
    for (const id of ['', '60m', '1w', 'custom']) {
      expect(() => buildObservationPreset('BTC-USD', id)).toThrow('window')
    }
  })

  it('fixes exact candle identity, precision, missing observations and payout authority', () => {
    const { resolutionRule } = buildObservationPreset('BTC-USD', '1d')
    expect(resolutionRule).toContain('exact UTC minute boundaries')
    expect(resolutionRule).toContain('time field exactly equals')
    expect(resolutionRule).toContain('first trade')
    expect(resolutionRule).toContain('100 × (end value / start value − 1)')
    expect(resolutionRule).toContain('do not round before assigning')
    expect(resolutionRule).toContain('source or either exact candle is unavailable')
    expect(resolutionRule).toContain('Do not invent a price')
    expect(resolutionRule).toContain('ratified scorecard controls payouts')
    expect(resolutionRule).toContain('does not fetch prices, guarantee availability or settle automatically')
  })

  it('fits immutable market fields without changing custom geometry or half-open membership', () => {
    const entryClosesAt = 1_800_003_600
    for (const asset of ASSET_PRESETS) for (const window of WINDOW_PRESETS) {
      const { durationSeconds, ...observation } = buildObservationPreset(asset.id, window.id)
      const definition = validateMarket({
        schemaVersion: 1, settlement: 'defifa-scorecard', ...observation,
        entryOpensAt: entryClosesAt - 3_600, entryClosesAt,
        resolvesAt: entryClosesAt + durationSeconds,
        rangeBoundaries: [-5, -1, 0, 0.5, 3], unitPriceWei: '1000000000000',
      })
      expect(definition.source.length).toBeLessThanOrEqual(500)
      expect(definition.resolutionRule.length).toBeLessThanOrEqual(2_000)
      expect(definition.rangeBoundaries).toEqual([-5, -1, 0, 0.5, 3])
      expect(definition.resolvesAt - definition.entryClosesAt).toBe(window.seconds)
      const ranges = marketRanges(definition)
      expect(binForOutcome(ranges, 0.5).tierId).toBe(5)
      expect(binForOutcome(ranges, 0.5 - 1e-8).tierId).toBe(4)
    }
  })
})
