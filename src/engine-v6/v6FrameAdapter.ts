import type { EditorV6Document } from '../shared/editorV6'
import type { EditorV6NativeFramePlan } from '../shared/editorV6Export'
import { editorV6ElementSize } from '../shared/editorV6SceneModel'
import { resolveEditorV6SceneAtFrame, type EditorV6ResolvedScene } from '../shared/editorV6TimelineScene'

export type EngineV6Layer = 'all' | 'background' | 'foreground'
export type EngineV6FrameOptions = { width: number; height: number; layer?: EngineV6Layer }

/**
 * Temporary V6 -> engine bridge. Pure, versioned and independent of React/DOM/Electron.
 * No image bytes enter the IR: they are materialized only at the compositor boundary.
 *
 * Scope (F1): backgrounds, images, character snapshots and prepared motion atlases.
 * Text, face patches and embedded video intentionally fail instead of silently disappearing.
 * Export-only hair/mouth preparation remains a separate, later milestone.
 */
export type EngineV6FramePlanV1 = {
  contractVersion: 1
  projectId: string
  sourceFrame: number
  width: number
  height: number
  logicalHeight: 1080
  backgroundColor: string
  commands: EditorV6NativeFramePlan['commands']
  requiredAssetIds: string[]
}

function position(x: number, y: number) {
  return { x: (50 + x) * 19.2, y: (50 + y) * 10.8 }
}

function validateOptions(options: EngineV6FrameOptions) {
  if (!Number.isSafeInteger(options.width) || !Number.isSafeInteger(options.height)
    || options.width < 1 || options.height < 1 || options.width > 4096 || options.height > 2160
    || options.width * options.height > 4096 * 2160
    || (options.layer && options.layer !== 'all' && options.layer !== 'background' && options.layer !== 'foreground')) {
    throw Error('Dimensões ou camada inválidas para o frame da Engine V6.')
  }
}

export function planEngineV6ResolvedScene(
  project: EditorV6Document,
  scene: EditorV6ResolvedScene,
  options: EngineV6FrameOptions
): EngineV6FramePlanV1 {
  validateOptions(options)
  if (!project.id || !Number.isSafeInteger(scene.frame) || scene.frame < 0 || scene.frame >= project.timeline.durationFrames) {
    throw Error('Projeto ou quadro inválido para a Engine V6.')
  }
  const layer = options.layer ?? 'all'
  if (scene.mediaVideo && layer === 'all') {
    throw Error('Vídeo sobreposto requer a composição de mídia por camadas; a Engine V6 F1 ainda não oferece essa etapa.')
  }

  const assetIndex = new Map(project.assets.map(asset => [asset.id, asset]))
  const requiredAssetIds = new Set<string>()
  const commands: EngineV6FramePlanV1['commands'] = []
  const requireAsset = (id: string) => {
    if (!assetIndex.has(id)) throw Error(`Asset não encontrado na cena V6: ${id}.`)
    requiredAssetIds.add(id)
  }
  const background = scene.background
  if (layer !== 'foreground') {
    if (background.backgroundAssetId) {
      const id = background.backgroundAssetId
      requireAsset(id)
      commands.push({
        kind: 'image',
        assetId: id,
        ...position(background.backgroundX, background.backgroundY),
        width: background.backgroundWidth * 19.2,
        height: background.backgroundHeight * 10.8,
        rotation: background.backgroundRotation,
        opacity: 1
      })
    }
  }
  if (layer !== 'background') {
    for (const element of scene.elements) {
      if (element.kind === 'narrator' || element.kind === 'speech' || element.kind === 'thought') {
        throw Error(`Texto/balão ${element.id} ainda requer um rasterizador de fonte na Engine V6 F1.`)
      }
      if (element.mouthPatch) {
        throw Error(`Composição facial ${element.id} ainda requer validação de máscaras na Engine V6 F1.`)
      }
      if (!element.assetId) throw Error(`Elemento visível sem imagem: ${element.id}.`)
      requireAsset(element.assetId)
      const size = editorV6ElementSize(element)
      const sprite = element.motionSprite
      commands.push({
        kind: 'image',
        assetId: element.assetId,
        ...position(element.x, element.y),
        width: size.width * 19.2,
        height: size.height * 10.8,
        rotation: element.rotation,
        opacity: 1,
        flipX: Boolean(element.flipX),
        contain: element.kind === 'image' && !sprite,
        ...(sprite ? { source: { x: sprite.x, y: sprite.y, width: sprite.width, height: sprite.height } } : {})
      })
    }
  }
  return {
    contractVersion: 1,
    projectId: project.id,
    sourceFrame: scene.frame,
    width: options.width,
    height: options.height,
    logicalHeight: 1080,
    backgroundColor: layer === 'foreground' ? 'transparent' : background.backgroundColor,
    commands,
    requiredAssetIds: [...requiredAssetIds]
  }
}

export function planEngineV6DocumentFrame(
  project: EditorV6Document,
  frame: number,
  options: EngineV6FrameOptions
): EngineV6FramePlanV1 {
  if (!Number.isSafeInteger(frame) || frame < 0 || frame >= project.timeline.durationFrames) {
    throw Error('Quadro fora dos limites do documento V6.')
  }
  const scene = resolveEditorV6SceneAtFrame(project, frame)
  return planEngineV6ResolvedScene(project, scene, options)
}

/** Only this boundary exposes asset bytes for the existing native/Sharp compositor packet. */
export function materializeEngineV6LegacyFrame(
  project: EditorV6Document,
  plan: EngineV6FramePlanV1
): EditorV6NativeFramePlan {
  if (plan.contractVersion !== 1 || project.id !== plan.projectId) {
    throw Error('Versão ou projeto incompatível com o plano de frame da Engine V6.')
  }
  const index = new Map<string, string>()
  for (const asset of project.assets) {
    if (index.has(asset.id)) throw Error(`Asset duplicado no documento V6: ${asset.id}.`)
    index.set(asset.id, asset.dataUrl)
  }
  const assets = plan.requiredAssetIds.map(id => {
    const dataUrl = index.get(id)
    if (!dataUrl) throw Error(`Asset necessário para o frame não existe: ${id}.`)
    if (!/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+={0,2}$/i.test(dataUrl)) {
      throw Error(`Asset ${id} exige resolução de mídia fora do adaptador puro da Engine V6.`)
    }
    return { id, dataUrl }
  })
  return {
    width: plan.width,
    height: plan.height,
    logicalHeight: plan.logicalHeight,
    backgroundColor: plan.backgroundColor,
    commands: plan.commands.map(command => ({ ...command })),
    assets
  }
}
