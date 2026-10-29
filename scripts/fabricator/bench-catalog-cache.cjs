'use strict'
/** Compara leituras reais do mesmo asset binário sintético com e sem cache; não mede FPS do Electron. */
const { readFileSync } = require('node:fs')
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { performance } = require('node:perf_hooks')
const ts = require('typescript')
const resolverSource = join(__dirname, '../../electron/domains/fabricator/versionedAssetResolver.ts')
const resolverCode = ts.transpile(readFileSync(resolverSource, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
const resolverModule = { exports: {} }
new Function('module', 'exports', resolverCode)(resolverModule, resolverModule.exports)
const { VersionedAssetResolver } = resolverModule.exports

function measureBufferWrapping(sample, wrap, runs = 5, rounds = 150) {
  const durations = []
  let checksum = 0
  for (let run = 0; run < runs; run += 1) {
    const startedAt = performance.now()
    for (let index = 0; index < rounds; index += 1) {
      const buffer = wrap(sample)
      checksum += buffer[0] + buffer[buffer.length - 1]
    }
    durations.push(performance.now() - startedAt)
  }
  durations.sort((left, right) => left - right)
  return { medianMs: Number(durations[Math.floor(durations.length / 2)].toFixed(3)), checksum }
}

async function main() {
  const tempRoot = await mkdtemp(join(tmpdir(), 'gacha-fabricator-cache-bench-'))
  try {
    const assetPath = join(tempRoot, 'asset.bin')
    const sample = Uint8Array.from({ length: 256 * 1024 }, (_, index) => index % 251)
    await writeFile(assetPath, sample)

    const rounds = 150
    const measurementRuns = 5
    const uncachedDurations = []
    const cachedDurations = []
    let uncachedReadCalls = 0
    let cachedReadCalls = 0
    let identicalPayloadChecksums = true
    await readFile(assetPath) // Warm the OS file cache before measuring either path.

    const runUncached = async () => {
      let checksum = 0
      const startedAt = performance.now()
      for (let index = 0; index < rounds; index += 1) {
        uncachedReadCalls += 1
        const dataUrlPayload = (await readFile(assetPath)).toString('base64')
        checksum += dataUrlPayload.length + dataUrlPayload.charCodeAt(0) + dataUrlPayload.charCodeAt(dataUrlPayload.length - 1)
      }
      uncachedDurations.push(performance.now() - startedAt)
      return checksum
    }
    const runCached = async () => {
      const resolver = new VersionedAssetResolver(32 * 1024 * 1024)
      let checksum = 0
      const startedAt = performance.now()
      for (let index = 0; index < rounds; index += 1) {
        const bytes = await resolver.resolveBuffer('wardrobe', 'model-1:uniform', 'rev1', async () => {
          cachedReadCalls += 1
          return readFile(assetPath)
        }, assetPath)
        const dataUrlPayload = bytes.toString('base64')
        checksum += dataUrlPayload.length + dataUrlPayload.charCodeAt(0) + dataUrlPayload.charCodeAt(dataUrlPayload.length - 1)
      }
      cachedDurations.push(performance.now() - startedAt)
      return { checksum, resolver }
    }
    let resolver
    for (let run = 0; run < measurementRuns; run += 1) {
      const uncachedFirst = run % 2 === 0
      const uncachedChecksum = uncachedFirst ? await runUncached() : null
      const cached = await runCached()
      resolver = cached.resolver
      const otherUncachedChecksum = uncachedFirst ? null : await runUncached()
      identicalPayloadChecksums &&= cached.checksum === (uncachedFirst ? uncachedChecksum : otherUncachedChecksum)
    }
    const copiedWrap = measureBufferWrapping(sample, bytes => Buffer.from(bytes))
    const viewWrap = measureBufferWrapping(sample, bytes => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
    const median = values => {
      const ordered = [...values].sort((left, right) => left - right)
      return Number(ordered[Math.floor(ordered.length / 2)].toFixed(3))
    }

    const result = {
      roundsPerRun: rounds,
      measurementRuns,
      bytesPerAsset: sample.byteLength,
      uncachedMedianMs: median(uncachedDurations),
      cachedMedianMs: median(cachedDurations),
      uncachedReadCalls,
      cachedReadCalls,
      savedReadCalls: uncachedReadCalls - cachedReadCalls,
      cacheEntries: resolver.entries,
      cacheBytes: resolver.byteSize,
      identicalPayloadChecksums,
      bufferWrapping: {
        roundsPerRun: 150,
        copiedMedianMs: copiedWrap.medianMs,
        viewMedianMs: viewWrap.medianMs,
        copyPathChecksum: copiedWrap.checksum,
        viewPathChecksum: viewWrap.checksum,
        copyBytesAvoidedPerAsset: sample.byteLength
      }
    }
    console.log(JSON.stringify(result, null, 2))
    if (uncachedReadCalls !== rounds * measurementRuns || cachedReadCalls !== measurementRuns || !result.identicalPayloadChecksums || copiedWrap.checksum !== viewWrap.checksum) {
      throw Error('A medição precisa preservar os bytes e evitar todas as leituras depois do primeiro cache miss.')
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
