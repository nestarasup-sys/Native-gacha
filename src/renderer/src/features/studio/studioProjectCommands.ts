import type { StudioDocument } from '../../../../shared/studio'
import { sceneCatalogColor } from '../../ui/sceneEditorDefaults'

export type StudioProjectCommandDependencies = {
  studios: () => readonly StudioDocument[]
  nextNumber: { current: number }
  createId: () => string
  now: () => string
  writeDocument: (document: StudioDocument) => Promise<unknown>
  appendStudio: (document: StudioDocument) => void
  selectStudio: (id: string) => void
  setSaved: (saved: boolean) => void
  setError: (message: string | null) => void
}

/** Owns Studio scene creation and duplication; Editor V6 keeps its own project contract. */
export function createStudioProjectCommands(dependencies: StudioProjectCommandDependencies) {
  const allocateNumber = () => {
    const highest = dependencies.studios().reduce((max, studio) => (
      Math.max(max, Number(studio.title.match(/^Studio\s+(\d+)/i)?.[1] ?? 0))
    ), 0)
    const number = Math.max(dependencies.nextNumber.current, highest + 1)
    dependencies.nextNumber.current = number + 1
    return number
  }

  const publish = async (document: StudioDocument, failureMessage: string) => {
    try {
      dependencies.setError(null)
      await dependencies.writeDocument(document)
      dependencies.appendStudio(document)
      dependencies.selectStudio(document.id)
      dependencies.setSaved(true)
    } catch (reason) {
      dependencies.setError(reason instanceof Error ? reason.message : failureMessage)
    }
  }

  const createStudio = async () => {
    const number = allocateNumber()
    const now = dependencies.now()
    const studio: StudioDocument = {
      schemaVersion: 1,
      id: dependencies.createId(),
      title: `Studio ${String(number).padStart(2, '0')}`,
      color: sceneCatalogColor(number),
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
      elements: []
    }
    await publish(studio, 'Não foi possível criar o Studio.')
  }

  const duplicateStudio = async (source: StudioDocument | null) => {
    if (!source) return
    const number = allocateNumber()
    const now = dependencies.now()
    const assets = source.assets.map((asset) => ({ ...asset, id: dependencies.createId() }))
    const oldToNew = new Map(source.assets.map((asset, index) => [asset.id, assets[index]?.id ?? '']))
    const duplicate: StudioDocument = {
      ...source,
      id: dependencies.createId(),
      title: `Studio ${String(number).padStart(2, '0')}`,
      color: sceneCatalogColor(number),
      createdAt: now,
      updatedAt: now,
      assets,
      elements: source.elements.map((element) => ({
        ...element,
        id: dependencies.createId(),
        assetId: element.assetId ? oldToNew.get(element.assetId) : undefined
      })),
      backgroundAssetId: source.backgroundAssetId ? oldToNew.get(source.backgroundAssetId) ?? null : null
    }
    await publish(duplicate, 'Não foi possível duplicar o Studio.')
  }

  return { allocateNumber, createStudio, duplicateStudio }
}
