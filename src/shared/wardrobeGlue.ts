/** Encaixe explícito na folha ORIGINAL desmontada, sem mover PNGs ou poses. */
import type { ModelPart, WardrobeComponent, WardrobeBinding } from './fabricator'
import { bindWardrobeComponent } from './wardrobePose'

export type WardrobeGlueFrame = { x: number; y: number; width: number; height: number; rotation: number }
export type WardrobeGlueState = 'loose' | 'fixed' | 'stale' | 'orphan'

export function wardrobeSourceFrame(part: ModelPart): WardrobeGlueFrame {
  const source = part.sourceTransform
  return { x: source?.x ?? part.x, y: source?.y ?? part.y,
    width: source?.width ?? part.width, height: source?.height ?? part.height,
    rotation: source?.rotation ?? part.rotation }
}

function sameFrame(a: WardrobeGlueFrame, b: WardrobeGlueFrame): boolean {
  return (['x','y','width','height','rotation'] as const).every(key => Math.abs(a[key]-b[key]) < 0.00001)
}

/** Legacy pieces with a binding remain attached. Explicit loose pieces never follow a pose. */
export function wardrobeGlueState(component: WardrobeComponent, sourcePart?: ModelPart): WardrobeGlueState {
  if (component.glue?.mode === 'loose') return 'loose'
  if (!sourcePart || component.attachedPartId !== sourcePart.id) return 'orphan'
  if (!component.binding || component.binding.boneId !== sourcePart.id) return 'loose'
  return component.glue?.sourceFrame && !sameFrame(component.glue.sourceFrame, wardrobeSourceFrame(sourcePart))
    ? 'stale' : 'fixed'
}

/** Called only on explicit Fixar or when the user edits an already fixed garment. */
export function fixWardrobeGlue(component: WardrobeComponent, sourcePart: ModelPart): WardrobeComponent {
  const binding: WardrobeBinding = bindWardrobeComponent(component, sourcePart)
  return { ...component, attachedPartId: sourcePart.id, binding,
    glue: { version: 1, mode: 'fixed', sourceFrame: wardrobeSourceFrame(sourcePart) } }
}

/** Preserve the manual placement while removing the attachment. */
export function releaseWardrobeGlue(component: WardrobeComponent): WardrobeComponent {
  const { binding: _binding, ...rest } = component
  return { ...rest, glue: { version: 1, mode: 'loose' } }
}

/** Manual edits reattach only if the piece was already fixed, never while loose. */
export function editWardrobeGlue(component: WardrobeComponent, patch: Partial<WardrobeComponent>, sourcePart?: ModelPart): WardrobeComponent {
  const updated = { ...component, ...patch }
  if (component.glue?.mode === 'loose' || (patch.attachedPartId !== undefined && patch.attachedPartId !== component.attachedPartId)) return { ...updated, binding: undefined, glue: { version: 1, mode: 'loose' } }
  if (!sourcePart || sourcePart.id !== updated.attachedPartId) return { ...updated, binding: undefined, glue: { version: 1, mode: 'loose' } }
  // Legacy fitted clothes preserve their long-standing edit-to-rebind behavior.
  return fixWardrobeGlue(updated, sourcePart)
}

/** Suggest a limb from overlap, without moving the garment or changing the saved target. */
export function suggestWardrobeGlueTarget(component: WardrobeComponent, parts: readonly ModelPart[]): ModelPart | null {
  const sideHint = (component.name + ' ' + component.attachedPartId).toLocaleLowerCase()
  const side = /esquerd|left/.test(sideHint) ? 'left' : /direit|right/.test(sideHint) ? 'right' : null
  const targetFamily = /manga|luvas/.test(component.category) ? /bra[cç]o|antebra[cç]o|arm|forearm|hand|m[aã]o/i
    : /calca|shorts|meia|sapato/.test(component.category) ? /coxa|canela|perna|leg|thigh|calf|p[eé]/i
    : /camisa|jaqueta|cinto|saia/.test(component.category) ? /tronco|corpo|torso|body|quadril|hip/i
    : /oculos|cabeca/.test(component.category) ? /cabe[cç]a|head|face|rosto/i : null
  let best: { part: ModelPart; score: number } | null = null
  for (const part of parts) {
    const frame = wardrobeSourceFrame(part)
    const overlapW = Math.max(0, Math.min(component.x+component.width,frame.x+frame.width)-Math.max(component.x,frame.x))
    const overlapH = Math.max(0, Math.min(component.y+component.height,frame.y+frame.height)-Math.max(component.y,frame.y))
    const overlap = overlapW * overlapH / Math.max(1,component.width*component.height)
    if (overlap <= 0) continue
    const name = part.name.toLocaleLowerCase()
    const partLeft = /esquerd|left/.test(name), partRight = /direit|right/.test(name)
    if ((side === 'left' && partRight) || (side === 'right' && partLeft)) continue
    const categoryBonus = targetFamily?.test(part.name) ? 0.2 : 0
    const score = overlap + categoryBonus + (side && ((side==='left' && partLeft)||(side==='right' && partRight)) ? 0.1 : 0)
    if (!best || score > best.score) best = { part, score }
  }
  return best?.part ?? null
}
