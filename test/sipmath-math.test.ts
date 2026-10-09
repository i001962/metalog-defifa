import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { quantile, validateCoefficients } from '../src/domain/distribution'
import { hdrUniform, lookupTable, lookupValue, MAX_HDR_COUNTER, MAX_HDR_SEED } from '../src/domain/sipmath'
import { EXAMPLE_MARKET } from '../src/lib/example'
import { forecastSIPmath } from '../src/lib/sipmath'
import single from './fixtures/sipmath/canonical-single.json'
import poisson from './fixtures/sipmath/canonical-poisson.json'
import calibration from './fixtures/sipmath/hdr-calibration.json'

// The pinned package's `types` points at a missing main.d.ts. Use its real unmodified CJS entry.
const { simulateSIP, metalog } = createRequire(import.meta.url)('@solace-fi/hydrate') as {
  simulateSIP: (library: unknown, name: string, trials: number) => number[]
  metalog: (p: number, a: readonly number[]) => number
}

describe('SIPmath HDR_2_0', () => {
  it('reproduces the publisher spreadsheet calibration exactly', () => {
    for (const trial of calibration.trials) {
      expect(hdrUniform(trial.counter, calibration.seeds)).toBe(trial.uniform)
    }
  })

  it('keeps integer inputs within the portable profile and samples strictly inside (0,1)', () => {
    const seeds = { entity: MAX_HDR_SEED, varId: MAX_HDR_SEED, seed3: MAX_HDR_SEED, seed4: MAX_HDR_SEED }
    for (const counter of [0, 1, 100, MAX_HDR_COUNTER]) {
      const p = hdrUniform(counter, seeds)
      expect(p).toBeGreaterThan(0)
      expect(p).toBeLessThan(1)
      expect(hdrUniform(counter, { ...seeds })).toBe(p)
    }
    for (const counter of [-1, 1.5, MAX_HDR_COUNTER + 1, NaN, Infinity, '1']) {
      expect(() => hdrUniform(counter as number, seeds)).toThrow('counter')
    }
    for (const field of ['entity', 'varId', 'seed3', 'seed4']) {
      for (const value of [-1, 0.5, MAX_HDR_SEED + 1, NaN, Infinity, '1', undefined]) {
        expect(() => hdrUniform(1, { ...seeds, [field]: value })).toThrow('seeds')
      }
    }
    expect(() => hdrUniform(1, null as never)).toThrow('seeds')
  })
})

describe('SIPmath categorical lookup', () => {
  it('uses exact integer totals, skips zero counts and preserves interval endpoints', () => {
    const table = lookupTable([0n, 3n, 0n, 7n, 0n], [1, 2, 3, 4, 5])
    expect(table).toEqual([[0.3, 2], [1, 4]])
    expect(lookupValue(table, 0)).toBe(2)
    expect(lookupValue(table, 0.3)).toBe(2)
    expect(lookupValue(table, 0.3 + Number.EPSILON)).toBe(4)
    expect(lookupValue(table, 1)).toBe(4)
    expect(lookupTable([0n, 0n], [1, 2])).toEqual([])
    expect(lookupTable([], [])).toEqual([])
    const huge = 2n ** 200n
    expect(lookupTable([huge, 2n * huge], [5, 7])).toEqual([[1 / 3, 5], [1, 7]])
  })

  it('refuses malformed inputs and does not silently erase tiny positive counts', () => {
    for (const counts of [[-1n, 2n], [1, 2], [1n], new Array<bigint>(2), null]) {
      expect(() => lookupTable(counts as bigint[], [1, 2])).toThrow()
    }
    for (const ids of [[1, 1], [0, 2], [1.5, 2], [1, Infinity], [1, '2'], new Array<number>(2)]) {
      expect(() => lookupTable([1n, 2n], ids as number[])).toThrow()
    }
    expect(() => lookupTable([10n ** 30n, 1n], [1, 2])).toThrow('too small')
    expect(() => lookupTable([1n, 1n, 10n ** 400n], [1, 2, 3])).toThrow('numeric range')
    for (const p of [-1, 1.1, NaN, Infinity]) expect(() => lookupValue([[1, 1]], p)).toThrow('Probability')
    for (const table of [[], [[0, 1], [1, 2]], [[0.5, 1], [0.5, 2]], [[0.5, 1]], [[1, Infinity]], [[1.1, 1]], new Array(2)]) {
      expect(() => lookupValue(table as [number, number][], 0.25)).toThrow()
    }
  })

  it('reproduces all published Poisson lookup calibration trials', () => {
    const { arguments: seeds } = poisson.U01.rng[0]
    const sip = poisson.sips[0]
    const table = sip.arguments.value as [number, number][]
    expect(sip.function).toBe('Lookup_Table')
    for (const [counter, expected] of [[6, sip.metadata.Trial6], [23, sip.metadata.Trial23], [299, sip.metadata.Trial299]]) {
      expect(lookupValue(table, hdrUniform(counter, seeds))).toBe(expected)
    }
  })
})

describe('independent SIPmath consumer', () => {
  it('agrees with canonical publisher Metalog trials after aligning its zero-based counter', () => {
    const sip = single.sips[0]
    const values = simulateSIP(single, sip.name, 4).slice(1)
    for (const [i, expected] of [sip.metadata.Trial1, sip.metadata.Trial2, sip.metadata.Trial3].entries()) {
      expect(values[i]).toBeCloseTo(expected, 14)
      expect(metalog(hdrUniform(i + 1, single.U01.rng[0].arguments), sip.arguments.aCoefficients)).toBeCloseTo(expected, 14)
    }
  })

  it('consumes the six-term curve from the actual two-variable forecast download', () => {
    const coefficients = validateCoefficients([3, 2, 0.5, 1, 0.1, 0.3])
    const output = forecastSIPmath({ market: EXAMPLE_MARKET, coefficients, positions: 100 })
    expect(output.sips.map(sip => [sip.name, sip.function])).toEqual([
      ['forecast', 'Metalog_1_0'], ['allocation', 'Lookup_Table'],
    ])
    const file: unknown = JSON.parse(JSON.stringify(output))
    const samples = simulateSIP(file, 'forecast', 6).slice(1)
    const expected = output.sips[0].metadata.calibrationTrials
    expect(samples).toHaveLength(expected.length)
    samples.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 12))
    for (const p of [0.001, 0.01, 0.1, 0.5, 0.8, 0.99, 0.999]) {
      expect(metalog(p, coefficients)).toBeCloseTo(quantile(coefficients, p), 12)
    }
  })
})
