import type { SyntheticEvent } from 'react'
import type { EditorV6Asset, EditorV6Element, EditorV6SceneElement } from '../../../../shared/editorV6'
import type { SceneSurfaceInteraction } from './SceneVideoLayer'

export type SceneLayerProps = {
  element: EditorV6SceneElement
  asset?: EditorV6Asset
  mouthAsset?: EditorV6Asset
  rasterCanvas?: HTMLCanvasElement
  rasterFrame?: number
  selected: boolean
  interaction?: SceneSurfaceInteraction
  onImageLoad?: (event: SyntheticEvent<SVGImageElement>) => void
}

function sameMotionSprite(left: EditorV6Element['motionSprite'], right: EditorV6Element['motionSprite']): boolean {
  if (left === right) return true
  return Boolean(left && right && left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height
    && left.atlasWidth === right.atlasWidth && left.atlasHeight === right.atlasHeight)
}

function sameMouthPatch(left: EditorV6Element['mouthPatch'], right: EditorV6Element['mouthPatch']): boolean {
  if (left === right) return true
  return Boolean(left && right && left.assetId === right.assetId && left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height
    && left.replace === right.replace && left.replaceBounds?.x === right.replaceBounds?.x && left.replaceBounds?.y === right.replaceBounds?.y
    && left.replaceBounds?.width === right.replaceBounds?.width && left.replaceBounds?.height === right.replaceBounds?.height && sameMotionSprite(left.sprite, right.sprite))
}

/** Timeline resolution creates new state objects each frame; skip SVG layers whose visual inputs are unchanged.
 * Assets and nested element fields follow the Editor V6 Immer/immutable update contract, so replacing pixels
 * replaces the asset object; motionSprite's six fields fully define its crop within that asset. */
export function sceneLayerPropsEqual(previous: SceneLayerProps, next: SceneLayerProps): boolean {
  if (typeof window !== 'undefined' && (window as Window & { __editorV6DisableSceneLayerMemo?: boolean }).__editorV6DisableSceneLayerMemo) return false
  if (previous.asset !== next.asset || previous.mouthAsset !== next.mouthAsset || previous.rasterCanvas !== next.rasterCanvas || previous.rasterFrame !== next.rasterFrame || previous.selected !== next.selected || previous.interaction !== next.interaction || previous.onImageLoad !== next.onImageLoad) return false
  const left = previous.element, right = next.element
  const keys = Object.keys(left) as Array<keyof EditorV6Element>
  if (keys.length !== Object.keys(right).length) return false
  return keys.every((key) => key === 'motionSprite' ? sameMotionSprite(left.motionSprite, right.motionSprite)
    : key === 'mouthPatch' ? sameMouthPatch(left.mouthPatch, right.mouthPatch)
      : Object.is(left[key], right[key]))
}
