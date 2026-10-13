import { marketRanges, validateMarket } from '@/domain/market'
import type { MarketSnapshot } from './defifa'
import { marketData } from './market-data'
import { buildSIPmath, type SipVariable } from './sipmath'

function supplyCount(value: string): bigint {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new Error('Snapshot position supply must be a non-negative integer string.')
  }
  return BigInt(value)
}

/** Export observed tier categories without inventing outcomes inside their ranges. */
export function marketSIPmath(snapshot: MarketSnapshot) {
  const definition = validateMarket(snapshot.definition)
  const ranges = marketRanges(definition)
  if (snapshot.ranges.length !== ranges.length || snapshot.tiers.length !== ranges.length
    || ranges.some((range, index) => {
      const observed = snapshot.ranges[index]
      return observed.tierId !== range.tierId || observed.lower !== range.lower || observed.upper !== range.upper
        || observed.label !== range.label || snapshot.tiers[index].tierId !== range.tierId
    })) throw new Error('Snapshot ranges and tiers do not match the market definition.')

  const circulating = snapshot.tiers.map(tier => supplyCount(tier.supply))
  const opening = snapshot.tiers.map(tier => tier.entrySupply === null || tier.entrySupply === undefined
    ? null : supplyCount(tier.entrySupply))
  const native = marketData({ ...snapshot, definition, ranges })
  const availability = {
    circulating: native.positionDistribution.probabilities === null ? 'empty' : 'available',
    opening: native.openingDistribution === null ? 'unavailable'
      : native.openingDistribution.probabilities === null ? 'empty' : 'available',
  }
  const tierIds = ranges.map(range => range.tierId)
  const categoryMetadata = { weighting: 'stake', unit: 'tier-id', asOfBlock: snapshot.blockNumber, ranges,
    interpretation: 'Tier IDs are categories, not percentage outcomes or payout amounts. No within-range outcome distribution is assumed.' }
  const variables: SipVariable[] = []
  if (availability.circulating === 'available') variables.push({
    name: 'circulating_tier', kind: 'discrete', tierIds, counts: circulating,
    metadata: { ...categoryMetadata, source: 'circulating-supply' },
  })
  if (availability.opening === 'available') variables.push({
    name: 'opening_tier', kind: 'discrete', tierIds, counts: opening as bigint[],
    metadata: { ...categoryMetadata, source: 'entry-close-supply',
      reconstructedFromRedemptions: native.openingDistribution!.reconstructedFromRedemptions },
  })
  const source = { kind: 'market-snapshot', chainId: snapshot.chainId, projectId: snapshot.projectId, hook: snapshot.hook,
    blockNumber: snapshot.blockNumber, blockTimestamp: snapshot.blockTimestamp, definition }
  return buildSIPmath({ name: `Metalog market ${snapshot.chainId}:${snapshot.projectId}`, source, audit: { native, availability }, variables })
}
