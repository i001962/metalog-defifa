import { marketRanges, type MarketDefinition } from '@/domain/market'
import { formatPercentage, RANGE_DECIMAL_PLACES } from '@/domain/ranges'

export function utcTime(seconds: number) {
  return new Intl.DateTimeFormat('en', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(seconds * 1000) + ' UTC'
}

export function MarketFacts({ definition }: { definition: MarketDefinition }) {
  const ranges = marketRanges(definition)
  return <details><summary>Market rules</summary><dl className="facts">
    <dt>Entry opens</dt><dd>{utcTime(definition.entryOpensAt)}</dd>
    <dt>Entry closes / observation starts</dt><dd>{utcTime(definition.entryClosesAt)}</dd>
    <dt>Observation ends</dt><dd>{utcTime(definition.resolvesAt)}</dd>
    <dt>Source</dt><dd>{definition.source}</dd>
    <dt>Observation rule</dt><dd>{definition.resolutionRule}</dd>
    <dt>Default delegate</dt><dd>{definition.defaultAttestationDelegate ?? 'None; NFT recipients delegate to themselves.'} Holders can change their voting delegate while entry is open.</dd>
    <dt>Ranges</dt><dd>{definition.rangeBoundaries === undefined
      ? <>{ranges.length - 2} equal ranges of {definition.rangeWidth}%, plus two overflow ranges.</>
      : <>{ranges.length} ranges with cutoffs at {ranges.slice(0, -1).map(range => formatPercentage(range.upper!, RANGE_DECIMAL_PLACES)).join(', ')}. Outer ranges include overflow.</>}</dd>
    <dt>Payout</dt><dd>The ratified scorecard.</dd>
  </dl><p className="hint"><a href="https://github.com/BallKidz/defifa/tree/main/src" target="_blank" rel="noreferrer">Built on Defifa, see engine code</a></p></details>
}
