import { coefficientsFromMoments, quantile } from './distribution'
import { createEqualWidthRanges, RANGE_DECIMAL_PLACES, validateCustomRangeCount, validateRangeBoundaries } from './ranges'

export const RANGE_PRESETS = [
  { id: 'equal-width', label: 'Equal width' },
  { id: 'equal-probability', label: 'Equal probability' },
  { id: 'logarithmic', label: 'Logarithmic' },
  { id: 'kmac-15m', label: 'kmac · 15 minutes' },
  { id: 'kmac-1h', label: 'kmac · 1 hour' },
  { id: 'kmac-1d', label: 'kmac · 1 day' },
] as const
export type RangePresetId = typeof RANGE_PRESETS[number]['id']

const KMAC_NAMES = ['Rekt', 'FUD', 'Copium', 'Crab', 'Hopium', 'FOMO', 'Moon']
const KMAC_BOUNDARIES = {
  'kmac-15m': [-0.25, -0.15, -0.05, 0.05, 0.15, 0.25],
  'kmac-1h': [-0.5, -0.3, -0.1, 0.1, 0.3, 0.5],
  'kmac-1d': [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5],
}

/** Recipes are explicit starting points; every result uses canonical cutoff precision. */
export function buildRangePreset(id: RangePresetId, options: { count: number; width: number; mean: number; sigma: number }): { boundaries: number[]; names?: string[] } {
  if (id === 'kmac-15m' || id === 'kmac-1h' || id === 'kmac-1d') {
    return { boundaries: [...KMAC_BOUNDARIES[id]], names: [...KMAC_NAMES] }
  }
  const count = validateCustomRangeCount(options.count)
  if (id === 'equal-width') {
    return { boundaries: createEqualWidthRanges(count, options.width).slice(0, -1).map(range => range.upper!) }
  }
  let boundaries: number[]
  if (id === 'equal-probability') {
    const coefficients = coefficientsFromMoments(options.mean, options.sigma)
    boundaries = Array.from({ length: count - 1 }, (_, index) => quantile(coefficients, (index + 1) / count))
  } else if (id === 'logarithmic') {
    boundaries = Array.from({ length: count - 1 }, (_, index) => {
      const position = 2 * (index + 1) / count - 1
      return Math.sign(position) * Math.expm1(Math.log(101) * Math.abs(position))
    })
  } else {
    throw new Error('Choose an available range preset.')
  }
  return { boundaries: validateRangeBoundaries(boundaries.map(value => Number(value.toFixed(RANGE_DECIMAL_PLACES)))) }
}
