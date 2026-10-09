import type { MarketSnapshot } from './defifa'

/** The view and API share the same interpretation of live circulating supply. */
export function marketData(market: MarketSnapshot) {
  const supplies = market.tiers.map(tier => BigInt(tier.supply))
  const total = supplies.reduce((sum, supply) => sum + supply, 0n)
  const entrySupplies = market.tiers.every(tier => tier.entrySupply !== null && tier.entrySupply !== undefined)
    ? market.tiers.map(tier => BigInt(tier.entrySupply!)) : null
  const entryTotal = entrySupplies?.reduce((sum, supply) => sum + supply, 0n)
  const payoutTotal = market.ratifiedWeights ? BigInt(market.cashOutWeightTotal) : 0n
  return {
    ...market,
    schema: 'metalog.market.v1',
    positionDistribution: {
      source: 'circulating-supply',
      weighting: 'stake',
      unit: 'probability-mass',
      totalSupply: total.toString(),
      probabilities: total === 0n ? null : supplies.map(supply => Number(supply) / Number(total)),
      asOfBlock: market.blockNumber,
      asOfTimestamp: market.blockTimestamp,
      historicalEntrySnapshot: false,
    },
    openingDistribution: entrySupplies && entryTotal !== undefined ? {
      source: 'entry-close-supply', weighting: 'stake', unit: 'probability-mass', totalSupply: entryTotal.toString(),
      probabilities: entryTotal === 0n ? null : entrySupplies.map(supply => Number(supply) / Number(entryTotal)),
      asOfBlock: market.blockNumber, reconstructedFromRedemptions: market.stage === 'complete',
    } : null,
    ratifiedPayoutShares: payoutTotal > 0n ? market.ratifiedWeights!.map(weight => Number(weight.weight) / Number(payoutTotal)) : null,
    tradingDistribution: null,
  }
}
