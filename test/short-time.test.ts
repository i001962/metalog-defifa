import { expect, it } from 'vitest'
import { shortTime } from '../src/components/StageLamps'

it('writes midnight as 00:00 on the server too, so dates hydrate unchanged', () => {
  expect(shortTime(Date.UTC(2026, 9, 8) / 1000)).toBe('Oct 8, 00:00 UTC')
})
