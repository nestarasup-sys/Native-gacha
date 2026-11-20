'use strict'

// F1 only. Synthetic, reproducible resource/raster profile; no user project,
// Chromium, filesystem writes or MP4. Encoding is tested in smokeExport.cjs.
const sharp = require('sharp')
const { createHash } = require('node:crypto')
const { performance } = require('node:perf_hooks')
const { renderOfflineFrame } = require('./offlineCompositor.cjs')

function parseArgs(args) {
  const options = { width: 640, height: 360, frames: 12, atlas: 256, static: false }
  const found = new Set()
  for (const arg of args) {
    if (arg === '--static') {
      if (found.has('static')) throw Error('Flag duplicada.')
      found.add('static'); options.static = true; continue
    }
    const match = /^--(width|height|frames|atlas)=(\d+)$/.exec(arg)
    if (!match || found.has(match[1])) throw Error('Parâmetro de perfil inválido ou duplicado.')
    const number = Number(match[2])
    if (!Number.isSafeInteger(number)) throw Error('Parâmetro numérico inválido.')
    options[match[1]] = number
    found.add(match[1])
  }
  if (options.width < 64 || options.height < 36 || options.width > 1920 || options.height > 1080
    || options.width % 2 || options.height % 2 || options.width * 9 !== options.height * 16
    || options.frames < 1 || options.frames > 300 || options.atlas < 64 || options.atlas > 2048
    || options.atlas % 2) throw Error('Dimensões fora dos limites do laboratório.')
  return options
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const pick = p => Number(sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))].toFixed(3))
  return { count: samples.length, p50Ms: pick(.5), p95Ms: pick(.95),
    minMs: pick(0), maxMs: pick(1), sumMs: Number(samples.reduce((s, x) => s + x, 0).toFixed(3)) }
}
async function syntheticAtlas(size) {
  const pixels = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const off = (y * size + x) * 4
    pixels[off] = (x * 13 + y * 5) & 255
    pixels[off + 1] = (x * 3 + y * 11) & 255
    pixels[off + 2] = (x * 7 + y * 17) & 255
    pixels[off + 3] = 90 + ((x * 5 + y * 3) % 166)
  }
  const encoded = await sharp(pixels, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer()
  return { id: 'synthetic-atlas', dataUrl: `data:image/png;base64,${encoded.toString('base64')}`, encodedBytes: encoded.length }
}

async function profile(opts = parseArgs([])) {
  const started = performance.now()
  const atlas = await syntheticAtlas(opts.atlas)
  const prepareMs = performance.now() - started
  const inputDigest = createHash('sha256').update(atlas.dataUrl).digest('hex')
  let observedRssPeakBytes = process.memoryUsage().rss, firstSha256 = '', lastSha256 = ''
  const samples = []
  const rasterStart = performance.now()
  for (let index = 0; index < opts.frames; index++) {
    const phase = opts.static ? 0 : index
    const left = (phase % 5) * (opts.atlas / 10)
    const crop = { x: Math.floor(left), y: 0,
      width: opts.atlas / 2, height: opts.atlas / 2 }
    const plan = {
      width: opts.width, height: opts.height, logicalHeight: 1080,
      backgroundColor: '#152a40ff',
      assets: [{ id: atlas.id, dataUrl: atlas.dataUrl }],
      commands: [
        { kind: 'image', assetId: atlas.id, x: 960 + phase * 4, y: 540,
          width: 1000, height: 800, rotation: phase % 7, opacity: .8,
          source: crop, flipX: phase % 2 === 0 },
      ]
    }
    const frameStart = performance.now()
    const pixels = await renderOfflineFrame(plan)
    samples.push(performance.now() - frameStart)
    if (pixels.length !== opts.width * opts.height * 4) throw Error('Frame RGBA tem dimensões incompatíveis.')
    const digest = createHash('sha256').update(pixels).digest('hex')
    if (index === 0) firstSha256 = digest
    lastSha256 = digest
    observedRssPeakBytes = Math.max(observedRssPeakBytes, process.memoryUsage().rss)
  }
  const rasterMs = performance.now() - rasterStart
  return {
    schemaVersion: 1,
    experiment: 'editor-v6-engine-v3-offline-raster-profile',
    syntheticOnly: true, comparableToLegacyExport: false, platform: process.platform,
    nodeVersion: process.version, sharpVersion: sharp.versions.sharp, libvipsVersion: sharp.versions.vips,
    width: opts.width, height: opts.height, frames: opts.frames, atlasSize: opts.atlas,
    staticFrames: opts.static, inputSha256: inputDigest, assetEncodedBytes: atlas.encodedBytes,
    frameBytes: opts.width * opts.height * 4, firstSha256, lastSha256,
    prepareMs: Number(prepareMs.toFixed(3)), rasterMs: Number(rasterMs.toFixed(3)),
    elapsedWallMs: Number((performance.now() - started).toFixed(3)),
    frameTiming: summarize(samples), observedRssPeakBytes,
    limitations: 'Sampling RSS after each frame is not a process peak. Repeated synthetic atlas, no real V6 hair/mouth, Chromium reference, MP4, audio, IPC or Windows packaged application.'
  }
}

if (require.main === module) {
  profile(parseArgs(process.argv.slice(2))).then(report => {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  }).catch(error => {
    console.error('O perfil sintético offline falhou:', error.message)
    process.exitCode = 1
  })
}

module.exports = { parseArgs, profile }
