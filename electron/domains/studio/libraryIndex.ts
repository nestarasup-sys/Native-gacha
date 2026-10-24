/** Índice leve do Studio principal e dos cards do Video Studio.
 * Contratos e leitura de arquivos são injetados; não conhece app/window Electron.
 * Preserva os nomes e a migração em leitura do studio-card.json legado.
 */
import { join } from 'node:path'
import type * as nodeFs from 'node:fs/promises'
import type { StudioDocument, VideoStudioCardSummary } from '../../../src/shared/studio'

type StudioWorkspaceStorage = 'studio' | 'video'
type Files = Pick<typeof nodeFs, 'mkdir' | 'readdir' | 'readFile' | 'writeFile'>

export function createStudioLibraryIndex(deps: {
  files: Files
  studioLibraryPath: (workspace: StudioWorkspaceStorage) => string
  readStudio: (id: string, workspace: StudioWorkspaceStorage) => Promise<StudioDocument | null>
}) {
  const { mkdir, readdir, readFile, writeFile } = deps.files
  const { studioLibraryPath, readStudio } = deps

async function listStudios(workspace: StudioWorkspaceStorage = 'studio'): Promise<StudioDocument[]> {
  const libraryPath = studioLibraryPath(workspace)
  await mkdir(libraryPath, { recursive: true })
  const entries = await readdir(libraryPath, { withFileTypes: true })
  const documents = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && /^studio-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.name))
    .map((entry) => readStudio(entry.name.slice('studio-'.length), workspace)))
  return documents.filter((studio): studio is StudioDocument => studio !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title))
}

function videoStudioCardSummary(value: Record<string, unknown>, id: string): VideoStudioCardSummary {
  const timeline = value.videoTimeline && typeof value.videoTimeline === 'object' ? value.videoTimeline as Record<string, unknown> : null
  return {
    id,
    title: String(value.title ?? 'Video Studio').slice(0, 100),
    color: typeof value.color === 'string' ? value.color : '#d7b5cd',
    createdAt: String(value.createdAt ?? new Date(0).toISOString()),
    updatedAt: String(value.updatedAt ?? new Date(0).toISOString()),
    ...(typeof timeline?.coverDataUrl === 'string' && timeline.coverDataUrl.length <= 1_500_000 ? { coverDataUrl: timeline.coverDataUrl } : {})
  }
}

async function listVideoStudioCards(): Promise<VideoStudioCardSummary[]> {
  const libraryPath = studioLibraryPath('video')
  await mkdir(libraryPath, { recursive: true })
  const entries = await readdir(libraryPath, { withFileTypes: true })
  const cards = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && /^studio-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(entry.name))
    .map(async (entry) => {
      const id = entry.name.slice('studio-'.length)
      const cardPath = join(libraryPath, entry.name, 'studio-card.json')
      try {
        const card = JSON.parse(await readFile(cardPath, 'utf8')) as VideoStudioCardSummary
        return card.id === id ? card : null
      } catch (reason) {
        if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason
        const raw = JSON.parse(await readFile(join(libraryPath, entry.name, 'studio.json'), 'utf8')) as Record<string, unknown>
        const card = videoStudioCardSummary(raw, id)
        // Migrate the light card manifest once, without hydrating timeline images or video data.
        await writeFile(cardPath, JSON.stringify(card), 'utf8')
        return card
      }
    }))
  return cards.filter((card): card is VideoStudioCardSummary => card !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title))
}


  return { listStudios, listVideoStudioCards, videoStudioCardSummary }
}
