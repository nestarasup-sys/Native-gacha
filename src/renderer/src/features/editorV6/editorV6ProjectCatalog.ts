import type { EditorV6Document, EditorV6ProjectSummary } from '../../../../shared/editorV6.ts'
import { isLegacySceneCatalogId, type LegacySceneCatalogEntry } from '../../ui/legacySceneCatalog.ts'

export type EditorV6ProjectCatalogDependencies = {
  listProjects: () => Promise<EditorV6ProjectSummary[]>
  getFolder: () => Promise<string>
  legacyCatalog: () => LegacySceneCatalogEntry[]
  writeDocument: (document: EditorV6Document) => Promise<unknown>
  createTimeline: () => EditorV6Document['timeline']
  concurrency?: number
  now?: () => string
}

function createLegacyDocument(entry: LegacySceneCatalogEntry, now: string, createTimeline: EditorV6ProjectCatalogDependencies['createTimeline']): EditorV6Document {
  return {
    schemaVersion: 1,
    ...entry,
    createdAt: now,
    updatedAt: now,
    backgroundColor: '#d7b5cd',
    backgroundAssetId: null,
    backgroundX: 0,
    backgroundY: 0,
    backgroundWidth: 100,
    backgroundHeight: 100,
    backgroundRotation: 0,
    assets: [],
    elements: [],
    timeline: createTimeline()
  }
}

async function writeLegacyDocuments(
  entries: LegacySceneCatalogEntry[],
  writeDocument: EditorV6ProjectCatalogDependencies['writeDocument'],
  createTimeline: EditorV6ProjectCatalogDependencies['createTimeline'],
  now: string,
  concurrency: number
): Promise<void> {
  let nextIndex = 0
  const writesById = new Map<string, Promise<void>>()
  const worker = async () => {
    while (true) {
      const index = nextIndex++
      if (index >= entries.length) return
      const entry = entries[index]
      const preceding = writesById.get(entry.id) ?? Promise.resolve()
      const write = preceding.catch(() => undefined).then(() => writeDocument(createLegacyDocument(entry, now, createTimeline))).then(() => undefined)
      writesById.set(entry.id, write)
      await write
    }
  }
  const safeConcurrency = Number.isFinite(concurrency) ? Math.floor(concurrency) : 3
  const workerCount = Math.min(entries.length, Math.max(1, safeConcurrency))
  const results = await Promise.allSettled(Array.from({ length: workerCount }, worker))
  const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (failed) throw failed.reason
}

/** Imports old catalog entries before returning the authoritative on-disk project list. */
export async function loadEditorV6ProjectCatalog({
  listProjects,
  getFolder,
  legacyCatalog: loadLegacyCatalog,
  writeDocument,
  createTimeline,
  concurrency = 3,
  now = () => new Date().toISOString()
}: EditorV6ProjectCatalogDependencies): Promise<{
  projects: EditorV6ProjectSummary[]
  folder: string
  clearLegacyCatalog: boolean
}> {
  const existing = await listProjects()
  const knownIds = new Set(existing.map((project) => project.id))
  const legacyCatalog = loadLegacyCatalog()
  const pending = legacyCatalog.filter((entry) => !knownIds.has(entry.id) && isLegacySceneCatalogId(entry.id))
  if (pending.length) await writeLegacyDocuments(pending, writeDocument, createTimeline, now(), concurrency)

  const [projects, folder] = await Promise.all([listProjects(), getFolder()])
  return { projects, folder, clearLegacyCatalog: legacyCatalog.length > 0 }
}
