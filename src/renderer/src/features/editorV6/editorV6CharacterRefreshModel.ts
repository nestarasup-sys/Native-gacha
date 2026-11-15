import type { EditorV6Document, EditorV6Element } from '../../../../shared/editorV6'
import { faceRenderGeometry, fitElementToTrim } from '../../characters/characterGeometry.ts'
import type { TrimmedImage } from '../../characters/transparentImageTrim.ts'

/** Facial variants share one crop. Legacy normalization must not trim one of
 * those images independently when a project is reopened. */
export function editorV6LegacyCharacterCropAssetIds(project: EditorV6Document): Set<string> {
  const states = [...project.elements, ...project.timeline.tracks.flatMap(track => track.blocks.flatMap(block => block.state ? [block.state] : []))]
  const aligned = new Set(states.flatMap(state => state.kind === 'character' && Object.values(state.faceModeAssetIds ?? {}).some(Boolean)
    ? [state.assetId, ...Object.values(state.faceModeAssetIds ?? {})] : []))
  return new Set(states.flatMap(element => element.kind === 'character' && element.assetId && !aligned.has(element.assetId) ? [element.assetId] : []))
}

/** A refreshed bitmap replaces an existing snapshot. Its authored center is already crop-relative.
 * Recompute dimensions in project coordinates, without applying an expression-change offset again. */
export function editorV6RefreshedCharacterGeometry(
  state: EditorV6Element,
  rendered: { width: number; height: number },
  crop: Pick<TrimmedImage, 'left' | 'top' | 'width' | 'height'> | null
) {
  return faceRenderGeometry(state, rendered, crop, 1920, 1080)
}

/** Applies legacy transparent-border crops to every scene and timeline snapshot using that asset. */
export function applyEditorV6CharacterAssetCrops(
  project: EditorV6Document,
  crops: Array<{ assetId: string; crop: TrimmedImage }>,
  updatedAt = new Date().toISOString()
): EditorV6Document {
  const cropByAsset = new Map(crops.map(({ assetId, crop }) => [assetId, crop]))
  if (!cropByAsset.size) return project

  return {
    ...project,
    assets: project.assets.map((asset) => {
      const crop = cropByAsset.get(asset.id)
      return crop ? { ...asset, dataUrl: crop.dataUrl, mimeType: 'image/png' } : asset
    }),
    elements: project.elements.map((element) => {
      const crop = element.kind === 'character' && element.assetId ? cropByAsset.get(element.assetId) : undefined
      return crop ? fitElementToTrim(element, crop) : element
    }),
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track) => ({
        ...track,
        blocks: track.blocks.map((block) => {
          const crop = block.state?.kind === 'character' && block.state.assetId
            ? cropByAsset.get(block.state.assetId)
            : undefined
          return crop && block.state ? { ...block, state: fitElementToTrim(block.state, crop) } : block
        })
      }))
    },
    updatedAt
  }
}
