import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { StudioDocument, StudioElement } from '../../../../shared/studio'
import { buildStudioExpressionAppearance, buildStudioExpressionTransforms, resolveStudioExpressionBase } from './expressionTransforms'
import { selectStudioCharacterRefreshCandidates } from './studioCharacterRefreshModel'
import { sceneFaceModeForElement } from '../../characters/sceneFaceMode'
import { faceRenderGeometry, fitElementToTrim, trimTransparentImage, type TrimmedImage } from '../../characters/characterGeometry'
import { STUDIO_FACE_RENDER_VERSION } from './useStudioFacePreview'
import { mapConcurrentItems } from '../../ui/mapConcurrentItems'

type StudioListSetter = Dispatch<SetStateAction<StudioDocument[]>>
type StudioStageRef = { current: HTMLDivElement | null }

type StudioCharacterSourceRefreshOptions = {
  activeStudio: StudioDocument | null
  availableCharacters: CustomizerCharacter[]
  expressionPresetVersions: Record<string, string | undefined>
  assetLibraryRevision: number
  sceneRef: StudioStageRef
  setStudios: StudioListSetter
  markUnsaved: () => void
  setError: (message: string | null) => void
}

/** Normalizes legacy character crops and refreshes Studio snapshots from their live sources. */
export function useStudioCharacterSourceRefresh({
  activeStudio,
  availableCharacters,
  expressionPresetVersions,
  assetLibraryRevision,
  sceneRef,
  setStudios,
  markUnsaved,
  setError
}: StudioCharacterSourceRefreshOptions) {
  const normalizedStudioIdsRef = useRef(new Set<string>())
  const appliedAssetRevisionRef = useRef(new Map<string, number>())
  const [normalizedStudioVersion, setNormalizedStudioVersion] = useState(0)

  useEffect(() => {
    if (!activeStudio || normalizedStudioIdsRef.current.has(activeStudio.id)) return
    let cancelled = false
    const studioId = activeStudio.id
    void (async () => {
      const characterAssets = activeStudio.assets.filter((asset) => asset.category === 'character' && activeStudio.elements.some((element) => element.kind === 'character' && element.assetId === asset.id))
      const crops = await mapConcurrentItems(
        characterAssets,
        async (asset) => ({ assetId: asset.id, crop: await trimTransparentImage(asset.dataUrl) }),
        () => cancelled
      )
      if (cancelled) return
      normalizedStudioIdsRef.current.add(studioId)
      setNormalizedStudioVersion((version) => version + 1)
      const byAsset = new Map(crops.filter((entry): entry is { assetId: string; crop: TrimmedImage } => entry.crop !== null).map((entry) => [entry.assetId, entry.crop]))
      if (!byAsset.size) return
      setStudios((current) => current.map((studio) => studio.id !== studioId ? studio : {
        ...studio,
        assets: studio.assets.map((asset) => {
          const crop = byAsset.get(asset.id)
          return crop ? { ...asset, dataUrl: crop.dataUrl, mimeType: 'image/png' } : asset
        }),
        elements: studio.elements.map((element) => {
          const crop = element.kind === 'character' && element.assetId ? byAsset.get(element.assetId) : undefined
          return crop ? fitElementToTrim(element, crop) : element
        }),
        updatedAt: new Date().toISOString()
      }))
      markUnsaved()
    })().catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível normalizar as imagens de personagens do Studio.')
    })
    return () => { cancelled = true }
  }, [activeStudio, markUnsaved, setError, setStudios])

  useEffect(() => {
    if (!activeStudio || !normalizedStudioIdsRef.current.has(activeStudio.id) || !availableCharacters.length) return
    const pending = selectStudioCharacterRefreshCandidates({
      studio: activeStudio,
      availableCharacters,
      expressionPresetVersions,
      assetLibraryRevision,
      appliedAssetRevisions: appliedAssetRevisionRef.current,
      faceRendererVersion: STUDIO_FACE_RENDER_VERSION
    })
    if (!pending.length) return
    let cancelled = false
    const studioId = activeStudio.id
    const stageWidth = sceneRef.current?.clientWidth ?? 1000
    const stageHeight = sceneRef.current?.clientHeight ?? 562
    void (async () => {
      try {
        const { renderSavedCharacter } = await import('../../characters/characterRenderer')
        const updates: Array<{ previous: StudioElement; next: StudioElement; asset: StudioDocument['assets'][number] }> = []
        for (const { element, character, shouldRecomposeExpression, assetRevisionKey, assetsChanged } of pending) {
          const savedPreset = element.activeExpressionPresetId
            ? await window.desktop.fabricator.loadFaceExpressionPreset(character.customization.modelSlot ?? 1, element.activeExpressionPresetId)
            : null
          if (element.activeExpressionPresetId && !savedPreset) continue
          const sourceAppearance = character.customization.faceAppearance
          const appearanceFallback = sourceAppearance ?? element.faceAppearance ?? element.expressionBase?.appearance
          if (!appearanceFallback) continue
          const previousBase = resolveStudioExpressionBase(element, appearanceFallback)
          const sceneTransforms = Object.fromEntries(Object.entries(element.faceTransforms ?? {}).filter(([key]) => !key.startsWith('expression-component:') && !key.startsWith('expression:')))
          const characterChanged = element.characterSourceUpdatedAt !== character.updatedAt
          const expressionBase = characterChanged && sourceAppearance
            ? { appearance: structuredClone(sourceAppearance), transforms: sceneTransforms }
            : previousBase
          const appearance = shouldRecomposeExpression
            ? savedPreset && expressionBase
              ? await buildStudioExpressionAppearance(savedPreset, expressionBase.appearance, (id) => window.desktop.fabricator.loadFaceCatalogItem(savedPreset.modelSlot, id))
              : expressionBase?.appearance ?? element.faceAppearance
            : element.faceAppearance ?? expressionBase?.appearance
          const faceMode = sceneFaceModeForElement(element, element.faceAppearance ?? expressionBase?.appearance)
          const faceTransforms = shouldRecomposeExpression
            ? savedPreset && appearance && expressionBase
              ? await buildStudioExpressionTransforms(savedPreset, appearance, expressionBase.transforms,
                (id) => window.desktop.fabricator.loadFaceComponentAsset(savedPreset.modelSlot, id),
                (id) => window.desktop.fabricator.loadFaceCatalogItem(savedPreset.modelSlot, id), element.activeExpressionGaze ?? 'right')
              : expressionBase?.transforms ?? element.faceTransforms
            : element.faceTransforms ?? expressionBase?.transforms
          const expressionEffects = shouldRecomposeExpression ? savedPreset?.effects : element.activeExpressionEffects
          const customization = {
            ...character.customization,
            poseSlot: element.poseSlot === undefined ? character.customization.poseSlot : element.poseSlot,
            faceAppearance: appearance
          }
          const rendered = await renderSavedCharacter({ ...character, customization }, faceTransforms, expressionEffects, faceMode)
          if (cancelled) return
          const crop = await trimTransparentImage(rendered.dataUrl)
          if (cancelled) return
          const geometry = faceRenderGeometry(element, rendered, crop, stageWidth, stageHeight)
          const asset = activeStudio.assets.find((item) => item.id === element.assetId)
          if (!asset) continue
          updates.push({
            previous: element,
            next: {
              ...element, characterSourceUpdatedAt: character.updatedAt, faceRendererVersion: STUDIO_FACE_RENDER_VERSION, expressionBase, faceAppearance: appearance, faceTransforms, activeExpressionEffects: expressionEffects, activeFaceMode: faceMode,
              ...(savedPreset ? { activeExpressionPresetUpdatedAt: savedPreset.updatedAt } : {}), ...geometry,
              text: element.text === asset.name ? character.name : element.text
            },
            asset: { ...asset, name: character.name, mimeType: 'image/png', dataUrl: crop?.dataUrl ?? rendered.dataUrl }
          })
          if (assetsChanged) appliedAssetRevisionRef.current.set(assetRevisionKey, assetLibraryRevision)
        }
        if (cancelled || !updates.length) return
        setStudios((current) => current.map((studio) => {
          if (studio.id !== studioId) return studio
          const valid = updates.filter(({ previous }) => studio.elements.some((element) => element === previous))
          if (!valid.length) return studio
          const elements = new Map(valid.map(({ next }) => [next.id, next]))
          const assets = new Map(valid.map(({ asset }) => [asset.id, asset]))
          return {
            ...studio,
            elements: studio.elements.map((element) => elements.get(element.id) ?? element),
            assets: studio.assets.map((asset) => assets.get(asset.id) ?? asset),
            updatedAt: new Date().toISOString()
          }
        }))
        markUnsaved()
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o personagem do Studio.')
      }
    })()
    return () => { cancelled = true }
  }, [activeStudio, availableCharacters, normalizedStudioVersion, expressionPresetVersions, assetLibraryRevision, markUnsaved, sceneRef, setError, setStudios])
}
