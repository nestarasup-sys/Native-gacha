/** Persistência de animações DEV e rascunhos. DomainFileSystem injetado,
 * mesmos contratos JSON/PNG e mesmas filas no processo principal.
 */
import { join } from 'node:path'
import type { AnimatorAnimation, AnimatorAnimationAsset, AnimatorAnimationDraft, AnimatorAnimationSave, PosePart } from '../../../src/shared/fabricator'
import type * as nodeFs from 'node:fs/promises'

export type AnimatorPersistenceDependencies = {
  animatorSlotPath: (modelSlot: number, slot: number) => string
  animatorDraftPath: (modelSlot: number) => string
  isValidModelSlot: (slot: number) => boolean
  isValidPoseSlot: (slot: number) => boolean
  dataUrlBuffer: (url: string) => Buffer
  writeAssetImageSource: (path: string, bytes: Buffer) => Promise<void>
  readAssetImage: (path: string) => Promise<Buffer>
  files: Pick<typeof nodeFs, 'mkdir' | 'access' | 'readdir' | 'unlink' | 'readFile' | 'writeFile' | 'rename'>
}

export function createAnimatorPersistence(deps: AnimatorPersistenceDependencies) {
  const { animatorSlotPath, animatorDraftPath, isValidModelSlot, isValidPoseSlot, dataUrlBuffer, writeAssetImageSource, readAssetImage } = deps
  const { mkdir, access, readdir, unlink, readFile, writeFile, rename } = deps.files

function isValidAnimatorSlot(slot: number): boolean { return isValidPoseSlot(slot) }

function validateAnimatorDocument(modelSlot: number, document: Pick<AnimatorAnimation, 'schemaVersion' | 'sourceModelSlot' | 'parts' | 'frames' | 'interpolation' | 'loopMode' | 'speed' | 'thumbnailDataUrl'>): void {
  if (!isValidModelSlot(modelSlot) || document.schemaVersion !== 1 || document.sourceModelSlot !== modelSlot || !Array.isArray(document.parts) || document.parts.length === 0 || document.parts.length > 500 || !Array.isArray(document.frames) || document.frames.length === 0 || document.frames.length > 300) throw new Error('Animação inválida.')
  if (!['smooth', 'stepped'].includes(document.interpolation) || !['once', 'loop', 'pingpong'].includes(document.loopMode) || !Number.isFinite(document.speed) || document.speed < 0.1 || document.speed > 4) throw new Error('Configurações da animação inválidas.')
  const partIds = new Set(document.parts.map((part) => part.id))
  if (partIds.size !== document.parts.length || [...partIds].some((id) => !/^[a-zA-Z0-9_-]{1,80}$/.test(id))) throw new Error('Identificadores de peças da animação inválidos.')
  for (const frame of document.frames) {
    if (!frame.id || !Number.isFinite(frame.durationMs) || frame.durationMs < 40 || frame.durationMs > 10000 || !frame.thumbnailDataUrl.startsWith('data:image/png;base64,') || frame.thumbnailDataUrl.length > 3_000_000) throw new Error('Frame de animação inválido.')
    for (const id of partIds) {
      const transform = frame.transforms[id]
      if (!transform || !Number.isFinite(transform.x) || !Number.isFinite(transform.y) || !Number.isFinite(transform.rotation)) throw new Error('Transformação de frame inválida.')
      if (transform.width !== undefined && (!Number.isFinite(transform.width) || transform.width <= 0 || transform.width > 10000)) throw new Error('Largura de frame inválida.')
      if (transform.height !== undefined && (!Number.isFinite(transform.height) || transform.height <= 0 || transform.height > 10000)) throw new Error('Altura de frame inválida.')
    }
  }
  if (!document.thumbnailDataUrl.startsWith('data:image/png;base64,') || document.thumbnailDataUrl.length > 3_000_000) throw new Error('Miniatura da animação inválida.')
}

async function writeAnimatorParts(folder: string, parts: Array<Omit<PosePart, 'dataUrl'>>, assets: AnimatorAnimationAsset[]): Promise<void> {
  const partsFolder = join(folder, 'parts')
  await mkdir(partsFolder, { recursive: true })
  const validIds = new Set(parts.map((part) => part.id))
  for (const asset of assets) if (validIds.has(asset.id)) await writeAssetImageSource(join(partsFolder, `${asset.id}.png`), dataUrlBuffer(asset.dataUrl))
  for (const part of parts) {
    const target = join(partsFolder, `${part.id}.png`)
    try { await access(target) } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason
      throw new Error(`Imagem-base ausente na animação: ${part.name} (${part.id}).`)
    }
  }
  const keep = new Set(parts.map((part) => `${part.id}.png`))
  for (const filename of await readdir(partsFolder)) if (filename.endsWith('.png') && !filename.endsWith('.paint.png') && !keep.has(filename)) await unlink(join(partsFolder, filename))
}

async function readAnimatorParts(folder: string, parts: Array<Omit<PosePart, 'dataUrl'>>): Promise<PosePart[]> {
  return Promise.all(parts.map(async (part) => ({ ...part, dataUrl: `data:image/png;base64,${(await readAssetImage(join(folder, 'parts', `${part.id}.png`))).toString('base64')}` })))
}

async function writeAnimatorAnimation(modelSlot: number, slot: number, animation: AnimatorAnimationSave, assets: AnimatorAnimationAsset[]): Promise<void> {
  if (!isValidAnimatorSlot(slot) || animation.slot !== slot) throw new Error('Slot de animação inválido.')
  validateAnimatorDocument(modelSlot, animation as AnimatorAnimation)
  const folder = animatorSlotPath(modelSlot, slot)
  await writeAnimatorParts(folder, animation.parts, assets)
  await mkdir(folder, { recursive: true })
  const temporary = join(folder, 'animation.json.tmp')
  await writeFile(temporary, JSON.stringify(animation), 'utf8')
  await rename(temporary, join(folder, 'animation.json'))
}

async function readAnimatorAnimation(modelSlot: number, slot: number): Promise<AnimatorAnimation | null> {
  if (!isValidModelSlot(modelSlot) || !isValidAnimatorSlot(slot)) throw new Error('Slot de animação inválido.')
  try {
    const folder = animatorSlotPath(modelSlot, slot)
    const saved = JSON.parse(await readFile(join(folder, 'animation.json'), 'utf8')) as AnimatorAnimationSave
    if (saved.slot !== slot) return null
    validateAnimatorDocument(modelSlot, saved as AnimatorAnimation)
    return { ...saved, parts: await readAnimatorParts(folder, saved.parts) }
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw reason
  }
}

async function writeAnimatorDraft(modelSlot: number, draft: AnimatorAnimationDraft, assets: AnimatorAnimationAsset[]): Promise<void> {
  if (!isValidModelSlot(modelSlot) || draft.animation.sourceModelSlot !== modelSlot || (draft.editingSlot !== null && !isValidAnimatorSlot(draft.editingSlot))) throw new Error('Rascunho de animação inválido.')
  validateAnimatorDocument(modelSlot, { ...draft.animation, slot: draft.editingSlot ?? 1 } as AnimatorAnimation)
  const folder = animatorDraftPath(modelSlot)
  await writeAnimatorParts(folder, draft.animation.parts, assets)
  await mkdir(folder, { recursive: true })
  const temporary = join(folder, 'draft.json.tmp')
  await writeFile(temporary, JSON.stringify(draft), 'utf8')
  await rename(temporary, join(folder, 'draft.json'))
}

async function readAnimatorDraft(modelSlot: number): Promise<AnimatorAnimationDraft | null> {
  if (!isValidModelSlot(modelSlot)) throw new Error('Modelo de rascunho inválido.')
  try {
    const folder = animatorDraftPath(modelSlot)
    const draft = JSON.parse(await readFile(join(folder, 'draft.json'), 'utf8')) as AnimatorAnimationDraft
    if (draft.editingSlot !== null && !isValidAnimatorSlot(draft.editingSlot)) return null
    validateAnimatorDocument(modelSlot, { ...draft.animation, slot: draft.editingSlot ?? 1 } as AnimatorAnimation)
    return { ...draft, animation: { ...draft.animation, parts: await readAnimatorParts(folder, draft.animation.parts) } }
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw reason
  }
}


  return { isValidAnimatorSlot, validateAnimatorDocument, writeAnimatorAnimation, readAnimatorAnimation, writeAnimatorDraft, readAnimatorDraft }
}
