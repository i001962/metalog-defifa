/** Conservative portable HDR profile: seven-digit seeds and an eight-digit trial index. */
export const MAX_HDR_SEED = 9_999_999
export const MAX_HDR_COUNTER = 99_999_999

export type HdrSeeds = { entity: number; varId: number; seed3: number; seed4: number }
export type LookupRow = readonly [probability: number, value: number]

/**
 * HDR_2_0, using exact integer arithmetic before the final U(0,1) conversion.
 * Formula and seed ordering: https://www.probabilitymanagement.org/hdr
 * Counter zero is defined; publisher calibration trials start at counter one.
 */
export function hdrUniform(counter: number, seeds: HdrSeeds): number {
  if (!Number.isInteger(counter) || counter < 0 || counter > MAX_HDR_COUNTER) {
    throw new Error(`HDR counter must be a whole number from 0 to ${MAX_HDR_COUNTER}.`)
  }
  const inputs = [seeds?.entity, seeds?.varId, seeds?.seed3, seeds?.seed4]
  if (inputs.some(value => !Number.isInteger(value) || value < 0 || value > MAX_HDR_SEED)) {
    throw new Error(`HDR seeds must be whole numbers from 0 to ${MAX_HDR_SEED}.`)
  }
  const [trial, entity, varId, seed3, seed4] = [counter, ...inputs].map(BigInt)
  const prime = 999_999_999_999_989n
  const leftInput = trial * 2_499_997n + varId * 1_800_451n + entity * 2_000_371n + seed3 * 1_796_777n + seed4 * 2_299_603n
  const rightInput = trial * 2_246_527n + varId * 2_399_993n + entity * 2_100_869n + seed3 * 1_918_303n + seed4 * 1_624_729n
  const left = (prime % (leftInput % 7_450_589n * 4_658n + 7_450_581n)) * 383n % 99_991n
  const right = (prime % (rightInput % 7_450_987n * 7_580n + 7_560_584n)) * 17_669n % 7_440_893n
  const integer = (left * 7_440_893n + right) * 1_343n % 4_294_967_296n
  return (Number(integer) + 0.5) / 4_294_967_296
}

/** Cumulative categorical probabilities; tier IDs are labels, never invented outcomes. */
export function lookupTable(counts: readonly bigint[], tierIds: readonly number[]): [number, number][] {
  if (!Array.isArray(counts) || !Array.isArray(tierIds) || counts.length !== tierIds.length
    || Array.from(counts).some(count => typeof count !== 'bigint' || count < 0n)
    || Array.from(tierIds).some(id => !Number.isSafeInteger(id) || id <= 0)
    || new Set(tierIds).size !== tierIds.length) {
    throw new Error('A lookup table needs nonnegative integer counts and unique positive tier IDs.')
  }
  const total = counts.reduce((sum, count) => sum + count, 0n)
  if (total === 0n) return []
  const numericTotal = Number(total)
  if (!Number.isFinite(numericTotal)) throw new Error('NFT totals exceed the numeric range of a SIP lookup table.')
  let cumulative = 0n
  let previous = 0
  const rows: [number, number][] = []
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] === 0n) continue
    cumulative += counts[i]
    const probability = cumulative === total ? 1 : Number(cumulative) / numericTotal
    if (probability <= previous || (cumulative < total && probability >= 1)) {
      throw new Error('A positive tier share is too small to represent in a SIP lookup table.')
    }
    rows.push([probability, tierIds[i]])
    previous = probability
  }
  return rows
}

/** Inverse discrete CDF: return the first value whose cumulative probability is at least p. */
export function lookupValue(table: readonly LookupRow[], p: number): number {
  if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error('Probability must be between 0 and 1.')
  if (!Array.isArray(table) || table.length === 0) throw new Error('A lookup table must contain probability rows.')
  let previous = 0
  for (const row of table) {
    if (!Array.isArray(row) || row.length !== 2 || !Number.isFinite(row[0]) || row[0] <= previous
      || row[0] > 1 || !Number.isFinite(row[1])) {
      throw new Error('Lookup probabilities must increase strictly and values must be finite.')
    }
    previous = row[0]
  }
  if (previous !== 1) throw new Error('Lookup probabilities must end at one.')
  return table.find(row => row[0] >= p)![1]
}
