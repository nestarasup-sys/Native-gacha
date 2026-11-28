import { useEffect, useState } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Element } from '../../../../shared/editorV6'
import { normalizeEditorV6IntroPoseFace } from './editorV6IntroInspectorTarget'

/** Resolve the old image-only format for the Inspector without editing a project on selection. */
export function useEditorV6IntroFace(element: EditorV6Element | null, character: CustomizerCharacter | null, enabled: boolean) {
  const [resolved, setResolved] = useState<{ key: string; element: EditorV6Element }>()
  const key = enabled && element?.activeExpressionPresetId && !element.faceAppearance && character
    ? [element.id, element.assetId, element.activeExpressionPresetId, character.updatedAt].join(':') : ''
  useEffect(() => {
    if (!key || !element || !character) return
    let cancelled = false
    void normalizeEditorV6IntroPoseFace(element, character).then(next => {
      if (!cancelled) setResolved({ key, element: next })
    }).catch(() => {
      // A removed preset can still be replaced using the live catalog.
    })
    return () => { cancelled = true }
  }, [key])
  if (!element || !key || resolved?.key !== key) return element
  const { faceAppearance, faceTransforms, expressionBase, activeExpressionGaze, activeExpressionEffects, activeExpressionCollectionId } = resolved.element
  return { ...element, faceAppearance, faceTransforms, expressionBase, activeExpressionGaze, activeExpressionEffects, activeExpressionCollectionId }
}
