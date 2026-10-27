/** Operações puras sobre composição salva. Não importam React, Electron nem editam bibliotecas.
 */
import type { EditorV6Document, EditorV6Element } from './editorV6'
import type { CustomizerCharacter } from './customizer'
import { resolveEditorV6ElementsAtFrame } from './editorV6Timeline'

export type EditorV6SceneSnapshot = Pick<EditorV6Document, 'backgroundColor' | 'backgroundAssetId' | 'backgroundX' | 'backgroundY' | 'backgroundWidth' | 'backgroundHeight' | 'backgroundRotation' | 'assets' | 'elements' | 'timeline'>

export function snapshotEditorV6Scene(editorV6: EditorV6Document): EditorV6SceneSnapshot {
  return {
    backgroundColor: editorV6.backgroundColor,
    backgroundAssetId: editorV6.backgroundAssetId,
    backgroundX: editorV6.backgroundX,
    backgroundY: editorV6.backgroundY,
    backgroundWidth: editorV6.backgroundWidth,
    backgroundHeight: editorV6.backgroundHeight,
    backgroundRotation: editorV6.backgroundRotation,
    assets: editorV6.assets,
    elements: editorV6.elements,
    timeline: editorV6.timeline
  }
}

export function withEditorV6Snapshot<T extends Partial<EditorV6Document>>(editorV6: EditorV6Document, next: T): EditorV6Document {
  return { ...editorV6, ...next, updatedAt: new Date().toISOString() }
}

/** Não inclui mudanças só de expressão facial na chave de cache da geometria. */
export function editorV6CharacterRenderKey(character: CustomizerCharacter, poseSourceRevision?: string): string {
  const { faceAppearance: _ignored, ...customization } = character.customization
  return JSON.stringify({ id: character.id, customization, poseSourceRevision })
}

export function editorV6ElementSize(element: EditorV6Element): { width: number; height: number } {
  if (element.kind !== 'character') return { width: element.width, height: element.height }
  const scale = (element.characterScale ?? 100) / 100
  return {
    width: element.width * scale * (element.characterWidthScale ?? 100) / 100,
    height: element.height * scale * (element.characterHeightScale ?? 100) / 100
  }
}

export function isEditorV6ElementVisibleAtFrame(editorV6: EditorV6Document, elementId: string, frame: number): boolean {
  return resolveEditorV6ElementsAtFrame(editorV6, frame).some((element) => element.id === elementId)
}
