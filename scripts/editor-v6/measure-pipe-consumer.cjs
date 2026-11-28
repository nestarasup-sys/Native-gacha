'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { createHash } = require('node:crypto')
const { createReadStream } = require('node:fs')

const argument = (prefix) => process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length)
const captureDirectory = argument('--capture-dir=') && path.resolve(argument('--capture-dir='))
const resultDirectory = argument('--result-dir=') && path.resolve(argument('--result-dir='))
const sampleName = argument('--sample=')
const runName = `${sampleName}-${new Date().toISOString().replace(/[:.]/g, '-')}`
const arms = [
  { name: 'A1', concurrency: 1 }, { name: 'B1', concurrency: 4 },
  { name: 'A2', concurrency: 1 }, { name: 'B2', concurrency: 4 },
  { name: 'A3', concurrency: 1 }, { name: 'B3', concurrency: 4 }
]
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function sha256(filePath) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

function run(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    const started = process.hrtime.bigint()
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-16_000) })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      const wallMs = Number(process.hrtime.bigint() - started) / 1e6
      if (code !== 0) reject(Error(`${path.basename(binary)} terminou com ${code}/${signal}: ${stderr.slice(-2000)}`))
      else resolve({ wallMs, stderr })
    })
  })
}

async function probe(ffprobe, mediaPath) {
  const { stdout } = await new Promise((resolve, reject) => {
    const child = spawn(ffprobe, [
      '-v', 'error', '-select_streams', 'v:0', '-count_frames',
      '-show_entries', 'stream=nb_read_frames,avg_frame_rate,width,height', '-of', 'json', mediaPath
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000) })
    child.once('error', reject)
    child.once('close', (code) => code === 0 ? resolve({ stdout }) : reject(Error(`ffprobe falhou: ${stderr}`)))
  })
  const stream = JSON.parse(stdout).streams?.[0]
  if (Number(stream?.nb_read_frames) !== 150 || stream?.avg_frame_rate !== '30/1')
    throw Error(`Saída não validou 150 quadros a 30 FPS: ${JSON.stringify(stream)}`)
  return { frames: Number(stream.nb_read_frames), fps: stream.avg_frame_rate, width: stream.width, height: stream.height }
}

async function main() {
  if (!captureDirectory || !resultDirectory || !['without-video', 'with-video'].includes(sampleName))
    throw Error('Uso: node measure-pipe-consumer.cjs --capture-dir=<dump> --result-dir=<novo diretório> --sample=without-video|with-video')
  const resultParent = path.resolve('out/editor-v6-stress/runs')
  const relative = path.relative(resultParent, resultDirectory)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw Error('Os resultados precisam ficar em um diretório novo sob out/editor-v6-stress/runs.')
  const stats = await fs.statfs(resultParent)
  if (stats.bavail * stats.bsize < 3 * 1024 ** 3) throw Error('Menos de 3 GiB livres antes da medição.')
  await fs.mkdir(resultDirectory, { recursive: false })
  const metadata = JSON.parse(await fs.readFile(path.join(captureDirectory, `frames-${sampleName}.json`), 'utf8'))
  const ffprobe = path.join(path.dirname(metadata.ffmpeg), 'ffprobe.exe')
  const inputStat = await fs.stat(metadata.rawPath)
  if (inputStat.size !== metadata.bytesPerFrame * 150 || metadata.framesCaptured !== 150)
    throw Error(`Dump incompleto: ${inputStat.size} bytes, ${metadata.framesCaptured}/150 quadros.`)

  const results = []
  let retainedReference
  for (let index = 0; index < arms.length; index++) {
    const arm = arms[index]
    if (index > 0) await delay(60_000)
    const paths = Array.from({ length: arm.concurrency }, (_, worker) =>
      path.join(resultDirectory, `${arm.name}-worker-${worker + 1}.mp4`)
    )
    const startedAt = new Date().toISOString()
    const wallStarted = process.hrtime.bigint()
    const workerResults = await Promise.all(paths.map(async (outputPath) => {
      const args = metadata.argsTemplate.map((value) => value === '{{OUTPUT}}' ? outputPath : value)
      if (!args.includes(outputPath)) throw Error('O comando arquivado não tinha marcador de saída.')
      return run(metadata.ffmpeg, args)
    }))
    const wallMs = Number(process.hrtime.bigint() - wallStarted) / 1e6
    const validation = await Promise.all(paths.map((outputPath) => probe(ffprobe, outputPath)))
    const frames = arm.concurrency * 150
    const aggregateFps = frames / (wallMs / 1000)
    const entry = {
      arm: arm.name,
      concurrency: arm.concurrency,
      startedAt,
      wallMs,
      workerWallMs: workerResults.map((item) => item.wallMs),
      frames,
      aggregateFps,
      extrapolated6000FrameSeconds: 6000 / aggregateFps,
      validation,
      stderrBytes: workerResults.map((item) => Buffer.byteLength(item.stderr))
    }
    results.push(entry)
    console.log(JSON.stringify(entry))
    if (arm.name === 'A1') {
      retainedReference = paths[0]
    } else {
      await Promise.all(paths.map((outputPath) => fs.rm(outputPath, { force: true })))
    }
  }

  const summary = {
    schemaVersion: 1,
    runName,
    input: {
      kind: metadata.kind,
      sha256: await sha256(metadata.rawPath),
      bytes: inputStat.size,
      frames: metadata.framesCaptured,
      bytesPerFrame: metadata.bytesPerFrame,
      width: metadata.width,
      height: metadata.height,
      fps: metadata.fps,
      ffmpegArgs: metadata.argsTemplate
    },
    protocol: 'A/B/A/B/A/B, 60 s de descanso entre execuções, processo Node e máquina únicos',
    referenceForQuality: retainedReference,
    results
  }
  const summaryPath = path.join(resultDirectory, 'consumer-ceiling.json')
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), { flag: 'wx' })
  console.log(`RELATORIO=${summaryPath}`)
}

main().catch((error) => {
  console.error(`[V6 consumer ceiling] ${error.message}`)
  process.exitCode = 1
})
