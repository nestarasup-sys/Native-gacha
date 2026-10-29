/** Persistência de animações DEV e rascunhos. DomainFileSystem injetado,
 * mesmos contratos JSON/PNG e mesmas filas no processo principal.
 */
import { join } from 'node:path'
import type { AnimatorAnimation, AnimatorAnimationAsset, AnimatorAnimationDraft, AnimatorAnimationSave, PosePart } from '../../../src/shared/fabricator'
import { areModelPartSkinContoursValid, isValidModelSkinContours } from '../../../src/shared/modelSkinContours.ts'
import { recoverAnimatorImageTransaction, runAnimatorImageTransaction, type AnimatorManifestName, type PendingImage } from './imageManifestTransaction.ts'
import type * as nodeFs from 'node:fs/promises'

export type AnimatorPersistenceDependencies = {
  animatorSlotPath: (modelSlot: number, slot: number) => string
  animatorDraftPath: (modelSlot: number) => string
  isValidModelSlot: (slot: number) => boolean
  isValidPoseSlot: (slot: number) => boolean
  dataUrlBuffer: (url: string) => Buffer
  writeAssetImageSource: (path: string, bytes: Buffer) => Promise<void>
  readAssetImage: (path: string) => Promise<Buffer>
  files: Pick<typeof nodeFs, 'mkdir' | 'access' | 'readdir' | 'unlink' | 'readFile' | 'writeFile' | 'rename' | 'rm'>
}

export function createAnimatorPersistence(deps: AnimatorPersistenceDependencies) {
  const { animatorSlotPath, animatorDraftPath, isValidModelSlot, isValidPoseSlot, dataUrlBuffer, writeAssetImageSource, readAssetImage } = deps
  const { mkdir, access, readdir, unlink, readFile, writeFile, rename } = deps.files

function isValidAnimatorSlot(slot: number): boolean { return isValidPoseSlot(slot) }

function validateAnimatorDocument(modelSlot: number, document: Pick<AnimatorAnimation, 'schemaVersion' | 'sourceModelSlot' | 'parts' | 'frames' | 'interpolation' | 'loopMode' | 'speed' | 'thumbnailDataUrl'>): void {
  if (!isValidModelSlot(modelSlot) || document.schemaVersion !== 1 || document.sourceModelSlot !== modelSlot || !Array.isArray(document.parts) || document.parts.length === 0 || document.parts.length > 500 || !Array.isArray(document.frames) || document.frames.length === 0 || document.frames.length > 300) throw new Error('Animação inválida.')
  if (!areModelPartSkinContoursValid(document.parts)) throw new Error('Contornos artificiais inválidos na animação.')
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

async function prepareAnimatorParts(folder: string, parts: Array<Omit<PosePart, 'dataUrl'>>, assets: AnimatorAnimationAsset[]): Promise<{ partsFolder: string; images: PendingImage[] }> {
  const partsFolder = join(folder, 'parts')
  await mkdir(partsFolder, { recursive: true })
  const validIds = new Set(parts.map((part) => part.id))
  const imagesById = new Map<string, Buffer>()
  for (const asset of assets) {
    if (!validIds.has(asset.id)) continue
    const bytes = dataUrlBuffer(asset.dataUrl)
    // Preserva o comportamento anterior: se o IPC repetir um ID, prevalece o último asset.
    imagesById.set(asset.id, bytes)
  }
  for (const part of parts) {
    if (imagesById.has(part.id)) continue
    const target = join(partsFolder, `${part.id}.png`)
    try { await access(target) } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason
      throw new Error(`Imagem-base ausente na animação: ${part.name} (${part.id}).`)
    }
  }
  return { partsFolder, images: [...imagesById].map(([id, bytes]) => ({ id, bytes })) }
}

async function pruneAnimatorParts(partsFolder: string, parts: Array<Omit<PosePart, 'dataUrl'>>): Promise<void> {
  const keep = new Set(parts.map((part) => `${part.id}.png`))
  let entries: string[]
  try { entries = await readdir(partsFolder) }
  catch (reason) { if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return; throw reason }
  for (const filename of entries) {
    if (!filename.endsWith('.png') || filename.endsWith('.paint.png') || keep.has(filename)) continue
    try { await unlink(join(partsFolder, filename)) }
    catch (reason) { if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason }
  }
}

async function publishAnimatorDocument(folder: string, manifestName: AnimatorManifestName, parts: Array<Omit<PosePart, 'dataUrl'>>, assets: AnimatorAnimationAsset[], manifest: unknown): Promise<void> {
  const { partsFolder, images } = await prepareAnimatorParts(folder, parts, assets)
  await mkdir(folder, { recursive: true })
  await runAnimatorImageTransaction({
    files: deps.files, folder, imageFolder: partsFolder, manifestName, manifest, images,
    writeImage: writeAssetImageSource,
    promoteManifest: async () => {
      const temporary = join(folder, `${manifestName}.tmp`)
      await writeFile(temporary, JSON.stringify(manifest), 'utf8')
      await rename(temporary, join(folder, manifestName))
    }
  })
  await pruneAnimatorParts(partsFolder, parts)
}

async function recoverAnimatorAnimation(modelSlot: number, slot: number): Promise<void> {
  if (!isValidModelSlot(modelSlot) || !isValidAnimatorSlot(slot)) throw new Error('Slot de animação inválido.')
  const folder = animatorSlotPath(modelSlot, slot)
  await recoverAnimatorImageTransaction(deps.files, folder, join(folder, 'parts'), 'animation.json')
}

async function recoverAnimatorDraft(modelSlot: number): Promise<void> {
  if (!isValidModelSlot(modelSlot)) throw new Error('Modelo de rascunho inválido.')
  const folder = animatorDraftPath(modelSlot)
  await recoverAnimatorImageTransaction(deps.files, folder, join(folder, 'parts'), 'draft.json')
}

async function readAnimatorParts(folder: string, parts: Array<Omit<PosePart, 'dataUrl'>>): Promise<PosePart[]> {
  const contoursValid = areModelPartSkinContoursValid(parts)
  return Promise.all(parts.map(async (part) => ({ ...part, fakeSkinContours: contoursValid && isValidModelSkinContours(part.fakeSkinContours) ? part.fakeSkinContours : undefined, dataUrl: `data:image/png;base64,${(await readAssetImage(join(folder, 'parts', `${part.id}.png`))).toString('base64')}` })))
}

async function writeAnimatorAnimation(modelSlot: number, slot: number, animation: AnimatorAnimationSave, assets: AnimatorAnimationAsset[]): Promise<void> {
  if (!isValidAnimatorSlot(slot) || animation.slot !== slot) throw new Error('Slot de animação inválido.')
  validateAnimatorDocument(modelSlot, animation as AnimatorAnimation)
  const folder = animatorSlotPath(modelSlot, slot)
  await recoverAnimatorAnimation(modelSlot, slot)
  await publishAnimatorDocument(folder, 'animation.json', animation.parts, assets, animation)
}

async function readAnimatorAnimation(modelSlot: number, slot: number): Promise<AnimatorAnimation | null> {
  if (!isValidModelSlot(modelSlot) || !isValidAnimatorSlot(slot)) throw new Error('Slot de animação inválido.')
  try {
    await recoverAnimatorAnimation(modelSlot, slot)
    const folder = animatorSlotPath(modelSlot, slot)
    const saved = JSON.parse(await readFile(join(folder, 'animation.json'), 'utf8')) as AnimatorAnimationSave
    if (saved.slot !== slot) return null
    validateAnimatorDocument(modelSlot, saved as AnimatorAnimation)
    const loadedParts = await readAnimatorParts(folder, saved.parts)
    return { ...saved, parts: loadedParts }
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw reason
  }
}

async function writeAnimatorDraft(modelSlot: number, draft: AnimatorAnimationDraft, assets: AnimatorAnimationAsset[]): Promise<void> {
  if (!isValidModelSlot(modelSlot) || draft.animation.sourceModelSlot !== modelSlot || (draft.editingSlot !== null && !isValidAnimatorSlot(draft.editingSlot))) throw new Error('Rascunho de animação inválido.')
  validateAnimatorDocument(modelSlot, { ...draft.animation, slot: draft.editingSlot ?? 1 } as AnimatorAnimation)
  const folder = animatorDraftPath(modelSlot)
  await recoverAnimatorDraft(modelSlot)
  await publishAnimatorDocument(folder, 'draft.json', draft.animation.parts, assets, draft)
}

async function readAnimatorDraft(modelSlot: number): Promise<AnimatorAnimationDraft | null> {
  if (!isValidModelSlot(modelSlot)) throw new Error('Modelo de rascunho inválido.')
  try {
    await recoverAnimatorDraft(modelSlot)
    const folder = animatorDraftPath(modelSlot)
    const draft = JSON.parse(await readFile(join(folder, 'draft.json'), 'utf8')) as AnimatorAnimationDraft
    if (draft.editingSlot !== null && !isValidAnimatorSlot(draft.editingSlot)) return null
    validateAnimatorDocument(modelSlot, { ...draft.animation, slot: draft.editingSlot ?? 1 } as AnimatorAnimation)
    const loadedParts = await readAnimatorParts(folder, draft.animation.parts)
    return { ...draft, animation: { ...draft.animation, parts: loadedParts } }
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw reason
  }
}


  return { isValidAnimatorSlot, validateAnimatorDocument, writeAnimatorAnimation, readAnimatorAnimation, recoverAnimatorAnimation, writeAnimatorDraft, readAnimatorDraft, recoverAnimatorDraft }
}
