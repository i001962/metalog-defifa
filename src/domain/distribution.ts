/** Metalog coefficients use percentage points, so a mean of 2 is a 2% change. */
export type Coefficients = readonly [number, number, number, number, number, number]

export const MAX_COEFFICIENT_MAGNITUDE = 1_000_000

/**
 * Accept a conservative subset of feasible 2–6 term unbounded metalogs.
 * Equations: https://www.metalogdistributions.com/equations.html
 */
export function validateCoefficients(input: readonly number[]): Coefficients {
  if (!Array.isArray(input) || input.length < 2 || input.length > 6) {
    throw new Error('Enter an array of 2 to 6 coefficients.')
  }
  if (Array.from(input).some(value => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error('Every coefficient must be a finite number.')
  }
  if (input.some(value => Math.abs(value) > MAX_COEFFICIENT_MAGNITUDE)) {
    throw new Error(`Coefficients must be between −${MAX_COEFFICIENT_MAGNITUDE} and ${MAX_COEFFICIENT_MAGNITUDE}.`)
  }

  const a: Coefficients = [input[0], input[1], input[2] ?? 0, input[3] ?? 0, input[4] ?? 0, input[5] ?? 0]
  // With z=p−½, v=p(1−p), h=v logit(p): |h|≤¼, |z|≤½ and zh≥0.
  // Bound vQ′ = a2+a3(z+h)+a4v+2a5zv+a6(z²+2zh) over the entire interval.
  const lowerBound = a[1] - 0.75 * Math.abs(a[2]) + Math.min(0, a[3]) / 4
    - Math.abs(a[4]) / 4 + Math.min(0, a[5]) / 2
  const margin = Number.EPSILON * 64 * Math.max(1, ...a.map(Math.abs))
  if (lowerBound <= margin) {
    // ponytail: some valid shapes fail this sufficient condition; interval certification can broaden it.
    throw new Error('This curve could not be verified. Adjust the coefficients or use mean and standard deviation.')
  }
  return Object.freeze(a)
}

export function coefficientsFromMoments(mean: number, sigma: number): Coefficients {
  if (!Number.isFinite(mean) || !Number.isFinite(sigma) || sigma <= 0) {
    throw new Error('Mean must be finite and standard deviation must be greater than zero.')
  }
  // A two-term logistic metalog has mean a1 and standard deviation a2π/√3 exactly.
  return validateCoefficients([mean, sigma * Math.sqrt(3) / Math.PI])
}

/** Fit the first three Metalog terms to the 10th, 50th and 90th percentiles. */
export function coefficientsFromPercentiles(low: number, median: number, high: number): Coefficients {
  if (![low, median, high].every(Number.isFinite)) {
    throw new Error('Enter a finite value for each percentile.')
  }
  if (!(low < median && median < high)) {
    throw new Error('Low outcome must be below the median, and the median below the high outcome.')
  }
  const logit = Math.log(9)
  const lowerDistance = median - low
  const upperDistance = high - median
  const baseSpread = (lowerDistance + upperDistance) / (2 * logit)
  const tailAsymmetry = (upperDistance - lowerDistance) / (0.8 * logit)
  try {
    return validateCoefficients([median, baseSpread, tailAsymmetry])
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith('This curve could not be verified')) {
      throw new Error('These estimates do not currently produce a curve we can verify. Adjust the percentile values.')
    }
    throw cause
  }
}

export type QuantilePoint = { probability: number; outcome: number }

/** Fit a Metalog to user-supplied quantiles; overdetermined inputs use least squares. */
export function coefficientsFromQuantilePoints(points: readonly QuantilePoint[], seed: Coefficients): Coefficients {
  if (!Array.isArray(points) || points.length < 1) throw new Error('Add at least one quantile point.')
  const sorted = [...points].sort((left, right) => left.probability - right.probability)
  if (sorted.some(({ probability, outcome }) => !Number.isFinite(probability) || probability <= 0 || probability >= 1
    || !Number.isFinite(outcome))) {
    throw new Error('Enter probabilities above 0% and below 100%, with finite outcomes.')
  }
  if (new Set(sorted.map(point => point.probability)).size !== sorted.length) {
    throw new Error('Each quantile point needs a different probability.')
  }
  if (sorted.some((point, index) => index > 0 && point.outcome <= sorted[index - 1].outcome)) {
    throw new Error('Outcomes must increase as probability increases.')
  }

  if (sorted.length === 1) {
    const [point] = sorted
    const reference = quantile(validateCoefficients(seed), point.probability)
    return validateCoefficients([seed[0] + point.outcome - reference, ...seed.slice(1)])
  }

  const terms = Math.min(sorted.length, 6)
  const matrix = sorted.map(({ probability }) => quantileBasis(probability).slice(0, terms))
  const fitted = leastSquares(matrix, sorted.map(point => point.outcome))
  return validateCoefficients(fitted)
}

function quantileBasis(p: number): number[] {
  const z = p - 0.5
  const logit = Math.log(p) - Math.log1p(-p)
  return [1, logit, z * logit, z, z * z, z * z * logit]
}

/** Householder QR keeps the overdetermined fit stable without normal equations. */
function leastSquares(matrix: readonly (readonly number[])[], values: readonly number[]): number[] {
  const columns = matrix[0]?.length ?? 0
  const a = matrix.map(row => [...row])
  const b = [...values]
  for (let column = 0; column < columns; column++) {
    let norm = 0
    for (let row = column; row < a.length; row++) norm = Math.hypot(norm, a[row][column])
    if (!Number.isFinite(norm) || norm < 1e-12) {
      throw new Error('These probability points are too close together to fit. Spread them farther apart.')
    }
    const alpha = a[column][column] >= 0 ? -norm : norm
    const vector = a.slice(column).map((row, offset) => row[column] + (offset === 0 ? -alpha : 0))
    const magnitude = vector.reduce((sum, value) => sum + value * value, 0)
    if (!Number.isFinite(magnitude) || magnitude === 0) {
      throw new Error('These probability points are too close together to fit. Spread them farther apart.')
    }
    const scale = 2 / magnitude
    for (let target = column; target < columns; target++) {
      let projection = 0
      for (let offset = 0; offset < vector.length; offset++) projection += vector[offset] * a[column + offset][target]
      for (let offset = 0; offset < vector.length; offset++) a[column + offset][target] -= scale * projection * vector[offset]
    }
    let projection = 0
    for (let offset = 0; offset < vector.length; offset++) projection += vector[offset] * b[column + offset]
    for (let offset = 0; offset < vector.length; offset++) b[column + offset] -= scale * projection * vector[offset]
  }

  const result = Array(columns).fill(0) as number[]
  for (let row = columns - 1; row >= 0; row--) {
    let value = b[row]
    for (let column = row + 1; column < columns; column++) value -= a[row][column] * result[column]
    const diagonal = a[row][row]
    if (!Number.isFinite(diagonal) || Math.abs(diagonal) < 1e-12) {
      throw new Error('These probability points are too close together to fit. Spread them farther apart.')
    }
    result[row] = value / diagonal
  }
  return result
}

export function parseCoefficients(text: string): Coefficients {
  if (text.length > 1_024) throw new Error('The coefficient array is too long.')
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    throw new Error('Enter coefficients as a JSON array, for example [0, 1].')
  }
  if (!Array.isArray(input)) throw new Error('Enter an array of 2 to 6 coefficients.')
  return validateCoefficients(input)
}

export function parseCoefficientFields(values: readonly string[]): Coefficients {
  if (!Array.isArray(values) || values.length !== 6) throw new Error('Enter all six coefficients.')
  return validateCoefficients(Array.from(values, (value, index) => {
    const text = typeof value === 'string' ? value.trim() : ''
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) || !Number.isFinite(Number(text))) {
      throw new Error(`Enter a finite number for a${index + 1}.`)
    }
    return Number(text)
  }))
}

function evaluateCenteredQuantile(a: Coefficients, p: number): number {
  const z = p - 0.5
  const logit = Math.log(p) - Math.log1p(-p)
  return a[3] * z + a[4] * z * z + (a[1] + a[2] * z + a[5] * z * z) * logit
}

function evaluateDerivative(a: Coefficients, p: number): number {
  const z = p - 0.5
  const logit = Math.log(p) - Math.log1p(-p)
  const v = p * (1 - p)
  return (a[1] + a[2] * z + a[5] * z * z) / v
    + (a[2] + 2 * a[5] * z) * logit + a[3] + 2 * a[4] * z
}

export function quantile(coefficients: Coefficients, p: number): number {
  const a = validateCoefficients(coefficients)
  if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error('Probability must be between 0 and 1.')
  if (p === 0) return -Infinity
  if (p === 1) return Infinity
  return a[0] + evaluateCenteredQuantile(a, p)
}

export function cdf(coefficients: Coefficients, outcome: number): number {
  const a = validateCoefficients(coefficients)
  if (typeof outcome !== 'number' || Number.isNaN(outcome)) throw new Error('Outcome must be a number.')
  if (outcome === -Infinity) return 0
  if (outcome === Infinity) return 1
  // Compare centered values so a large location does not swallow a narrow spread.
  const centeredOutcome = outcome - a[0]
  let lower = 0
  let upper = 1
  for (let i = 0; i < 56; i++) {
    const midpoint = (lower + upper) / 2
    if (midpoint === lower || midpoint === upper) break
    if (evaluateCenteredQuantile(a, midpoint) < centeredOutcome) lower = midpoint
    else upper = midpoint
  }
  return (lower + upper) / 2
}

export function pdf(coefficients: Coefficients, outcome: number): number {
  const a = validateCoefficients(coefficients)
  const p = cdf(a, outcome)
  if (p === 0 || p === 1 || !Number.isFinite(outcome)) return 0
  return 1 / evaluateDerivative(a, p)
}

export type DensityBucket = { lower: number; upper: number; density: number; mass: number }

/** Average density over each display interval preserves area even for sub-pixel spikes. */
export function densityBuckets(coefficients: Coefficients, count = 240, bounds?: { low: number; high: number }) {
  if (!Number.isInteger(count) || count < 2 || count > 1_024) {
    throw new Error('Choose 2 to 1024 density buckets.')
  }
  const a = validateCoefficients(coefficients)
  if (bounds !== undefined && (bounds === null || !Number.isFinite(bounds.low) || !Number.isFinite(bounds.high)
    || bounds.high <= bounds.low || !Number.isFinite(bounds.high - bounds.low))) {
    throw new Error('Density bounds must be finite and increasing.')
  }
  const low = bounds === undefined ? quantile(a, 0.005) : bounds.low
  const high = bounds === undefined ? quantile(a, 0.995) : bounds.high
  const lowerCdf = cdf(a, low)
  let previousCdf = lowerCdf
  let lower = low
  const buckets: DensityBucket[] = []
  for (let i = 1; i <= count; i++) {
    const upper = i === count ? high : low + (high - low) * i / count
    if (upper <= lower) throw new Error('This curve is too narrow to display at this resolution.')
    const upperCdf = cdf(a, upper)
    const mass = upperCdf - previousCdf
    buckets.push({ lower, upper, density: mass / (upper - lower), mass })
    lower = upper
    previousCdf = upperCdf
  }
  return { low, high, buckets, visibleMass: previousCdf - lowerCdf, peak: Math.max(...buckets.map(bucket => bucket.density)) }
}
