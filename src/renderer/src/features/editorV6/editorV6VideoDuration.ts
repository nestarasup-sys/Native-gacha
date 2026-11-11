import type { VideoLibraryItem } from '../../../../shared/mediaLibrary'

export type EditorV6VideoDurationDependencies = {
  createVideo: () => HTMLVideoElement
  finishImport: (videoId: string, durationFrames: number) => Promise<VideoLibraryItem>
  setTimeout: (callback: () => void, milliseconds: number) => number
  clearTimeout: (timer: number) => void
}

/** Resolves missing video duration from browser metadata and persists the measured frame count. */
export async function recognizeEditorV6VideoDuration(
  item: VideoLibraryItem,
  dependencies: EditorV6VideoDurationDependencies
): Promise<VideoLibraryItem> {
  if (item.durationFrames !== null) return item
  const video = dependencies.createVideo()
  video.preload = 'metadata'
  video.muted = true
  try {
    const seconds = await new Promise<number>((resolve, reject) => {
      const timer = dependencies.setTimeout(() => {
        cleanup()
        reject(new Error(`Não foi possível reconhecer a duração de “${item.name}”.`))
      }, 30000)
      const cleanup = () => {
        dependencies.clearTimeout(timer)
        video.onloadedmetadata = null
        video.onerror = null
      }
      video.onloadedmetadata = () => {
        cleanup()
        resolve(video.duration)
      }
      video.onerror = () => {
        cleanup()
        reject(new Error(`Não foi possível ler “${item.name}”.`))
      }
      video.src = `gacha-video://library/${item.id}`
      video.load()
    })
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60 * 60 * 24) throw new Error(`A duração de “${item.name}” não é válida.`)
    return await dependencies.finishImport(item.id, Math.max(1, Math.ceil(seconds * 30)))
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
  }
}
