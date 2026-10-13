import { ForecastEditor } from '@/components/ForecastEditor'
import { MarketFacts } from '@/components/MarketFacts'
import { ScheduleMeter } from '@/components/ScheduleMeter'
import { EXAMPLE_MARKET } from '@/lib/example'

export const metadata = { title: 'Example market' }

export default function ExamplePage() {
  return <><span className="eyebrow">Example market</span><h1>{EXAMPLE_MARKET.prompt}</h1>
    <ScheduleMeter definition={EXAMPLE_MARKET} />
    <MarketFacts definition={EXAMPLE_MARKET} /><ForecastEditor definition={EXAMPLE_MARKET} />
  </>
}
