export type RangeBin = {
  tierId: number
  /** null means the tier includes the entire lower or upper tail. */
  lower: number | null
  upper: number | null
  label: string
}

export const DEFAULT_RANGE_COUNT = 21
export const MIN_RANGE_COUNT = 3
export const MAX_RANGE_COUNT = 61
export const DEFAULT_RANGE_WIDTH = 1
export const MIN_RANGE_WIDTH = 0.01
export const MAX_RANGE_WIDTH = 100
export const RANGE_DECIMAL_PLACES = 4

export function validateRangeCount(count: number): number {
  if (!Number.isInteger(count) || count < MIN_RANGE_COUNT || count > MAX_RANGE_COUNT || count % 2 !== 1) {
    throw new Error(`Choose an odd number of ranges from ${MIN_RANGE_COUNT} to ${MAX_RANGE_COUNT}.`)
  }
  return count
}

export function validateRangeWidth(width: number): number {
  if (!Number.isFinite(width) || width < MIN_RANGE_WIDTH || width > MAX_RANGE_WIDTH
    || width !== Number(width.toFixed(2))) {
    throw new Error(`Range width must be ${MIN_RANGE_WIDTH} to ${MAX_RANGE_WIDTH} percentage points with at most 2 decimal places.`)
  }
  return width
}

export function formatPercentage(value: number, digits = 2): string {
  if (!Number.isFinite(value)) throw new Error('Percentage must be finite.')
  const rounded = Number(value.toFixed(digits))
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

export function createRanges(count = DEFAULT_RANGE_COUNT, width = DEFAULT_RANGE_WIDTH): RangeBin[] {
  validateRangeCount(count)
  validateRangeWidth(width)
  const finiteCount = count - 2
  const boundaries = Array.from({ length: finiteCount + 1 }, (_, index) => {
    // The advertised NFT labels and allocation boundaries must describe the same intervals.
    return Number(((index - finiteCount / 2) * width).toFixed(RANGE_DECIMAL_PLACES))
  })
  return rangesFromBoundaries(boundaries)
}

function rangesFromBoundaries(boundaries: readonly number[]): RangeBin[] {
  const count = boundaries.length + 1
  return Array.from({ length: count }, (_, index) => {
    const lower = index === 0 ? null : boundaries[index - 1]
    const upper = index === count - 1 ? null : boundaries[index]
    const label = lower === null
      ? `< ${formatPercentage(upper!, RANGE_DECIMAL_PLACES)}`
      : upper === null
        ? `≥ ${formatPercentage(lower, RANGE_DECIMAL_PLACES)}`
        : `${formatPercentage(lower, RANGE_DECIMAL_PLACES)} to < ${formatPercentage(upper, RANGE_DECIMAL_PLACES)}`
    return { tierId: index + 1, lower, upper, label }
  })
}

/** Locates an answer, not its payout; Defifa's ratified scorecard controls settlement. */
export function binForOutcome(ranges: readonly RangeBin[], outcome: number): RangeBin {
  if (!Number.isFinite(outcome)) throw new Error('Outcome must be finite.')
  const bin = ranges.find(range => (range.lower === null || outcome >= range.lower)
    && (range.upper === null || outcome < range.upper))
  if (!bin) throw new Error('No range covers this outcome.')
  return bin
}
