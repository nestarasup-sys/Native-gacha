/** Persistência do manifesto e imagens dos modelos do Fabricador DEV.
 * Sem Electron; acessa o armazenamento somente por dependências injetadas.
 */
import { join } from 'node:path'
import type { FabricatorAssetSave, FabricatorProjectSave } from '../../../src/shared/fabricator'
import { areModelPartSkinContoursValid } from '../../../src/shared/modelSkinContours.ts'
import type { mkdir as nativeMkdir, readFile as nativeReadFile, writeFile as nativeWriteFile, rename as nativeRename, readdir as nativeReaddir, access as nativeAccess, unlink as nativeUnlink } from 'node:fs/promises'

export type FabricatorModelWriterDependencies = {
  slotPath: (slot: number) => string
  isValidSlot: (slot: number) => boolean
  dataUrlBuffer: (value: string) => Buffer
  writeAssetImageSource: (path: string, bytes: Buffer) => Promise<void>
  files: {
    mkdir: typeof nativeMkdir
    readFile: typeof nativeReadFile
    writeFile: typeof nativeWriteFile
    rename: typeof nativeRename
    readdir: typeof nativeReaddir
    access: typeof nativeAccess
    unlink: typeof nativeUnlink
  }
}

export function createFabricatorModelWriter(deps: FabricatorModelWriterDependencies) {
  const { slotPath, isValidSlot, dataUrlBuffer, writeAssetImageSource } = deps
  const { mkdir, readFile, writeFile, rename, readdir, access, unlink } = deps.files
  return async function writeFabricatorProject(project: FabricatorProjectSave, changedAssets: FabricatorAssetSave[], folderOverride?: string): Promise<void> {
  if (!isValidSlot(project.slot) || project.schemaVersion !== 1 || project.parts.length > 500) throw new Error('Projeto inválido.')
  if (!areModelPartSkinContoursValid(project.parts)) throw new Error('Contornos artificiais do modelo inválidos.')
  if (project.modelSkinTone !== undefined && !/^#[0-9a-f]{6}$/i.test(project.modelSkinTone)) throw new Error('Cor de pele do modelo inválida.')
  if (project.modelOutlineColor !== undefined && !/^#[0-9a-f]{6}$/i.test(project.modelOutlineColor)) throw new Error('Cor do contorno do modelo inválida.')
  const folder = folderOverride ?? slotPath(project.slot)
  const partsFolder = join(folder, 'parts')
  await mkdir(partsFolder, { recursive: true })
  const sourceFile = project.sourceAssetName
  if (!/^source-[a-f0-9-]+\.(png|jpe?g|webp)$/i.test(sourceFile)) throw new Error('Imagem original inválida.')
  await readFile(join(folder, sourceFile))
  const parts = project.parts.map((part) => {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(part.id)) throw new Error('Identificador de peça inválido.')
    return part
  })
  const validPartIds = new Set(parts.map((part) => part.id))
  for (const asset of changedAssets) {
    if (!validPartIds.has(asset.id)) continue
    await writeAssetImageSource(join(partsFolder, `${asset.id}.png`), dataUrlBuffer(asset.dataUrl))
    if (asset.chromaBaseDataUrl) await writeFile(join(partsFolder, `${asset.id}.base.png`), dataUrlBuffer(asset.chromaBaseDataUrl))
  }
  // Never publish a manifest until every referenced image exists. Serializing
  // saves per slot also prevents an older save from deleting a newer asset.
  const missingAssets: string[] = []
  for (const part of parts) {
    const requiredFiles = [`${part.id}.png`, ...(part.chromaBaseSaved ? [`${part.id}.base.png`] : [])]
    let missing = false
    for (const file of requiredFiles) {
      try { await access(join(partsFolder, file)) } catch (reason) {
        if ((reason as NodeJS.ErrnoException).code !== 'ENOENT') throw reason
        missing = true
      }
    }
    if (missing) missingAssets.push(part.id)
  }
  if (missingAssets.length) throw new Error(`FABRICATOR_MISSING_ASSETS:${missingAssets.join(',')}`)
  const projectDocument = {
    schemaVersion: project.schemaVersion,
    slot: project.slot,
    name: project.name,
    sourceName: project.sourceName,
    sourceAssetName: project.sourceAssetName,
    width: project.width,
    height: project.height,
    tolerance: project.tolerance,
    chromaBaseTolerance: project.chromaBaseTolerance,
    modelSkinTone: project.modelSkinTone,
    modelOutlineColor: project.modelOutlineColor,
    joints: project.joints,
    layerOrder: project.layerOrder,
    hiddenPartIds: project.hiddenPartIds,
    updatedAt: project.updatedAt
  }
  const manifest = { ...projectDocument, parts, sourceFile }
  const manifestTemp = join(folder, 'project.json.tmp')
  await writeFile(manifestTemp, JSON.stringify(manifest), 'utf8')
  await rename(manifestTemp, join(folder, 'project.json'))
  const keepFiles = new Set(parts.flatMap((part) => [
    `${part.id}.png`,
    ...(part.chromaBaseSaved ? [`${part.id}.base.png`] : [])
  ]))
  for (const file of await readdir(partsFolder)) {
    if (file.endsWith('.png') && !file.endsWith('.paint.png') && !keepFiles.has(file)) await unlink(join(partsFolder, file))
  }
  const keptSources = new Set([sourceFile])
  try {
    const history = JSON.parse(await readFile(join(folder, 'history', 'history.json'), 'utf8')) as { undo?: Array<{ project?: { sourceAssetName?: string } }>; redo?: Array<{ project?: { sourceAssetName?: string } }> }
    for (const entry of [...(history.undo ?? []), ...(history.redo ?? [])]) if (entry.project?.sourceAssetName) keptSources.add(entry.project.sourceAssetName)
  } catch { /* No persisted history yet. */ }
  for (const file of await readdir(folder)) {
    if (/^source-[a-f0-9-]+\.(png|jpe?g|webp)$/i.test(file) && !keptSources.has(file)) await unlink(join(folder, file))
  }
}

}
