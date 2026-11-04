'use strict'
// Offline A/B probe only. No project writes and no changes to production MP4.
const sharp = require('sharp')
const { readFile } = require('node:fs/promises')
const { performance } = require('node:perf_hooks')

const LIMIT_PIXELS = 4096 * 2160
function parseArgs(argv) {
  const values = new Map()
  for (const arg of argv) {
    const match = arg.match(/^--([a-z-]+)(?:=(.*))?$/)
    if (!match || !['background', 'foreground', 'reference', 'frames', 'width', 'height', 'strict'].includes(match[1]) || values.has(match[1])) throw Error('Parâmetros inválidos para o spike de composição nativa.')
    values.set(match[1], match[2] ?? 'true')
  }
  const frames = Number(values.get('frames') ?? 30)
  const width = Number(values.get('width') ?? 1920)
  const height = Number(values.get('height') ?? 1080)
  if (![frames, width, height].every(Number.isSafeInteger) || frames < 1 || frames > 1000 || width < 32 || height < 32 || width * height > LIMIT_PIXELS) throw Error('Dimensões ou quantidade de quadros fora dos limites do spike.')
  if (values.has('foreground') !== values.has('background')) throw Error('Informe fundo e primeiro plano juntos.')
  if (values.has('reference') && !values.has('background')) throw Error('Referência exige fundo e primeiro plano fornecidos.')
  if (values.has('strict') && !values.has('reference')) throw Error('--strict exige --reference.')
  return { frames, width, height, background: values.get('background'), foreground: values.get('foreground'), reference: values.get('reference'), strict: values.has('strict') }
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
if (require.main === module) {
  ;(async () => {
    try {
      const opts = parseArgs(process.argv.slice(2))
      const result = await benchmark(opts)
      console.log(JSON.stringify(result, null, 2))
      if (opts.strict && !result.parity?.identical) process.exitCode = 2
    } catch { console.error('O spike nativo não conseguiu validar as entradas ou a composição. Verifique os argumentos e as imagens isoladas.'); process.exitCode = 1 }
  })()
}
module.exports = { parseArgs, compareRgba, benchmark }
