import type { FabricatorHistoryState, FabricatorProject } from '../../../../../shared/fabricator'
import { cleanSavedPartEdges } from './chromaCleanup'
import { normalizeLayerOrder, normalizePartAnchors } from './rig'

export type PreparedFabricatorProject = {
  project: FabricatorProject
  dirtyAssets: Map<string, string>
  dirtyChromaBases: Map<string, string>
  warning: string | null
}

/** Rebuilds editor state and missing chroma bases without changing saved IDs or formats. */
export async function prepareLoadedFabricatorProject(
  loaded: FabricatorProject,
  loadedHistory: FabricatorHistoryState,
  isCurrent: () => boolean
): Promise<PreparedFabricatorProject | null> {
  const rig = normalizePartAnchors(loaded.parts, loaded.joints)
  let loadedParts = rig.parts
  let chromaVersion = loaded.chromaVersion ?? 0
  let warning: string | null = null
  const dirtyAssets = new Map<string, string>()
  const dirtyChromaBases = new Map<string, string>()

  if (chromaVersion < 2) {
    try {
      loadedParts = await cleanSavedPartEdges(rig.parts, loaded.sourceDataUrl, loaded.tolerance)
      if (!isCurrent()) return null
      for (const part of loadedParts) {
        const previous = rig.parts.find((item) => item.id === part.id)
        if (previous?.dataUrl !== part.dataUrl) dirtyAssets.set(part.id, part.dataUrl)
      }
      chromaVersion = 2
    } catch {
      if (!isCurrent()) return null
      warning = 'O modelo abriu, mas não foi possível corrigir automaticamente o contorno verde.'
    }
  }

  const historicalBaselines = [loaded, ...loadedHistory.undo, ...loadedHistory.redo]
    .map((entry) => 'project' in entry ? entry.project : entry)
    .filter((candidate) => candidate.parts.length === loaded.parts.length && loaded.parts.every((part) => candidate.parts.some((item) => item.id === part.id)))
    .sort((a, b) => a.tolerance - b.tolerance)
  const historicalBaseline = historicalBaselines[0]
  const chromaBaseTolerance = loaded.chromaBaseTolerance ?? (loaded.parts.every((part) => part.chromaBaseDataUrl) ? 0 : historicalBaseline?.tolerance ?? loaded.tolerance)
  const partsWithBases = loadedParts.map((part) => {
    const storedPart = loaded.parts.find((item) => item.id === part.id)
    const historicalPart = historicalBaseline?.parts.find((item) => item.id === part.id)
    const chromaBaseDataUrl = storedPart?.chromaBaseDataUrl ?? historicalPart?.dataUrl ?? part.dataUrl
    const chromaBaseSaved = storedPart?.chromaBaseSaved ?? Boolean(historicalPart)
    if (chromaBaseSaved && !storedPart?.chromaBaseDataUrl && chromaBaseDataUrl) dirtyChromaBases.set(part.id, chromaBaseDataUrl)
    return { ...part, chromaBaseSaved, chromaBaseDataUrl }
  })
  if (!isCurrent()) return null

  return {
    project: {
      ...loaded,
      chromaVersion,
      chromaBaseTolerance,
      parts: partsWithBases,
      layerOrder: normalizeLayerOrder(loaded.parts, loaded.layerOrder),
      hiddenPartIds: loaded.hiddenPartIds ?? [],
      joints: rig.joints
    },
    dirtyAssets,
    dirtyChromaBases,
    warning
  }
}
