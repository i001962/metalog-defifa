import Link from 'next/link'

export const metadata = { title: 'How it works' }

export default function RulesPage() {
  return <article className="prose"><h1>How it works</h1>
    <p>Each market is a Defifa game. Its tiers represent ranges of percentage change. You enter a probability curve and choose a stake; the area within each range determines how many positions you buy.</p>
    <p>Basic inputs produce a logistic Metalog with your mean and standard deviation. Raw coefficients let you change its shape. Positions are indivisible, so the entry preview shows the actual allocation and its rounding difference.</p>
    <p>Entry closes when the observation starts. Existing positions remain transferable. This interface has no connected exchange or trading price feed.</p>
    <p><strong>The ratified result controls payouts.</strong> The observation source and rule guide scoring. Anyone can propose a result after entry closes. Eligible holders attest after the observation ends; ratification requires the native voting threshold, at least one day of grace and a one-hour timelock.</p>
    <p>Select your positions to transfer them, refund during entry, or claim after settlement. Refunds and claims burn the selected positions. The transaction preview shows the minimum ETH returned and any protocol token rewards.</p>
    <p>Settlement depends on participation. Defifa discounts a tier’s voting power as its proposed payout increases; a sparse losing range can block a concentrated result. An empty tier cannot receive result weight. A timeout may permit Defifa’s no-contest process.</p>
    <p>The displayed distribution is stake-weighted. An allocation is a bet, and incentives can differ from an honest forecast. More money, more entries and transfers do not imply more independent forecasters.</p>
    <p>Creators choose Simple ranges with equal widths centered on 0%, or Advanced ranges with custom boundaries. Both include an overflow range at each end. The curve and bars share one percentage axis; each bar uses its actual range width, and its area represents its share of positions. Overflow totals appear separately.</p>
    <p><Link href="/data">Query probability data</Link></p>
  </article>
}
