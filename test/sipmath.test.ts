import { describe, expect, it } from 'vitest'
import { POST } from '../src/app/api/preview/route'
import { validateCoefficients } from '../src/domain/distribution'
import { EXAMPLE_MARKET } from '../src/lib/example'
import { forecastPreview } from '../src/lib/forecast'
import { buildSIPmath, forecastSIPmath } from '../src/lib/sipmath'

const input = { market: { ...EXAMPLE_MARKET, rangeCount: 3, rangeWidth: 2 }, coefficients: [2.5, 1, .2, .3, .1, .2], positions: 17 }

function repeatable(value: ReturnType<typeof buildSIPmath>) { return { ...value, dateCreated: '' } }

describe('SIPmath forecast export boundary', () => {
  it('preserves the validated forecast, exact coefficients and categorical allocation as separate variables', () => {
    const library = forecastSIPmath(input)
    expect(library).toMatchObject({ objectType: 'sipModel', libraryType: 'SIPmath_3_0', metadata: { standard: 'SIPmath 3.1', audit: forecastPreview(input) } })
    expect(library.sips.map(sip => [sip.name, sip.function, sip.metadata.unit])).toEqual([
      ['forecast', 'Metalog_1_0', 'percentage-points'], ['allocation', 'Lookup_Table', 'tier-id'],
    ])
    expect(library.sips[0].arguments).toEqual({ aCoefficients: input.coefficients })
    expect(library.sips[1].metadata).toMatchObject({ ranges: [{ lower: null, upper: -1 }, { lower: -1, upper: 1 }, { lower: 1, upper: null }] })
    expect(library.U01.rng.map(rng => rng.arguments)).toHaveLength(2)
    expect(library.U01.rng[0].arguments).not.toEqual(library.U01.rng[1].arguments)
    expect(library.metadata.simulation).toMatchObject({ firstTrial: 1, calibrationIndices: [1, 2, 3, 4, 5] })
    expect(Number.isNaN(Date.parse(library.dateCreated))).toBe(false)
    expect(JSON.parse(JSON.stringify(library))).toEqual(library)
  })

  it('exports manual tier IDs and preserves a reference curve only as source evidence', () => {
    const manual = { market: input.market, coefficients: input.coefficients, quantities: [7, 0, 3] }
    const library = forecastSIPmath(manual)
    expect(library.metadata.audit).toEqual(forecastPreview(manual))
    expect(library.sips).toHaveLength(1)
    expect(library.sips[0]).toMatchObject({ name: 'allocation', function: 'Lookup_Table', arguments: { value: [[.7, 1], [1, 3]] } })
    expect(library.sips[0].metadata.calibrationTrials.every(tier => tier === 1 || tier === 3)).toBe(true)
    expect(library.sips.some(sip => 'aCoefficients' in sip.arguments)).toBe(false)
  })

  it('preserves custom cutoffs and exact categorical counts in draft exports and replay identity', async () => {
    const { rangeCount, rangeWidth, ...definition } = EXAMPLE_MARKET
    const market = { ...definition, rangeBoundaries: [-5, -1, 0, .5, 3] }
    const curve = { market, coefficients: [0, 1], positions: 100 }
    const manual = { market, coefficients: [0, 1], quantities: [2, 0, 3, 0, 0, 5] }
    for (const payload of [curve, manual]) {
      const library = forecastSIPmath(payload)
      const preview = forecastPreview(payload)
      expect(library.metadata.audit).toEqual(preview)
      expect(library.metadata.source).toEqual({ kind: 'draft', market, mode: preview.allocation.mode })
      const allocation = library.sips.find(sip => sip.name === 'allocation')!
      expect(allocation.metadata).toMatchObject({ ranges: [
        { tierId: 1, lower: null, upper: -5 }, { tierId: 2, lower: -5, upper: -1 },
        { tierId: 3, lower: -1, upper: 0 }, { tierId: 4, lower: 0, upper: .5 },
        { tierId: 5, lower: .5, upper: 3 }, { tierId: 6, lower: 3, upper: null },
      ] })
      expect(library.sips.map(sip => sip.name)).toEqual(preview.allocation.mode === 'manual' ? ['allocation'] : ['forecast', 'allocation'])
      if (preview.allocation.mode === 'manual') {
        expect(allocation.arguments).toEqual({ value: [[.2, 1], [.5, 3], [1, 6]] })
      }
      const response = await POST(new Request('http://localhost/api/preview?format=sipmath', { method: 'POST', body: JSON.stringify(payload) }))
      expect(response.status).toBe(200)
      expect(repeatable(await response.json())).toEqual(repeatable(library))
    }
    const original = forecastSIPmath(manual)
    const changed = forecastSIPmath({ ...manual, market: { ...market, rangeBoundaries: [-5, -1, 0, .75, 3] } })
    expect(changed.metadata.sourceSha256).not.toBe(original.metadata.sourceSha256)
    expect(changed.U01).not.toEqual(original.U01)
    expect(changed.sips[0].arguments).toEqual(original.sips[0].arguments)
    for (const invalidMarket of [
      { ...market, rangeCount }, { ...market, rangeWidth }, { ...market, rangeBoundaries: [-5, -1, 0, 0, 3] },
    ]) expect(() => forecastSIPmath({ ...manual, market: invalidMarket })).toThrow()
  })

  it('repeats stable streams across key ordering and dates, while changes to source or role change identity', () => {
    expect(repeatable(forecastSIPmath(input))).toEqual(repeatable(forecastSIPmath({
      positions: input.positions, coefficients: input.coefficients,
      market: Object.fromEntries(Object.entries(input.market).reverse()),
    })))
    const coefficients = validateCoefficients(input.coefficients)
    const variables = [{ name: 'forecast', kind: 'curve' as const, coefficients }]
    const source = { market: 'Example', nested: { b: 2, a: 1 } }
    const one = buildSIPmath({ name: 'One', source, audit: { b: 2, a: { z: 3, y: 4 } }, variables })
    const reordered = buildSIPmath({ name: 'One', source: { nested: { a: 1, b: 2 }, market: 'Example' }, audit: { a: { y: 4, z: 3 }, b: 2 }, variables })
    expect(repeatable(one)).toEqual(repeatable(reordered))
    for (const changed of [
      buildSIPmath({ name: 'One', source: { ...source, market: 'Another' }, audit: one.metadata.audit, variables }),
      buildSIPmath({ name: 'One', source, audit: one.metadata.audit, variables: [{ ...variables[0], name: 'other' }] }),
      buildSIPmath({ name: 'One', source, audit: one.metadata.audit, variables: [{ ...variables[0], coefficients: validateCoefficients([3, 1]) }] }),
    ]) {
      expect(changed.U01).not.toEqual(one.U01)
      expect(changed.sips[0].metadata.streamIdentity).not.toBe(one.sips[0].metadata.streamIdentity)
    }
    expect(() => buildSIPmath({ name: 'Duplicate', source, audit: {}, variables: [...variables, ...variables] })).toThrow('unique')
    expect(() => buildSIPmath({ name: 'Invalid', source, audit: { value: Infinity }, variables })).toThrow('finite')
    expect(() => buildSIPmath({ name: 'Empty variable', source, audit: {}, variables: [{ name: 'empty', kind: 'discrete', counts: [0n], tierIds: [1] }] })).toThrow('empty')
  })

  it('does not let derived audit rounding alter the exact source identity or replay stream', () => {
    const source = { kind: 'draft', market: EXAMPLE_MARKET }
    const variables = [{ name: 'forecast', kind: 'curve' as const, coefficients: validateCoefficients(input.coefficients) }]
    const first = buildSIPmath({ name: 'Curve', source, variables, audit: { probability: .123456789012345 } })
    const second = buildSIPmath({ name: 'Curve', source, variables, audit: { probability: .123456789012345 + Number.EPSILON } })
    expect(first.metadata.auditSha256).not.toBe(second.metadata.auditSha256)
    expect(first.metadata.sourceSha256).toBe(second.metadata.sourceSha256)
    expect(first.U01).toEqual(second.U01)
    expect(first.sips).toEqual(second.sips)
    expect(first.sips[0].metadata.calibrationTolerance).toEqual({ absolute: 2.5e-12, relative: 1e-12 })
  })

  it('serves the same SIPmath document through the bounded API and rejects invalid drafts or unknown formats', async () => {
    for (const payload of [input, { market: input.market, coefficients: input.coefficients, quantities: [1, 0, 2] }]) {
      const response = await POST(new Request('http://localhost/api/preview?format=sipmath', { method: 'POST', body: JSON.stringify(payload) }))
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(repeatable(await response.json())).toEqual(repeatable(forecastSIPmath(payload)))
    }
    for (const payload of [null, {}, { ...input, coefficients: [0, -1] }, { ...input, quantities: [1, 2, 3] }, { ...input, quantities: [1.5, 0, 1] }]) {
      const response = await POST(new Request('http://localhost/api/preview?format=sipmath', { method: 'POST', body: JSON.stringify(payload) }))
      expect(response.status).toBe(400)
    }
    expect((await POST(new Request('http://localhost/api/preview?format=sipmath', { method: 'POST', body: ' '.repeat(32_769) }))).status).toBe(413)
    expect((await POST(new Request('http://localhost/api/preview?format=csv', { method: 'POST', body: JSON.stringify(input) }))).status).toBe(400)
  })
})
