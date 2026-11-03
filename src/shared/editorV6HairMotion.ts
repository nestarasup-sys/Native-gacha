import { z } from 'zod'
import { normalizeHairMotionPreset, type HairMotionPreset } from './hairMotionEngine'
import type { EditorV6Element } from './editorV6'
import type { EditorV6FacePatch, EditorV6MotionSprite } from './editorV6Motion'

export type EditorV6HairMotionSurface = { id: string; dataUrl: string }
export type EditorV6HairMotionLayer = {
  id: string
  textureId: string
  side: 'front' | 'back' | 'fringe'
  width: number
  height: number
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  flipX: boolean
  phase: number
}
export type EditorV6HairMotionRig = {
  elementId: string
  assetId: string
  characterId: string
  baseSurfaceId: string
  faceSurfaceId: string
  overlaySurfaceId: string | null
  artworkWidth: number
  artworkHeight: number
  outputWidth: number
  outputHeight: number
  shapeScaleX: number
  shapeScaleY: number
  sourceCrop: { left: number; top: number; width: number; height: number }
  sourceHead: { width: number; height: number }
  targetHead: { x: number; y: number; width: number; height: number; rotation: number }
  layers: EditorV6HairMotionLayer[]
}
export type EditorV6HairMotionTransitionFrame = {
  offset: number
  sprite: EditorV6MotionSprite
  crop: { left: number; top: number; width: number; height: number }
  x: number
  y: number
  width: number
  height: number
  rotation: number
  flipX: boolean
  facePatch?: EditorV6FacePatch
}
export type EditorV6HairMotionTransition = {
  elementId: string
  key: string
  startFrame: number
  endFrame: number
  behindFaceSurfaceId: string
  faceSurfaceId: string
  overlaySurfaceId: string | null
  faceAtlasSurfaceId: string | null
  frames: EditorV6HairMotionTransitionFrame[]
}
export type EditorV6HairMotionBundle = {
  presetSlot: number
  preset: HairMotionPreset
  surfaces: EditorV6HairMotionSurface[]
  textures: EditorV6HairMotionSurface[]
  rigs: EditorV6HairMotionRig[]
  motionTransitions?: EditorV6HairMotionTransition[]
}

/** Return the head's horizontal position in stage coordinates for export physics. */
export function editorV6HairMotionHeadAnchorX(element: Pick<EditorV6Element, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flipX' | 'characterScale' | 'characterWidthScale' | 'characterHeightScale'>, rig: EditorV6HairMotionRig): number {
  const overall = (element.characterScale ?? 100) / 100
  const cropWidth = Math.max(1, rig.sourceCrop.width), cropHeight = Math.max(1, rig.sourceCrop.height)
  const elementWidth = element.width * rig.outputWidth / cropWidth * overall * (element.characterWidthScale ?? 100) / 100
  const elementHeight = element.height * rig.outputHeight / cropHeight * overall * (element.characterHeightScale ?? 100) / 100
  const headCenterX = rig.outputWidth / 2 + (rig.targetHead.x + rig.targetHead.width / 2 - rig.artworkWidth / 2) * rig.shapeScaleX
  const headCenterY = rig.outputHeight / 2 + (rig.targetHead.y + rig.targetHead.height / 2 - rig.artworkHeight / 2) * rig.shapeScaleY
  const cropCenterX = rig.sourceCrop.left + cropWidth / 2
  const cropCenterY = rig.sourceCrop.top + cropHeight / 2
  let localX = (headCenterX - cropCenterX) / rig.outputWidth * elementWidth
  const localY = (headCenterY - cropCenterY) / rig.outputHeight * elementHeight
  if (element.flipX) localX *= -1
  const radians = element.rotation * Math.PI / 180
  const rotatedX = localX * Math.cos(radians) - localY * (9 / 16) * Math.sin(radians)
  return (50 + element.x + rotatedX) / 100
}

/** Interpolate only the per-pose head geometry used to drive export hair inertia. */
export function interpolateEditorV6HairMotionRig(from: EditorV6HairMotionRig, to: EditorV6HairMotionRig, progress: number): EditorV6HairMotionRig {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) throw Error('Progresso da geometria do cabelo inválido.')
  const mix = (left: number, right: number) => left + (right - left) * progress
  const angle = (left: number, right: number) => left + ((((right - left) % 360 + 540) % 360) - 180) * progress
  return {
    ...from,
    artworkWidth: mix(from.artworkWidth, to.artworkWidth), artworkHeight: mix(from.artworkHeight, to.artworkHeight),
    outputWidth: mix(from.outputWidth, to.outputWidth), outputHeight: mix(from.outputHeight, to.outputHeight),
    shapeScaleX: mix(from.shapeScaleX, to.shapeScaleX), shapeScaleY: mix(from.shapeScaleY, to.shapeScaleY),
    sourceCrop: {
      left: mix(from.sourceCrop.left, to.sourceCrop.left), top: mix(from.sourceCrop.top, to.sourceCrop.top),
      width: mix(from.sourceCrop.width, to.sourceCrop.width), height: mix(from.sourceCrop.height, to.sourceCrop.height)
    },
    targetHead: {
      x: mix(from.targetHead.x, to.targetHead.x), y: mix(from.targetHead.y, to.targetHead.y),
      width: mix(from.targetHead.width, to.targetHead.width), height: mix(from.targetHead.height, to.targetHead.height),
      rotation: angle(from.targetHead.rotation, to.targetHead.rotation)
    },
    layers: from.layers.map(layer => {
      const matching = to.layers.find(candidate => candidate.id === layer.id && candidate.side === layer.side)
      if (!matching) return layer
      return {
        ...layer,
        width: mix(layer.width, matching.width), height: mix(layer.height, matching.height),
        x: mix(layer.x, matching.x), y: mix(layer.y, matching.y),
        scaleX: mix(layer.scaleX, matching.scaleX), scaleY: mix(layer.scaleY, matching.scaleY),
        rotation: angle(layer.rotation, matching.rotation),
        flipX: progress < .5 ? layer.flipX : matching.flipX
      }
    })
  }
}

const finite = z.number().finite()
const dimension = finite.positive().max(16_384)
const id = z.string().min(1).max(300)
const surface = z.object({ id, dataUrl: z.string().max(48_000_000).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/) }).strict()
const motionSprite = z.object({
  x: finite.min(0).max(16_384), y: finite.min(0).max(16_384), width: dimension, height: dimension,
  atlasWidth: dimension, atlasHeight: dimension
}).strict().superRefine((sprite, context) => {
  if (sprite.x + sprite.width > sprite.atlasWidth || sprite.y + sprite.height > sprite.atlasHeight) context.addIssue({ code: 'custom', message: 'Recorte da transição fora do atlas.' })
})
const facePatch = z.object({
  sprite: motionSprite,
  x: finite.min(0).max(1), y: finite.min(0).max(1), width: dimension, height: dimension,
  replace: z.boolean().optional(),
  replaceBounds: z.object({ x: finite.min(0).max(1), y: finite.min(0).max(1), width: dimension, height: dimension }).strict().optional()
}).strict()
const layer = z.object({
  id, textureId: id, side: z.enum(['front', 'back', 'fringe']), width: dimension, height: dimension,
  x: finite.max(100_000).min(-100_000), y: finite.max(100_000).min(-100_000),
  scaleX: finite.positive().max(20), scaleY: finite.positive().max(20), rotation: finite.min(-3600).max(3600),
  flipX: z.boolean(), phase: finite.min(-1000).max(1000)
}).strict()
const rig = z.object({
  elementId: id, assetId: id, characterId: id, baseSurfaceId: id, faceSurfaceId: id, overlaySurfaceId: id.nullable(),
  artworkWidth: dimension, artworkHeight: dimension, outputWidth: dimension, outputHeight: dimension,
  shapeScaleX: finite.positive().max(10), shapeScaleY: finite.positive().max(10),
  sourceCrop: z.object({ left: finite.min(0).max(16_384), top: finite.min(0).max(16_384), width: dimension, height: dimension }).strict(),
  sourceHead: z.object({ width: dimension, height: dimension }).strict(),
  targetHead: z.object({ x: finite.min(-100_000).max(100_000), y: finite.min(-100_000).max(100_000), width: dimension, height: dimension, rotation: finite.min(-3600).max(3600) }).strict(),
  layers: z.array(layer).min(1, 'Cada personagem precisa ter uma camada visível de cabelo.').max(20)
}).strict()
const transitionFrame = z.object({
  offset: finite.min(-300).max(0), sprite: motionSprite,
  crop: z.object({ left: finite.min(0).max(16_384), top: finite.min(0).max(16_384), width: dimension, height: dimension }).strict(),
  x: finite.min(-100_000).max(100_000), y: finite.min(-100_000).max(100_000),
  width: finite.positive().max(100_000), height: finite.positive().max(100_000),
  rotation: finite.min(-3600).max(3600), flipX: z.boolean(),
  facePatch: facePatch.optional()
}).strict()
const transition = z.object({
  elementId: id, key: z.string().min(1).max(20_000), startFrame: finite.min(0).max(10_000_000), endFrame: finite.min(0).max(10_000_000),
  behindFaceSurfaceId: id, faceSurfaceId: id, overlaySurfaceId: id.nullable(), faceAtlasSurfaceId: id.nullable(),
  frames: z.array(transitionFrame).min(1).max(16)
}).strict().superRefine((value, context) => {
  if (value.endFrame <= value.startFrame) context.addIssue({ code: 'custom', message: 'Intervalo da transição do cabelo inválido.' })
  if (new Set(value.frames.map(frame => frame.offset)).size !== value.frames.length) context.addIssue({ code: 'custom', message: 'A transição do cabelo contém quadros duplicados.' })
})

const bundleSchema = z.object({
  presetSlot: z.number().int().min(1).max(5),
  preset: z.unknown(),
  surfaces: z.array(surface).max(5000),
  textures: z.array(surface).max(2000),
  rigs: z.array(rig).min(1).max(10_000),
  motionTransitions: z.array(transition).max(10_000).optional()
}).strict()

/** Validate the renderer-created, export-only bundle before it crosses IPC. */
export function parseEditorV6HairMotionBundle(value: unknown): EditorV6HairMotionBundle {
  const parsed = bundleSchema.parse(value)
  const preset = normalizeHairMotionPreset(parsed.preset)
  if (!preset) throw Error('O preset de animação de cabelo está inválido.')
  const surfaces = new Set(parsed.surfaces.map(item => item.id))
  const textures = new Set(parsed.textures.map(item => item.id))
  const rigKeys = new Set<string>()
  if (surfaces.size !== parsed.surfaces.length || textures.size !== parsed.textures.length) throw Error('A exportação contém camadas de cabelo repetidas.')
  const transitionKeys = new Set<string>()
  const totalDataUrlCharacters = [...parsed.surfaces, ...parsed.textures].reduce((sum, item) => sum + item.dataUrl.length, 0)
  if (totalDataUrlCharacters > 96_000_000) throw Error('As camadas preparadas para animação de cabelo excedem o limite de memória da exportação.')
  for (const item of parsed.rigs) {
    const key = `${item.elementId}:${item.assetId}`
    if (rigKeys.has(key)) throw Error('A exportação contém um personagem repetido nas camadas de cabelo.')
    rigKeys.add(key)
    if (!surfaces.has(item.baseSurfaceId) || !surfaces.has(item.faceSurfaceId) || (item.overlaySurfaceId && !surfaces.has(item.overlaySurfaceId))) throw Error('A exportação não encontrou uma camada preparada do personagem.')
    if (item.layers.some(piece => !textures.has(piece.textureId))) throw Error('A exportação não encontrou uma imagem de cabelo preparada.')
    if (item.sourceCrop.left + item.sourceCrop.width > item.outputWidth + 1 || item.sourceCrop.top + item.sourceCrop.height > item.outputHeight + 1) throw Error('O enquadramento preparado do cabelo é inválido.')
  }
  for (const item of parsed.motionTransitions ?? []) {
    const key = `${item.elementId}:${item.key}`
    if (transitionKeys.has(key)) throw Error('A exportação contém uma transição de cabelo repetida.')
    transitionKeys.add(key)
    if (!surfaces.has(item.behindFaceSurfaceId) || !surfaces.has(item.faceSurfaceId) || (item.overlaySurfaceId && !surfaces.has(item.overlaySurfaceId)) || (item.faceAtlasSurfaceId && !surfaces.has(item.faceAtlasSurfaceId))) throw Error('A exportação não encontrou uma camada de pose sem cabelo.')
  }
  return { ...parsed, preset } as EditorV6HairMotionBundle
}
