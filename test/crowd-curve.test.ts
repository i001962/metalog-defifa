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
  it('follows the bars where most positions sit, not the thin tails', () => {
    // Base game 28: a peaked crowd that an unweighted fit flattened to 18% below where the bars put 41%.
    const ranges = [-3.3033, -2.4824, -1.9757, -1.5955, -1.2826, -1.0104, -0.7643, -0.5353, -0.3172, -0.1051]
    const edges = [...ranges, ...ranges.toReversed().map(edge => -edge)]
    const bins = [{ tierId: 1, lower: null, upper: edges[0], label: '' }, ...edges.slice(1).map((upper, index) => ({ tierId: index + 2, lower: edges[index], upper, label: '' })),
      { tierId: 21, lower: edges.at(-1)!, upper: null, label: '' }]
    const counts = [1, 1, 1, 2, 2, 4, 9, 17, 33, 96, 77, 46, 39, 31, 21, 12, 6, 4, 3, 1, 1]
    const curve = curveFromPositions(bins, counts)!
    const total = counts.reduce((sum, count) => sum + count, 0)
    for (const edge of edges) expect(Math.abs(cdf(curve, edge) - (1 - shareAtOrAbove(bins, counts, edge) / total))).toBeLessThan(.03)
  })
  it('needs positions on both sides of an edge', () => {
    const ranges = createEqualWidthRanges(5, 1)
    expect(curveFromPositions(ranges, [0, 0, 0, 0, 0])).toBeNull()
    expect(curveFromPositions(ranges, [0, 0, 9, 0, 0])).toBeNull()
  })
})
