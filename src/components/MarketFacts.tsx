import type { MarketDefinition } from '@/domain/market'

export function utcTime(seconds: number) {
  return new Intl.DateTimeFormat('en', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(seconds * 1000) + ' UTC'
}

export function MarketFacts({ definition }: { definition: MarketDefinition }) {
  return <details><summary>Market rules</summary><dl className="facts">
    <dt>Entry opens</dt><dd>{utcTime(definition.entryOpensAt)}</dd>
    <dt>Entry closes / observation starts</dt><dd>{utcTime(definition.entryClosesAt)}</dd>
    <dt>Observation ends</dt><dd>{utcTime(definition.resolvesAt)}</dd>
    <dt>Source</dt><dd>{definition.source}</dd>
    <dt>Observation rule</dt><dd>{definition.resolutionRule}</dd>
    <dt>Ranges</dt><dd>{definition.rangeCount - 2} equal ranges of {definition.rangeWidth}%, plus two overflow ranges.</dd>
    <dt>Payout</dt><dd>The ratified scorecard.</dd>
  </dl><p className="hint"><a href="https://github.com/BallKidz/defifa/tree/main/src" target="_blank" rel="noreferrer">Built on Defifa, see engine code</a></p></details>
}
