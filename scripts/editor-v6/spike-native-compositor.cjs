'use strict'
// Offline A/B probe only. No project writes and no changes to production MP4.
const sharp = require('sharp')
const { readFile, writeFile, mkdir } = require('node:fs/promises')
const { spawn } = require('node:child_process')
const { createHash } = require('node:crypto')
const path = require('node:path')
const { performance } = require('node:perf_hooks')

const LIMIT_PIXELS = 4096 * 2160
function parseArgs(argv) {
  const values = new Map()
  for (const arg of argv) {
    const match = arg.match(/^--([a-z-]+)(?:=(.*))?$/)
    if (!match || !['background', 'foreground', 'reference', 'frames', 'width', 'height', 'strict', 'canvas-parity'].includes(match[1]) || values.has(match[1])) throw Error('Parâmetros inválidos para o spike de composição nativa.')
    values.set(match[1], match[2] ?? 'true')
  }
  const canvasParity = values.has('canvas-parity')
  const frames = Number(values.get('frames') ?? 30)
  const width = Number(values.get('width') ?? (canvasParity ? 640 : 1920))
  const height = Number(values.get('height') ?? (canvasParity ? 360 : 1080))
  if (![frames, width, height].every(Number.isSafeInteger) || frames < 1 || frames > 1000 || width < 32 || height < 32 || width * height > LIMIT_PIXELS) throw Error('Dimensões ou quantidade de quadros fora dos limites do spike.')
  if (values.has('foreground') !== values.has('background')) throw Error('Informe fundo e primeiro plano juntos.')
  if (values.has('reference') && !values.has('background')) throw Error('Referência exige fundo e primeiro plano fornecidos.')
  if (canvasParity && (values.has('foreground') || values.has('reference'))) throw Error('--canvas-parity usa somente uma fixture dinâmica sintética.')
  if (values.has('strict') && !values.has('reference') && !canvasParity) throw Error('--strict exige --reference ou --canvas-parity.')
  return { frames, width, height, background: values.get('background'), foreground: values.get('foreground'), reference: values.get('reference'), strict: values.has('strict'), canvasParity }
}

function compareRgba(actual, reference, width, height) {
  if (actual.length !== width * height * 4 || reference.length !== actual.length) throw Error('Quadros RGBA possuem dimensões incompatíveis.')
  let mismatchedPixels = 0, mismatchedChannels = 0, sumDifference = 0, maximumChannelDifference = 0
  for (let pixel = 0; pixel < width * height; pixel++) {
    let pixelDifferent = false
    for (let channel = 0; channel < 4; channel++) {
      const offset = pixel * 4 + channel, difference = Math.abs(actual[offset] - reference[offset])
      if (difference) { pixelDifferent = true; mismatchedChannels++ }
      sumDifference += difference
      if (difference > maximumChannelDifference) maximumChannelDifference = difference
    }
    if (pixelDifferent) mismatchedPixels++
  }
  return { identical: mismatchedPixels === 0, mismatchedPixels, mismatchedChannels, maximumChannelDifference,
    meanAbsoluteChannelDifference: Number((sumDifference / actual.length).toFixed(6)) }
}
function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(p / 100 * sorted.length) - 1)]
}
async function rgba(buffer) {
  const { data, info } = await sharp(buffer, { limitInputPixels: LIMIT_PIXELS }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}
async function syntheticInputs(width, height) {
  const background = await sharp({ create: { width, height, channels: 4, background: { r: 40, g: 32, b: 52, alpha: 1 } } }).png().toBuffer()
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '"><rect x="7" y="13" width="' + (width - 14) + '" height="' + (height - 26) + '" rx="40" fill="#ce5480" opacity="0.63"/><circle cx="' + Math.floor(width / 2) + '" cy="' + Math.floor(height / 2) + '" r="' + Math.floor(Math.min(width, height) / 5) + '" fill="#aaf4ed" opacity="0.83"/></svg>'
  const foreground = await sharp(Buffer.from(svg)).png().toBuffer()
  return { background, foreground }
}
async function benchmark(opts) {
  if (opts.canvasParity) return benchmarkCanvasParity(opts)
  const supplied = Boolean(opts.background)
  const { background, foreground } = supplied ? { background: await readFile(opts.background), foreground: await readFile(opts.foreground) } : await syntheticInputs(opts.width, opts.height)
  const [bg, fg] = await Promise.all([rgba(background), rgba(foreground)])
  if (bg.width !== fg.width || bg.height !== fg.height) throw Error('As camadas de entrada têm dimensões diferentes.')
  const width = bg.width, height = bg.height
  const composite = async () => sharp(bg.data, { raw: { width, height, channels: 4 } })
    .composite([{ input: fg.data, raw: { width, height, channels: 4 }, blend: 'over' }])
    .raw().toBuffer()
  for (let i = 0; i < 3; i++) await composite()
  let output, observedRssPeak = process.memoryUsage().rss
  const samples = [], started = performance.now()
  for (let i = 0; i < opts.frames; i++) {
    const frameStarted = performance.now()
    output = await composite()
    samples.push(performance.now() - frameStarted)
    observedRssPeak = Math.max(observedRssPeak, process.memoryUsage().rss)
  }
  const elapsed = performance.now() - started
  let parity = null
  if (opts.reference) {
    const reference = await rgba(await readFile(opts.reference))
    if (reference.width !== width || reference.height !== height) throw Error('A referência possui resolução incompatível.')
    parity = compareRgba(output, reference.data, width, height)
  }
  return {
    experiment: 'sharp-native-rgba-over', syntheticOnly: !supplied, sourceFrameCount: 1,
    width, height, frames: opts.frames,
    totalMs: Number(elapsed.toFixed(2)), framesPerSecond: Number((opts.frames * 1000 / elapsed).toFixed(2)),
    p50FrameMs: Number(percentile(samples, 50).toFixed(2)), p95FrameMs: Number(percentile(samples, 95).toFixed(2)),
    observedRssPeakBytes: observedRssPeak, parity,
    limitations: 'Compositor 2D isolado: não inclui preparo do cabelo, timeline, animação, FFmpeg, áudio ou Chromium. Uma única dupla de PNGs repetida não prova 300 quadros dinâmicos.'
  }
}

function buildDynamicFixture(width, height, frameCount) {
  const background = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4
    background[offset] = (x * 3 + y) % 256
    background[offset + 1] = (y * 5 + x) % 256
    background[offset + 2] = (x + y * 2) % 256
    background[offset + 3] = 255
  }
  const overlayWidth = Math.min(96, width), overlayHeight = Math.min(128, height)
  const frames = Array.from({ length: frameCount }, (_, frame) => {
    const pixels = Buffer.alloc(overlayWidth * overlayHeight * 4)
    const phase = frame * 0.23
    for (let y = 0; y < overlayHeight; y++) for (let x = 0; x < overlayWidth; x++) {
      const offset = (y * overlayWidth + x) * 4
      const center = overlayWidth / 2 + 12 * Math.sin(y / 11 + phase) + 3 * Math.sin(y / 4 + phase * 1.7)
      const distance = Math.abs(x - center)
      const edge = Math.max(0, Math.min(1, 1.5 - distance))
      if (!edge) continue
      pixels[offset] = 48 + Math.round(20 * Math.sin(phase))
      pixels[offset + 1] = 36 + Math.round(15 * Math.cos(phase))
      pixels[offset + 2] = 88 + Math.round(24 * Math.sin(phase + 1))
      pixels[offset + 3] = Math.round(220 * edge)
    }
    const horizontalTravel = Math.max(0, width - overlayWidth)
    const verticalTravel = Math.max(0, height - overlayHeight)
    return {
      pixels,
      left: Math.round(horizontalTravel / 2 + Math.sin(phase) * horizontalTravel * 0.16),
      top: Math.round(verticalTravel / 2 + Math.cos(phase * 0.8) * verticalTravel * 0.2)
    }
  })
  return { width, height, background, overlayWidth, overlayHeight, frames }
}

function summarizeSamples(samples) {
  const sorted = [...samples].sort((left, right) => left - right)
  return {
    totalMs: Number(samples.reduce((sum, value) => sum + value, 0).toFixed(2)),
    p50FrameMs: Number(sorted[Math.floor(sorted.length * 0.5)].toFixed(3)),
    p95FrameMs: Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)].toFixed(3))
  }
}

async function runOffscreenCanvasFixture(workspace, fixture) {
  const inputPath = path.join(workspace, 'canvas-fixture.json')
  const outputPath = path.join(workspace, 'canvas-results.json')
  const input = {
    width: fixture.width, height: fixture.height,
    background: fixture.background.toString('base64'),
    overlayWidth: fixture.overlayWidth, overlayHeight: fixture.overlayHeight,
    frames: fixture.frames.map(frame => ({ pixels: frame.pixels.toString('base64'), left: frame.left, top: frame.top }))
  }
  await writeFile(inputPath, JSON.stringify(input), { flag: 'wx' })
  const helper = path.join(__dirname, 'spike-native-compositor-canvas.cjs')
  const child = spawn(require('electron'), [helper, inputPath, outputPath], {
    cwd: path.resolve(__dirname, '../..'), env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
    windowsHide: true, stdio: 'inherit'
  })
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (status, signal) => status === null ? reject(Error(`Electron offscreen encerrou por sinal ${signal}.`)) : resolve(status))
  })
  if (code !== 0) throw Error(`A prova Canvas2D offscreen falhou (Electron ${code}).`)
  return JSON.parse(await readFile(outputPath, 'utf8'))
}

async function benchmarkCanvasParity(opts) {
  if (opts.frames > 60 || opts.width * opts.height * opts.frames > 14_000_000) throw Error('A prova Canvas2D limita-se a 60 frames e 14 milhões de pixels acumulados.')
  const workspaceRoot = path.resolve(__dirname, '../../out/editor-v6-stress/runs')
  const workspace = path.join(workspaceRoot, `native-compositor-canvas-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`)
  await mkdir(workspace, { recursive: false })
  const fixture = buildDynamicFixture(opts.width, opts.height, opts.frames)
  const inputHashes = fixture.frames.map(frame => createHash('sha256').update(frame.pixels).digest('hex'))
  const canvas = await runOffscreenCanvasFixture(workspace, fixture)
  if (canvas.frames?.length !== opts.frames) throw Error('O backend Canvas2D não retornou todos os frames dinâmicos.')

  const composite = (frame) => sharp(fixture.background, { raw: { width: opts.width, height: opts.height, channels: 4 } })
    .composite([{ input: frame.pixels, raw: { width: fixture.overlayWidth, height: fixture.overlayHeight, channels: 4 }, left: frame.left, top: frame.top, blend: 'over' }])
    .raw().toBuffer()
  for (let index = 0; index < Math.min(3, fixture.frames.length); index++) await composite(fixture.frames[index])
  const samples = [], comparisons = []
  let observedRssPeakBytes = process.memoryUsage().rss
  const started = performance.now()
  for (let index = 0; index < fixture.frames.length; index++) {
    const frameStarted = performance.now()
    const sharpFrame = await composite(fixture.frames[index])
    samples.push(performance.now() - frameStarted)
    observedRssPeakBytes = Math.max(observedRssPeakBytes, process.memoryUsage().rss)
    const canvasFrame = Buffer.from(canvas.frames[index].rgba, 'base64')
    comparisons.push(compareRgba(sharpFrame, canvasFrame, opts.width, opts.height))
  }
  const totalMs = performance.now() - started
  const canvasTimings = summarizeSamples(canvas.samplesMs)
  const sharpTimings = summarizeSamples(samples)
  const exactFrames = comparisons.filter(item => item.identical).length
  const summary = {
    experiment: 'sharp-vs-canvas2d-dynamic-source-over', syntheticOnly: true,
    width: opts.width, height: opts.height, frames: opts.frames,
    distinctInputFrames: new Set(inputHashes).size,
    canvas: { ...canvasTimings, jsHeapBytes: canvas.jsHeapBytes, browserProcesses: canvas.processes },
    sharp: { ...sharpTimings, measuredPipelineWallMs: Number(totalMs.toFixed(2)), observedRssPeakBytes },
    parity: {
      exactFrames, frameCount: comparisons.length, allPixelsExact: exactFrames === comparisons.length,
      mismatchedPixels: comparisons.reduce((sum, item) => sum + item.mismatchedPixels, 0),
      maximumChannelDifference: Math.max(...comparisons.map(item => item.maximumChannelDifference)),
      meanAbsoluteChannelDifference: Number((comparisons.reduce((sum, item) => sum + item.meanAbsoluteChannelDifference, 0) / comparisons.length).toFixed(6))
    },
    speedRatioCanvasOverSharp: Number((canvasTimings.totalMs / sharpTimings.totalMs).toFixed(2)),
    limitations: 'Fixture sintética com movimento translacional e alpha. Não representa rig, interpolação de poses, expressões, cabelo físico, timeline, FFmpeg ou MP4.'
  }
  await writeFile(path.join(workspace, 'native-compositor-parity.json'), JSON.stringify(summary, null, 2), { flag: 'wx' })
  return { ...summary, reportPath: path.join(workspace, 'native-compositor-parity.json') }
}

if (require.main === module) {
  ;(async () => {
    try {
      const opts = parseArgs(process.argv.slice(2))
      const result = await benchmark(opts)
      console.log(JSON.stringify(result, null, 2))
      const identical = result.parity?.identical ?? result.parity?.allPixelsExact
      if (opts.strict && !identical) process.exitCode = 2
    } catch { console.error('O spike nativo não conseguiu validar as entradas ou a composição. Verifique os argumentos e as imagens isoladas.'); process.exitCode = 1 }
  })()
}
module.exports = { parseArgs, compareRgba, buildDynamicFixture, benchmark }
