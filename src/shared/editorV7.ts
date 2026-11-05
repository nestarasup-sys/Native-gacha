/** Pure, renderer-independent document and scene contract for Editor V7. */
import { z } from 'zod'

export const EDITOR_V7_DOCUMENT_VERSION = 1 as const
export const EDITOR_V7_TICKS_PER_SECOND = 90_000

export type EditorV7Rational = { numerator: number; denominator: number }
export type EditorV7Transform = { x: number; y: number; width: number; height: number; rotation: number; opacity: number; flipX: boolean }
export type EditorV7Asset = { id: string; mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; dataUrl: string; name: string }
export type EditorV7Layer = {
  id: string
  name: string
  assetId: string
  startTick: number
  endTick: number
  transform: EditorV7Transform
  visible: boolean
  zIndex: number
}
export type EditorV7Document = {
  version: typeof EDITOR_V7_DOCUMENT_VERSION
  id: string
  title: string
  width: number
  height: number
  frameRate: EditorV7Rational
  durationTicks: number
  background: { color: string }
  assets: EditorV7Asset[]
  layers: EditorV7Layer[]
}
export type EditorV7ResolvedLayer = EditorV7Layer & { asset: EditorV7Asset }
export type EditorV7Scene = { tick: number; background: string; layers: EditorV7ResolvedLayer[] }

const id = z.string().min(1).max(160)
const finite = z.number().finite()
const rationalSchema = z.object({ numerator: z.number().int().positive(), denominator: z.number().int().positive() }).strict()
const transformSchema = z.object({ x: finite, y: finite, width: finite.positive(), height: finite.positive(), rotation: finite, opacity: z.number().finite().min(0).max(1), flipX: z.boolean() }).strict()
const assetSchema = z.object({ id, mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']), dataUrl: z.string().min(1), name: z.string().max(240) }).strict()
const layerSchema = z.object({ id, name: z.string().max(240), assetId: id, startTick: z.number().int().nonnegative(), endTick: z.number().int().positive(), transform: transformSchema, visible: z.boolean(), zIndex: z.number().int() }).strict()

export const editorV7DocumentSchema = z.object({
  version: z.literal(EDITOR_V7_DOCUMENT_VERSION), id, title: z.string().trim().min(1).max(120),
  width: z.number().int().min(320).max(3840), height: z.number().int().min(180).max(2160),
  frameRate: rationalSchema, durationTicks: z.number().int().positive(),
  background: z.object({ color: z.string().regex(/^#[0-9a-f]{6}$/i) }).strict(),
  assets: z.array(assetSchema).max(20_000), layers: z.array(layerSchema).max(20_000)
}).strict().superRefine((document, context) => {
  const assets = new Set<string>()
  for (const [index, asset] of document.assets.entries()) {
    if (assets.has(asset.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['assets', index, 'id'], message: 'ID de asset duplicado.' })
    assets.add(asset.id)
    if (!asset.dataUrl.startsWith(`data:${asset.mimeType};base64,`)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['assets', index, 'dataUrl'], message: 'O conteúdo do asset deve ser uma data URL base64 do MIME declarado.' })
  }
  const layers = new Set<string>()
  for (const [index, layer] of document.layers.entries()) {
    if (layers.has(layer.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['layers', index, 'id'], message: 'ID de camada duplicado.' })
    layers.add(layer.id)
    if (!assets.has(layer.assetId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['layers', index, 'assetId'], message: 'A camada aponta para um asset ausente.' })
    if (layer.endTick <= layer.startTick || layer.endTick > document.durationTicks) context.addIssue({ code: z.ZodIssueCode.custom, path: ['layers', index], message: 'Intervalo de camada fora da duração do documento.' })
  }
})

export function parseEditorV7Document(value: unknown): EditorV7Document {
  return editorV7DocumentSchema.parse(value) as EditorV7Document
}

export function editorV7FrameToTick(frame: number, frameRate: EditorV7Rational): number {
  if (!Number.isSafeInteger(frame) || frame < 0) throw new RangeError('Frame precisa ser um inteiro seguro não negativo.')
  return Math.round(frame * EDITOR_V7_TICKS_PER_SECOND * frameRate.denominator / frameRate.numerator)
}

export function editorV7TickToFrame(tick: number, frameRate: EditorV7Rational): number {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError('Tick precisa ser um inteiro seguro não negativo.')
  return Math.round(tick * frameRate.numerator / (EDITOR_V7_TICKS_PER_SECOND * frameRate.denominator))
}

/** Resolve from immutable source data at an absolute tick; no playback clock or accumulated delta. */
export function resolveEditorV7Scene(document: EditorV7Document, tick: number): EditorV7Scene {
  if (!Number.isSafeInteger(tick) || tick < 0 || tick >= document.durationTicks) throw new RangeError('Tick fora da duração do documento.')
  const assets = new Map(document.assets.map((asset) => [asset.id, asset]))
  const layers = document.layers
    .filter((layer) => layer.visible && layer.startTick <= tick && tick < layer.endTick)
    .slice()
    .sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id))
    .map((layer) => ({ ...layer, transform: { ...layer.transform }, asset: assets.get(layer.assetId)! }))
  return { tick, background: document.background.color, layers }
}

export function createEditorV7Document(idValue: string, title: string, options: { width?: number; height?: number; fps?: number; durationFrames?: number } = {}): EditorV7Document {
  const fps = options.fps ?? 30
  const durationFrames = options.durationFrames ?? fps * 10
  if (!Number.isSafeInteger(fps) || fps < 1 || fps > 240 || !Number.isSafeInteger(durationFrames) || durationFrames < 1) throw new RangeError('Taxa ou duração inválida.')
  return parseEditorV7Document({
    version: EDITOR_V7_DOCUMENT_VERSION, id: idValue, title,
    width: options.width ?? 1920, height: options.height ?? 1080,
    frameRate: { numerator: fps, denominator: 1 }, durationTicks: editorV7FrameToTick(durationFrames, { numerator: fps, denominator: 1 }),
    background: { color: '#ffffff' }, assets: [], layers: []
  })
}
