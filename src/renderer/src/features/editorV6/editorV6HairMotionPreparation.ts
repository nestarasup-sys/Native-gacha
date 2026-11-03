import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Document, EditorV6Element, EditorV6FaceRenderMode } from '../../../../shared/editorV6'
import type { HairMotionPreset } from '../../../../shared/hairMotionEngine'
import { hairAppearanceStyleIds } from '../../../../shared/hairCategories'
import type { EditorV6HairMotionBundle, EditorV6HairMotionLayer, EditorV6HairMotionRig } from '../../../../shared/editorV6HairMotion'
import { resolveSavedCharacterSource } from '../../characters/characterSourceResolver'
import { trimTransparentCanvas } from './faceModeAssets'

type MotionTarget = { elementId: string; state: EditorV6Element; assetId: string; faceMode: EditorV6FaceRenderMode }

function faceMode(value: EditorV6Element['activeFaceMode']): EditorV6FaceRenderMode {
  return value === 'blink' || value === 'talk' ? value : 'idle'
}

function targetsForState(elementId: string, state: EditorV6Element): MotionTarget[] {
  if (state.kind !== 'character' || !state.characterId || !state.assetId) return []
  const targets: MotionTarget[] = [{ elementId, state, assetId: state.assetId, faceMode: faceMode(state.activeFaceMode) }]
  for (const [mode, assetId] of Object.entries(state.faceModeAssetIds ?? {})) {
    if (!assetId || !['idle', 'blink', 'talk', 'talk-blink'].includes(mode)) continue
    targets.push({ elementId, state, assetId, faceMode: mode as EditorV6FaceRenderMode })
  }
  return targets
}

export function collectEditorV6HairMotionTargets(project: EditorV6Document): MotionTarget[] {
  const targets = new Map<string, MotionTarget>()
  const states = [
    ...project.elements,
    ...project.timeline.tracks.flatMap(track => track.blocks.flatMap(block => block.state ? [block.state] : []))
  ]
  for (const state of states) {
    for (const target of targetsForState(state.id, state)) {
      const key = `${target.elementId}:${target.assetId}`
      const existing = targets.get(key)
      if (existing && existing.state.characterId !== target.state.characterId) throw Error('Um retrato do Editor V6 está associado a mais de um personagem.')
      if (!existing) targets.set(key, target)
    }
  }
  return [...targets.values()]
}

function canvasDataUrl(canvas: HTMLCanvasElement): string {
  if (!canvas.width || !canvas.height) throw Error('Uma camada do personagem ficou vazia ao preparar a animação de cabelo.')
  return canvas.toDataURL('image/png')
}

/** Build disposable, export-only split character layers from the current saved character/catalog snapshots. */
export async function prepareEditorV6HairMotionBundle(
  project: EditorV6Document,
  presetSlot: number,
  preset: HairMotionPreset,
  isCancelled: () => boolean = () => false
): Promise<EditorV6HairMotionBundle> {
  if (!Number.isInteger(presetSlot) || presetSlot < 1 || presetSlot > 5) throw Error('Selecione um preset de animação de cabelo válido.')
  const targets = collectEditorV6HairMotionTargets(project)
  if (!targets.length) throw Error('Este projeto ainda não tem personagens preparados para animar o cabelo.')
  const characters = await window.desktop.customizer.listCustomizerCharacters()
  if (isCancelled()) throw Error('Preparação da animação de cabelo cancelada.')
  const characterById = new Map(characters.map(character => [character.id, character]))
  const groups = new Map<string, { character: CustomizerCharacter; targets: MotionTarget[] }>()
  for (const target of targets) {
    const character = characterById.get(target.state.characterId!)
    if (!character || !character.customization.hairAppearance) continue
    const poseSlot = target.state.poseSlot === undefined ? character.customization.poseSlot : target.state.poseSlot
    const characterCopy: CustomizerCharacter = { ...character, customization: { ...character.customization, poseSlot } }
    const key = `${character.id}:${poseSlot ?? 'base'}`
    const group = groups.get(key) ?? { character: characterCopy, targets: [] }
    group.targets.push(target)
    groups.set(key, group)
  }
  if (!groups.size) throw Error('Nenhum personagem usado neste projeto tem cabelo selecionado no Customizador.')

  const surfaces: EditorV6HairMotionBundle['surfaces'] = []
  const textures: EditorV6HairMotionBundle['textures'] = []
  const rigs: EditorV6HairMotionRig[] = []
  const surfaceIds = new Map<string, string>(), textureIds = new Map<string, string>()
  const addSurface = (key: string, dataUrl: string) => {
    const existing = surfaceIds.get(key)
    if (existing) return existing
    const id = `surface-${surfaces.length + 1}`
    surfaceIds.set(key, id); surfaces.push({ id, dataUrl })
    return id
  }
  const addTexture = (key: string, dataUrl: string) => {
    const existing = textureIds.get(key)
    if (existing) return existing
    const id = `texture-${textures.length + 1}`
    textureIds.set(key, id); textures.push({ id, dataUrl })
    return id
  }

  const [{ prepareSavedCharacterRenderer }, { loadCharacterTintedImage, resolvedHairColors }] = await Promise.all([
    import('../../characters/editorV6CharacterRenderer'), import('../../characters/characterRenderer')
  ])
  for (const [groupKey, group] of groups) {
    if (isCancelled()) throw Error('Preparação da animação de cabelo cancelada.')
    const character = group.character
    const resolved = await resolveSavedCharacterSource(character)
    const appearance = character.customization.hairAppearance
    const references = appearance?.modelSlot === resolved.modelSlot ? hairAppearanceStyleIds(appearance) : []
    if (!references.length) continue
    const styleIds = [...new Set(references.map(reference => reference.id))]
    const loadedStyles = await Promise.all(styleIds.map(async id => [id, await window.desktop.fabricator.loadHairStyle(resolved.modelSlot, id)] as const))
    const styles = new Map(loadedStyles)
    const sourceHeadPart = resolved.source.parts.find(part => /cabe[çc]a|head/i.test(part.name))
    const targetHeadPart = resolved.artwork.parts.find(part => part.id === sourceHeadPart?.id)
    if (!sourceHeadPart || !targetHeadPart) throw Error(`O modelo de ${character.name} não tem uma cabeça disponível para animar o cabelo.`)

    const hairless: CustomizerCharacter = { ...character, customization: { ...character.customization, hairAppearance: undefined } }
    const renderSource = { source: resolved.source, artwork: resolved.sourceArtwork, assetProvider: window.desktop.fabricator }
    const [originalRenderer, hairlessRenderer] = await Promise.all([
      prepareSavedCharacterRenderer(character, renderSource),
      prepareSavedCharacterRenderer(hairless, renderSource)
    ])
    try {
      const descriptors: EditorV6HairMotionLayer[] = []
      for (const [index, reference] of references.entries()) {
        const style = styles.get(reference.id), original = style?.[reference.side], baseTransform = style?.transforms[reference.side]
        if (!original || !baseTransform) throw Error(`Não foi possível carregar a peça ${reference.part} do cabelo de ${character.name}.`)
        const override = character.customization.partOverrides?.[`head:${reference.part}`]
        if (override?.hidden) continue
        const transform = override ? {
          ...baseTransform, x: baseTransform.x + (override.x ?? 0), y: baseTransform.y + (override.y ?? 0),
          scaleX: baseTransform.scaleX * (override.scaleX ?? 1), scaleY: baseTransform.scaleY * (override.scaleY ?? 1),
          rotation: baseTransform.rotation + (override.rotation ?? 0)
        } : baseTransform
        const colors = resolvedHairColors(appearance, reference.part)
        let dataUrl = original.dataUrl
        if (Object.keys(colors).length) {
          const tinted = await loadCharacterTintedImage(original.dataUrl, colors)
          const canvas = document.createElement('canvas'); canvas.width = tinted.naturalWidth; canvas.height = tinted.naturalHeight
          const context = canvas.getContext('2d')
          if (!context) throw Error('Não foi possível recolorir uma camada de cabelo para a exportação.')
          context.drawImage(tinted, 0, 0); dataUrl = canvasDataUrl(canvas); canvas.width = canvas.height = 1
        }
        descriptors.push({
          id: `${reference.part}:${index}`,
          textureId: addTexture(`${character.id}:${reference.id}:${reference.side}:${reference.part}`, dataUrl),
          side: reference.side, width: original.width, height: original.height,
          x: transform.x * targetHeadPart.width / sourceHeadPart.width - targetHeadPart.width / 2,
          y: transform.y * targetHeadPart.height / sourceHeadPart.height - targetHeadPart.height / 2,
          scaleX: transform.scaleX * targetHeadPart.width / sourceHeadPart.width,
          scaleY: transform.scaleY * targetHeadPart.height / sourceHeadPart.height,
          rotation: transform.rotation, flipX: Boolean(transform.flipX),
          phase: index * 1.2 + (reference.side === 'back' ? 0 : 1.2)
        })
      }
      if (!descriptors.length) continue

      const poseSurfaceKey = JSON.stringify([groupKey, character.updatedAt, appearance?.modelSlot, appearance?.parts, character.customization.partOverrides])
      let baseSurfaceId: string | undefined, overlaySurfaceId: string | null | undefined
      for (const target of group.targets) {
        if (isCancelled()) throw Error('Preparação da animação de cabelo cancelada.')
        const state = target.state
        const currentAppearance = state.faceAppearance ?? state.expressionBase?.appearance ?? character.customization.faceAppearance
        const faceTransforms = state.faceTransforms ?? state.expressionBase?.transforms
        const effects = state.activeExpressionEffects
        const mode = target.faceMode
        const [originalFrame, splitFrame] = await Promise.all([
          originalRenderer.renderToCanvas(currentAppearance, faceTransforms, effects, mode),
          hairlessRenderer.renderLayersToCanvas(currentAppearance, faceTransforms, effects, mode)
        ])
        const crop = trimTransparentCanvas(originalFrame.canvas)
        const sourceCrop = crop ? { left: crop.left, top: crop.top, width: crop.width, height: crop.height }
          : { left: 0, top: 0, width: originalFrame.width, height: originalFrame.height }
        const poseKey = JSON.stringify([poseSurfaceKey, state.poseSlot, sourceHeadPart.width, sourceHeadPart.height, targetHeadPart.x, targetHeadPart.y, targetHeadPart.width, targetHeadPart.height])
        baseSurfaceId ??= addSurface(`${poseKey}:base`, canvasDataUrl(splitFrame.behindFace))
        overlaySurfaceId ??= splitFrame.inFrontOfFace ? addSurface(`${poseKey}:overlay`, canvasDataUrl(splitFrame.inFrontOfFace)) : null
        const faceSurfaceId = addSurface(`${poseKey}:face:${target.assetId}`, canvasDataUrl(splitFrame.face))
        rigs.push({
          elementId: target.elementId, assetId: target.assetId, characterId: target.state.characterId!,
          baseSurfaceId, faceSurfaceId, overlaySurfaceId,
          artworkWidth: splitFrame.width, artworkHeight: splitFrame.height,
          outputWidth: splitFrame.outputWidth, outputHeight: splitFrame.outputHeight,
          shapeScaleX: splitFrame.shapeScaleX, shapeScaleY: splitFrame.shapeScaleY,
          sourceCrop, sourceHead: { width: sourceHeadPart.width, height: sourceHeadPart.height },
          targetHead: { x: targetHeadPart.x, y: targetHeadPart.y, width: targetHeadPart.width, height: targetHeadPart.height, rotation: targetHeadPart.rotation },
          layers: descriptors
        })
      }
    } finally { originalRenderer.dispose(); hairlessRenderer.dispose() }
  }
  if (!rigs.length) throw Error('Nenhum personagem do projeto tem uma camada de cabelo visível para animar.')
  return { presetSlot, preset, surfaces, textures, rigs }
}
