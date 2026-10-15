import { parseUnits } from 'viem'

export const SCORECARD_WEIGHT_TOTAL = 1_000_000_000_000_000_000n
export type TierWeight = { tierId: number; weight: string }

/** Percentages have 16 fractional places because 100% equals 1e18 native scorecard units. */
export function scorecardWeightsFromPercentages(
  ranges: readonly { tierId: number }[], values: readonly string[],
): TierWeight[] {
  if (values.length !== ranges.length || !values.length) throw new Error('Enter a percentage for every range.')
  const weights = values.map((raw, i) => {
    const value = raw.trim() || '0'
    if (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,16})?$/.test(value)) {
      throw new Error('Result percentages must be nonnegative decimals with at most 16 decimal places.')
    }
    return { tierId: ranges[i].tierId, weight: parseUnits(value, 16).toString() }
  })
  if (weights.reduce((sum, item) => sum + BigInt(item.weight), 0n) !== SCORECARD_WEIGHT_TOTAL) {
    throw new Error('Result percentages must add to exactly 100%.')
  }
  return weights.filter(item => item.weight !== '0')
}

/** Attestation power each range with positions adds to the base quorum (DefifaGovernor). */
export const MAX_ATTESTATION_POWER_TIER = 1_000_000_000n

/**
 * The quorum a result must reach, as the governor snapshots it at submission: the base quorum
 * plus a penalty that grows with the square of the largest payout share, so a result paying one
 * range needs nearly every other range to attest.
 */
export function scorecardQuorum(baseQuorum: bigint, weights: readonly TierWeight[]): bigint {
  if (baseQuorum < MAX_ATTESTATION_POWER_TIER) return baseQuorum
  let headroom = baseQuorum - MAX_ATTESTATION_POWER_TIER
  if (headroom > BigInt(weights.length)) headroom -= BigInt(weights.length)
  const largest = weights.reduce((max, item) => BigInt(item.weight) > max ? BigInt(item.weight) : max, 0n)
  return baseQuorum + headroom * (largest * largest / SCORECARD_WEIGHT_TOTAL) / SCORECARD_WEIGHT_TOTAL
}
