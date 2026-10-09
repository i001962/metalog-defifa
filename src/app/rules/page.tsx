import Link from 'next/link'

export const metadata = { title: 'How it works' }

export default function RulesPage() {
  return <article className="prose"><h1>How it works</h1>
    <p>Each market is a Defifa game. Its NFT tiers represent ranges of percentage change. You enter a probability curve and choose a stake; the area within each range determines how many positions you buy.</p>
    <p>Basic inputs produce a logistic Metalog with your mean and standard deviation. Raw coefficients let you change its shape. NFTs are indivisible, so the entry preview shows the actual allocation and its rounding difference.</p>
    <p>Entry closes when the observation starts. Existing NFTs remain transferable. This interface has no connected exchange or trading price feed.</p>
    <p><strong>The ratified Defifa scorecard controls payouts.</strong> The observation source and rule guide scoring. Defifa holders submit, attest to and ratify scorecards after the observation ends.</p>
    <p>Settlement depends on participation. Defifa discounts a tier’s voting power as its proposed payout increases; a sparse losing range can block a concentrated scorecard. An empty tier cannot receive scorecard weight. A timeout may permit Defifa’s no-contest process.</p>
    <p>The displayed distribution is stake-weighted. An allocation is a bet, and incentives can differ from an honest forecast. More money, more entries and transfers do not imply more independent forecasters.</p>
    <p>Ranges have equal widths centered on 0%, with an overflow range at each end. The creator fixes their width. The curve and bars share one percentage axis; each bar’s area represents its share of NFT positions. Overflow totals appear separately.</p>
    <p><Link href="/data">Query probability data</Link></p>
  </article>
}
