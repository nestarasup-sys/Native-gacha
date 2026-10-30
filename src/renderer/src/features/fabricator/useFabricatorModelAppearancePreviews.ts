import { useEffect, useState } from 'react'
import type { FabricatorProject } from '../../../../shared/fabricator'
import { isValidSkinTone } from '../../../../shared/skinTones'
import { cachedModelBodyAppearancePreview } from './models/modelSkinTone'
import { loadModelAppearancePreviews } from './models/modelAppearancePreviewLoader'

export function useFabricatorModelAppearancePreviews(
  appearanceProject: FabricatorProject | null,
  onError: (message: string) => void
) {
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!appearanceProject) {
      setPreviewUrls({})
      return
    }

    let active = true
    const tone = isValidSkinTone(appearanceProject.modelSkinTone) ? appearanceProject.modelSkinTone : undefined
    const outlineColor = isValidSkinTone(appearanceProject.modelOutlineColor) ? appearanceProject.modelOutlineColor : undefined

    void loadModelAppearancePreviews(
      appearanceProject.slot,
      appearanceProject.parts,
      tone,
      outlineColor,
      cachedModelBodyAppearancePreview,
      () => !active
    ).then((previews) => {
      if (active) setPreviewUrls(previews)
    }).catch((reason: unknown) => {
      if (active) onError(reason instanceof Error ? reason.message : 'Não foi possível aplicar a cor de pele do modelo.')
    })

    return () => { active = false }
  }, [appearanceProject?.slot, appearanceProject?.modelSkinTone, appearanceProject?.modelOutlineColor, appearanceProject?.parts, onError])

  return previewUrls
}
