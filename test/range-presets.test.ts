import { describe, expect, it } from 'vitest'
import { buildRangePreset, RANGE_PRESETS } from '../src/domain/range-presets'
import { createCustomRanges, createRanges, namedRanges, resizeRangeBoundaries, validateRangeNames } from '../src/domain/ranges'
import { decodeMarketDefinition, encodeMarketDefinition, marketRanges, validateMarket, type MarketDefinition } from '../src/domain/market'
import { buildProjectMetadata, validateProjectMetadata } from '../src/domain/market-metadata'

const options = { count: 21, width: 1, mean: 0, sigma: 2 }
const definition: MarketDefinition = {
  schemaVersion: 1, settlement: 'defifa-scorecard', prompt: 'BTC change?', source: 'Named source',
  resolutionRule: 'Compare specified observations.', entryOpensAt: 1_800_000_100,
  entryClosesAt: 1_800_003_700, resolvesAt: 1_800_090_100, rangeCount: 21, rangeWidth: 1, unitPriceWei: '1000',
}

describe('range recipes and names', () => {
  it('retains the Simple equal-width geometry and permits even Advanced counts', () => {
    expect(buildRangePreset('equal-width', options).boundaries).toEqual(createRanges().slice(0, -1).map(range => range.upper))
    expect(buildRangePreset('equal-width', { ...options, count: 4, width: 2 }).boundaries).toEqual([-2, 0, 2])
    expect(() => createRanges(4, 2)).toThrow('odd')
    for (const count of [2, 62, 3.5, NaN]) {
      for (const id of ['equal-width', 'equal-probability', 'logarithmic'] as const) {
        expect(() => buildRangePreset(id, { ...options, count })).toThrow('ranges')
      }
    }
  })

  it('places equal-probability cutoffs at independent logistic quantiles to four decimals', () => {
    for (const count of [3, 4, 21, 61]) {
      const mean = 1.25, sigma = 3
      const { boundaries } = buildRangePreset('equal-probability', { ...options, count, mean, sigma })
      const scale = sigma * Math.sqrt(3) / Math.PI
      expect(boundaries).toEqual(Array.from({ length: count - 1 }, (_, index) => {
        const p = (index + 1) / count
        return Number((mean + scale * Math.log(p / (1 - p))).toFixed(4))
      }))
      const cumulative = [0, ...boundaries.map(value => 1 / (1 + Math.exp(-(value - mean) / scale))), 1]
      for (let index = 1; index < cumulative.length; index++) {
        expect(Math.abs(cumulative[index] - cumulative[index - 1] - 1 / count)).toBeLessThan(0.00002)
      }
      expect(createCustomRanges(boundaries)).toHaveLength(count)
    }
    expect(() => buildRangePreset('equal-probability', { ...options, sigma: 0 })).toThrow('standard deviation')
    expect(() => buildRangePreset('equal-probability', { ...options, sigma: 0.000001 })).toThrow('increasing')
  })

  it('reproduces symmetric logarithmic spacing and widening away from zero', () => {
    const { boundaries } = buildRangePreset('logarithmic', options)
    expect(boundaries[0]).toBe(-64.0779)
    expect(boundaries.at(-1)).toBe(64.0779)
    expect(boundaries).toEqual(Array.from({ length: 20 }, (_, index) => {
      const position = 2 * (index + 1) / 21 - 1
      return Number((Math.sign(position) * (101 ** Math.abs(position) - 1)).toFixed(4))
    }))
    const widths = createCustomRanges(boundaries).slice(10, -1).map(range => range.upper! - range.lower!)
    expect(widths.every((width, index) => index === 0 || width > widths[index - 1])).toBe(true)
    expect(buildRangePreset('logarithmic', { ...options, count: 4 }).boundaries).toEqual([-9.0499, 0, 9.0499])
  })

  it('provides seven independent named kmac recipes with overflow tails', () => {
    const expected = {
      'kmac-15m': [-0.25, -0.15, -0.05, 0.05, 0.15, 0.25],
      'kmac-1h': [-0.5, -0.3, -0.1, 0.1, 0.3, 0.5],
      'kmac-1d': [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5],
    }
    for (const id of ['kmac-15m', 'kmac-1h', 'kmac-1d'] as const) {
      const preset = buildRangePreset(id, options)
      expect(preset).toEqual({ boundaries: expected[id], names: ['Rekt', 'FUD', 'Copium', 'Crab', 'Hopium', 'FOMO', 'Moon'] })
      const bins = namedRanges(createCustomRanges(preset.boundaries), preset.names)
      expect(bins[0].lower).toBeNull()
      expect(bins.at(-1)?.upper).toBeNull()
      preset.boundaries[0] = -100
      preset.names![0] = 'Changed'
      expect(buildRangePreset(id, options)).toEqual({ boundaries: expected[id], names: ['Rekt', 'FUD', 'Copium', 'Crab', 'Hopium', 'FOMO', 'Moon'] })
    }
    expect(RANGE_PRESETS).toHaveLength(6)
  })

  it('rebuilds counts evenly at exact precision while preserving the finite extent', () => {
    expect(resizeRangeBoundaries([-2, -1.9, 3], 4)).toEqual([-2, 0.5, 3])
    expect(resizeRangeBoundaries([-2, 3], 6)).toEqual([-2, -0.75, 0.5, 1.75, 3])
    expect(resizeRangeBoundaries([0, 0.0005], 5)).toEqual([0, 0.0002, 0.0003, 0.0005])
    expect(() => resizeRangeBoundaries([0, 0.0001], 4)).toThrow('fit the remaining ranges')
    expect(() => resizeRangeBoundaries([2, 1], 4)).toThrow('increasing')
  })

  it('canonicalizes names and preserves them through market and Center metadata roundtrips', () => {
    const { boundaries, names } = buildRangePreset('kmac-1d', options)
    const named = validateMarket({ ...definition, rangeCount: undefined, rangeWidth: undefined,
      rangeBoundaries: boundaries, rangeNames: names!.map(name => ` ${name} `) })
    expect(named.rangeNames).toEqual(names)
    expect(decodeMarketDefinition(encodeMarketDefinition(named))).toEqual(named)
    expect(marketRanges(named)[0].label).toBe('Rekt · < -2.5%')
    expect(marketRanges(named)[3].label).toBe('Crab · -0.5% to < +0.5%')
    expect(marketRanges(named)[6].label).toBe('Moon · ≥ +2.5%')
    const metadata = buildProjectMetadata(named)
    expect(validateProjectMetadata(metadata)).toEqual(metadata)
    expect(metadata.metalog.tiers).toEqual(marketRanges(named))
    expect(metadata.metalog.definition.rangeNames).toEqual(names)
    expect(validateRangeNames(undefined, 3)).toBeUndefined()
    for (const invalid of [[], ['A', '', 'C'], ['A', 'A', 'C'], ['A', ' B ', 'B'], ['A', 'x'.repeat(41), 'C'], ['A', 1, 'C']]) {
      expect(() => validateRangeNames(invalid, 3)).toThrow()
    }
    expect(validateRangeNames(['A', 'a', 'C'], 3)).toEqual(['A', 'a', 'C'])
    expect(() => validateMarket({ ...definition, rangeNames: ['only one'] })).toThrow('one name')
  })
})
