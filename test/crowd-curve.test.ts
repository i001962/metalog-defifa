import { describe, expect, it } from 'vitest'
import { cdf, coefficientsFromMoments, fitMetalog, quantile } from '../src/domain/distribution'
import { createEqualWidthRanges, curveFromPositions, rangeEdges, shareAtOrAbove, smoothShareAtOrAbove } from '../src/domain/ranges'

describe('crowd curve from positions', () => {
  it('recovers a curve from its own quantiles', () => {
    const truth = coefficientsFromMoments(.4, 1.3)
    const fit = fitMetalog([.1, .25, .5, .75, .9].map(p => ({ p, value: quantile(truth, p) })))!
    for (const p of [.2, .5, .8]) expect(quantile(fit, p)).toBeCloseTo(quantile(truth, p), 6)
  })
  it('fits positions and matches them exactly at every range edge', () => {
    const ranges = createEqualWidthRanges(7, 1)
    const counts = [3, 11, 24, 21, 14, 10, 17]
    const curve = curveFromPositions(ranges, counts)!
    expect(curve).not.toBeNull()
    for (const edge of rangeEdges(ranges)) expect(smoothShareAtOrAbove(ranges, counts, curve, edge)).toBeCloseTo(shareAtOrAbove(ranges, counts, edge) / 100, 12)
    // Between edges the answer moves smoothly and stays between its neighbors.
    const between = smoothShareAtOrAbove(ranges, counts, curve, 0)
    expect(between).toBeLessThan(shareAtOrAbove(ranges, counts, -.5) / 100)
    expect(between).toBeGreaterThan(shareAtOrAbove(ranges, counts, .5) / 100)
    expect(cdf(curve, 0)).toBeGreaterThan(0)
  })
  it('needs positions on both sides of an edge', () => {
    const ranges = createEqualWidthRanges(5, 1)
    expect(curveFromPositions(ranges, [0, 0, 0, 0, 0])).toBeNull()
    expect(curveFromPositions(ranges, [0, 0, 9, 0, 0])).toBeNull()
  })
})
