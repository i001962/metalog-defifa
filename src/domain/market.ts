import { validateRangeCount, validateRangeWidth } from './ranges'

export type MarketDefinition = {
  schemaVersion: 1
  settlement: 'defifa-scorecard'
  prompt: string
  source: string
  resolutionRule: string
  entryOpensAt: number
  /** Observation starts and curve entry closes at this second. */
  entryClosesAt: number
  /** Observation ends and Defifa attestations can begin at this second. */
  resolvesAt: number
  rangeCount: number
  rangeWidth: number
  unitPriceWei: string
}

// This is below Defifa's uint48 limit and keeps every accepted timestamp representable by JS Date.
export const MAX_TIMESTAMP_SECONDS = 8_640_000_000_000
export const MAX_ENTRY_DURATION_SECONDS = 2 ** 24 - 1
export const SCORECARD_TIMEOUT_BUFFER_SECONDS = 7 * 24 * 60 * 60
export const MAX_RESOLUTION_DURATION_SECONDS = 2 ** 32 - 1 - SCORECARD_TIMEOUT_BUFFER_SECONDS
export const MAX_UNIT_PRICE_WEI = (1n << 104n) - 1n

const DATA_URI_PREFIX = 'data:application/json;charset=utf-8,'
const MAX_METADATA_LENGTH = 32_768

function textField(input: Record<string, unknown>, key: string, maximum: number): string {
  const value = input[key]
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) {
    throw new Error(`${key} must contain 1 to ${maximum} characters.`)
  }
  return value.trim()
}

function timestamp(input: Record<string, unknown>, key: string): number {
  const value = input[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > MAX_TIMESTAMP_SECONDS) {
    throw new Error(`${key} must be a positive integer timestamp in seconds within the supported calendar range.`)
  }
  return value
}

/** Omitting now validates historical metadata without treating an old market as malformed. */
export function validateMarket(input: unknown, now?: number): MarketDefinition {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('Market definition must be an object.')
  const object = input as Record<string, unknown>
  if (object.schemaVersion !== 1 || object.settlement !== 'defifa-scorecard') {
    throw new Error('Unsupported market schema or settlement rule.')
  }
  const entryOpensAt = timestamp(object, 'entryOpensAt')
  const entryClosesAt = timestamp(object, 'entryClosesAt')
  const resolvesAt = timestamp(object, 'resolvesAt')
  if (entryClosesAt <= entryOpensAt || entryClosesAt - entryOpensAt > MAX_ENTRY_DURATION_SECONDS) {
    throw new Error(`Entry must last between 1 and ${MAX_ENTRY_DURATION_SECONDS} seconds.`)
  }
  if (resolvesAt <= entryClosesAt || resolvesAt - entryClosesAt > MAX_RESOLUTION_DURATION_SECONDS) {
    throw new Error('Observation must end after entry closes and fit the Defifa scorecard timeout.')
  }
  if (now !== undefined) {
    if (!Number.isSafeInteger(now) || now < 0) throw new Error('Current time must be an integer timestamp in seconds.')
    if (entryClosesAt <= now) throw new Error('The entry period has already closed.')
  }
  const unitPriceWei = object.unitPriceWei
  if (typeof unitPriceWei !== 'string' || !/^[1-9][0-9]{0,31}$/.test(unitPriceWei)
    || BigInt(unitPriceWei) > MAX_UNIT_PRICE_WEI) {
    throw new Error('Position price must be a positive uint104 amount in wei.')
  }
  if (typeof object.rangeCount !== 'number') throw new Error('Range count must be a number.')
  if (typeof object.rangeWidth !== 'number') throw new Error('Range width must be a number.')
  return {
    schemaVersion: 1,
    settlement: 'defifa-scorecard',
    prompt: textField(object, 'prompt', 280),
    source: textField(object, 'source', 500),
    resolutionRule: textField(object, 'resolutionRule', 2_000),
    entryOpensAt,
    entryClosesAt,
    resolvesAt,
    rangeCount: validateRangeCount(object.rangeCount),
    rangeWidth: validateRangeWidth(object.rangeWidth),
    unitPriceWei,
  }
}

export function encodeMarketDefinition(definition: MarketDefinition): string {
  const uri = DATA_URI_PREFIX + encodeURIComponent(JSON.stringify(validateMarket(definition)))
  if (uri.length > MAX_METADATA_LENGTH) throw new Error('Market metadata is too long.')
  return uri
}

export function decodeMarketDefinition(uri: string): MarketDefinition {
  if (typeof uri !== 'string' || uri.length > MAX_METADATA_LENGTH || !uri.startsWith(DATA_URI_PREFIX)) {
    throw new Error('Market metadata must be a Metalog JSON data URI.')
  }
  let input: unknown
  try {
    input = JSON.parse(decodeURIComponent(uri.slice(DATA_URI_PREFIX.length)))
  } catch {
    throw new Error('Market metadata is not valid encoded JSON.')
  }
  return validateMarket(input)
}
