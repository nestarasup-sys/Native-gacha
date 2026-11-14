'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')

const BYTES_PER_PIXEL = 4

function run(binary, args, { maxBytes = 128 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks = []
    let size = 0, stderr = '', rejected = false
    child.stdout.on('data', chunk => {
      size += chunk.length
      if (size > maxBytes && !rejected) { rejected = true; child.kill(); reject(new Error('O decoder excedeu o limite de saída.')); return }
      chunks.push(chunk)
    })
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8000) })
    child.once('error', reject)
    child.once('close', code => {
      if (rejected) return
      code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`Ferramenta de mídia encerrou com código ${code}: ${stderr.trim()}`))
    })
  })
}

function compareBgra(reference, rendered, width, height) {
  if (reference.length !== rendered.length || reference.length !== width * height * BYTES_PER_PIXEL) {
    throw new Error('Tamanho BGRA incompatível entre o quadro de referência pré-encoder e o MP4.')
  }
  let squaredError = 0, samples = 0
  const blockSize = 8, c1 = (0.01 * 255) ** 2, c2 = (0.03 * 255) ** 2
  let ssimSum = 0, ssimBlocks = 0
  for (let top = 0; top < height; top += blockSize) {
    for (let left = 0; left < width; left += blockSize) {
      let sumA = 0, sumB = 0, sumA2 = 0, sumB2 = 0, sumAB = 0, count = 0
      for (let y = top; y < Math.min(top + blockSize, height); y++) {
        for (let x = left; x < Math.min(left + blockSize, width); x++) {
          const i = (y * width + x) * BYTES_PER_PIXEL
          const a = 0.2126 * reference[i + 2] + 0.7152 * reference[i + 1] + 0.0722 * reference[i]
          const b = 0.2126 * rendered[i + 2] + 0.7152 * rendered[i + 1] + 0.0722 * rendered[i]
          for (let channel = 0; channel < 3; channel++) {
            const delta = reference[i + channel] - rendered[i + channel]
            squaredError += delta * delta
            samples++
          }
          sumA += a; sumB += b; sumA2 += a * a; sumB2 += b * b; sumAB += a * b; count++
        }
      }
      const meanA = sumA / count, meanB = sumB / count
      const varianceA = Math.max(0, sumA2 / count - meanA * meanA)
      const varianceB = Math.max(0, sumB2 / count - meanB * meanB)
      const covariance = sumAB / count - meanA * meanB
      ssimSum += ((2 * meanA * meanB + c1) * (2 * covariance + c2))
        / ((meanA * meanA + meanB * meanB + c1) * (varianceA + varianceB + c2))
      ssimBlocks++
    }
  }
  const mse = squaredError / samples
  return {
    psnrRgbDb: mse === 0 ? null : Number((10 * Math.log10((255 * 255) / mse)).toFixed(5)),
    ssimLuma8x8: Number((ssimSum / ssimBlocks).toFixed(7)),
    samplePixels: width * height,
    method: 'PSNR RGB plus SSIM luma, 8x8 non-overlapping blocks; reference is sampled from the final composited FFmpeg filter output before encoding.'
  }
}

async function compareRun({ runFolder, videoPath, ffmpegPath, width, height }) {
  const referenceFolder = path.join(runFolder, 'encoder-reference')
  const names = (await fs.readdir(referenceFolder).catch(() => []))
    .filter(name => /^part-\d+\.json$/.test(name)).sort((a, b) => Number.parseInt(a.match(/\d+/)[0]) - Number.parseInt(b.match(/\d+/)[0]))
  if (!names.length) throw new Error('Não há manifestos de quadros pré-encoder; comparação indisponível.')
  const entries = []
  for (const name of names) {
    const manifest = JSON.parse(await fs.readFile(path.join(referenceFolder, name), 'utf8'))
    if (manifest.width !== width || manifest.height !== height || !Array.isArray(manifest.frames) || typeof manifest.dataFile !== 'string' || path.basename(manifest.dataFile) !== manifest.dataFile) {
      throw new Error(`Manifesto de qualidade inválido: ${name}`)
    }
    const data = await fs.readFile(path.join(referenceFolder, manifest.dataFile))
    const frameBytes = width * height * BYTES_PER_PIXEL
    if (data.length !== manifest.frames.length * frameBytes) throw new Error(`Quadros pré-encoder truncados: ${name}`)
    for (let i = 0; i < manifest.frames.length; i++) {
      const frame = manifest.frames[i]
      const localFrame = frame - manifest.exportStartFrame
      if (!Number.isInteger(localFrame) || localFrame < 0) throw new Error(`Índice de quadro inválido em ${name}`)
      entries.push({ frame, localFrame, data: data.subarray(i * frameBytes, (i + 1) * frameBytes) })
    }
  }
  entries.sort((a, b) => a.localFrame - b.localFrame)
  if (new Set(entries.map(item => item.localFrame)).size !== entries.length) throw new Error('Quadros duplicados nos manifestos de referência.')
  const frameBytes = width * height * BYTES_PER_PIXEL
  const expression = `select=${entries.map(item => `eq(n\\,${item.localFrame})`).join('+')}`
  const renderedFrames = await run(ffmpegPath, ['-v', 'error', '-i', videoPath, '-vf', expression, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'bgra', 'pipe:1'], { maxBytes: frameBytes * entries.length + frameBytes })
  const frames = entries.map((entry, index) => {
    const rendered = renderedFrames.subarray(index * frameBytes, (index + 1) * frameBytes)
    return { frame: entry.frame, ...(rendered.length === frameBytes ? compareBgra(entry.data, rendered, width, height) : { error: 'Quadro correspondente ausente no MP4.' }) }
  })
  return { frames, compared: frames.filter(frame => !frame.error).length, missing: frames.filter(frame => frame.error).length }
}

if (require.main === module) {
  const [runFolder, videoPath, ffmpegPath, widthText = '1920', heightText = '1080'] = process.argv.slice(2)
  if (!runFolder || !videoPath || !ffmpegPath) throw new Error('Uso: compare-planb-quality.cjs <run-folder> <mp4> <ffmpeg> [width] [height]')
  compareRun({ runFolder, videoPath, ffmpegPath, width: Number(widthText), height: Number(heightText) })
    .then(result => process.stdout.write(JSON.stringify(result)))
    .catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1 })
}

module.exports = { compareBgra, compareRun }
