'use strict'

// F1: self-contained, synthetic offline pipeline. Never reads user projects.
// Run: node scripts/editor-v6/engine-v3/smokeExport.cjs --frames=150 --width=640 --height=360
const sharp = require('sharp')
const { spawn, execFile } = require('node:child_process')
const { mkdtemp, stat, writeFile, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const { promisify } = require('node:util')
const { renderOfflineFrame } = require('./offlineCompositor.cjs')

const exec = promisify(execFile)

function parseArgs(argv) {
  const opts = { frames: 150, width: 640, height: 360, fps: 30 }
  for (const arg of argv) {
    const match = /^--(frames|width|height|fps)=(\d+)$/.exec(arg)
    if (!match) throw Error('Parâmetro inválido para smoke offline.')
    const key = match[1]
    if (!Number.isSafeInteger(Number(match[2]))) throw Error('Número de smoke inválido.')
    opts[key] = Number(match[2])
  }
  if (opts.frames < 1 || opts.frames > 300 || opts.width < 32 || opts.width > 1920 || opts.height < 32
    || opts.height > 1080 || opts.width * opts.height > 1920 * 1080 || opts.width % 2 || opts.height % 2
    || opts.width * 9 !== opts.height * 16 || opts.fps !== 30) throw Error('Intervalo/resolução inválidos para o laboratório.')
  return opts
}

async function syntheticAsset(svg) {
  return 'data:image/png;base64,' + (await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64')
}

async function syntheticProjectAssets() {
  const character = await syntheticAsset(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="160" viewBox="0 0 128 160">
    <path fill="#804b8a" d="M14 148 Q15 88 63 84 Q116 88 115 148Z"/>
    <ellipse cx="64" cy="65" rx="46" ry="55" fill="#f4cfa8"/>
    <path d="M18 44 Q20 -6 65 4 Q105 -3 110 46 Q88 20 67 26 Q37 18 18 44" fill="#46305d"/>
    <circle cx="46" cy="72" r="6" fill="#21213d"/><circle cx="83" cy="72" r="6" fill="#21213d"/>
    <path d="M56 98 Q64 105 72 98" stroke="#ad556b" stroke-width="3" fill="none"/>
  </svg>`)
  const blink = await syntheticAsset(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="160" viewBox="0 0 128 160">
    <path fill="#804b8a" d="M14 148 Q15 88 63 84 Q116 88 115 148Z"/>
    <ellipse cx="64" cy="65" rx="46" ry="55" fill="#f4cfa8"/>
    <path d="M18 44 Q20 -6 65 4 Q105 -3 110 46 Q88 20 67 26 Q37 18 18 44" fill="#46305d"/>
    <path d="M38 73 h16 M75 73 h16" stroke="#21213d" stroke-width="4"/>
    <path d="M56 98 Q64 105 72 98" stroke="#ad556b" stroke-width="3" fill="none"/>
  </svg>`)
  return [{ id: 'character', dataUrl: character }, { id: 'blink', dataUrl: blink }]
}

async function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => code === 0 ? resolve() : reject(Error(`FFmpeg terminou com ${code ?? signal}.`)))
  })
}

async function run(opts = parseArgs([])) {
  const dir = await mkdtemp(path.join(tmpdir(), 'native-gacha-engine-v3-'))
  try {
  const output = path.join(dir, 'synthetic-offline.mp4')
  const reportPath = path.join(dir, 'report.json')
  const assets = await syntheticProjectAssets()
  const ffmpeg = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'rgba',
    '-video_size', `${opts.width}x${opts.height}`, '-framerate', String(opts.fps), '-i', 'pipe:0',
    '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-n', output
  ], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] })
  let stderr = ''
  ffmpeg.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-3000) })
  const exited = waitForExit(ffmpeg)
  const started = performance.now()
  let framesWritten = 0
  try {
    for (let frame = 0; frame < opts.frames; frame++) {
      const selected = frame % 79 < 3 ? 'blink' : 'character'
      const x = Math.round(960 + 170 * Math.sin(frame / 18))
      const plan = {
        width: opts.width, height: opts.height, logicalHeight: 1080,
        backgroundColor: '#22283fff', assets,
        commands: [
          { kind: 'solid', x: 0, y: 840, width: 1920, height: 240, color: '#5e5778ff' },
          { kind: 'image', assetId: selected, x, y: 580, width: 550, height: 690,
            rotation: 5 * Math.sin(frame / 11), opacity: 1, flipX: false }
        ]
      }
      const pixels = await renderOfflineFrame(plan)
      if (pixels.length !== opts.width * opts.height * 4) throw Error('Compositor gerou tamanho incorreto.')
      await new Promise((resolve, reject) => ffmpeg.stdin.write(pixels, error => error ? reject(error) : resolve()))
      framesWritten++
    }
    ffmpeg.stdin.end()
    await exited
  } catch (error) {
    ffmpeg.stdin.destroy()
    ffmpeg.kill()
    await exited.catch(() => {})
    throw Error(`Smoke offline falhou: ${error instanceof Error ? error.message : String(error)}. ${stderr}`)
  }
  const wallMs = performance.now() - started
  const { stdout } = await exec('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries',
    'stream=codec_name,width,height,nb_read_frames,r_frame_rate', '-of', 'json', output
  ])
  const stream = JSON.parse(stdout).streams?.[0]
  if (!stream || stream.codec_name !== 'h264' || stream.width !== opts.width || stream.height !== opts.height
    || Number(stream.nb_read_frames) !== opts.frames || stream.r_frame_rate !== `${opts.fps}/1`) {
    throw Error('O MP4 sintético não passou na validação de frames/codec/resolução.')
  }
  const bytes = (await stat(output)).size
  const report = { status: 'validated', experiment: 'engine-v3-sharp-offline-smoke', syntheticOnly: true,
    renderer: 'sharp', transportPixelFormat: 'rgba', codec: stream.codec_name, frames: framesWritten,
    width: opts.width, height: opts.height, fps: opts.fps,
    outputBytes: bytes, wallMilliseconds: Math.round(wallMs),
    temporaryArtifactsRemoved: true,
    limitations: 'Fixture sintética sem timeline real, boca dinâmica, cabelo, texto, áudio ou vídeo sobreposto. Não é comparação com export de produção.' }
  await writeFile(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' })
  console.log(JSON.stringify(report, null, 2))
  return report
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2))).catch(error => { console.error(error); process.exitCode = 1 })
}
module.exports = { parseArgs, run }
