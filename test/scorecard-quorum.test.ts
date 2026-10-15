import { expect, it } from 'vitest'
import { scorecardQuorum } from '../src/domain/scorecard'

it('matches the quorum the governor stored for Base game 28', () => {
  // 21 ranges with positions: base 10.5e9. A result paying one range 100% stored 19,999,999,999 on-chain.
  expect(scorecardQuorum(10_500_000_000n, [{ tierId: 1, weight: '1000000000000000000' }])).toBe(19_999_999_999n)
  // An even split barely moves it; a tiny game keeps the base.
  const even = Array.from({ length: 21 }, (_, i) => ({ tierId: i + 1, weight: (10n ** 18n / 21n).toString() }))
  expect(scorecardQuorum(10_500_000_000n, even) - 10_500_000_000n).toBeLessThan(25_000_000n)
  expect(scorecardQuorum(500_000_000n, [{ tierId: 1, weight: '1000000000000000000' }])).toBe(500_000_000n)
})
