'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')

const BYTES_PER_PIXEL = 4

function run(binary, args, { maxBytes = 128 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks = []
    let size = 0, stderr = ''
    child.stdout.on('data', chunk => {
      size += chunk.length
      if (size > maxBytes) { child.kill(); reject(new Error('O decoder excedeu o limite de saída.')); return }
      chunks.push(chunk)
    })
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8000) })
    child.once('error', reject)
    child.once('close', code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`Ferramenta de mídia encerrou com código ${code}: ${stderr.trim()}`)))
  })
}

function compareBgra(reference, rendered, width, height) {
  if (reference.length !== rendered.length || reference.length !== width * height * BYTES_PER_PIXEL) {
    throw new Error('Tamanho BGRA incompatível entre a captura de referência e o quadro exportado.')
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
    method: 'PSNR RGB plus SSIM luma, 8x8 non-overlapping blocks, source is raw BGRA capture immediately before encoder.'
  }
}

async function compareRun({ runFolder, videoPath, ffmpegPath, width, height }) {
  const referenceFolder = path.join(runFolder, 'quality-reference')
  const names = (await fs.readdir(referenceFolder).catch(() => []))
    .filter(name => /^\d+\.bgra$/.test(name)).sort((a, b) => Number.parseInt(a) - Number.parseInt(b))
  if (!names.length) throw new Error('Não há quadros BGRA de referência; a comparação de qualidade não foi executada.')
  const frameNumbers = names.map(name => Number.parseInt(name, 10))
  const expression = frameNumbers.length ? `select=${frameNumbers.map(frame => `eq(n\\,${frame})`).join('+')}` : null
  const frameBytes = width * height * BYTES_PER_PIXEL
  const renderedFrames = expression
    ? await run(ffmpegPath, ['-v', 'error', '-i', videoPath, '-vf', expression, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'bgra', 'pipe:1'], { maxBytes: frameBytes * names.length + frameBytes })
    : Buffer.alloc(0)
  const frames = []
  for (const [index, name] of names.entries()) {
    const frameNumber = frameNumbers[index]
    const reference = await fs.readFile(path.join(referenceFolder, name))
    const rendered = renderedFrames.subarray(index * frameBytes, (index + 1) * frameBytes)
    frames.push({ frame: frameNumber, ...(rendered.length === frameBytes ? compareBgra(reference, rendered, width, height) : { error: 'Quadro ausente no MP4.' }) })
  }
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
