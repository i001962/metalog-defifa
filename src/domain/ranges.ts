import { cdf, fitMetalog, type Coefficients } from './distribution'

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
const RANGE_SCALE = 10 ** RANGE_DECIMAL_PLACES
const COMPLETE_CUTOFF = new RegExp(`^[+-]?(?:\\d+(?:\\.\\d{1,${RANGE_DECIMAL_PLACES}})?|\\.\\d{1,${RANGE_DECIMAL_PLACES}})$`)
// Both cutoffs and their full span fit safely in integer ten-thousandths.
export const MAX_RANGE_BOUNDARY = Math.floor(Number.MAX_SAFE_INTEGER / 2) / RANGE_SCALE

export function validateRangeCount(count: number): number {
  if (!Number.isInteger(count) || count < MIN_RANGE_COUNT || count > MAX_RANGE_COUNT || count % 2 !== 1) {
    throw new Error(`Choose an odd number of ranges from ${MIN_RANGE_COUNT} to ${MAX_RANGE_COUNT}.`)
  }
  return count
}

/** Advanced layouts may have an even number of tiers. */
export function validateCustomRangeCount(count: number): number {
  if (!Number.isInteger(count) || count < MIN_RANGE_COUNT || count > MAX_RANGE_COUNT) {
    throw new Error(`Choose ${MIN_RANGE_COUNT} to ${MAX_RANGE_COUNT} ranges.`)
  }
  return count
}

export function validateRangeNames(input: unknown, count: number): string[] | undefined {
  if (input === undefined) return undefined
  if (!Array.isArray(input) || input.length !== count) throw new Error('Provide one name for every range.')
  const names = Array.from(input, name => {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) {
      throw new Error('Range names must contain 1 to 40 characters.')
    }
    return name.trim()
  })
  if (new Set(names).size !== names.length) throw new Error('Range names must be unique.')
  return names
}

export function namedRanges(ranges: readonly RangeBin[], input?: unknown): RangeBin[] {
  const names = validateRangeNames(input, ranges.length)
  return names ? ranges.map((range, index) => ({ ...range, label: `${names[index]} · ${range.label}` })) : [...ranges]
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

export function validateRangeBoundaries(boundaries: readonly number[]): number[] {
  if (!Array.isArray(boundaries) || boundaries.length < MIN_RANGE_COUNT - 1 || boundaries.length > MAX_RANGE_COUNT - 1) {
    throw new Error(`Enter ${MIN_RANGE_COUNT - 1} to ${MAX_RANGE_COUNT - 1} cutoffs.`)
  }
  let previous = -Infinity
  return Array.from(boundaries, (value, index) => {
    value = validateRangeBoundary(value, index)
    const scaled = Math.round(value * RANGE_SCALE)
    if (scaled <= previous) throw new Error(boundaryOrderIssue(index - 1, index))
    previous = scaled
    return value === 0 ? 0 : value
  })
}

/** Incomplete editor text is invalid, never a silently substituted zero. */
export function parseRangeBoundaries(fields: readonly string[]): number[] {
  if (!Array.isArray(fields)) throw new Error('Enter a value for every cutoff.')
  const values = Array.from(fields, parseRangeBoundaryText)
  return validateRangeBoundaries(values)
}

function validateRangeBoundary(value: number, index: number): number {
  const scaled = Math.round(value * RANGE_SCALE)
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > MAX_RANGE_BOUNDARY
    || !Number.isSafeInteger(scaled) || scaled / RANGE_SCALE !== value
    || value !== Number(value.toFixed(RANGE_DECIMAL_PLACES))) {
    throw new Error(`Boundary ${index + 1} must be a finite percentage within ±${MAX_RANGE_BOUNDARY} with at most ${RANGE_DECIMAL_PLACES} decimal places.`)
  }
  return value === 0 ? 0 : value
}

function parseRangeBoundaryText(field: string, index: number): number {
  if (typeof field !== 'string' || !COMPLETE_CUTOFF.test(field.trim())) {
    throw new Error(`Enter a complete percentage for Boundary ${index + 1}, with at most ${RANGE_DECIMAL_PLACES} decimal places.`)
  }
  return Number(field.trim())
}

/** Parses one editor field with the same precision rules as a complete layout. */
export function parseRangeBoundary(field: string, index = 0): number {
  return validateRangeBoundary(parseRangeBoundaryText(field, index), index)
}

function boundaryOrderIssue(lowerIndex: number, upperIndex: number): string {
  return `Boundary ${lowerIndex + 1} must be less than Boundary ${upperIndex + 1}; boundaries must stay in strictly increasing order.`
}

/** Errors stay beside every involved field, while invalid text remains intact. */
export function rangeBoundaryIssues(fields: readonly string[]): Record<number, string> {
  const issues: Record<number, string> = {}
  const values = Array.from(fields, (field, index) => {
    try { return parseRangeBoundary(field, index) }
    catch (error) {
      issues[index] = error instanceof Error ? error.message : 'Enter a valid percentage.'
      return null
    }
  })
  for (let index = 1; index < values.length; index++) {
    const lower = values[index - 1], upper = values[index]
    if (lower !== null && upper !== null && lower >= upper) {
      const message = boundaryOrderIssue(index - 1, index)
      issues[index - 1] = message
      issues[index] = message
    }
  }
  return issues
}

/** Deliberate values anchor equal spacing; all other cutoffs refill the remaining span. */
export function redistributeRangeBoundaries(current: readonly number[], index: number, value: number, fixedIndices: readonly number[]): number[] {
  const boundaries = validateRangeBoundaries(current)
  if (!Number.isInteger(index) || index < 0 || index >= boundaries.length
    || fixedIndices.some(fixed => !Number.isInteger(fixed) || fixed < 0 || fixed >= boundaries.length)) {
    throw new Error('Choose an existing boundary.')
  }
  boundaries[index] = validateRangeBoundary(value, index)
  const anchors = [...new Set([0, boundaries.length - 1, index, ...fixedIndices])].sort((a, b) => a - b)
  return fillRangeBoundaries(boundaries, anchors)
}

function fillRangeBoundaries(boundaries: number[], anchors: number[]): number[] {
  for (let anchor = 1; anchor < anchors.length; anchor++) {
    const lowerIndex = anchors[anchor - 1], upperIndex = anchors[anchor]
    const lower = Math.round(boundaries[lowerIndex] * RANGE_SCALE)
    const upper = Math.round(boundaries[upperIndex] * RANGE_SCALE)
    if (upper <= lower) throw new Error(boundaryOrderIssue(lowerIndex, upperIndex))
    const steps = upperIndex - lowerIndex
    if (upper - lower < steps) {
      throw new Error(`Boundary ${lowerIndex + 1} and Boundary ${upperIndex + 1} need at least ${(steps / RANGE_SCALE).toFixed(RANGE_DECIMAL_PLACES)} percentage points between them to fit the remaining ranges.`)
    }
    // Integer interpolation keeps all spans exact, including near the safe numeric limit.
    const span = BigInt(upper - lower), divisor = BigInt(steps)
    for (let offset = 1; offset < steps; offset++) {
      const distance = Number((span * BigInt(offset) + divisor / 2n) / divisor)
      boundaries[lowerIndex + offset] = (lower + distance) / RANGE_SCALE
    }
  }
  return validateRangeBoundaries(boundaries)
}

/** Explicit rebuilding releases interior anchors while preserving the outer extent. */
export function resizeRangeBoundaries(current: readonly number[], count: number): number[] {
  const previous = validateRangeBoundaries(current)
  const boundaries = new Array<number>(validateCustomRangeCount(count) - 1).fill(0)
  boundaries[0] = previous[0]
  boundaries[boundaries.length - 1] = previous[previous.length - 1]
  return fillRangeBoundaries(boundaries, [0, boundaries.length - 1])
}

export function createCustomRanges(boundaries: readonly number[]): RangeBin[] {
  return rangesFromBoundaries(validateRangeBoundaries(boundaries))
}

export function createRanges(count = DEFAULT_RANGE_COUNT, width = DEFAULT_RANGE_WIDTH): RangeBin[] {
  validateRangeCount(count)
  return createEqualWidthRanges(count, width)
}

/** Equal-width geometry shared by Simple and Advanced recipes. */
export function createEqualWidthRanges(count: number, width: number): RangeBin[] {
  validateCustomRangeCount(count)
  validateRangeWidth(width)
  const finiteCount = count - 2
  const boundaries = Array.from({ length: finiteCount + 1 }, (_, index) => {
    // The advertised position labels and allocation boundaries must describe the same intervals.
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

/** The edges between ranges, low to high: where "at or above" questions can be answered exactly. */
export function rangeEdges(ranges: readonly RangeBin[]): number[] {
  return [...new Set(ranges.flatMap(range => [range.lower, range.upper]).filter((edge): edge is number => edge !== null))].sort((a, b) => a - b)
}

/** The share of outcomes at or above an edge: every range that starts at or past it. */
export function shareAtOrAbove(ranges: readonly RangeBin[], shares: readonly number[], edge: number): number {
  return ranges.reduce((sum, range, index) => range.lower !== null && range.lower >= edge ? sum + (shares[index] ?? 0) : sum, 0)
}

/** A smooth curve through the positions' cumulative share at each range edge, so only real positions shape it. */
export function curveFromPositions(ranges: readonly RangeBin[], counts: readonly number[]): Coefficients | null {
  const total = counts.reduce((sum, count) => sum + count, 0)
  if (!(total > 0)) return null
  return fitMetalog(rangeEdges(ranges).map(edge => ({ p: 1 - shareAtOrAbove(ranges, counts, edge) / total, value: edge })))
}

/** Share at or above any value: exact at range edges, spread within a range by the fitted curve's shape. */
export function smoothShareAtOrAbove(ranges: readonly RangeBin[], counts: readonly number[], curve: Coefficients, outcome: number): number {
  const total = counts.reduce((sum, count) => sum + count, 0)
  if (!(total > 0)) return 0
  const bin = binForOutcome(ranges, outcome)
  const lower = bin.lower ?? -Infinity, upper = bin.upper ?? Infinity
  const atLower = cdf(curve, lower), atUpper = cdf(curve, upper)
  const inside = atUpper - atLower > 1e-12 ? (atUpper - cdf(curve, outcome)) / (atUpper - atLower)
    : Number.isFinite(lower) && Number.isFinite(upper) ? (upper - outcome) / (upper - lower) : 0.5
  return (shareAtOrAbove(ranges, counts, upper) + counts[ranges.indexOf(bin)] * inside) / total
}
