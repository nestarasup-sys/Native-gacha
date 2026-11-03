import { z } from 'zod'
import { normalizeHairMotionPreset, type HairMotionPreset } from './hairMotionEngine'

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
export type EditorV6HairMotionBundle = {
  presetSlot: number
  preset: HairMotionPreset
  surfaces: EditorV6HairMotionSurface[]
  textures: EditorV6HairMotionSurface[]
  rigs: EditorV6HairMotionRig[]
}

const finite = z.number().finite()
const dimension = finite.positive().max(16_384)
const id = z.string().min(1).max(300)
const surface = z.object({ id, dataUrl: z.string().max(48_000_000).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/) }).strict()
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

const bundleSchema = z.object({
  presetSlot: z.number().int().min(1).max(5),
  preset: z.unknown(),
  surfaces: z.array(surface).max(5000),
  textures: z.array(surface).max(2000),
  rigs: z.array(rig).min(1).max(10_000)
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
  return { ...parsed, preset } as EditorV6HairMotionBundle
}
