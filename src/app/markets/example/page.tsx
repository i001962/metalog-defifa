import { ForecastEditor } from '@/components/ForecastEditor'
import { MarketFacts, utcTime } from '@/components/MarketFacts'
import { EXAMPLE_MARKET } from '@/lib/example'

export const metadata = { title: 'Example market' }

export default function ExamplePage() {
  return <><span className="eyebrow">Example market</span><h1>{EXAMPLE_MARKET.prompt}</h1>
    <p className="muted">{utcTime(EXAMPLE_MARKET.entryClosesAt)} → {utcTime(EXAMPLE_MARKET.resolvesAt)}</p>
    <MarketFacts definition={EXAMPLE_MARKET} /><ForecastEditor definition={EXAMPLE_MARKET} />
  </>
}
