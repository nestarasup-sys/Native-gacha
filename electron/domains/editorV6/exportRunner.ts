import { mkdir, mkdtemp, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { availableParallelism } from 'node:os'
import type { EditorV6Document } from '../../../src/shared/editorV6'
import { missingEditorV6Motions } from '../../../src/shared/editorV6Motion'
import { planEditorV6Audio, planEditorV6Export, type EditorV6ExportAudio, type EditorV6ExportOptions, type EditorV6ExportPart, type EditorV6ExportStatus } from '../../../src/shared/editorV6Export'
import { runExportCommand, spawnExportProcess, waitForExport } from './exportProcess'
import type { EditorV6FrameWorker } from './exportWorkers'
type StreamProbe = { codec_type: string; codec_name: string; profile?: string; pix_fmt?: string; width?: number; height?: number; r_frame_rate?: string; time_base?: string; nb_read_frames?: string; nb_frames?: string; duration?: string; extradata_hash?: string }
export type MediaProbe = { streams: StreamProbe[]; format: { duration?: string } }
export async function probeExportMedia(ffprobe: string, path: string, signal: AbortSignal, count = false): Promise<MediaProbe> {
  const result = await runExportCommand(ffprobe, ['-v', 'error', ...(count ? ['-count_frames'] : []), '-show_streams', '-show_format', '-show_data_hash', 'sha256', '-of', 'json', path], signal)
  return JSON.parse(result.stdout) as MediaProbe
}
type PartReport = EditorV6ExportPart & { encoder: string; rendered: number; reused: number; frames: number; milliseconds: number; path: string; probe?: MediaProbe }
type AttemptReport = { parts: PartReport[]; encoder: string; parallelism: number; milliseconds?: number; error?: string }
export type EditorV6ExportReport = { schemaVersion: 1; id: string; state: string; projectId: string; options: EditorV6ExportOptions; fps: 30; totalFrames: number; fallback: boolean; attempts: AttemptReport[]; encoderTests: Array<{ encoder: string; error?: string }>; audioClips: number; videoInputs: number; proxies: 0; startedAt: string; endedAt?: string; milliseconds?: number; outputPath: string; validation?: unknown; error?: string }
type Dependencies = {
  ffmpeg: string; ffprobe: string; tempRoot: string; reportPath: string; outputPath: string; id: string
  createWorker: (part: EditorV6ExportPart, signal: AbortSignal) => Promise<EditorV6FrameWorker>
  audioPath: (clip: EditorV6ExportAudio) => string
  mediaPath: (projectId: string, fileName: string) => string
  signal: AbortSignal; progress: (patch: Partial<EditorV6ExportStatus>) => void
}
const message = (error: unknown) => error instanceof Error ? error.message : String(error)
const encodingArgs = (encoder: string, threads: number) => ['-c:v', encoder, ...(encoder === 'libopenh264' ? ['-b:v', '12M', '-rc_mode', 'quality', '-allow_skip_frames', '0', '-threads', String(threads)] : ['-b:v', '12M']), '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level:v', '4.1', '-g', '60', '-bf', '0', '-video_track_timescale', '30000']

function timelineMediaAudio(project: EditorV6Document): EditorV6ExportAudio[] {
  const media = new Map((project.media ?? []).filter((asset) => asset.hasAudio).map((asset) => [asset.id, asset]))
  return project.timeline.tracks.flatMap((track) => track.blocks.flatMap((block) => {
    const asset = block.mediaId ? media.get(block.mediaId) : undefined
    if (!asset || (track.kind !== 'audio' && !(track.kind === 'video' && asset.kind === 'video')) || track.muted || track.hidden || block.audioEnabled === false) return []
    return [{ id: block.id, name: asset.name, fileName: asset.fileName, sourceFrames: asset.sourceFrames, startFrame: block.startFrame, sourceInFrame: block.mediaInFrame ?? 0, durationFrames: block.durationFrames, gain: block.gain ?? 1, muted: false }]
  }))
}
type TimelineVideoClip = { fileName: string; mediaInFrame: number; startFrame: number; endFrame: number }
function timelineVideoClips(project: EditorV6Document, startFrame: number, endFrame: number): TimelineVideoClip[] {
  const media = new Map((project.media ?? []).filter((asset) => asset.kind === 'video').map((asset) => [asset.id, asset.fileName]))
  return project.timeline.tracks.filter((track) => track.kind === 'video' && !track.hidden && !track.muted).flatMap((track) => track.blocks.flatMap((block) => {
    const fileName = block.mediaId ? media.get(block.mediaId) : undefined
    const start = Math.max(startFrame, block.startFrame), end = Math.min(endFrame, block.startFrame + block.durationFrames)
    return fileName && end > start ? [{ fileName, mediaInFrame: (block.mediaInFrame ?? 0) + start - block.startFrame, startFrame: start, endFrame: end }] : []
  })).sort((a, b) => a.startFrame - b.startFrame || a.fileName.localeCompare(b.fileName))
}
export async function runEditorV6Export(project: EditorV6Document, options: EditorV6ExportOptions, deps: Dependencies): Promise<EditorV6ExportReport> {
  const planned = planEditorV6Export(options, project.timeline.durationFrames)
  if (missingEditorV6Motions(project, options.startFrame, options.endFrame).length) throw Error('Aguarde a preparação das animações antes de exportar.')
  if (process.platform !== 'win32') throw Error('Este exportador BGRA está preparado para Windows.')
  const started = performance.now(), totalFrames = options.endFrame - options.startFrame
  const layeredVideo = timelineVideoClips(project, 0, project.timeline.durationFrames).length > 0
  const report: EditorV6ExportReport = { schemaVersion: 1, id: deps.id, projectId: project.id, options, fps: 30, totalFrames, state: 'preparing', fallback: false, attempts: [], encoderTests: [], audioClips: 0, videoInputs: new Set(timelineVideoClips(project, options.startFrame, options.endFrame).map((clip) => clip.fileName)).size, proxies: 0, startedAt: new Date().toISOString(), outputPath: deps.outputPath }
  await mkdir(deps.tempRoot, { recursive: true })
  const folder = await mkdtemp(join(deps.tempRoot, 'editor-v6-export-'))
  const candidate = join(dirname(deps.outputPath), `.editor-v6-${deps.id}.mp4`)
  let published = false
  const saveReport = async () => { await mkdir(dirname(deps.reportPath), { recursive: true }); await writeFile(deps.reportPath + '.tmp', JSON.stringify(report, null, 2)); await rename(deps.reportPath + '.tmp', deps.reportPath) }
  const testEncoder = async (encoder: string) => {
    try {
      await runExportCommand(deps.ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=30', '-frames:v', '1', ...encodingArgs(encoder, 1), '-an', '-f', 'null', '-'], deps.signal)
      report.encoderTests.push({ encoder }); return true
    } catch (error) { deps.signal.throwIfAborted(); report.encoderTests.push({ encoder, error: message(error) }); return false }
  }
  const renderAttempt = async (parts: EditorV6ExportPart[], encoder: string): Promise<PartReport[]> => {
    const began = performance.now(), controller = new AbortController(), abort = () => controller.abort(deps.signal.reason)
    deps.signal.addEventListener('abort', abort, { once: true })
    if (deps.signal.aborted) abort()
    const attempt: AttemptReport = { parts: [], encoder, parallelism: parts.length }
    report.attempts.push(attempt)
    let done = 0
    deps.progress({ state: 'rendering', frames: 0, message: parts.length === 2 ? 'Renderizando duas partes em paralelo…' : 'Renderizando em modo seguro…', fallback: report.fallback })
    const tasks = parts.map(async (part): Promise<PartReport> => {
      const beganPart = performance.now(), path = join(folder, `attempt-${report.attempts.length}-part-${part.index}.mp4`)
      const result: PartReport = { ...part, path, encoder, rendered: 0, reused: 0, frames: 0, milliseconds: 0 }
      attempt.parts.push(result)
      let worker: EditorV6FrameWorker | undefined
      const videoClips = timelineVideoClips(project, part.startFrame, part.endFrame)
      const videoInputs = videoClips.flatMap((clip) => ['-ss', String(clip.mediaInFrame / 30), '-t', String((clip.endFrame - clip.startFrame) / 30), '-i', deps.mediaPath(project.id, clip.fileName)])
      const filters = layeredVideo ? ['[0:v]crop=iw:ih/2:0:0,format=rgba,setsar=1[base]', '[0:v]crop=iw:ih/2:0:ih/2,format=rgba,setsar=1[fg]'] : ['[0:v]setsar=1[base]']
      let lastVideo = 'base'
      videoClips.forEach((clip, index) => {
        const offset = (clip.startFrame - part.startFrame) / 30, end = (clip.endFrame - part.startFrame) / 30
        const output = index === videoClips.length - 1 && !layeredVideo ? 'vout' : `mix${index}`
        filters.push(`[${index + 1}:v:0]scale=${options.width}:${options.height}:force_original_aspect_ratio=increase,crop=${options.width}:${options.height},setsar=1,setpts=PTS-STARTPTS+${offset}/TB[clip${index}]`)
        filters.push(`[${lastVideo}][clip${index}]overlay=0:0:enable='gte(t,${offset})*lt(t,${end})':eof_action=pass:repeatlast=0[${output}]`)
        lastVideo = output
      })
      if (layeredVideo) filters.push(`[${lastVideo}][fg]overlay=0:0:format=auto:eof_action=pass:repeatlast=1[vout]`)
      const filterArgs = layeredVideo || videoClips.length ? ['-filter_complex', filters.join(';'), '-map', '[vout]'] : ['-map', '0:v:0']
      const rawHeight = options.height * (layeredVideo ? 2 : 1)
      const process = spawnExportProcess(deps.ffmpeg, ['-v', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'bgra', '-video_size', `${options.width}x${rawHeight}`, '-framerate', '30', '-i', 'pipe:0', ...videoInputs, ...filterArgs, '-an', ...encodingArgs(encoder, Math.max(1, Math.min(8, Math.floor(availableParallelism() / parts.length)))), '-frames:v', String(part.endFrame - part.startFrame), path], controller.signal)
      try {
        worker = await deps.createWorker(part, controller.signal)
        let bitmap: Buffer | undefined
        for (let frame = part.startFrame; frame < part.endFrame; frame++) {
          controller.signal.throwIfAborted()
          const rendered = await worker.frame(frame)
          if (rendered.reused && bitmap) result.reused++
          else { if (!rendered.bitmap) throw Error('O renderizador não entregou o bitmap.'); bitmap = rendered.bitmap; result.rendered++ }
          await waitForExport(new Promise<void>((resolve, reject) => process.child.stdin.write(bitmap!, (error) => error ? reject(error) : resolve())), controller.signal, 60000, 'enviar quadro ao FFmpeg')
          result.frames++; done++
          deps.progress({ frames: done })
        }
        process.child.stdin.end()
        await waitForExport(process.done, controller.signal, 120000, 'finalizar parte')
        result.probe = await probeExportMedia(deps.ffprobe, path, controller.signal)
        if (Number(result.probe.streams.find((stream) => stream.codec_type === 'video')?.nb_frames) !== part.endFrame - part.startFrame) throw Error('Uma parte não contém todos os quadros previstos.')
        result.milliseconds = performance.now() - beganPart
        return result
      } catch (error) { controller.abort(error); throw error }
      finally { worker?.close(); if (process.child.exitCode === null) process.child.kill(); await process.done.catch(() => {}) }
    })
    try {
      const results = await Promise.allSettled(tasks)
      const failed = results.find((item) => item.status === 'rejected')
      if (failed?.status === 'rejected') throw failed.reason
      return results.flatMap((item) => item.status === 'fulfilled' ? [item.value] : []).sort((a, b) => a.index - b.index)
    } catch (error) { attempt.error = message(error); throw error }
    finally { attempt.milliseconds = performance.now() - began; deps.signal.removeEventListener('abort', abort) }
  }
  try {
    deps.signal.throwIfAborted()
    await saveReport()
    await mkdir(dirname(deps.outputPath), { recursive: true })
    await writeFile(candidate, '', { flag: 'wx' })
    let encoder = ''
    for (const candidate of options.encoder === 'auto' ? ['h264_nvenc', 'h264_qsv', 'h264_amf', 'libopenh264'] : ['libopenh264']) if (await testEncoder(candidate)) { encoder = candidate; break }
    if (!encoder) throw Error('Nenhum codificador H.264 pôde ser iniciado.')
    const finish = async (parts: PartReport[]) => {
      if (new Set(parts.map((part) => part.encoder)).size !== 1) throw Error('As partes usaram codificadores diferentes.')
      const signatures = parts.map((part) => {
        const video = part.probe?.streams.find((stream) => stream.codec_type === 'video')
        if (!video || video.codec_name !== 'h264') throw Error('Uma parte não contém vídeo H.264 válido.')
        return JSON.stringify([video.codec_name, video.profile, video.pix_fmt, video.width, video.height, video.r_frame_rate, video.time_base, video.extradata_hash])
      })
      if (new Set(signatures).size !== 1) throw Error('Os parâmetros das partes são incompatíveis para junção sem recodificação.')
      deps.progress({ state: 'joining', message: 'Juntando o vídeo e preparando a mixagem de áudio…', frames: totalFrames })
      const list = join(folder, 'parts.txt')
      await writeFile(list, parts.map((part) => `file '${basename(part.path)}'`).join('\n') + '\n')
      const audio = planEditorV6Audio([...(project.exportAudio ?? []), ...timelineMediaAudio(project)], options.startFrame, options.endFrame)
      report.audioClips = audio.length
      const filters = audio.map((item, index) => `[${index + 1}:a:0]atrim=start=${item.sourceInFrame / 30}:duration=${item.durationFrames / 30},asetpts=N/SR/TB,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${item.clip.gain},adelay=${item.delayFrames * 1600}S:all=1[a${index}]`)
      if (audio.length) filters.push(`${audio.map((_item, index) => `[a${index}]`).join('')}amix=inputs=${audio.length}:normalize=0:duration=longest:dropout_transition=0,asetpts=N/SR/TB,apad=whole_dur=${totalFrames / 30},atrim=duration=${totalFrames / 30},asetpts=N/SR/TB[mix]`)
      await runExportCommand(deps.ffmpeg, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, ...audio.flatMap((item) => ['-i', deps.audioPath(item.clip)]), ...(audio.length ? ['-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[mix]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000'] : ['-map', '0:v:0', '-an']), '-c:v', 'copy', '-t', String(totalFrames / 30), '-movflags', '+faststart', candidate], deps.signal, folder)
      deps.progress({ state: 'validating', message: 'Conferindo quadros, duração e emendas do MP4…' })
      const validation = await probeExportMedia(deps.ffprobe, candidate, deps.signal, true)
      report.validation = validation
      const video = validation.streams.find((stream) => stream.codec_type === 'video')
      if (!video || Number(video.nb_read_frames) !== totalFrames || video.width !== options.width || video.height !== options.height || video.r_frame_rate !== '30/1' || !Number.isFinite(Number(video.duration)) || Math.abs(Number(video.duration) - totalFrames / 30) > 1 / 30 + .001) throw Error('O arquivo final não passou na validação de quadros, resolução, FPS ou duração.')
      if (audio.length) {
        const sound = validation.streams.find((stream) => stream.codec_type === 'audio')
        if (!sound || !Number.isFinite(Number(sound.duration)) || Math.abs(Number(sound.duration) - totalFrames / 30) > .05) throw Error('O arquivo final perdeu ou truncou a trilha de áudio.')
      }
      const seams = parts.slice(1).map((part) => part.startFrame - options.startFrame)
      for (const seam of seams) await runExportCommand(deps.ffmpeg, ['-v', 'error', '-err_detect', 'explode', '-ss', String(Math.max(0, seam - 1) / 30), '-i', candidate, '-frames:v', '3', '-an', '-f', 'null', '-'], deps.signal)
      return { ...validation, seams, decodedFramesNearEachSeam: seams.length ? 3 : 0 }
    }
    try {
      report.validation = await finish(await renderAttempt(planned, encoder))
    } catch (error) {
      deps.signal.throwIfAborted()
      const attempt = report.attempts.at(-1)
      if (attempt) attempt.error = message(error)
      if (planned.length < 2) throw error
      report.fallback = true
      deps.progress({ message: 'O Turbo falhou. Reiniciando com um renderizador e CPU…', fallback: true })
      if (encoder !== 'libopenh264' && !await testEncoder('libopenh264')) throw Error('O codificador seguro também não está disponível.')
      report.validation = await finish(await renderAttempt([{ index: 0, startFrame: options.startFrame, endFrame: options.endFrame }], 'libopenh264'))
    }
    deps.signal.throwIfAborted()
    // The destination only changes after the candidate passes all validations.
    report.state = 'completed'
    report.endedAt = new Date().toISOString(); report.milliseconds = performance.now() - started
    await saveReport()
    deps.signal.throwIfAborted()
    await rename(candidate, deps.outputPath)
    published = true
    return report
  } catch (error) {
    report.state = deps.signal.aborted ? 'cancelled' : 'failed'
    report.error = message(error)
    throw error
  } finally {
    try {
      if (!published) { report.endedAt = new Date().toISOString(); report.milliseconds = performance.now() - started; await saveReport() }
    } finally {
      await unlink(candidate).catch(() => {})
      await unlink(deps.reportPath + '.tmp').catch(() => {})
      const absolute = resolve(folder)
      if (absolute.startsWith(resolve(deps.tempRoot) + sep) && basename(absolute).startsWith('editor-v6-export-')) await rm(absolute, { recursive: true, force: true })
    }
  }
}
