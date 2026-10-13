import { describe, expect, it } from 'vitest'
import { cdf, coefficientsFromMoments, densityBuckets, mixtureBuckets, mixtureCdf } from '../src/domain/distribution'

const left = coefficientsFromMoments(-1, 1), right = coefficientsFromMoments(2, 1)
const bounds = { low: -5, high: 5 }

describe('crowd mixture', () => {
  it('equals the curve itself for one entry, whatever its weight', () => {
    expect(mixtureCdf([{ coefficients: left, weight: 7 }], .5)).toBeCloseTo(cdf(left, .5), 12)
    expect(mixtureBuckets([{ coefficients: left, weight: 7 }], 40, bounds).buckets[10].mass)
      .toBeCloseTo(densityBuckets(left, 40, bounds).buckets[10].mass, 12)
  })
  it('weights each curve by the positions it bought', () => {
    const mixed = mixtureCdf([{ coefficients: left, weight: 3 }, { coefficients: right, weight: 1 }], .5)
    expect(mixed).toBeCloseTo((3 * cdf(left, .5) + cdf(right, .5)) / 4, 12)
  })
  it('refuses a crowd with no weight', () => {
    expect(() => mixtureCdf([], 0)).toThrow()
    expect(() => mixtureBuckets([{ coefficients: left, weight: 0 }], 10, bounds)).toThrow()
  })
})
