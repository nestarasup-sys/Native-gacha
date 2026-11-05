import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { stat } from 'node:fs/promises'
import type { EditorV7Document } from '../../../src/shared/editorV7'
import { editorV7TickToFrame, parseEditorV7Document } from '../../../src/shared/editorV7'
import { createEditorV7FrameRenderer } from './renderFrame'

export type EditorV7ExportResult = { outputPath: string; frames: number; encoder: string; milliseconds: number; renderingMilliseconds: number; encoderBackpressureMilliseconds: number; mediaDecodeWarning?: string }
export type EditorV7VideoOverlay = { path: string; startFrame: number; endFrame: number; mediaInFrame: number; layout: { x: number; y: number; width: number; height: number; rotation: number }; audioEnabled: boolean; gain: number }
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
  videoOverlays?: EditorV7VideoOverlay[]
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
  const overlays = options.videoOverlays ?? []
  const inputArgs = overlays.flatMap((clip) => ['-ss', String(clip.mediaInFrame / fps), '-t', String((clip.endFrame - clip.startFrame) / fps), '-i', clip.path])
  const filters: string[] = ['[0:v]setsar=1[base]']
  let lastVideo = 'base'
  overlays.forEach((clip, index) => {
    const start = clip.startFrame / fps, end = clip.endFrame / fps
    const boxWidth = clip.layout.width * document.width / 100, boxHeight = clip.layout.height * document.height / 100
    const centerX = (50 + clip.layout.x) * document.width / 100, centerY = (50 + clip.layout.y) * document.height / 100
    const output = `mix${index}`
    filters.push(`[${index + 1}:v:0]scale=${boxWidth}:${boxHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,format=rgba,rotate=${clip.layout.rotation * Math.PI / 180}:ow=rotw(iw):oh=roth(ih):c=none,setpts=PTS-STARTPTS+${start}/TB[clip${index}]`)
    filters.push(`[${lastVideo}][clip${index}]overlay=x='${centerX}-overlay_w/2':y='${centerY}-overlay_h/2':enable='gte(t,${start})*lt(t,${end})':eof_action=pass:repeatlast=0[${output}]`)
    lastVideo = output
  })
  filters.push(`[${lastVideo}]null[vout]`)
  const audioIndexes = overlays.flatMap((clip, index) => clip.audioEnabled && clip.gain > 0 ? [index] : [])
  audioIndexes.forEach((overlayIndex, audioIndex) => {
    const clip = overlays[overlayIndex]
    const duration = (clip.endFrame - clip.startFrame) / fps
    const delaySamples = Math.round(clip.startFrame * 48_000 / fps)
    filters.push(`[${overlayIndex + 1}:a:0]atrim=duration=${duration},asetpts=PTS-STARTPTS,aresample=48000:async=48000:first_pts=0,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${clip.gain},adelay=${delaySamples}S:all=1[a${audioIndex}]`)
  })
  if (audioIndexes.length) {
    filters.push(`${audioIndexes.map((_index, audioIndex) => `[a${audioIndex}]`).join('')}amix=inputs=${audioIndexes.length}:normalize=0:duration=longest:dropout_transition=0,asetpts=N/SR/TB,apad=whole_dur=${totalFrames / fps},atrim=duration=${totalFrames / fps},asetpts=N/SR/TB[aout]`)
  }
  const raw = spawn(options.ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-max_error_rate', '1', '-y', '-f', 'rawvideo', '-pixel_format', 'rgba',
    '-video_size', `${document.width}x${document.height}`, '-framerate', String(fps), '-i', 'pipe:0', ...inputArgs,
    '-filter_complex', filters.join(';'), '-map', '[vout]', ...(audioIndexes.length ? ['-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000'] : ['-an']),
    '-c:v', encoder, '-b:v', '12M', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-profile:v', 'high', '-level:v', '4.1', '-g', String(fps * 2), '-bf', '0', '-video_track_timescale', '30000',
    '-movflags', '+faststart', '-f', 'mp4', options.outputPath
  ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  raw.stdout.resume()
  const started = performance.now()
  let renderingMilliseconds = 0
  let encoderBackpressureMilliseconds = 0
  let encoderStderr = ''
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
    encoderStderr = result.stderr
  } catch (error) {
    raw.stdin.destroy()
    if (!raw.killed && raw.exitCode === null) raw.kill()
    const encoderResult = await completion.catch(() => undefined)
    if (encoderResult && encoderResult.code !== 0 && !options.signal.aborted) {
      throw new Error(`O encoder/comp da timeline V7 encerrou antes do fim (código ${encoderResult.code}): ${encoderResult.stderr.trim() || (error instanceof Error ? error.message : String(error))}`)
    }
    throw error
  }
  const output = await stat(options.outputPath)
  if (!output.isFile() || output.size < 512) throw new Error('O MP4 V7 não foi criado corretamente.')
  const probe = spawn(options.ffprobe, ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,duration', '-of', 'json', options.outputPath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let probeOut = '', probeError = ''
  probe.stdout.setEncoding('utf8'); probe.stderr.setEncoding('utf8')
  probe.stdout.on('data', (chunk: string) => { if (probeOut.length < 64_000) probeOut += chunk })
  probe.stderr.on('data', (chunk: string) => { if (probeError.length < 32_000) probeError += chunk })
  const probeCode = await new Promise<number>((resolve, reject) => {
    probe.once('error', reject)
    probe.once('close', (code) => resolve(code ?? -1))
  })
  if (probeCode !== 0) throw new Error(`ffprobe não conseguiu validar o MP4 V7: ${probeError.trim()}`)
  const probeData = JSON.parse(probeOut) as { streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; r_frame_rate?: string; nb_read_frames?: string }> }
  const video = probeData.streams?.find((stream) => stream.codec_type === 'video')
  if (video?.codec_name !== 'h264' || video.width !== document.width || video.height !== document.height || video.r_frame_rate !== `${fps}/1` || Number(video.nb_read_frames) !== totalFrames) {
    throw new Error(`A validação do MP4 V7 divergiu: esperados ${totalFrames} frames H.264 ${document.width}×${document.height} a ${fps} FPS; recebido ${JSON.stringify(video)}.`)
  }
  if (Boolean(probeData.streams?.some((stream) => stream.codec_type === 'audio')) !== Boolean(audioIndexes.length)) throw new Error('A presença da trilha de áudio do MP4 V7 não corresponde às mídias da timeline.')
  const mediaDecodeWarning = /Invalid data found when processing input|Input buffer exhausted before END element found/i.test(encoderStderr)
    ? 'A trilha AAC de uma mídia contém pacotes danificados; o FFmpeg recuperou os pacotes decodificáveis e manteve a trilha sincronizada até o fim do projeto.'
    : undefined
  return { outputPath: options.outputPath, frames: totalFrames, encoder, milliseconds: Math.round(performance.now() - started), renderingMilliseconds: Math.round(renderingMilliseconds), encoderBackpressureMilliseconds: Math.round(encoderBackpressureMilliseconds), ...(mediaDecodeWarning ? { mediaDecodeWarning } : {}) }
}
