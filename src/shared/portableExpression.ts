import type { FaceExpressionTransforms, FaceTransform, PortableExpressionMotion, PtPupilOverrides, PtPupilMotion } from './fabricator'

export type ExpressionLayer = keyof FaceExpressionTransforms
export type ExpressionMetric = { width: number; height: number; mirrored?: boolean }
export type ExpressionMetrics = Partial<Record<ExpressionLayer, ExpressionMetric>>
export const expressionLayers: readonly ExpressionLayer[] = ['eyeLeft','eyeRight','pupilLeft','pupilRight','browLeft','browRight','nose','mouth']

function finite(value: number): boolean { return Number.isFinite(value) }
function validTransform(value: FaceTransform): boolean {
  return Boolean(value) && [value.x,value.y,value.scaleX,value.scaleY,value.rotation].every(finite) && value.scaleX > 0 && value.scaleY > 0
}
function validMetric(metric: ExpressionMetric | undefined): metric is ExpressionMetric {
  return Boolean(metric && finite(metric.width) && finite(metric.height) && metric.width > 0 && metric.height > 0)
}

/** Authored motion is a change relative to the original calibrated face, never an asset selection.
 * Units: fractions of source part width/height (pupil offsets use eye dimensions).
 * Asset IDs or PNG bytes NEVER enter the motion and are not needed when applying it.
 */
export function compilePortableExpression(
  transforms: FaceExpressionTransforms,
  reference: FaceExpressionTransforms,
  metrics: ExpressionMetrics
): PortableExpressionMotion {
  const layers: PortableExpressionMotion['layers'] = {}
  for (const layer of expressionLayers) {
    const part = transforms[layer], base = reference[layer], metric = metrics[layer]
    if (!validTransform(part) || !validTransform(base)) throw Error(`Transformação da expressão ${layer} inválida.`)
    if (!validMetric(metric)) continue // Do not fabricate a metric for missing source assets.
    layers[layer] = {
      dx: (part.x-base.x)/metric.width,
      dy: (part.y-base.y)/metric.height,
      sx: part.scaleX/base.scaleX, sy: part.scaleY/base.scaleY,
      rotation: part.rotation-base.rotation,
      flip: Boolean(part.flipX) !== Boolean(base.flipX),
      ...(metric.mirrored !== undefined ? {sourceMirrored:metric.mirrored} : {})
    }
  }
  return {version:1,layers}
}

export function isPortableExpressionMotion(value: unknown): value is PortableExpressionMotion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const motion=value as PortableExpressionMotion
  if (motion.version !== 1 || !motion.layers || typeof motion.layers !== 'object' || Array.isArray(motion.layers)) return false
  const keys=Object.keys(motion.layers)
  return keys.length > 0 && keys.length <= expressionLayers.length && keys.every(key => {
    const part=motion.layers[key as ExpressionLayer]
    return expressionLayers.includes(key as ExpressionLayer) && Boolean(part)
      && [part!.dx,part!.dy,part!.sx,part!.sy,part!.rotation].every(finite)
      && part!.sx > 0 && part!.sy > 0 && typeof part!.flip === 'boolean'
      && (part!.sourceMirrored === undefined || typeof part!.sourceMirrored === 'boolean')
  })
}

export function applyPortableExpressionLayer(
  motion: PortableExpressionMotion,
  layer: ExpressionLayer,
  base: FaceTransform,
  metric: ExpressionMetric
): FaceTransform {
  if (!isPortableExpressionMotion(motion) || !validTransform(base) || !validMetric(metric))
    throw Error('Movimento de expressão inválido; os dados originais foram preservados.')
  const part=motion.layers[layer]
  if (!part) return { ...base }
  const direction=Boolean(part.sourceMirrored) !== Boolean(metric.mirrored) ? -1 : 1
  const result: FaceTransform = {
    ...base,
    x: base.x+part.dx*metric.width*direction,
    y: base.y+part.dy*metric.height,
    scaleX: base.scaleX*part.sx,
    scaleY: base.scaleY*part.sy,
    rotation: base.rotation+part.rotation*direction
  }
  const flip=Boolean(base.flipX)!==part.flip
  if (flip) result.flipX=true
  else delete result.flipX
  if (!validTransform(result)) throw Error('Expressão fora dos limites numéricos.')
  return result
}

/** Gaze is a playback dimension, not an edit to saved emotion or Customizer face.
 * The right-side asset can be already positioned on the right, otherwise it is mirrored.
 */
export type ExpressionGaze = 'right' | 'left'

export function isPtPupilOverrides(value: unknown): value is PtPupilOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(([side, part]) => (side === 'left' || side === 'right')
    && Boolean(part) && typeof part === 'object' && !Array.isArray(part)
    && Object.keys(part as object).every(key => ['x','y','rotation'].includes(key))
    && [(part as FaceTransform).x,(part as FaceTransform).y,(part as FaceTransform).rotation].every(Number.isFinite))
}
export function isPtPupilMotion(value: unknown): value is PtPupilMotion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const motion = value as PtPupilMotion
  return motion.version === 1 && !!motion.layers && typeof motion.layers === 'object' && !Array.isArray(motion.layers)
    && Object.entries(motion.layers).every(([side, part]) => (side === 'left' || side === 'right')
      && !!part && [part.dx,part.dy,part.rotation].every(Number.isFinite)
      && (part.sourceMirrored === undefined || typeof part.sourceMirrored === 'boolean'))
}
/** Save manual PT offsets normalized to the authored eye dimensions, never the pupil bitmap. */
export function compilePtPupilMotion(overrides: PtPupilOverrides | undefined,
  reference: FaceExpressionTransforms, metrics: ExpressionMetrics): PtPupilMotion | undefined {
  if (!overrides || !Object.keys(overrides).length) return undefined
  if (!isPtPupilOverrides(overrides)) throw Error('Pupilas PT inválidas.')
  const layers: PtPupilMotion['layers'] = {}
  for (const side of ['left','right'] as const) {
    const value=overrides[side]
    if (!value) continue
    const key=side==='left'?'pupilLeft':'pupilRight'
    const metric=metrics[key],base=reference[key]
    if (!validMetric(metric) || !validTransform(base)) throw Error('Olho de referência ausente ao salvar pupila PT.')
    layers[side]={
      dx:(value.x-base.x)/metric.width,dy:(value.y-base.y)/metric.height,
      rotation:value.rotation-base.rotation,
      ...(metric.mirrored!==undefined?{sourceMirrored:metric.mirrored}:{})
    }
  }
  return {version:1,layers}
}
/** Only PT position/rotation differ: normal scale/flip always remain inherited. */
export function applyPtPupilMotion(normal: FaceTransform, neutral: FaceTransform,
  layer: NonNullable<PtPupilMotion['layers']['left']>, metric: ExpressionMetric): FaceTransform {
  if (!validTransform(normal) || !validTransform(neutral) || !validMetric(metric)
      || ![layer.dx,layer.dy,layer.rotation].every(Number.isFinite)) throw Error('Movimento PT inválido.')
  const direction=Boolean(layer.sourceMirrored)!==Boolean(metric.mirrored)?-1:1
  return {...normal,x:neutral.x+layer.dx*metric.width*direction,
    y:neutral.y+layer.dy*metric.height,rotation:neutral.rotation+layer.rotation*direction}
}
export function expressionGazeX(
  basePupilX: number,
  eyeWidth: number,
  eyeScaleX: number,
  side: 'left'|'right',
  rightSidePositioned: boolean,
  gaze: ExpressionGaze
): number {
  if (![basePupilX,eyeWidth,eyeScaleX].every(finite) || eyeWidth <= 0 || eyeScaleX <= 0)
    throw Error('Dimensões dos olhos inválidas para a direção da pupila.')
  const mirror=side === 'right' && !rightSidePositioned ? -1 : 1
  return basePupilX + (gaze==='left' ? -1 : 1)*mirror*eyeWidth*eyeScaleX*.16
}

/** Keeps normal authored gaze untouched. PT mirrors authored displacement, or
 * uses a deterministic left offset when the authored pupil is neutral.
 * Does not edit the original preset or alter pupil Y / size / rotation.
 */
export function resolvePresetPupilGaze(
  authoredX: number, neutralX: number, eyeWidth: number, eyeScaleX: number,
  side: 'left'|'right', rightSidePositioned: boolean, gaze: ExpressionGaze, eyeFlipped = false
): number {
  if (![authoredX,neutralX,eyeWidth,eyeScaleX].every(finite) || eyeWidth<=0 || eyeScaleX<=0)
    throw Error('Direção das pupilas recebeu geometria inválida.')
  // Authoring establishes the intensity; playback establishes a consistent
  // screen direction even for physically mirrored right-side image assets.
  const authoredMagnitude=Math.abs(authoredX-neutralX)
  const magnitude=authoredMagnitude < eyeWidth*eyeScaleX*.03 ? eyeWidth*eyeScaleX*.16 : authoredMagnitude
  const mirror=(side==='right' && !rightSidePositioned ? -1 : 1)*(eyeFlipped?-1:1)
  return neutralX+(gaze==='left'?-1:1)*mirror*magnitude
}
