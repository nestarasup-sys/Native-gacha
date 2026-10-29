import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { createFabricatorPaths } from '../electron/domains/fabricator/paths.ts'
import { createCustomizerPaths } from '../electron/domains/customizer/paths.ts'
import { createStudioPaths } from '../electron/domains/studio/paths.ts'
import { createEditorV6Paths } from '../electron/domains/editorV6/paths.ts'

const root = join('synthetic-root', 'profile')
const userDataPath = () => root

test('Fabricador mantém caminhos legados de modelo, pose, animação, rosto e cabelo', () => {
  const paths = createFabricatorPaths(userDataPath)
  const model = join(root, 'fabricator', 'models')
  const poses = join(root, 'fabricator', 'poses')
  const animations = join(root, 'fabricator', 'animations')
  const wardrobe = join(root, 'fabricator', 'wardrobe')
  const face = join(root, 'fabricator', 'faces', 'model-3')
  const expressions = join(root, 'fabricator', 'expression-presets', 'model-3')
  const components = join(root, 'fabricator', 'face-components', 'model-3')
  const hair = join(root, 'fabricator', 'hair', 'model-3')
  assert.deepEqual({
    library: paths.libraryPath(), slot: paths.slotPath(3),
    poseLibrary: paths.poseLibraryPath(), poseModel: paths.poseModelPath(3),
    poseSlot: paths.poseSlotPath(3, 2), poseDraft: paths.poseDraftPath(3),
    animatorLibrary: paths.animatorLibraryPath(), animatorModel: paths.animatorModelPath(3),
    animatorSlot: paths.animatorSlotPath(3, 4), animatorDraft: paths.animatorDraftPath(3),
    wardrobeLibrary: paths.wardrobeLibraryPath(), wardrobeModel: paths.wardrobeModelPath(3),
    wardrobeSet: paths.wardrobeSetPath(3, 'a'),
    faceModel: paths.faceModelPath(3), faceSet: paths.faceSetPath(3, 'a'),
    faceCatalog: paths.faceCatalogPath(3), faceCatalogItem: paths.faceCatalogItemPath(3, 'a'),
    expressionPreset: paths.faceExpressionPresetPath(3, 'a'),
    expressionCollections: paths.faceExpressionCollectionsPath(3),
    expressionDraft: paths.faceExpressionWorkspaceDraftPath(3),
    faceComponents: paths.faceComponentPath(3), faceComponentItem: paths.faceComponentItemPath(3, 'a'),
    hairModel: paths.hairModelPath(3), hairStyle: paths.hairStylePath(3, 'a')
  }, {
    library: model, slot: join(model, 'slot-3'),
    poseLibrary: poses, poseModel: join(poses, 'model-3'),
    poseSlot: join(poses, 'model-3', 'slot-2'), poseDraft: join(poses, 'model-3', 'draft'),
    animatorLibrary: animations, animatorModel: join(animations, 'model-3'),
    animatorSlot: join(animations, 'model-3', 'slot-4'), animatorDraft: join(animations, 'model-3', 'draft'),
    wardrobeLibrary: wardrobe, wardrobeModel: join(wardrobe, 'model-3'),
    wardrobeSet: join(wardrobe, 'model-3', 'set-a'),
    faceModel: face, faceSet: join(face, 'set-a'), faceCatalog: join(face, 'catalog'),
    faceCatalogItem: join(face, 'catalog', 'item-a'),
    expressionPreset: join(expressions, 'preset-a.json'),
    expressionCollections: join(expressions, 'collections.json'),
    expressionDraft: join(expressions, 'workspace-draft.json'),
    faceComponents: components, faceComponentItem: join(components, 'item-a'),
    hairModel: hair, hairStyle: join(hair, 'styles', 'style-a')
  })
})

test('Customizador mantém o manifesto e a raiz da biblioteca nos caminhos atuais', () => {
  const paths = createCustomizerPaths(userDataPath)
  assert.equal(paths.characterLibraryPath(), join(root, 'customizer', 'characters'))
  assert.equal(paths.characterManifestPath(), join(root, 'customizer', 'characters', 'characters.json'))
})

test('Studio mantém nomes distintos para Studio Principal e Editor Gacha', () => {
  const paths = createStudioPaths(userDataPath)
  assert.equal(paths.studioLibraryPath(), join(root, 'studios', 'Studio Principal'))
  assert.equal(paths.studioLibraryPath('video'), join(root, 'studios', 'Editor Gacha'))
  assert.equal(paths.studioPath('abc'), join(root, 'studios', 'Studio Principal', 'studio-abc'))
})

test('Editor V6 mantém biblioteca e pasta de projeto nos nomes existentes', () => {
  const paths = createEditorV6Paths(userDataPath)
  assert.equal(paths.editorV6LibraryPath(), join(root, 'studios', 'Editor V6'))
  assert.equal(paths.editorV6Path('abc'), join(root, 'studios', 'Editor V6', 'editorV6-abc'))
})

test('resolução do caminho continua dinâmica em relação ao diretório de dados', () => {
  let rootNow = root
  const paths = createFabricatorPaths(() => rootNow)
  assert.equal(paths.slotPath(1), join(root, 'fabricator', 'models', 'slot-1'))
  rootNow = join('synthetic-root', 'replacement-profile')
  assert.equal(paths.slotPath(1), join(rootNow, 'fabricator', 'models', 'slot-1'))
})
