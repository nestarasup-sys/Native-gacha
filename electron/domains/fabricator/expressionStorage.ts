/** Operações isoladas de arquivos de expressão, sem Electron ou dependências da UI. */
import { join, dirname } from 'node:path'
import type * as nodeFs from 'node:fs/promises'
import type { FaceExpressionCollection, FaceExpressionPreset, FaceExpressionPresetSummary, FaceExpressionWorkspaceDraft } from '../../../src/shared/fabricator'
import { legacyStandardExpressionEffects } from '../../../src/shared/legacyExpressionEffects'

type Files = Pick<typeof nodeFs, 'readFile' | 'writeFile' | 'rename' | 'readdir' | 'mkdir'>
export function createFabricatorExpressionStorage(deps: {
  files: Files
  userDataRoot: string
  isValidModelSlot: (slot: number) => boolean
  isValidWardrobeId: (id: string) => boolean
  validFaceExpressionPreset: (slot: number, preset: FaceExpressionPreset) => boolean
  validFaceExpressionWorkspaceDraft: (slot: number, draft: FaceExpressionWorkspaceDraft) => boolean
  faceExpressionWorkspaceDraftPath: (slot: number) => string
  faceExpressionCollectionsPath: (slot: number) => string
  faceExpressionPresetPath: (slot: number, id: string) => string
}) {
  const { readFile, writeFile, rename, readdir, mkdir } = deps.files
  const { isValidModelSlot, isValidWardrobeId, validFaceExpressionPreset, validFaceExpressionWorkspaceDraft,
    faceExpressionWorkspaceDraftPath, faceExpressionCollectionsPath, faceExpressionPresetPath } = deps
async function readFaceExpressionWorkspaceDraft(modelSlot: number): Promise<FaceExpressionWorkspaceDraft | null> {
  if (!isValidModelSlot(modelSlot)) throw new Error('Modelo inválido.')
  try {
    const draft = JSON.parse(await readFile(faceExpressionWorkspaceDraftPath(modelSlot), 'utf8')) as FaceExpressionWorkspaceDraft
    return validFaceExpressionWorkspaceDraft(modelSlot, draft) ? draft : null
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === 'ENOENT' || reason instanceof SyntaxError) return null
    throw reason
  }
}

async function writeFaceExpressionWorkspaceDraft(modelSlot: number, draft: FaceExpressionWorkspaceDraft): Promise<void> {
  if (!validFaceExpressionWorkspaceDraft(modelSlot, draft)) throw new Error('Rascunho de expressão inválido.')
  const target = faceExpressionWorkspaceDraftPath(modelSlot)
  await mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.tmp`
  await writeFile(temporary, JSON.stringify(draft), 'utf8')
  await rename(temporary, target)
}

async function listFaceExpressionPresets(modelSlot: number): Promise<FaceExpressionPresetSummary[]> {
  if (!isValidModelSlot(modelSlot)) throw new Error('Modelo inválido.')
  const folder = join(deps.userDataRoot, 'fabricator', 'expression-presets', `model-${modelSlot}`)
  try {
    const entries = await readdir(folder, { withFileTypes: true })
    const presets: FaceExpressionPresetSummary[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !/^preset-[a-zA-Z0-9_-]{1,80}\.json$/.test(entry.name)) continue
      try {
        const preset = JSON.parse(await readFile(join(folder, entry.name), 'utf8')) as FaceExpressionPreset
        if (validFaceExpressionPreset(modelSlot, preset) && entry.name === `preset-${preset.id}.json`) {
          presets.push({ id: preset.id, modelSlot, name: preset.name, updatedAt: preset.updatedAt, collectionId: preset.collectionId, expressionIndex: preset.expressionIndex })
        }
      } catch { /* Arquivos incompletos não aparecem na biblioteca. */ }
    }
    return presets.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw reason
  }
}

function isValidFaceExpressionCollection(modelSlot: number, collection: FaceExpressionCollection): boolean {
  return isValidModelSlot(modelSlot) && !!collection && collection.schemaVersion === 1 && collection.modelSlot === modelSlot
    && isValidWardrobeId(collection.id) && typeof collection.name === 'string' && Boolean(collection.name.trim()) && collection.name.length <= 80
    && typeof collection.createdAt === 'string' && Number.isFinite(Date.parse(collection.createdAt))
    && typeof collection.updatedAt === 'string' && Number.isFinite(Date.parse(collection.updatedAt))
}

async function listFaceExpressionCollections(modelSlot: number): Promise<FaceExpressionCollection[]> {
  if (!isValidModelSlot(modelSlot)) throw new Error('Modelo inválido.')
  try {
    const collections = JSON.parse(await readFile(faceExpressionCollectionsPath(modelSlot), 'utf8')) as unknown
    if (!Array.isArray(collections)) return []
    return collections.filter((item): item is FaceExpressionCollection => isValidFaceExpressionCollection(modelSlot, item))
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw reason
  }
}

async function writeFaceExpressionCollection(modelSlot: number, collection: FaceExpressionCollection): Promise<void> {
  if (!isValidFaceExpressionCollection(modelSlot, collection)) throw new Error('Conjunto de expressões inválido.')
  const filePath = faceExpressionCollectionsPath(modelSlot)
  const existing = await listFaceExpressionCollections(modelSlot)
  const next = [...existing.filter((item) => item.id !== collection.id), collection]
  await mkdir(dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp`
  await writeFile(temporary, JSON.stringify(next), 'utf8')
  await rename(temporary, filePath)
}

async function readFaceExpressionPreset(modelSlot: number, id: string): Promise<FaceExpressionPreset | null> {
  if (!isValidModelSlot(modelSlot) || !isValidWardrobeId(id)) throw new Error('Preset de expressão inválido.')
  try {
    const preset = JSON.parse(await readFile(faceExpressionPresetPath(modelSlot, id), 'utf8')) as FaceExpressionPreset
    if (!validFaceExpressionPreset(modelSlot, preset) || preset.id !== id) return null
    return {
      ...preset,
      effects: preset.effects ?? legacyStandardExpressionEffects(preset),
      selections: { ...preset.selections, eyebrows: preset.selections.eyebrows ?? { left: null, right: null } },
      transforms: { ...preset.transforms, browLeft: preset.transforms.browLeft ?? { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }, browRight: preset.transforms.browRight ?? { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 } }
    }
  } catch (reason) {
    if ((reason as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw reason
  }
}

async function writeFaceExpressionPreset(modelSlot: number, preset: FaceExpressionPreset): Promise<void> {
  if (!validFaceExpressionPreset(modelSlot, preset)) throw new Error('Preset de expressão inválido.')
  const target = faceExpressionPresetPath(modelSlot, preset.id)
  await mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.tmp`
  await writeFile(temporary, JSON.stringify(preset), 'utf8')
  await rename(temporary, target)
}

  return { readFaceExpressionWorkspaceDraft, writeFaceExpressionWorkspaceDraft, listFaceExpressionPresets,
    listFaceExpressionCollections, writeFaceExpressionCollection, readFaceExpressionPreset, writeFaceExpressionPreset }
}
