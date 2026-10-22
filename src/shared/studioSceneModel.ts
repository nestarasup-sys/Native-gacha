/** Operações puras sobre composição salva. Não importam React, Electron nem editam bibliotecas.
 * As formas dos snapshots são as formas legadas, inclusive videoTimeline opcional.
 */
import type { StudioDocument, StudioElement } from './studio'
import type { CustomizerCharacter } from './customizer'

export type StudioSceneSnapshot = Pick<StudioDocument, 'backgroundColor' | 'backgroundAssetId' | 'backgroundX' | 'backgroundY' | 'backgroundWidth' | 'backgroundHeight' | 'backgroundRotation' | 'assets' | 'elements'>
export type VideoStudioSceneSnapshot = StudioSceneSnapshot & Pick<StudioDocument, 'videoTimeline'>

export function snapshotStudioScene(studio: StudioDocument): StudioSceneSnapshot {
  return {
    backgroundColor: studio.backgroundColor,
    backgroundAssetId: studio.backgroundAssetId,
    backgroundX: studio.backgroundX,
    backgroundY: studio.backgroundY,
    backgroundWidth: studio.backgroundWidth,
    backgroundHeight: studio.backgroundHeight,
    backgroundRotation: studio.backgroundRotation,
    assets: studio.assets,
    elements: studio.elements
  }
}

export function snapshotVideoStudioScene(studio: StudioDocument): VideoStudioSceneSnapshot {
  return { ...snapshotStudioScene(studio), videoTimeline: studio.videoTimeline }
}

export function withStudioSnapshot<T extends Partial<StudioDocument>>(studio: StudioDocument, next: T): StudioDocument {
  return { ...studio, ...next, updatedAt: new Date().toISOString() }
}

/** Não inclui mudanças só de expressão facial na chave de cache da geometria. */
export function studioCharacterRenderKey(character: CustomizerCharacter): string {
  const { faceAppearance: _ignored, ...customization } = character.customization
  return JSON.stringify({ id: character.id, customization })
}

export function studioElementSize(element: StudioElement): { width: number; height: number } {
  if (element.kind !== 'character') return { width: element.width, height: element.height }
  const scale = (element.characterScale ?? 100) / 100
  return {
    width: element.width * scale * (element.characterWidthScale ?? 100) / 100,
    height: element.height * scale * (element.characterHeightScale ?? 100) / 100
  }
}
