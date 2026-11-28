import type { EditorV6ProjectSummary } from '../../../src/shared/editorV6'
import type { EditorV6LibraryMediaItem } from '../../../src/shared/editorV6'

type Category = 'background' | 'object' | 'audio'
type Manifest = {
  assets?: Array<{ libraryAssetId?: unknown; category?: unknown }>
  media?: Array<{ libraryAudioId?: unknown }>
  exportAudio?: Array<{ libraryAudioId?: unknown }>
}

export function collectEditorV6LibraryReferenceIds(value: unknown, category: Category): Set<string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return new Set()
  const manifest = value as Manifest
  if (category === 'audio') return new Set([...manifest.media ?? [], ...manifest.exportAudio ?? []].flatMap((item) => typeof item?.libraryAudioId === 'string' ? [item.libraryAudioId] : []))
  return new Set((manifest.assets ?? []).flatMap((asset) => asset?.category === category && typeof asset.libraryAssetId === 'string' ? [asset.libraryAssetId] : []))
}

export function collectEditorV6LibraryReferences(manifestValue: unknown, category: Category, id: string): boolean {
  if (!manifestValue || typeof manifestValue !== 'object' || Array.isArray(manifestValue)) return false
  const manifest = manifestValue as Manifest
  if (category === 'audio') return [...(manifest.media ?? []), ...(manifest.exportAudio ?? [])].some((item) => item?.libraryAudioId === id)
  return (manifest.assets ?? []).some((asset) => asset?.libraryAssetId === id && asset.category === category)
}

export function createEditorV6MediaReferenceIndex(deps: {
  listProjects: () => Promise<EditorV6ProjectSummary[]>
  readManifest: (id: string) => Promise<unknown>
}) {
  const scanReferences = async (category: Category, ids: readonly string[]) => {
    const result = new Map(ids.map((id) => [id, [] as EditorV6LibraryMediaItem['references']]))
    const projects = await deps.listProjects()
    const unavailable = projects.flatMap((project) => project.unavailableReason
      ? [`${project.title}: ${project.unavailableReason}`]
      : [])
    const readableProjects = projects.filter((project) => !project.unavailableReason)
    const manifests = await Promise.allSettled(readableProjects.map((project) => deps.readManifest(project.id)))
    manifests.forEach((entry, index) => {
      const project = readableProjects[index]
      if (entry.status === 'rejected') {
        const detail = entry.reason instanceof Error ? entry.reason.message : String(entry.reason)
        unavailable.push(`${project.title}: ${detail}`)
        return
      }
      const manifest = entry.value
      const referencedIds = collectEditorV6LibraryReferenceIds(manifest, category)
      for (const id of ids) if (referencedIds.has(id)) result.get(id)!.push({ projectId: project.id, title: project.title })
    })
    return { references: result, unavailable }
  }
  const referencesForIds = async (category: Category, ids: readonly string[]) => (await scanReferences(category, ids)).references
  const references = async (category: Category, id: string) => (await referencesForIds(category, [id])).get(id) ?? []
  const assertUnreferenced = async (category: Category, id: string): Promise<void> => {
    const scan = await scanReferences(category, [id])
    if (scan.unavailable.length) {
      throw Error(`Não foi possível verificar todos os projetos do Editor V6 antes da exclusão: ${scan.unavailable.slice(0, 3).join(' · ')}`)
    }
    const reference = scan.references.get(id)?.[0]
    if (reference) throw Error(`Este item está vinculado pelo ID ao roteiro “${reference.title}” do Editor V6. Remova o vínculo antes de excluí-lo.`)
  }
  return { references, referencesForIds, assertUnreferenced }
}
