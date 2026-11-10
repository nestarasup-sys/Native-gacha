import { dialog, type IpcMain, type IpcMainInvokeEvent } from 'electron'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { editorV6IpcChannels } from '../../../src/shared/editorV6IpcChannels'
import { editorV6ExportAudioSchema, editorV6MediaAssetSchema } from '../../../src/shared/editorV6Schema'
import type { EditorV6MediaAsset } from '../../../src/shared/editorV6'
import type { EditorV6ExportAudio } from '../../../src/shared/editorV6Export'
import { probeExportMedia } from './exportMediaProbe'

type LibraryVideo = {
  path: string
  name: string
  mimeType: EditorV6MediaAsset['mimeType']
  extension: string
  size: number
  durationFrames: number | null
}

type LibraryAudio = {
  path: string
  name: string
  mimeType: string
  extension: string
  size: number
}

type ExportAudioPathDependencies = {
  projectPath: (id: string) => string
  resolveLibraryVideo: (id: string) => Promise<LibraryVideo>
  resolveLibraryAudio: (id: string) => Promise<LibraryAudio>
}

type PendingFileWrites = {
  track<T>(operation: () => Promise<T>): Promise<T>
}

type ExportMediaIpcDependencies = ExportAudioPathDependencies & {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  assertAvailable: () => void
  pendingFileWrites: PendingFileWrites
  ffprobe: string
}

const audioExtensions = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus', 'webm']
const videoExtensions = ['mp4', 'webm', 'mov', 'm4v']

/** Resolves either a shared-library source or a project-local audio file. */
export function createEditorV6ExportAudioPathResolver(deps: ExportAudioPathDependencies) {
  return async (projectId: string, clip: EditorV6ExportAudio, media: readonly EditorV6MediaAsset[] = []) => clip.libraryAudioId
    ? (await deps.resolveLibraryAudio(clip.libraryAudioId)).path
    : clip.libraryVideoId ? (await deps.resolveLibraryVideo(clip.libraryVideoId)).path
      : join(deps.projectPath(projectId), media.some((item) => item.fileName === clip.fileName) ? 'media' : 'export-audio', clip.fileName)
}

/** Registers the Editor V6 export media import, link, and project-copy channels. */
export function registerEditorV6ExportMediaHandlers(deps: ExportMediaIpcDependencies): void {
  const uuid = z.string().uuid()
  const audioPath = createEditorV6ExportAudioPathResolver(deps)

  const inspectLibraryAudio = async (audioId: string) => {
    const source = await deps.resolveLibraryAudio(audioId)
    const probe = await probeExportMedia(deps.ffprobe, source.path, new AbortController().signal)
    const audio = probe.streams.find((stream) => stream.codec_type === 'audio')
    const duration = Number(probe.format.duration ?? audio?.duration ?? 0)
    const sourceFrames = Math.max(1, Math.floor(duration * 30))
    if (!audio || !Number.isFinite(duration) || duration <= 0 || sourceFrames > 1_000_000) throw Error('O áudio da biblioteca não passou pela validação de duração e faixa de áudio.')
    return { source, sourceFrames }
  }

  deps.ipcMain.handle(editorV6IpcChannels.importEditorV6ExportAudio, async (event, projectId: string): Promise<EditorV6ExportAudio | null> => {
    deps.assertTrustedSender(event); deps.assertAvailable(); uuid.parse(projectId)
    const result = await dialog.showOpenDialog({ title: 'Editor V6: adicionar áudio à exportação', properties: ['openFile'], filters: [{ name: 'Áudio', extensions: audioExtensions }] })
    const source = result.filePaths[0]
    if (result.canceled || !source) return null
    const fileStats = await stat(source)
    if (fileStats.size <= 0) throw Error('O arquivo de áudio está vazio.')
    if (fileStats.size > 2 * 1024 ** 3) throw Error('O arquivo de áudio excede 2 GB.')
    const extension = extname(source).slice(1).toLowerCase()
    if (!audioExtensions.includes(extension)) throw Error('Formato de áudio inválido.')
    const probe = await probeExportMedia(deps.ffprobe, source, new AbortController().signal)
    const audio = probe.streams.find((stream) => stream.codec_type === 'audio')
    if (!audio) throw Error('O arquivo selecionado não contém áudio.')
    const duration = Number(probe.format.duration ?? audio.duration ?? 0)
    if (!Number.isFinite(duration) || duration <= 0) throw Error('A duração do áudio não pôde ser determinada.')
    const sourceFrames = Math.max(1, Math.floor(duration * 30))
    if (sourceFrames > 1_000_000) throw Error('A duração do áudio passa do limite do Editor V6.')
    const id = randomUUID(), fileName = `${id}.${extension}`
    const clip = editorV6ExportAudioSchema.parse({ id, fileName, name: basename(source), sourceFrames, startFrame: 0, sourceInFrame: 0, durationFrames: sourceFrames, gain: 1, muted: false })
    const folder = join(deps.projectPath(projectId), 'export-audio')
    deps.assertAvailable()
    return deps.pendingFileWrites.track(async () => {
      await mkdir(folder, { recursive: true })
      await copyFile(source, join(folder, fileName))
      return clip
    })
  })

  deps.ipcMain.handle(editorV6IpcChannels.cloneEditorV6ExportAudio, async (event, sourceId: string, targetId: string, rawClips: unknown) => {
    deps.assertTrustedSender(event); deps.assertAvailable(); uuid.parse(sourceId); uuid.parse(targetId)
    const clips = z.array(editorV6ExportAudioSchema).max(32).parse(rawClips)
    const folder = join(deps.projectPath(targetId), 'export-audio')
    return deps.pendingFileWrites.track(async () => {
      await mkdir(folder, { recursive: true })
      for (const clip of clips) if (!clip.libraryAudioId) await copyFile(await audioPath(sourceId, clip), join(folder, clip.fileName))
    })
  })

  deps.ipcMain.handle(editorV6IpcChannels.importEditorV6Media, async (event, projectId: string, rawKind: unknown): Promise<EditorV6MediaAsset | null> => {
    deps.assertTrustedSender(event); deps.assertAvailable(); uuid.parse(projectId)
    const kind = z.enum(['video', 'audio']).parse(rawKind)
    const allowed = kind === 'video' ? videoExtensions : audioExtensions
    const result = await dialog.showOpenDialog({ title: `Editor V6: importar ${kind === 'video' ? 'vídeo' : 'áudio'}`, properties: ['openFile'], filters: [{ name: kind === 'video' ? 'Vídeos' : 'Áudios', extensions: allowed }] })
    const source = result.filePaths[0]
    if (result.canceled || !source) return null
    const fileStats = await stat(source)
    if (fileStats.size <= 0 || fileStats.size > 2 * 1024 ** 3) throw Error('O arquivo precisa ter até 2 GB.')
    const extension = extname(source).slice(1).toLowerCase()
    if (!allowed.includes(extension)) throw Error('O formato selecionado não é compatível com este tipo de mídia.')
    const probe = await probeExportMedia(deps.ffprobe, source, new AbortController().signal)
    const video = probe.streams.find((stream) => stream.codec_type === 'video')
    const audio = probe.streams.find((stream) => stream.codec_type === 'audio')
    if (kind === 'video' && !video) throw Error('O arquivo selecionado não contém vídeo.')
    if (kind === 'audio' && !audio) throw Error('O arquivo selecionado não contém áudio.')
    const duration = Number(probe.format.duration ?? (kind === 'video' ? video?.duration : audio?.duration) ?? 0)
    const sourceFrames = Math.max(1, Math.floor(duration * 30))
    if (!Number.isFinite(duration) || duration <= 0 || sourceFrames > 1_000_000) throw Error('A duração da mídia é inválida ou passa do limite do Editor V6.')
    const mimeByExtension: Record<string, string> = { mp4: 'video/mp4', webm: kind === 'video' ? 'video/webm' : 'audio/webm', mov: 'video/quicktime', m4v: 'video/x-m4v', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac', opus: 'audio/opus' }
    const id = randomUUID(), fileName = `${id}.${extension}`
    const media = editorV6MediaAssetSchema.parse({ id, name: basename(source), fileName, kind, mimeType: mimeByExtension[extension], sourceFrames, hasAudio: Boolean(audio), ...(video?.width ? { width: video.width, height: video.height } : {}), sizeBytes: fileStats.size })
    const folder = join(deps.projectPath(projectId), 'media')
    deps.assertAvailable()
    return deps.pendingFileWrites.track(async () => {
      await mkdir(folder, { recursive: true })
      await copyFile(source, join(folder, fileName))
      return media
    })
  })

  deps.ipcMain.handle(editorV6IpcChannels.linkEditorV6LibraryAudio, async (event, projectId: string, rawAudioId: unknown): Promise<EditorV6MediaAsset> => {
    deps.assertTrustedSender(event); deps.assertAvailable(); uuid.parse(projectId)
    const audioId = uuid.parse(rawAudioId)
    const { source, sourceFrames } = await inspectLibraryAudio(audioId)
    return editorV6MediaAssetSchema.parse({ id: audioId, libraryAudioId: audioId, name: source.name, fileName: `${audioId}.${source.extension}`, kind: 'audio', mimeType: source.mimeType, sourceFrames, hasAudio: true, sizeBytes: source.size })
  })

  deps.ipcMain.handle(editorV6IpcChannels.linkEditorV6LibraryExportAudio, async (event, projectId: string, rawAudioId: unknown): Promise<EditorV6ExportAudio> => {
    deps.assertTrustedSender(event); deps.assertAvailable(); uuid.parse(projectId)
    const audioId = uuid.parse(rawAudioId)
    const { source, sourceFrames } = await inspectLibraryAudio(audioId)
    return editorV6ExportAudioSchema.parse({ id: randomUUID(), libraryAudioId: audioId, name: source.name, fileName: `${audioId}.${source.extension}`, sourceFrames, startFrame: 0, sourceInFrame: 0, durationFrames: sourceFrames, gain: 1, muted: false })
  })

  deps.ipcMain.handle(editorV6IpcChannels.cloneEditorV6Media, async (event, sourceId: string, targetId: string, rawMedia: unknown) => {
    deps.assertTrustedSender(event); deps.assertAvailable(); uuid.parse(sourceId); uuid.parse(targetId)
    const media = z.array(editorV6MediaAssetSchema).max(500).parse(rawMedia)
    const sourceFolder = join(deps.projectPath(sourceId), 'media'), targetFolder = join(deps.projectPath(targetId), 'media')
    return deps.pendingFileWrites.track(async () => {
      await mkdir(targetFolder, { recursive: true })
      for (const item of media) if (!item.libraryVideoId && !item.libraryAudioId) await copyFile(join(sourceFolder, item.fileName), join(targetFolder, item.fileName))
    })
  })

  deps.ipcMain.handle(editorV6IpcChannels.linkEditorV6LibraryVideo, async (event, projectId: string, rawLibraryVideoId: unknown): Promise<EditorV6MediaAsset> => {
    deps.assertTrustedSender(event); deps.assertAvailable(); uuid.parse(projectId)
    const libraryVideoId = uuid.parse(rawLibraryVideoId)
    const source = await deps.resolveLibraryVideo(libraryVideoId)
    if (!videoExtensions.includes(source.extension)) throw Error('O vídeo selecionado tem um formato incompatível.')
    const fileStats = await stat(source.path)
    const probe = await probeExportMedia(deps.ffprobe, source.path, new AbortController().signal)
    const video = probe.streams.find((stream) => stream.codec_type === 'video')
    const audio = probe.streams.find((stream) => stream.codec_type === 'audio')
    if (!video) throw Error('O vídeo selecionado não contém uma faixa de vídeo válida.')
    const duration = Number(probe.format.duration ?? video.duration ?? 0)
    const sourceFrames = Math.max(1, Math.floor(duration * 30))
    if (!Number.isFinite(duration) || duration <= 0 || sourceFrames > 1_000_000) throw Error('A duração do vídeo é inválida para o Editor V6.')
    return editorV6MediaAssetSchema.parse({ id: libraryVideoId, libraryVideoId, name: source.name, fileName: `${libraryVideoId}.${source.extension}`, kind: 'video', mimeType: source.mimeType, sourceFrames, hasAudio: Boolean(audio), ...(video.width ? { width: video.width, height: video.height } : {}), sizeBytes: fileStats.size })
  })
}
