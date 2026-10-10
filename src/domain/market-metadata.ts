import { bytes32ToCidV0, cidV0ToBytes32 } from '@bananapus/nana-sdk-core'
import { marketRanges, validateMarket, type MarketDefinition } from './market'

/** Canonical path-free DAG-PB CIDv0 profile used for immutable market manifests. */
export function metadataCid(uri: string): string {
  if (typeof uri !== 'string' || !/^ipfs:\/\/Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(uri)) {
    throw new Error('Market metadata must use a canonical, path-free CIDv0 IPFS URI.')
  }
  const cid = uri.slice(7)
  if (bytes32ToCidV0(cidV0ToBytes32(cid)) !== cid) throw new Error('Invalid metadata CIDv0.')
  return cid
}

export function buildProjectMetadata(input: MarketDefinition) {
  const definition = validateMarket(input)
  return {
    name: definition.prompt,
    description: `${definition.source}\n${definition.resolutionRule}`,
    infoUri: 'https://metalog.money',
    metalog: { schemaVersion: 1, definition, tiers: marketRanges(definition), tierMetadataMode: 'native' },
  }
}

/** Compare complete JSON documents, including extra keys, without depending on key order. */
export function metadataMatches(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true
  if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object') return false
  if (Array.isArray(actual) !== Array.isArray(expected)) return false
  const left = actual as Record<string, unknown>, right = expected as Record<string, unknown>
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && metadataMatches(left[key], right[key]))
}

export function validateProjectMetadata(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid project metadata.')
  const envelope = (input as Record<string, unknown>).metalog
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw new Error('Missing Metalog metadata.')
  const { schemaVersion, definition: rawDefinition, tierMetadataMode } = envelope as Record<string, unknown>
  if (schemaVersion !== 1 || tierMetadataMode !== 'native') {
    throw new Error('Unsupported Metalog metadata schema or tier metadata mode.')
  }
  const definition = validateMarket(rawDefinition)
  const metadata = buildProjectMetadata(definition)
  if (!metadataMatches(input, metadata)) throw new Error('Project metadata does not match its market definition.')
  return metadata
}
