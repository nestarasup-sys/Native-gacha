import { editorV6MotionPlans } from '../../../../shared/editorV6Motion'
import { timelineClips } from '../../../../shared/editorV6TimelineCore'
import type { EditorV6Document, EditorV6Element } from '../../../../shared/editorV6'

export type EditorV6DuplicateIdentity = Pick<EditorV6Document, 'id' | 'title' | 'color' | 'createdAt' | 'updatedAt'>

export function duplicateEditorV6ProjectDocument(source: EditorV6Document, identity: EditorV6DuplicateIdentity, createId: () => string): EditorV6Document {
  const duplicate: EditorV6Document = {
    ...source,
    ...identity,
    assets: source.assets.map((asset) => ({ ...asset, id: createId() })),
    elements: source.elements.map((element) => ({
      ...element,
      id: createId(),
      assetId: element.assetId ? source.assets.find((asset) => asset.id === element.assetId)?.id : undefined
    }))
  }
  const oldToNew = new Map(source.assets.map((asset, index) => [asset.id, duplicate.assets[index]?.id ?? '']))
  duplicate.elements = source.elements.map((element, index) => ({
    ...duplicate.elements[index],
    assetId: element.assetId ? oldToNew.get(element.assetId) : undefined,
    faceModeAssetIds: element.faceModeAssetIds
      ? Object.fromEntries(Object.entries(element.faceModeAssetIds).map(([mode, id]) => [mode, id ? oldToNew.get(id) : undefined])) as EditorV6Element['faceModeAssetIds']
      : undefined
  }))
  const oldToNewElements = new Map(source.elements.map((element, index) => [element.id, duplicate.elements[index].id]))
  const oldToNewBlocks = new Map(timelineClips(source.timeline).map(({ block }) => [block.id, createId()]))
  duplicate.timeline = {
    ...source.timeline,
    knownElementIds: source.timeline.knownElementIds?.map((id) => oldToNewElements.get(id) ?? id),
    tracks: source.timeline.tracks.map((track) => ({
      ...track,
      id: createId(),
      blocks: track.blocks.map((block) => ({
        ...block,
        id: oldToNewBlocks.get(block.id)!,
        elementId: block.elementId ? oldToNewElements.get(block.elementId) : undefined,
        parentBlockId: block.parentBlockId ? oldToNewBlocks.get(block.parentBlockId) : undefined,
        state: block.state ? {
          ...block.state,
          id: oldToNewElements.get(block.state.id) ?? block.state.id,
          assetId: block.state.assetId ? oldToNew.get(block.state.assetId) : undefined,
          faceModeAssetIds: block.state.faceModeAssetIds
            ? Object.fromEntries(Object.entries(block.state.faceModeAssetIds).map(([mode, id]) => [mode, id ? oldToNew.get(id) : undefined])) as EditorV6Element['faceModeAssetIds']
            : undefined
        } : undefined,
        background: block.background ? {
          ...block.background,
          backgroundAssetId: block.background.backgroundAssetId ? oldToNew.get(block.background.backgroundAssetId) ?? null : null
        } : undefined,
        incomingMotion: block.incomingMotion ? { ...block.incomingMotion, assetId: oldToNew.get(block.incomingMotion.assetId)! } : undefined
      }))
    }))
  }
  duplicate.backgroundAssetId = source.backgroundAssetId ? oldToNew.get(source.backgroundAssetId) ?? null : null
  const originalMotions = new Map<string, ReturnType<typeof editorV6MotionPlans>[number]>(editorV6MotionPlans(source).map((plan) => [oldToNewBlocks.get(plan.blockId)!, plan]))
  const copiedMotions = new Map(editorV6MotionPlans(duplicate).map((plan) => [plan.blockId, plan]))
  duplicate.timeline = {
    ...duplicate.timeline,
    tracks: duplicate.timeline.tracks.map((track) => ({
      ...track,
      blocks: track.blocks.map((block) => ({
        ...block,
        incomingMotion: block.incomingMotion && originalMotions.get(block.id)?.key === block.incomingMotion.key && copiedMotions.has(block.id)
          ? { ...block.incomingMotion, key: copiedMotions.get(block.id)!.key }
          : undefined
      }))
    }))
  }
  return duplicate
}
