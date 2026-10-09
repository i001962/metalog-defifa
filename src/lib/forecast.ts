import { formatEther, parseEther } from 'viem'
import { allocateManualPositions, allocatePositions, MAX_POSITIONS } from '@/domain/allocation'
import { validateCoefficients } from '@/domain/distribution'
import { validateMarket } from '@/domain/market'
import { createRanges } from '@/domain/ranges'

/** Both the form and public preview endpoint consume this exact allocation. */
export function forecastPreview(input: { market: unknown; coefficients: readonly number[]; positions?: number; quantities?: readonly number[] }) {
  if (!input || typeof input !== 'object') throw new Error('A forecast definition is required.')
  const market = validateMarket(input.market)
  const coefficients = validateCoefficients(input.coefficients)
  const ranges = createRanges(market.rangeCount, market.rangeWidth)
  const allocation = input.quantities === undefined
    ? allocatePositions(coefficients, ranges, input.positions!)
    : allocateManualPositions(coefficients, ranges, input.quantities)
  if (input.positions !== undefined && input.positions !== allocation.count) {
    throw new Error('The position total does not match the NFT counts.')
  }
  return {
    schema: 'metalog.forecast.v1',
    kind: 'draft' as const,
    market,
    distribution: { family: 'unbounded-metalog', unit: 'percentage-points', coefficients },
    allocation,
    ranges,
    payment: { currency: 'ETH', valueWei: (BigInt(market.unitPriceWei) * BigInt(allocation.count)).toString() },
    settlement: 'defifa-scorecard',
    tradingDistribution: null,
  }
}

export function positionsForBudget(text: string, unitPriceWei: string) {
  if (!/^(?:\d+(?:\.\d{0,18})?|\.\d{1,18})$/.test(text)) throw new Error('Enter an ETH amount with up to 18 decimal places.')
  const budget = parseEther(text)
  const price = BigInt(unitPriceWei)
  if (price <= 0n) throw new Error('The position price must be positive.')
  const count = budget / price
  if (count < 1n) throw new Error(`Enter at least ${formatEther(price)} ETH for one position.`)
  if (count > BigInt(MAX_POSITIONS)) throw new Error(`Use at most ${MAX_POSITIONS} positions per entry (${formatEther(price * BigInt(MAX_POSITIONS))} ETH).`)
  return { count: Number(count), valueWei: count * price, remainderWei: budget % price }
}

export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
