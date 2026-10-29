import { join } from 'node:path'

/** Caminhos persistidos que pertencem aos catálogos e rascunhos do Fabricador. */
export function createFabricatorPaths(userDataPath: () => string) {
  const libraryPath = () => join(userDataPath(), 'fabricator', 'models')
  const slotPath = (slot: number) => join(libraryPath(), `slot-${slot}`)
  const poseLibraryPath = () => join(userDataPath(), 'fabricator', 'poses')
  const poseModelPath = (modelSlot: number) => join(poseLibraryPath(), `model-${modelSlot}`)
  const poseSlotPath = (modelSlot: number, slot: number) => join(poseModelPath(modelSlot), `slot-${slot}`)
  const poseDraftPath = (modelSlot: number) => join(poseModelPath(modelSlot), 'draft')
  const animatorLibraryPath = () => join(userDataPath(), 'fabricator', 'animations')
  const animatorModelPath = (modelSlot: number) => join(animatorLibraryPath(), `model-${modelSlot}`)
  const animatorSlotPath = (modelSlot: number, slot: number) => join(animatorModelPath(modelSlot), `slot-${slot}`)
  const animatorDraftPath = (modelSlot: number) => join(animatorModelPath(modelSlot), 'draft')
  const wardrobeLibraryPath = () => join(userDataPath(), 'fabricator', 'wardrobe')
  const wardrobeModelPath = (modelSlot: number) => join(wardrobeLibraryPath(), `model-${modelSlot}`)
  const wardrobeSetPath = (modelSlot: number, id: string) => join(wardrobeModelPath(modelSlot), `set-${id}`)
  const faceModelPath = (modelSlot: number) => join(userDataPath(), 'fabricator', 'faces', `model-${modelSlot}`)
  const faceSetPath = (modelSlot: number, id: string) => join(faceModelPath(modelSlot), `set-${id}`)
  const faceCatalogPath = (modelSlot: number) => join(faceModelPath(modelSlot), 'catalog')
  const faceCatalogItemPath = (modelSlot: number, id: string) => join(faceCatalogPath(modelSlot), `item-${id}`)
  const faceExpressionPresetPath = (modelSlot: number, id: string) => join(userDataPath(), 'fabricator', 'expression-presets', `model-${modelSlot}`, `preset-${id}.json`)
  const faceExpressionCollectionsPath = (modelSlot: number) => join(userDataPath(), 'fabricator', 'expression-presets', `model-${modelSlot}`, 'collections.json')
  const faceExpressionWorkspaceDraftPath = (modelSlot: number) => join(userDataPath(), 'fabricator', 'expression-presets', `model-${modelSlot}`, 'workspace-draft.json')
  const faceComponentPath = (modelSlot: number) => join(userDataPath(), 'fabricator', 'face-components', `model-${modelSlot}`)
  const faceComponentItemPath = (modelSlot: number, id: string) => join(faceComponentPath(modelSlot), `item-${id}`)
  const hairModelPath = (modelSlot: number) => join(userDataPath(), 'fabricator', 'hair', `model-${modelSlot}`)
  const hairStylePath = (modelSlot: number, id: string) => join(hairModelPath(modelSlot), 'styles', `style-${id}`)

  return {
    libraryPath, slotPath, poseLibraryPath, poseModelPath, poseSlotPath, poseDraftPath,
    animatorLibraryPath, animatorModelPath, animatorSlotPath, animatorDraftPath,
    wardrobeLibraryPath, wardrobeModelPath, wardrobeSetPath,
    faceModelPath, faceSetPath, faceCatalogPath, faceCatalogItemPath,
    faceExpressionPresetPath, faceExpressionCollectionsPath, faceExpressionWorkspaceDraftPath,
    faceComponentPath, faceComponentItemPath, hairModelPath, hairStylePath
  }
}
