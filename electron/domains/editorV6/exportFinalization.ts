import { writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { EditorV6Document } from '../../../src/shared/editorV6'
import type { EditorV6ExportAudio, EditorV6ExportOptions, EditorV6ExportPart, EditorV6ExportStatus } from '../../../src/shared/editorV6Export'
import type { MediaProbe } from './exportMediaProbe'
import { editorV6AudioDecodeFailureSource, editorV6AudioFilterGraphs, isEditorV6AudioDecodeRateFailure, isEditorV6AudioPacketDecodeFailure, planEditorV6ProjectAudio } from './exportAudio'

/** Retained alias for callers that referenced the validation type through finalization. */
export type EditorV6ExportMediaProbe = MediaProbe

export type EditorV6ExportFinalizationPart = Pick<EditorV6ExportPart, 'startFrame'> & {
  encoder: string
  path: string
  probe?: EditorV6ExportMediaProbe
}

export type EditorV6ExportFinalizationResult = {
  validation: EditorV6ExportMediaProbe & { seams: number[]; decodedFramesNearEachSeam: number }
  audioClips: number
}

type Dependencies = {
  ffmpeg: string
  ffprobe: string
  folder: string
  candidate: string
  project: EditorV6Document
  options: Pick<EditorV6ExportOptions, 'startFrame' | 'endFrame' | 'width' | 'height'>
  totalFrames: number
  parts: readonly EditorV6ExportFinalizationPart[]
  signal: AbortSignal
  audioPath: (clip: EditorV6ExportAudio) => string | Promise<string>
  runCommand: (binary: string, args: string[], signal: AbortSignal, cwd?: string) => Promise<{ stdout: string; stderr: string }>
  probeMedia: (ffprobe: string, path: string, signal: AbortSignal, count?: boolean | 'packets') => Promise<EditorV6ExportMediaProbe>
  progress: (patch: Partial<EditorV6ExportStatus>) => void
  setAudioClipCount: (count: number) => void
  setDeliveryWarning: (warning: string) => void
  setValidation: (validation: EditorV6ExportMediaProbe) => void
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error)

/** Joins rendered parts, recovers only supported audio decode failures, then validates the final MP4. */
export async function finalizeEditorV6Export(deps: Dependencies): Promise<EditorV6ExportFinalizationResult> {
  const { parts, project, options, totalFrames, signal } = deps
  if (new Set(parts.map((part) => part.encoder)).size !== 1) throw Error('As partes usaram codificadores diferentes.')
  const signatures = parts.map((part) => {
    const video = part.probe?.streams.find((stream) => stream.codec_type === 'video')
    if (!video || video.codec_name !== 'h264') throw Error('Uma parte não contém vídeo H.264 válido.')
    return JSON.stringify([video.codec_name, video.profile, video.pix_fmt, video.width, video.height, video.r_frame_rate, video.time_base, video.extradata_hash])
  })
  if (new Set(signatures).size !== 1) throw Error('Os parâmetros das partes são incompatíveis para junção sem recodificação.')

  const audio = planEditorV6ProjectAudio(project, options.startFrame, options.endFrame)
  deps.progress({ state: 'joining', message: audio.length ? 'Juntando o vídeo e preparando a mixagem de áudio…' : 'Juntando o vídeo final…', frames: totalFrames })
  const list = join(deps.folder, 'parts.txt')
  await writeFile(list, parts.map((part) => `file '${basename(part.path)}'`).join('\n') + '\n')
  deps.setAudioClipCount(audio.length)
  const { strict: filters, recoverable: recoveryFilters } = editorV6AudioFilterGraphs(audio, totalFrames)
  const audioPaths = await Promise.all(audio.map((item) => deps.audioPath(item.clip)))
  const joinArgs = (recoverAudio = false) => ['-v', 'error', '-y', ...(recoverAudio ? ['-max_error_rate', '1'] : []), '-f', 'concat', '-safe', '0', '-i', list, ...audioPaths.flatMap((path) => ['-i', path]), ...(audio.length ? ['-filter_complex', (recoverAudio ? recoveryFilters : filters).join(';'), '-map', '0:v:0', '-map', '[mix]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000'] : ['-map', '0:v:0', '-an']), '-c:v', 'copy', '-t', String(totalFrames / 30), '-movflags', '+faststart', deps.candidate]
  try {
    await deps.runCommand(deps.ffmpeg, joinArgs(), signal, deps.folder)
  } catch (error) {
    signal.throwIfAborted()
    if (!audio.length) throw error
    const source = editorV6AudioDecodeFailureSource(error, audio)
    const sourceName = source.clip ? `“${source.clip.name}” (${source.clip.fileName})` : 'uma das fontes de áudio'
    const codec = source.codec ?? 'áudio'
    if (!isEditorV6AudioDecodeRateFailure(error)) {
      if (source.clip && isEditorV6AudioPacketDecodeFailure(error)) throw Error(`A fonte ${sourceName} contém dados ${codec} inválidos e não há quadros decodificáveis suficientes. O MP4 não foi publicado para evitar áudio ausente. Substitua ou reimporte essa mídia. ${message(error)}`, { cause: error })
      throw error
    }
    deps.progress({ state: 'joining', message: `Recuperando quadros decodificáveis de ${sourceName}…` })
    try {
      // FFmpeg's default max_error_rate is 2/3 and returns code 69 above it.
      // Retry only after that failure; valid sources keep the strict, unchanged path.
      await deps.runCommand(deps.ffmpeg, joinArgs(true), signal, deps.folder)
    } catch (recoveryError) {
      throw Error(`A fonte ${sourceName} tem erros demais para recuperar o ${codec}. O MP4 não foi publicado para evitar áudio ausente. Substitua ou reimporte essa mídia. ${message(recoveryError)}`, { cause: recoveryError })
    }
    deps.setDeliveryWarning(`O MP4 foi exportado e validado, mas a fonte ${sourceName} contém quadros ${codec} inválidos. O FFmpeg recuperou os quadros decodificáveis; os trechos danificados podem estar ausentes ou silenciosos. Substitua ou reimporte essa mídia para preservar o áudio completo.`)
  }

  deps.progress({ state: 'validating', message: 'Conferindo quadros, duração e emendas do MP4…' })
  const seams = parts.slice(1).map((part) => part.startFrame - options.startFrame)
  const validateSeams = async () => {
    for (let offset = 0; offset < seams.length; offset += 2) {
      const checks = await Promise.allSettled(seams.slice(offset, offset + 2).map((seam) =>
        deps.runCommand(deps.ffmpeg, ['-v', 'error', '-err_detect', 'explode', '-ss', String(Math.max(0, seam - 1) / 30), '-i', deps.candidate, '-frames:v', '3', '-an', '-f', 'null', '-'], signal)
      ))
      const failed = checks.find((check) => check.status === 'rejected')
      if (failed?.status === 'rejected') throw failed.reason
    }
  }
  const [packetProbeResult, seamResult] = await Promise.allSettled([
    deps.probeMedia(deps.ffprobe, deps.candidate, signal, 'packets'),
    validateSeams()
  ])
  if (packetProbeResult.status === 'rejected') throw packetProbeResult.reason
  if (seamResult.status === 'rejected') throw seamResult.reason
  let validation = packetProbeResult.value
  const packetVideo = validation.streams.find((stream) => stream.codec_type === 'video')
  // Encoded parts have already been frame-count validated; no-B-frame H.264 has one packet per frame.
  if (Number(packetVideo?.nb_read_packets) !== totalFrames || Number(packetVideo?.has_b_frames ?? 0) !== 0) {
    validation = await deps.probeMedia(deps.ffprobe, deps.candidate, signal, true)
  }
  deps.setValidation(validation)
  const video = validation.streams.find((stream) => stream.codec_type === 'video')
  const validatedFrames = video?.nb_read_frames === undefined && Number(video?.has_b_frames ?? 0) === 0
    ? video?.nb_read_packets : video?.nb_read_frames
  if (!video || Number(validatedFrames) !== totalFrames || video.width !== deps.options.width || video.height !== deps.options.height || video.r_frame_rate !== '30/1' || !Number.isFinite(Number(video.duration)) || Math.abs(Number(video.duration) - totalFrames / 30) > 1 / 30 + .001) throw Error('O arquivo final não passou na validação de quadros, resolução, FPS ou duração.')
  if (audio.length) {
    const sound = validation.streams.find((stream) => stream.codec_type === 'audio')
    if (!sound || !Number.isFinite(Number(sound.duration)) || Math.abs(Number(sound.duration) - totalFrames / 30) > .05) throw Error('O arquivo final perdeu ou truncou a trilha de áudio.')
  }
  return { validation: { ...validation, seams, decodedFramesNearEachSeam: seams.length ? 3 : 0 }, audioClips: audio.length }
}
