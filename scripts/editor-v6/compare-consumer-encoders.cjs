'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { createReadStream } = require('node:fs')
const { createHash } = require('node:crypto')

const argument = (prefix) => process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length)
const captureDirectory = argument('--capture-dir=') && path.resolve(argument('--capture-dir='))
const resultDirectory = argument('--result-dir=') && path.resolve(argument('--result-dir='))
const candidateEncoder = argument('--encoder=')
const arms = [
  { arm: 'A1', encoder: 'libopenh264' }, { arm: 'B1', encoder: candidateEncoder },
  { arm: 'A2', encoder: 'libopenh264' }, { arm: 'B2', encoder: candidateEncoder },
  { arm: 'A3', encoder: 'libopenh264' }, { arm: 'B3', encoder: candidateEncoder }
]
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function run(binary, args) {
  return new Promise((resolve) => {
    const child = spawn(binary, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk).slice(-64_000) })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-64_000) })
    child.on('error', (error) => resolve({ code: null, signal: null, stdout, stderr: `${stderr}\n${error.message}` }))
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
}

async function sha256(filePath) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

async function probe(ffprobe, file) {
  const result = await run(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,avg_frame_rate,nb_frames', '-of', 'json', file])
  if (result.code !== 0) throw Error(`ffprobe falhou: ${result.stderr}`)
  const stream = JSON.parse(result.stdout || '{}').streams?.[0]
  if (!stream || stream.codec_name !== 'h264' || stream.width !== 1920 || stream.height !== 1080 || stream.avg_frame_rate !== '30/1' || stream.nb_frames !== '150')
    throw Error(`Saída não corresponde a H.264 1920×1080/30, 150 quadros: ${JSON.stringify(stream)}`)
  return stream
}

async function main() {
  if (!captureDirectory || !resultDirectory || !candidateEncoder || !/^[a-z0-9_]+$/.test(candidateEncoder) || candidateEncoder === 'libopenh264')
    throw Error('Uso: node compare-consumer-encoders.cjs --capture-dir=<dumps> --result-dir=<novo diretório> --encoder=<encoder alternativo>')
  const allowedRoot = path.resolve('out/editor-v6-stress/runs')
  const relative = path.relative(allowedRoot, resultDirectory)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Os resultados precisam ficar sob out/editor-v6-stress/runs.')
  const stats = await fs.statfs(allowedRoot)
  if (stats.bavail * stats.bsize < 3 * 1024 ** 3) throw Error('Menos de 3 GiB livres antes da comparação.')
  await fs.mkdir(resultDirectory, { recursive: false })

  const metadataPath = path.join(captureDirectory, 'frames-with-video.json')
  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'))
  if (metadata.framesCaptured !== 150 || metadata.bytesCaptured !== metadata.bytesPerFrame * 150)
    throw Error('A amostra bruta com vídeo está incompleta.')
  const encoderArgument = metadata.argsTemplate.findIndex((value, index, args) => value === '-c:v' && args[index + 1] === 'libopenh264')
  if (encoderArgument < 0) throw Error('Não encontrei exatamente o seletor -c:v libopenh264 no comando arquivado.')

  const ffprobe = path.join(path.dirname(metadata.ffmpeg), 'ffprobe.exe')
  const results = []
  const outputs = new Map()
  for (let index = 0; index < arms.length; index++) {
    if (index > 0) await delay(60_000)
    const { arm, encoder } = arms[index]
    const output = path.join(resultDirectory, `${arm}-${encoder}.mp4`)
    const args = metadata.argsTemplate.map((value, argIndex) => {
      if (value === '{{OUTPUT}}') return output
      if (argIndex === encoderArgument + 1) return encoder
      return value
    })
    const startedAt = new Date().toISOString()
    const began = process.hrtime.bigint()
    const execution = await run(metadata.ffmpeg, args)
    const wallMs = Number(process.hrtime.bigint() - began) / 1e6
    const entry = { arm, encoder, startedAt, wallMs, exitCode: execution.code, signal: execution.signal, stderr: execution.stderr, stderrBytes: Buffer.byteLength(execution.stderr) }
    if (execution.code === 0) {
      try {
        entry.validation = await probe(ffprobe, output)
        entry.bytes = (await fs.stat(output)).size
        outputs.set(arm, output)
      } catch (error) { entry.validationError = error.message }
    }
    results.push(entry)
    console.log(JSON.stringify(entry))
  }

  const quality = []
  for (const [control, candidate] of [['A1', 'B1'], ['A2', 'B2'], ['A3', 'B3']]) {
    if (!outputs.has(control) || !outputs.has(candidate)) {
      quality.push({ control, candidate, status: 'não calculado: MP4 inválido ou encoder falhou' })
      continue
    }
    const filter = '[0:v][1:v]ssim;[0:v][1:v]psnr'
    const metrics = await run(metadata.ffmpeg, [
      '-hide_banner', '-nostats', '-i', outputs.get(control), '-i', outputs.get(candidate),
      '-filter_complex', filter, '-f', 'null', '-'
    ])
    const ssim = metrics.stderr.match(/SSIM Y:[^\r\n]*All:([0-9.]+)/)
    const psnr = metrics.stderr.match(/PSNR y:[^\r\n]*average:([0-9.]+)/)
    quality.push({ control, candidate, exitCode: metrics.code, ssimAll: ssim?.[1] ?? null, psnrAverageDb: psnr?.[1] ?? null, stderr: metrics.stderr })
  }

  const summary = {
    schemaVersion: 1,
    candidateEncoder,
    sample: 'frames-with-video.bgra',
    inputSha256: await sha256(metadata.rawPath),
    protocol: 'A/B/A/B/A/B, controle libopenh264, um processo por braço, 60 s de descanso, encoder é a única opção FFmpeg alterada',
    argsTemplate: metadata.argsTemplate,
    results,
    quality,
    outputs: Object.fromEntries(outputs)
  }
  await fs.writeFile(path.join(resultDirectory, 'encoder-comparison.json'), JSON.stringify(summary, null, 2), { flag: 'wx' })
  console.log(`RELATORIO=${path.join(resultDirectory, 'encoder-comparison.json')}`)
}

main().catch((error) => {
  console.error(`[V6 encoder comparison] ${error.message}`)
  process.exitCode = 1
})
