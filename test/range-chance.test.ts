import { describe, expect, it } from 'vitest'
import { createEqualWidthRanges, rangeEdges, shareAtOrAbove } from '../src/domain/ranges'

describe('shareAtOrAbove', () => {
  const ranges = createEqualWidthRanges(5, 1)
  const shares = [.1, .2, .3, .25, .15]
  it('answers only at range edges, including the overflow ranges', () => {
    expect(rangeEdges(ranges)).toEqual([-1.5, -.5, .5, 1.5])
    expect(shareAtOrAbove(ranges, shares, -1.5)).toBeCloseTo(.9)
    expect(shareAtOrAbove(ranges, shares, .5)).toBeCloseTo(.4)
    expect(shareAtOrAbove(ranges, shares, 1.5)).toBeCloseTo(.15)
  })
})
