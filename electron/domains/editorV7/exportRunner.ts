import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { stat } from 'node:fs/promises'
import type { EditorV7Document } from '../../../src/shared/editorV7'
import { editorV7TickToFrame, parseEditorV7Document } from '../../../src/shared/editorV7'
import { createEditorV7FrameRenderer } from './renderFrame'

export type EditorV7ExportResult = { outputPath: string; frames: number; encoder: string; milliseconds: number; renderingMilliseconds: number; encoderBackpressureMilliseconds: number }
type ChildResult = { code: number; stderr: string }

function runCommand(executable: string, args: string[], signal: AbortSignal): Promise<ChildResult> {
  signal.throwIfAborted()
  const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => { if (stderr.length < 32_000) stderr += chunk })
  const abort = () => child.kill()
  signal.addEventListener('abort', abort, { once: true })
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => {
      signal.removeEventListener('abort', abort)
      if (signal.aborted) reject(signal.reason)
      else resolve({ code: code ?? -1, stderr })
    })
  })
}

async function selectEncoder(ffmpeg: string, signal: AbortSignal): Promise<string> {
  const candidates = ['h264_nvenc', 'h264_amf', 'h264_qsv', 'h264_mf', 'libopenh264']
  for (const encoder of candidates) {
    const result = await runCommand(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=30',
      '-frames:v', '1', '-an', '-c:v', encoder, '-pix_fmt', 'yuv420p', '-f', 'null', '-'
    ], signal)
    if (result.code === 0) return encoder
  }
  throw new Error('Nenhum encoder H.264 disponível foi aprovado no teste local do FFmpeg.')
}

function waitForChild(child: ChildProcessWithoutNullStreams, signal: AbortSignal): Promise<ChildResult> {
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => { if (stderr.length < 32_000) stderr += chunk })
  const abort = () => child.kill()
  signal.addEventListener('abort', abort, { once: true })
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => {
      signal.removeEventListener('abort', abort)
      if (signal.aborted) reject(signal.reason)
      else resolve({ code: code ?? -1, stderr })
    })
  })
}

async function writeFrame(child: ChildProcessWithoutNullStreams, frame: Buffer, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  if (child.stdin.destroyed) throw new Error('O encoder encerrou a entrada antes do fim dos frames.')
  if (!child.stdin.write(frame)) await new Promise<void>((resolve, reject) => {
    const onDrain = () => { cleanup(); resolve() }
    const onError = (error: Error) => { cleanup(); reject(error) }
    const onAbort = () => { cleanup(); reject(signal.reason) }
    const cleanup = () => { child.stdin.off('drain', onDrain); child.stdin.off('error', onError); signal.removeEventListener('abort', onAbort) }
    child.stdin.once('drain', onDrain); child.stdin.once('error', onError); signal.addEventListener('abort', onAbort, { once: true })
  })
}

export async function runEditorV7Export(options: {
  document: unknown
  ffmpeg: string
  ffprobe: string
  outputPath: string
  signal: AbortSignal
  onProgress?: (frames: number, totalFrames: number) => void
}): Promise<EditorV7ExportResult> {
  const document: EditorV7Document = parseEditorV7Document(options.document)
  const fps = document.frameRate.numerator / document.frameRate.denominator
  if (!Number.isFinite(fps) || fps < 1 || fps > 240 || !Number.isInteger(fps)) throw new Error('A exportação inicial do V7 requer taxa de quadros inteira entre 1 e 240 FPS.')
  const totalFrames = editorV7TickToFrame(document.durationTicks, document.frameRate)
  if (totalFrames < 1 || totalFrames > 1_000_000) throw new Error('A duração da exportação está fora do limite permitido.')
  const encoder = await selectEncoder(options.ffmpeg, options.signal)
  const renderFrame = createEditorV7FrameRenderer(document)
  const raw = spawn(options.ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'rgba',
    '-video_size', `${document.width}x${document.height}`, '-framerate', String(fps), '-i', 'pipe:0', '-an',
    '-c:v', encoder, '-b:v', '12M', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-profile:v', 'high', '-level:v', '4.1', '-g', String(fps * 2), '-bf', '0', '-video_track_timescale', '30000',
    '-movflags', '+faststart', '-f', 'mp4', options.outputPath
  ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  raw.stdout.resume()
  const started = performance.now()
  let renderingMilliseconds = 0
  let encoderBackpressureMilliseconds = 0
  const completion = waitForChild(raw, options.signal)
  try {
    for (let frame = 0; frame < totalFrames; frame += 1) {
      options.signal.throwIfAborted()
      const tick = Math.round(frame * 90_000 * document.frameRate.denominator / document.frameRate.numerator)
      const renderStarted = performance.now()
      const pixels = await renderFrame(tick, options.signal)
      renderingMilliseconds += performance.now() - renderStarted
      const writeStarted = performance.now()
      await writeFrame(raw, pixels, options.signal)
      encoderBackpressureMilliseconds += performance.now() - writeStarted
      options.onProgress?.(frame + 1, totalFrames)
    }
    raw.stdin.end()
    const result = await completion
    if (result.code !== 0) throw new Error(`FFmpeg não concluiu o MP4 V7 (código ${result.code}): ${result.stderr.trim()}`)
  } catch (error) {
    raw.stdin.destroy()
    if (!raw.killed && raw.exitCode === null) raw.kill()
    await completion.catch(() => undefined)
    throw error
  }
  const output = await stat(options.outputPath)
  if (!output.isFile() || output.size < 512) throw new Error('O MP4 V7 não foi criado corretamente.')
  const probe = spawn(options.ffprobe, ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,nb_read_frames', '-of', 'json', options.outputPath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let probeOut = '', probeError = ''
  probe.stdout.setEncoding('utf8'); probe.stderr.setEncoding('utf8')
  probe.stdout.on('data', (chunk: string) => { if (probeOut.length < 64_000) probeOut += chunk })
  probe.stderr.on('data', (chunk: string) => { if (probeError.length < 32_000) probeError += chunk })
  const probeCode = await new Promise<number>((resolve, reject) => {
    probe.once('error', reject)
    probe.once('close', (code) => resolve(code ?? -1))
  })
  if (probeCode !== 0) throw new Error(`ffprobe não conseguiu validar o MP4 V7: ${probeError.trim()}`)
  const probeData = JSON.parse(probeOut) as { streams?: Array<{ codec_name?: string; width?: number; height?: number; r_frame_rate?: string; nb_read_frames?: string }> }
  const video = probeData.streams?.[0]
  if (video?.codec_name !== 'h264' || video.width !== document.width || video.height !== document.height || video.r_frame_rate !== `${fps}/1` || Number(video.nb_read_frames) !== totalFrames) {
    throw new Error(`A validação do MP4 V7 divergiu: esperados ${totalFrames} frames H.264 ${document.width}×${document.height} a ${fps} FPS; recebido ${JSON.stringify(video)}.`)
  }
  return { outputPath: options.outputPath, frames: totalFrames, encoder, milliseconds: Math.round(performance.now() - started), renderingMilliseconds: Math.round(renderingMilliseconds), encoderBackpressureMilliseconds: Math.round(encoderBackpressureMilliseconds) }
}
