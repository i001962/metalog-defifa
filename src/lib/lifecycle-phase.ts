import type { MarketSnapshot } from './defifa'

export type CashOutMode = 'refund' | 'cash-out' | 'no-contest-refund' | null

/** What a phase permits. The chain snapshot and stage previews both read it from here. */
export function phaseCapabilities(market: Pick<MarketSnapshot, 'phase' | 'commitmentsFulfilled' | 'noContestTriggered'>, owner: boolean) {
  const { phase } = market
  return {
    canSubmitScorecard: owner && phase === 3,
    canDelegate: owner && phase === 1,
    canFulfill: owner && phase === 4 && !market.commitmentsFulfilled,
    canTriggerNoContest: owner && phase === 5 && !market.noContestTriggered,
    cashOutMode: (phase === 1 || phase === 2 ? 'refund' : phase === 4 ? 'cash-out' : phase === 5 ? 'no-contest-refund' : null) as CashOutMode,
  }
}
