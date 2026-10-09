import { sha256, stringToHex } from 'viem'
import { quantile, validateCoefficients, type Coefficients } from '@/domain/distribution'
import { hdrUniform, lookupTable, lookupValue, MAX_HDR_COUNTER, MAX_HDR_SEED } from '@/domain/sipmath'
import { forecastPreview } from './forecast'

export type SipVariable = {
  name: string
  metadata?: Record<string, unknown>
} & ({ kind: 'curve'; coefficients: Coefficients }
  | { kind: 'discrete'; tierIds: readonly number[]; counts: readonly bigint[] })

const STANDARD_DOCUMENT = 'https://www.probabilitymanagement.org/s/SIPmath-31-Standard-2025-01-31.pdf'
const PROFILE = 'metalog.sipmath.v1'
const TRIALS = [1, 2, 3, 4, 5]

export function requestedExportFormat(url: string): { format: 'json' | 'sipmath' } | { error: string } {
  const format = new URL(url).searchParams.get('format') ?? 'json'
  return format === 'json' || format === 'sipmath' ? { format } : { error: 'Use format=json or format=sipmath.' }
}

/** Stable object keys; arrays retain their semantic order. No lossy nonfinite JSON values. */
function canonicalJson(value: unknown): string {
  const result = JSON.stringify(value, (_key, item) => {
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Export numbers must be finite.')
    return item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item
  })
  if (result === undefined) throw new Error('Export audit data is required.')
  return result
}

function digest(value: unknown) { return sha256(stringToHex(canonicalJson(value))) }
function seed(hash: string, offset: number) { return Number.parseInt(hash.slice(2 + offset, 10 + offset), 16) % (MAX_HDR_SEED + 1) }

/** The canonical 3.0 wire profile is also described by the 3.1 specification. */
export function buildSIPmath(input: { name: string; source: unknown; audit: unknown; variables: readonly SipVariable[] }) {
  const source = JSON.parse(canonicalJson(input.source)) as unknown
  const sourceSha256 = digest(source)
  const audit = JSON.parse(canonicalJson(input.audit)) as unknown
  const auditSha256 = digest(audit)
  const names = new Set<string>()
  const streams = new Set<string>()
  const variables = input.variables.map(variable => {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(variable.name) || names.has(variable.name)) {
      throw new Error('SIP variables need unique, simple names.')
    }
    names.add(variable.name)
    // Derived audit floats can differ across engines; only exact source inputs identify a stream.
    const variableSource = variable.kind === 'curve'
      ? { coefficients: validateCoefficients(variable.coefficients) }
      : { tierIds: variable.tierIds, counts: variable.counts.map(String) }
    const identity = digest([PROFILE, sourceSha256, variable.name, variable.kind, variableSource])
    const seeds = {
      entity: seed(digest('metalog.sipmath.entity.v1'), 0),
      varId: seed(identity, 0), seed3: seed(identity, 8), seed4: seed(identity, 16),
    }
    const key = JSON.stringify(seeds)
    if (streams.has(key)) throw new Error('SIP random streams collided. Export cannot preserve distinct streams.')
    streams.add(key)
    const uniforms = TRIALS.map(index => hdrUniform(index, seeds))
    const table = variable.kind === 'discrete' ? lookupTable(variable.counts, variable.tierIds) : null
    if (table?.length === 0) throw new Error('An empty distribution cannot be exported as a SIP variable.')
    const coefficients = variable.kind === 'curve' ? validateCoefficients(variable.coefficients) : null
    return {
      rng: { name: `rng_${variable.name}`, function: 'HDR_2_0', arguments: { counter: 'PM_Index', ...seeds } },
      sip: {
        name: variable.name,
        ref: { source: 'rng', name: `rng_${variable.name}` },
        function: coefficients ? 'Metalog_1_0' : 'Lookup_Table',
        arguments: coefficients ? { aCoefficients: coefficients } : { value: table! },
        metadata: {
          ...variable.metadata,
          unit: coefficients ? 'percentage-points' : 'tier-id',
          kind: coefficients ? 'continuous-forecast' : 'categorical-positions',
          streamIdentity: identity,
          calibrationTrials: uniforms.map(p => coefficients ? quantile(coefficients, p) : lookupValue(table!, p)),
          calibrationTolerance: coefficients
            ? { absolute: 1e-12 * Math.max(1, ...coefficients.map(Math.abs)), relative: 1e-12 }
            : { absolute: 0, relative: 0 },
        },
      },
    }
  })
  return {
    name: input.name,
    objectType: 'sipModel',
    libraryType: 'SIPmath_3_0',
    dateCreated: new Date().toISOString(),
    provenance: 'Metalog: validated native forecast or block-pinned market snapshot. Content hashes are not signatures.',
    U01: { rng: variables.map(variable => variable.rng) },
    sips: variables.map(variable => variable.sip),
    metadata: {
      standard: 'SIPmath 3.1', standardDocument: STANDARD_DOCUMENT, profile: PROFILE,
      wireProfile: 'Canonical SIPmath_3_0: HDR_2_0, Metalog_1_0 and Lookup_Table only.',
      sourceSha256, source, auditSha256, audit,
      simulation: {
        firstTrial: 1, calibrationIndices: TRIALS, maxTrial: MAX_HDR_COUNTER,
        seedDerivation: 'SHA-256 of [profile, sourceSha256, variable name, kind, variable inputs]; first three uint32 hex words modulo 10000000. Entity uses SHA-256 of the JSON string metalog.sipmath.entity.v1 with the same mapping.',
        dependence: 'Unspecified. Separate replay streams do not establish real-world independence. Identical source exports reuse streams; a joint simulation requires an explicit dependence model.',
      },
    },
  }
}

/** Both download and preview API rederive the same validated source rather than accepting an allocation claim. */
export function forecastSIPmath(input: Parameters<typeof forecastPreview>[0]) {
  const audit = forecastPreview(input)
  const variables: SipVariable[] = []
  if (audit.allocation.mode === 'curve') variables.push({
    name: 'forecast', kind: 'curve', coefficients: audit.distribution.coefficients,
    metadata: { source: 'draft-curve', interpretation: 'Percentage change; 2.5 means +2.5%.' },
  })
  variables.push({
    name: 'allocation', kind: 'discrete', tierIds: audit.allocation.tierIds,
    counts: audit.allocation.quantities.map(BigInt),
    metadata: { source: 'draft-allocation', weighting: 'stake', ranges: audit.ranges,
      curveRole: audit.allocation.mode === 'manual' ? 'reference-only' : 'forecast',
      interpretation: 'Tier IDs are categories, not percentage outcomes or payout amounts. No within-range outcome distribution is assumed.' },
  })
  return buildSIPmath({ name: audit.market.prompt,
    source: { kind: audit.kind, market: audit.market, mode: audit.allocation.mode }, audit, variables })
}
