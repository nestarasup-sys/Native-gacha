import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CustomizerCharacter, CustomizerFaceAppearance, FaceComponentPartId } from '../../../../shared/customizer'
import type { FaceCatalogItem, FaceElementKind, FaceSheetKind, FabricatorProject, ModelPart } from '../../../../shared/fabricator'
import { drawFaceCatalogOverlay, renderFaceOverlay } from '../../characters/characterRenderer'

type Props = { project: FabricatorProject; head: ModelPart }

function appearanceForReference(appearance: CustomizerFaceAppearance): CustomizerFaceAppearance {
  const components = Object.fromEntries(
    (['eye-left', 'eye-right', 'pupil-left', 'pupil-right', 'brow-left', 'brow-right'] as FaceComponentPartId[])
      .flatMap((part) => appearance.components?.[part] ? [[part, appearance.components[part]]] : [])
  ) as CustomizerFaceAppearance['components']
  return {
    ...appearance,
    components,
    faceDetails: {},
    headExtras: {},
    mouthBlushEnabled: false,
    mouthBlushOpacity: 0
  }
}

export function HairFaceReference({ project, head }: Props) {
  const [controls, setControls] = useState<HTMLElement | null>(null)
  const [characters, setCharacters] = useState<CustomizerCharacter[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const compatibleCharacters = useMemo(() => characters.filter((character) =>
    character.customization.modelSlot === project.slot && character.customization.faceAppearance?.modelSlot === project.slot
  ), [characters, project.slot])
  const character = compatibleCharacters.find((item) => item.id === selectedId)

  useEffect(() => {
    let cancelled = false
    void window.desktop.customizer.listCustomizerCharacters().then((items) => {
      if (!cancelled) setCharacters(items)
    }).catch(() => {
      if (!cancelled) setCharacters([])
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    setControls(document.querySelector<HTMLElement>('[data-hair-face-reference-controls]'))
  }, [])

  useEffect(() => {
    if (!compatibleCharacters.some((item) => item.id === selectedId)) setSelectedId('')
  }, [compatibleCharacters, selectedId])

  useEffect(() => {
    let cancelled = false
    setImageUrl(null)
    const appearance = character?.customization.faceAppearance
    if (!character || !appearance || !project || !head) return
    void (async () => {
      const overlay = document.createElement('canvas')
      overlay.width = project.width
      overlay.height = project.height
      const context = overlay.getContext('2d')
      if (!context) throw new Error('Não foi possível preparar a prévia do rosto.')
      const face = appearanceForReference(appearance)
      const hasCatalogFace = Boolean(face.eyeCatalogId || face.eyeLeftCatalogId || face.eyeRightCatalogId || face.eyebrowCatalogId || face.eyebrowLeftCatalogId || face.eyebrowRightCatalogId || face.noseCatalogId || face.mouthClosedCatalogId || face.mouthOpenCatalogId || Object.values(face.components ?? {}).some((part) => part?.assetId))
      if (hasCatalogFace) {
        const ids: Partial<Record<FaceSheetKind | FaceElementKind, string | undefined>> = {
          eyes: face.eyeCatalogId, 'eye-left': face.eyeLeftCatalogId ?? undefined, 'eye-right': face.eyeRightCatalogId ?? undefined,
          eyebrows: face.eyebrowCatalogId, 'brow-left': face.eyebrowLeftCatalogId ?? undefined, 'brow-right': face.eyebrowRightCatalogId ?? undefined,
          nose: face.noseCatalogId, 'mouth-closed': face.mouthClosedCatalogId, 'mouth-open': face.mouthOpenCatalogId
        }
        const entries = await Promise.all(Object.entries(ids).filter((entry): entry is [FaceSheetKind | FaceElementKind, string] => Boolean(entry[1])).map(async ([kind, id]) => [kind, await window.desktop.fabricator.loadFaceCatalogItem(project.slot, id)] as const))
        const items: Partial<Record<FaceSheetKind | FaceElementKind, FaceCatalogItem>> = {}
        for (const [kind, item] of entries) if (item) items[kind] = item
        await drawFaceCatalogOverlay(context, project, project, items, face, character.customization.modelSkinTone)
      } else if (face.setId) {
        const legacyFace = await window.desktop.fabricator.loadFaceSet(project.slot, face.setId)
        const dataUrl = await renderFaceOverlay(project, project, legacyFace, face)
        if (dataUrl) {
          const image = new Image()
          await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Não foi possível abrir o rosto salvo.')); image.src = dataUrl })
          context.drawImage(image, 0, 0, project.width, project.height)
        }
      }
      if (cancelled) return
      const cropped = document.createElement('canvas')
      cropped.width = Math.max(1, Math.ceil(head.width))
      cropped.height = Math.max(1, Math.ceil(head.height))
      const croppedContext = cropped.getContext('2d')
      if (!croppedContext) throw new Error('Não foi possível recortar a prévia do rosto.')
      croppedContext.drawImage(overlay, head.x, head.y, head.width, head.height, 0, 0, cropped.width, cropped.height)
      setImageUrl(cropped.toDataURL('image/png'))
      overlay.width = overlay.height = 1
      cropped.width = cropped.height = 1
    })().catch(() => { if (!cancelled) setImageUrl(null) })
    return () => { cancelled = true }
  }, [character, head, project])

  return <>
    {controls && createPortal(<label className="hair-dev-face-reference">Rosto de referência
      <select aria-label="Rosto de referência do Customizador" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
        <option value="">{compatibleCharacters.length ? 'Rosto original' : 'Nenhum rosto disponível para este modelo'}</option>
        {compatibleCharacters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>, controls)}
    {imageUrl && <img className="hair-dev-face-overlay" src={imageUrl} alt={`Rosto de ${character?.name}`} draggable={false} />}
  </>
}
