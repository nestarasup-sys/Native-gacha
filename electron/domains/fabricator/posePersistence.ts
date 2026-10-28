/** Persistência de poses DEV: snapshots e rascunhos, sem camada Electron.
 * O adaptador é injetado para manter o DomainFileSystem e compatibilidade legada.
 */
import { join } from 'node:path'
import type { FabricatorAssetSave, FabricatorPose, FabricatorPoseDraft, FabricatorPoseDraftSave, FabricatorPoseSave, ModelPart, PosePart } from '../../../src/shared/fabricator.ts'
import { resolvePoseCategory } from '../../../src/shared/fabricator.ts'
import { areModelPartSkinContoursValid, isValidModelSkinContours } from '../../../src/shared/modelSkinContours.ts'
import { applyModelHeadShape } from '../../../src/shared/headShape.ts'
import type * as nodeFs from 'node:fs/promises'

export type PosePersistenceDependencies = {
  poseSlotPath: (modelSlot: number, slot: number) => string
  poseDraftPath: (modelSlot: number) => string
  modelHeadParts: (slot: number) => Promise<Array<Pick<ModelPart, 'id' | 'name' | 'width' | 'height' | 'resizeBase'>>>
  isValidModelSlot: (slot: number) => boolean
  isValidPoseSlot: (slot: number) => boolean
  dataUrlBuffer: (url: string) => Buffer
  writeAssetImageSource: (path: string, bytes: Buffer) => Promise<void>
  readAssetImage: (path: string) => Promise<Buffer>
  files: Pick<typeof nodeFs, 'mkdir' | 'access' | 'copyFile' | 'readdir' | 'unlink' | 'readFile' | 'writeFile' | 'rename'>
}

export function createPosePersistence(deps: PosePersistenceDependencies) {
  const { poseSlotPath, poseDraftPath, modelHeadParts, isValidModelSlot, isValidPoseSlot, dataUrlBuffer, writeAssetImageSource, readAssetImage } = deps
  const { mkdir, access, copyFile, readdir, unlink, readFile, writeFile, rename } = deps.files

async function writePoseAssets(folder: string, parts: Array<Omit<PosePart, 'dataUrl'>>, assets: FabricatorAssetSave[], fallbackFolder?: string): Promise<void> {
  const partsFolder = join(folder, 'parts')
  await mkdir(partsFolder, { recursive: true })
  const partIds = new Set(parts.map((part) => part.id))
  for (const asset of assets) {
    if (!partIds.has(asset.id) || !/^[a-zA-Z0-9_-]{1,80}$/.test(asset.id)) continue
    await writeAssetImageSource(join(partsFolder, `${asset.id}.png`), dataUrlBuffer(asset.dataUrl))
  }
  for (const part of parts) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(part.id)) throw new Error('Peça de pose inválida.')
    const target = join(partsFolder, `${part.id}.png`)
    try { await access(target) } catch (reason) {
      if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason
      if (!fallbackFolder) throw new Error(`Imagem ausente na pose: ${part.name} (${part.id}).`)
      try { await copyFile(join(fallbackFolder, 'parts', `${part.id}.png`), target) } catch (fallbackReason) {
        if ((fallbackReason as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`Imagem ausente na pose e no rascunho: ${part.name} (${part.id}).`)
        throw fallbackReason
      }
    }
  }
  const keepFiles = new Set(parts.map((part) => `${part.id}.png`))
  for (const filename of await readdir(partsFolder)) if (filename.endsWith('.png') && !filename.endsWith('.paint.png') && !keepFiles.has(filename)) await unlink(join(partsFolder, filename))
}

async function readPoseAssets(folder: string, parts: Array<Omit<PosePart, 'dataUrl'>>): Promise<PosePart[]> {
  const partsFolder = join(folder, 'parts')
  const contoursValid = areModelPartSkinContoursValid(parts)
  return Promise.all(parts.map(async (part) => ({
    ...part,
    fakeSkinContours: contoursValid && isValidModelSkinContours(part.fakeSkinContours) ? part.fakeSkinContours : undefined,
    dataUrl: `data:image/png;base64,${(await readAssetImage(join(partsFolder, `${part.id}.png`))).toString('base64')}`
  })))
}

async function preserveAndWritePoseManifest(path: string, document: FabricatorPoseSave | FabricatorPoseDraftSave): Promise<void> {
  const backup = `${path}.before-head-shape`
  try { await access(backup) } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason
    await copyFile(path, backup)
  }
  const temporary = `${path}.tmp`
  await writeFile(temporary, JSON.stringify(document), 'utf8')
  await rename(temporary, path)
}

async function writePoseProject(modelSlot: number, slot: number, project: FabricatorPoseSave, assets: FabricatorAssetSave[]): Promise<void> {
  if (!isValidModelSlot(modelSlot) || project.sourceModelSlot !== modelSlot || !isValidPoseSlot(slot) || project.slot !== slot || project.schemaVersion !== 1 || project.parts.length === 0 || project.parts.length > 500) throw new Error('Pose inválida.')
  if (!areModelPartSkinContoursValid(project.parts)) throw new Error('Contornos artificiais inválidos na pose.')
  if (project.category !== undefined && (typeof project.category !== 'string' || !project.category.trim() || project.category.trim().length > 32 || /[\r\n\t]/.test(project.category))) throw new Error('Categoria de pose inválida.')
  const folder = poseSlotPath(modelSlot, slot)
  // A edição automática salva primeiro no diretório de rascunho e consome as
  // imagens pendentes no renderer. Ao salvar no slot, copie as partes já
  // persistidas no rascunho para que o slot independente tenha sua biblioteca.
  await writePoseAssets(folder, project.parts, assets, poseDraftPath(modelSlot))
  const temporary = join(folder, 'pose.json.tmp')
  await writeFile(temporary, JSON.stringify({ ...project, category: resolvePoseCategory(project) }), 'utf8')
  await rename(temporary, join(folder, 'pose.json'))
}

async function readPoseProject(modelSlot: number, slot: number): Promise<FabricatorPose | null> {
  if (!isValidModelSlot(modelSlot)) throw new Error('Modelo da pose inválido.')
  if (!isValidPoseSlot(slot)) throw new Error('Slot de pose inválido.')
  try {
    const folder = poseSlotPath(modelSlot, slot)
    const manifest = JSON.parse(await readFile(join(folder, 'pose.json'), 'utf8')) as FabricatorPoseSave
    if (manifest.slot !== slot || manifest.sourceModelSlot !== modelSlot || manifest.schemaVersion !== 1 || manifest.parts.length === 0 || manifest.parts.length > 500) return null
    const pose = { ...manifest, parts: await readPoseAssets(folder, manifest.parts) }
    const shaped = applyModelHeadShape(pose, await modelHeadParts(modelSlot))
    if (shaped !== pose) {
      const { parts, ...metadata } = shaped
      await preserveAndWritePoseManifest(join(folder, 'pose.json'), { ...metadata, parts: parts.map(({ dataUrl: _dataUrl, ...part }) => part) })
    }
    return shaped
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw reason
  }
}

async function writePoseDraft(modelSlot: number, draft: FabricatorPoseDraftSave, assets: FabricatorAssetSave[]): Promise<void> {
  if (!isValidModelSlot(modelSlot) || draft.project.sourceModelSlot !== modelSlot) throw new Error('Modelo do rascunho inválido.')
  if (draft.editingSlot !== null && !isValidPoseSlot(draft.editingSlot)) throw new Error('Rascunho de pose inválido.')
  if (draft.project.schemaVersion !== 1 || draft.project.parts.length === 0 || draft.project.parts.length > 500) throw new Error('Rascunho de pose inválido.')
  if (!areModelPartSkinContoursValid(draft.project.parts)) throw new Error('Contornos artificiais inválidos no rascunho de pose.')
  if (draft.project.category !== undefined && (typeof draft.project.category !== 'string' || !draft.project.category.trim() || draft.project.category.trim().length > 32 || /[\r\n\t]/.test(draft.project.category))) throw new Error('Categoria de pose inválida.')
  const folder = poseDraftPath(modelSlot)
  await writePoseAssets(folder, draft.project.parts, assets)
  const temporary = join(folder, 'draft.json.tmp')
  await writeFile(temporary, JSON.stringify({ ...draft, project: { ...draft.project, category: resolvePoseCategory({ ...draft.project, slot: draft.editingSlot ?? undefined }) } }), 'utf8')
  await rename(temporary, join(folder, 'draft.json'))
}

async function readPoseDraft(modelSlot: number): Promise<FabricatorPoseDraft | null> {
  if (!isValidModelSlot(modelSlot)) throw new Error('Modelo do rascunho inválido.')
  try {
    const folder = poseDraftPath(modelSlot)
    const draft = JSON.parse(await readFile(join(folder, 'draft.json'), 'utf8')) as FabricatorPoseDraftSave
    if (draft.editingSlot !== null && !isValidPoseSlot(draft.editingSlot)) return null
    if (draft.project.sourceModelSlot !== modelSlot || draft.project.schemaVersion !== 1 || draft.project.parts.length === 0 || draft.project.parts.length > 500) return null
    const project = { ...draft.project, parts: await readPoseAssets(folder, draft.project.parts) }
    const shaped = applyModelHeadShape(project, await modelHeadParts(modelSlot))
    if (shaped !== project) {
      const { parts, ...metadata } = shaped
      await preserveAndWritePoseManifest(join(folder, 'draft.json'), { ...draft, project: { ...metadata, parts: parts.map(({ dataUrl: _dataUrl, ...part }) => part) } })
    }
    return { ...draft, project: shaped }
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw reason
  }
}


  return { writePoseProject, readPoseProject, writePoseDraft, readPoseDraft }
}
