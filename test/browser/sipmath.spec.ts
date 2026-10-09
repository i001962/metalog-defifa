import { expect, test, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { forecastPreview } from '../../src/lib/forecast'

type NativeForecast = ReturnType<typeof forecastPreview>
type SipmathLibrary = {
  objectType: string
  libraryType: string
  dateCreated: string
  metadata: { standard: string; source: unknown; sourceSha256: string; audit: NativeForecast; auditSha256: string }
  U01: { rng: { name: string; function: string; arguments: { counter: string; entity: number; varId: number; seed3: number; seed4: number } }[] }
  sips: {
    name: string
    function: string
    arguments: { aCoefficients?: number[]; value?: [number, number][] }
    ref: { source: string; name: string }
    metadata: { unit: string; calibrationTrials: number[]; calibrationTolerance: { absolute: number; relative: number } }
  }[]
}

async function downloadJson(page: Page, button: string, filename: string) {
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: button, exact: true }).click()
  const download = await event
  expect(download.suggestedFilename()).toBe(filename)
  return JSON.parse(await readFile((await download.path())!, 'utf8'))
}

function reproducibleContent(library: SipmathLibrary) {
  const content: Partial<SipmathLibrary> = { ...library }
  delete content.dateCreated
  return content
}

function canonicalHash(value: unknown) {
  const json = JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
  return `0x${createHash('sha256').update(json).digest('hex')}`
}

function expectCrossRuntimeMatch(actual: SipmathLibrary, expected: SipmathLibrary) {
  for (const library of [actual, expected]) {
    expect(library.metadata.auditSha256).toBe(canonicalHash(library.metadata.audit))
    expect(library.metadata.sourceSha256).toBe(canonicalHash(library.metadata.source))
  }
  expect(actual.metadata.source).toEqual(expected.metadata.source)
  expect(actual.metadata.sourceSha256).toBe(expected.metadata.sourceSha256)
  expect(actual.U01).toEqual(expected.U01)
  const actualAllocation = actual.metadata.audit.allocation
  const expectedAllocation = expected.metadata.audit.allocation
  expect(actualAllocation.probabilities).toHaveLength(expectedAllocation.probabilities.length)
  actualAllocation.probabilities.forEach((probability, index) => {
    expect(Math.abs(probability - expectedAllocation.probabilities[index])).toBeLessThanOrEqual(1e-12)
  })
  expect(Math.abs(actualAllocation.totalVariationError - expectedAllocation.totalVariationError)).toBeLessThanOrEqual(1e-12)
  expect(actual.sips).toHaveLength(expected.sips.length)
  // Normalize only individually verified derived floats; coefficients, counts, ranges and every other field stay exact.
  const normalized = structuredClone(actual)
  normalized.metadata.auditSha256 = expected.metadata.auditSha256
  normalized.metadata.audit.allocation.probabilities = expectedAllocation.probabilities
  normalized.metadata.audit.allocation.totalVariationError = expectedAllocation.totalVariationError
  actual.sips.forEach((sip, index) => {
    const reference = expected.sips[index]
    const tolerance = sip.metadata.calibrationTolerance
    const expectedTolerance = sip.function === 'Metalog_1_0'
      ? { absolute: 1e-12 * Math.max(1, ...sip.arguments.aCoefficients!.map(Math.abs)), relative: 1e-12 }
      : { absolute: 0, relative: 0 }
    expect(tolerance).toEqual(expectedTolerance)
    expect(reference.metadata.calibrationTolerance).toEqual(expectedTolerance)
    expect(sip.metadata.calibrationTrials).toHaveLength(reference.metadata.calibrationTrials.length)
    if (sip.function === 'Metalog_1_0') {
      sip.metadata.calibrationTrials.forEach((trial, trialIndex) => {
        const expectedTrial = reference.metadata.calibrationTrials[trialIndex]
        expect(Math.abs(trial - expectedTrial)).toBeLessThanOrEqual(tolerance.absolute + tolerance.relative * Math.abs(expectedTrial))
      })
      normalized.sips[index].metadata.calibrationTrials = reference.metadata.calibrationTrials
    } else expect(sip.metadata.calibrationTrials).toEqual(reference.metadata.calibrationTrials)
  })
  expect(reproducibleContent(normalized)).toEqual(reproducibleContent(expected))
}

test('SIPmath downloads preserve all three modes and agree with repeatable preview API output', async ({ page, request }) => {
  const failures: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  await page.goto('/markets/example')
  const expressive = [-2.543210987654321, 1.1026577908435842, .123456789012345, .1, 0, .00000123456789]
  for (const mode of ['Simple', 'Expressive', 'By range']) {
    await page.getByRole('button', { name: mode, exact: true }).click()
    if (mode === 'Simple') {
      await page.getByRole('textbox', { name: 'Mean (%)', exact: true }).fill('-1.23456789012345')
      await page.getByRole('textbox', { name: 'Standard deviation (%)', exact: true }).fill('1.234567890123456')
      await page.getByRole('textbox', { name: 'Stake (ETH)' }).fill('0.00012')
    } else if (mode === 'Expressive') {
      for (let index = 0; index < expressive.length; index++) {
        await page.getByRole('textbox', { name: new RegExp(`^a${index + 1} · `) }).fill(String(expressive[index]))
      }
    } else {
      const counts = page.getByRole('region', { name: 'NFT counts', exact: true }).getByRole('textbox')
      for (const input of await counts.all()) await input.fill('0')
      await counts.first().fill('1')
      await counts.nth(10).fill('2')
      await counts.last().fill('3')
    }
    const native: NativeForecast = await downloadJson(page, 'Download draft', 'metalog-forecast.json')
    const library: SipmathLibrary = await downloadJson(page, 'Download SIPmath', 'metalog-forecast.SIPmath')
    expect(library.objectType).toBe('sipModel')
    expect(library.libraryType).toBe('SIPmath_3_0')
    expect(Number.isNaN(Date.parse(library.dateCreated))).toBe(false)
    expect(library.metadata.standard).toBe('SIPmath 3.1')
    expect(library.metadata.audit).toEqual(native)
    expect(library.sips.map(sip => sip.name)).toEqual(mode === 'By range' ? ['allocation'] : ['forecast', 'allocation'])
    expect(new Set(library.U01.rng.map(rng => rng.name)).size).toBe(library.sips.length)
    expect(new Set(library.U01.rng.map(rng => JSON.stringify(rng.arguments))).size).toBe(library.sips.length)
    expect(new Set(library.sips.map(sip => sip.ref.name)).size).toBe(library.sips.length)
    for (const rng of library.U01.rng) {
      expect(rng.function).toBe('HDR_2_0')
      expect(rng.arguments.counter).toBe('PM_Index')
    }
    for (const sip of library.sips) {
      expect(sip.ref.source).toBe('rng')
      expect(library.U01.rng.some(rng => rng.name === sip.ref.name)).toBe(true)
      expect(sip.metadata.calibrationTrials).toHaveLength(5)
      expect(sip.metadata.calibrationTrials.every(Number.isFinite)).toBe(true)
    }
    const allocation = library.sips.find(sip => sip.name === 'allocation')!
    expect(allocation.function).toBe('Lookup_Table')
    expect(allocation.metadata.unit).toBe('tier-id')
    const positiveTierIds = native.allocation.tierIds.filter((_, index) => native.allocation.quantities[index] > 0)
    expect(allocation.arguments.value!.map(([, tierId]) => tierId)).toEqual(positiveTierIds)
    expect(allocation.arguments.value!.at(-1)![0]).toBe(1)
    expect(allocation.metadata.calibrationTrials.every(tierId => positiveTierIds.includes(tierId))).toBe(true)
    if (mode === 'By range') {
      expect(library.sips.some(sip => sip.function === 'Metalog_1_0')).toBe(false)
      expect(allocation.arguments.value).toEqual([[1 / 6, 1], [.5, 11], [1, 21]])
      expect(native.allocation.count).toBe(6)
      expect(native.allocation.quantities).toEqual([1, ...Array<number>(9).fill(0), 2, ...Array<number>(9).fill(0), 3])
      expect(library.metadata.audit.distribution.coefficients).toEqual(expressive)
    } else {
      const forecast = library.sips.find(sip => sip.name === 'forecast')!
      expect(forecast.function).toBe('Metalog_1_0')
      expect(forecast.metadata.unit).toBe('percentage-points')
      expect(forecast.arguments.aCoefficients).toEqual(native.distribution.coefficients)
      if (mode === 'Expressive') expect(forecast.arguments.aCoefficients).toEqual(expressive)
    }
    const input = {
      market: native.market,
      coefficients: native.distribution.coefficients,
      ...(mode === 'By range' ? { quantities: native.allocation.quantities } : { positions: native.allocation.count }),
    }
    const response = await request.post('/api/preview?format=sipmath', { data: input })
    expect(response.status()).toBe(200)
    const apiLibrary: SipmathLibrary = await response.json()
    expectCrossRuntimeMatch(apiLibrary, library)
    const repeated = await request.post('/api/preview?format=sipmath', { data: input })
    expect(repeated.status()).toBe(200)
    const repeatLibrary: SipmathLibrary = await repeated.json()
    expect(reproducibleContent(repeatLibrary)).toEqual(reproducibleContent(apiLibrary))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  expect(failures).toEqual([])
})

test('invalid active drafts disable native and SIPmath downloads through mode changes and recovery', async ({ page }) => {
  await page.goto('/markets/example')
  const buttons = ['Download draft', 'Download SIPmath'].map(name => page.getByRole('button', { name, exact: true }))
  const mean = page.getByRole('textbox', { name: 'Mean (%)', exact: true })
  const stake = page.getByRole('textbox', { name: 'Stake (ETH)' })
  await mean.fill('-')
  for (const button of buttons) await expect(button).toBeDisabled()
  await mean.fill('0')
  await stake.fill('.')
  for (const button of buttons) await expect(button).toBeDisabled()
  await stake.fill('0.0001')
  for (const button of buttons) await expect(button).toBeEnabled()
  await page.getByRole('button', { name: 'Expressive', exact: true }).click()
  const scale = page.getByRole('textbox', { name: 'a2 · Base spread', exact: true })
  await scale.fill('-1')
  for (const button of buttons) await expect(button).toBeDisabled()
  await page.getByRole('button', { name: 'Simple', exact: true }).click()
  for (const button of buttons) await expect(button).toBeEnabled()
  await page.getByRole('button', { name: 'Expressive', exact: true }).click()
  await expect(scale).toHaveValue('-1')
  for (const button of buttons) await expect(button).toBeDisabled()
  await scale.fill('1')
  await page.getByRole('button', { name: 'By range', exact: true }).click()
  const firstCount = page.getByRole('region', { name: 'NFT counts', exact: true }).getByRole('textbox').first()
  await firstCount.fill('')
  for (const button of buttons) await expect(button).toBeDisabled()
  await page.getByRole('button', { name: 'Expressive', exact: true }).click()
  for (const button of buttons) await expect(button).toBeEnabled()
  await page.getByRole('button', { name: 'By range', exact: true }).click()
  await expect(firstCount).toHaveValue('')
  for (const button of buttons) await expect(button).toBeDisabled()
  await firstCount.fill('1')
  for (const button of buttons) await expect(button).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
