import { MAX_RESOLUTION_DURATION_SECONDS } from './market'

/** Move entry near the present while preserving the applied observation window. */
export function shortTestSchedule(now: number, observationStartsAt: number, observationEndsAt: number) {
  const duration = observationEndsAt - observationStartsAt
  if (!Number.isSafeInteger(duration) || duration <= 0) throw new Error('Set valid observation dates with an end after the start.')
  if (duration > MAX_RESOLUTION_DURATION_SECONDS) throw new Error('The observation duration exceeds the market limit.')
  const entryOpensAt = Math.ceil(now / 60) * 60 + 120
  const entryClosesAt = entryOpensAt + 600
  return { entryOpensAt, entryClosesAt, resolvesAt: entryClosesAt + duration }
}
