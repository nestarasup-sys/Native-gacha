import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { useCustomizerWardrobePanelActions } from '../src/renderer/src/features/customizer/useCustomizerWardrobePanelActions.ts'
import { loadCustomizerWardrobeCatalog } from '../src/renderer/src/features/customizer/customizerWardrobeCatalog.ts'
import { getCustomizerHairLibraryPage, loadCustomizerHairDetails, loadCustomizerHairLibraryPageDetails, retainCustomizerHairDetailsForModel } from '../src/renderer/src/features/customizer/customizerHairCatalog.ts'
import {
  upperWardrobePanels,
  upperWardrobePageTwoPanels,
  accessoryWardrobePanels,
  lowerWardrobePanels,
  lowerWardrobePageTwoPanels,
  createWardrobePanelCandidateIndex,
  wardrobePanelCandidates,
  wardrobePanelSelectionComponents,
  isWardrobePanelCandidateSelected,
  wardrobePanelGroupMatchesComponent,
  restoreMissingPairedWardrobeSleeves
} from '../src/renderer/src/features/customizer/wardrobePanelModel.ts'

const summary = (id) => ({ id, modelSlot: 1, modelName: 'Modelo', name: id, updatedAt: '2026-10-29T00:00:00.000Z', edition: 2, componentCount: 1 })
const set = (id, category) => ({
  id,
  modelSlot: 1,
  modelName: 'Modelo',
  name: id,
  width: 10,
  height: 10,
  components: [{ id: `${id}-component`, name: id, category, attachedPartId: 'body', x: 0, y: 0, width: 10, height: 10, rotation: 0, dataUrl: 'data:image/png;base64,AA==' }],
  updatedAt: '2026-10-29T00:00:00.000Z'
})

test('sem permitir o outro gênero, oculta só as camisas opostas e mantém calças, mangas e peças antigas', () => {
  const component = (id, category, attachedPartId = 'body', sleeveSide, sleeveSegment) => ({
    id, name: id, category, attachedPartId, ...(sleeveSide ? { sleeveSide } : {}), ...(sleeveSegment ? { sleeveSegment } : {}),
    x: 0, y: 0, width: 10, height: 10, rotation: 0, dataUrl: 'data:image/png;base64,AA=='
  })
  const createSet = (id, previewGender) => ({
    schemaVersion: 1,
    edition: 1,
    id,
    modelSlot: 1,
    modelName: 'Modelo',
    name: id,
    width: 20,
    height: 20,
    components: [
      component(`${id}-shirt`, 'camisa'),
      component(`${id}-pants`, 'calca-coxa'),
      component(`${id}-sleeve`, 'manga-superior', 'braço esquerdo', 'left', 'upper')
    ],
    updatedAt: '2026-10-29T00:00:00.000Z',
    ...(previewGender ? { previewGender } : {})
  })
  const sets = [createSet('male-set', 'male'), createSet('female-set', 'female'), createSet('legacy-set')]
  const summaries = sets.map((item) => ({ ...summary(item.id), ...(item.previewGender ? { previewGender: item.previewGender } : {}) }))
  const panels = [upperWardrobePanels[0], upperWardrobePanels[2], lowerWardrobePanels[0]]
  const getCandidates = (gender, showOtherGender) => createWardrobePanelCandidateIndex({
    panels,
    selectedModelSlot: 1,
    wardrobeSets: summaries,
    wardrobeDetails: Object.fromEntries(sets.map((item) => [`1:${item.id}`, item])),
    faceComponentAssets: [],
    faceComponentDetails: {},
    wardrobeGenderFilter: { gender, showOtherGender }
  })
  const ids = (index, panel) => index.get(panel)?.map((candidate) => candidate.summary.id)
  const forFemale = getCandidates('female', false)
  const forMale = getCandidates('male', false)

  assert.deepEqual(ids(forFemale, 'shirt'), ['female-set', 'legacy-set'])
  assert.deepEqual(ids(forFemale, 'pants-left'), ['male-set', 'female-set', 'legacy-set'])
  assert.deepEqual(ids(forFemale, 'upper-left'), ['male-set', 'female-set', 'legacy-set'])
  assert.deepEqual(ids(forMale, 'shirt'), ['male-set', 'legacy-set'])
  assert.deepEqual(ids(forMale, 'pants-left'), ['male-set', 'female-set', 'legacy-set'])
  assert.deepEqual(ids(forMale, 'upper-left'), ['male-set', 'female-set', 'legacy-set'])
  assert.deepEqual(ids(getCandidates('male', true), 'shirt'), ['male-set', 'female-set', 'legacy-set'])
  assert.deepEqual(ids(getCandidates('female', true), 'shirt'), ['male-set', 'female-set', 'legacy-set'])
})

test('controle de roupas usa o checkbox do gênero oposto em Modelos', async () => {
  const [picker, page, importFlow] = await Promise.all([
    readFile('src/renderer/src/features/customizer/CustomizerModelPicker.tsx', 'utf8'),
    readFile('src/renderer/src/features/customizer/CustomizerPage.tsx', 'utf8'),
    readFile('src/renderer/src/features/fabricator/wardrobe/useWardrobeSheetEditing.ts', 'utf8')
  ])

  const checkboxPosition = picker.indexOf('Mostrar roupas {oppositeGenderClothesLabel}?')
  assert.ok(checkboxPosition > picker.indexOf('customizer-model-gender-band'))
  assert.match(picker, /showOtherGenderClothes/)
  assert.match(page, /showOtherGenderClothes=\{showOtherGenderClothes\}/)
  assert.match(page, /onShowOtherGenderClothesChange=\{\(show\) => \{ setShowOtherGenderClothes\(show\); setWardrobeLibraryPage\(0\) \}\}/)
  assert.match(page, /wardrobeGenderFilter: \{ gender: selectedCharacterGender, showOtherGender: showOtherGenderClothes \}/)
  assert.equal((importFlow.match(/previewGender: 'female'/g) ?? []).length, 3)
})

test('carrega todos os conjuntos com concorrência limitada e publica os detalhes progressivamente', async () => {
  const summaries = Array.from({ length: 9 }, (_, index) => summary(`set-${index}`))
  const loaded = []
  let active = 0
  let maximumActive = 0

  await loadCustomizerWardrobeCatalog({
    summaries,
    categories: [],
    concurrency: 3,
    loadSet: async (item) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active -= 1
      return set(item.id, 'camisa')
    },
    hasThumbnail: () => false,
    renderThumbnail: async () => null,
    isCancelled: () => false,
    onSetLoaded: (item) => loaded.push(item.id),
    onThumbnailLoaded: () => assert.fail('não há categorias de miniatura neste caso'),
    onError: (reason) => assert.fail(String(reason))
  })

  assert.equal(maximumActive, 3)
  assert.deepEqual(loaded.sort(), summaries.map((item) => item.id))
})

test('gera apenas miniaturas faltantes cujas categorias existem no conjunto', async () => {
  const summaries = [summary('shirt'), summary('pants')]
  const thumbnails = []
  const rendered = []
  await loadCustomizerWardrobeCatalog({
    summaries,
    categories: [
      { id: 'upper', source: ['camisa'] },
      { id: 'lower', source: ['calca-coxa'] }
    ],
    loadSet: async (item) => set(item.id, item.id === 'shirt' ? 'camisa' : 'calca-coxa'),
    hasThumbnail: (key) => key === '1:shirt:upper',
    renderThumbnail: async (_wardrobeSet, categories) => {
      rendered.push(categories)
      return 'data:image/png;base64,AA=='
    },
    isCancelled: () => false,
    onSetLoaded: () => {},
    onThumbnailLoaded: (key, thumbnail) => thumbnails.push({ key, thumbnail }),
    onError: (reason) => assert.fail(String(reason))
  })

  assert.deepEqual(rendered, [['calca-coxa']])
  assert.deepEqual(thumbnails, [{ key: '1:pants:lower', thumbnail: 'data:image/png;base64,AA==' }])
})

test('índice de candidatos preserva filtros, ordem e agrupamento de cada painel', async () => {
  const component = (id, name, category, attachedPartId = 'body', sleevePairId, sleeveSide, sleeveSegment) => ({
    id, name, category, attachedPartId, ...(sleevePairId ? { sleevePairId } : {}), ...(sleeveSide ? { sleeveSide } : {}), ...(sleeveSegment ? { sleeveSegment } : {}), x: 0, y: 0, width: 10, height: 10, rotation: 0,
    dataUrl: 'data:image/png;base64,AA=='
  })
  const createSet = (id, modelSlot, components) => ({
    schemaVersion: 1,
    edition: 2,
    id,
    modelSlot,
    modelName: `Modelo ${modelSlot}`,
    name: id,
    width: 20,
    height: 20,
    components,
    updatedAt: '2026-10-29T00:00:00.000Z'
  })
  const panels = [
    ...upperWardrobePanels,
    ...upperWardrobePageTwoPanels,
    ...accessoryWardrobePanels,
    ...lowerWardrobePanels,
    ...lowerWardrobePageTwoPanels
  ]
  const mainSet = createSet('main', 1, [
    component('shirt', 'Camisa', 'camisa'),
    component('jacket', 'Jaqueta', 'jaqueta'),
    component('upper-left', 'Manga esquerda · braço superior', 'manga-superior', 'braço esquerdo', 'sleeve-long', 'left', 'upper'),
    component('upper-right', 'Manga direita · braço superior', 'manga-superior', 'braço direito', 'sleeve-long', 'right', 'upper'),
    component('lower-left', 'Manga esquerda · antebraço', 'manga-inferior', 'antebraço esquerdo', 'sleeve-long', 'left', 'lower'),
    component('lower-right', 'Manga direita · antebraço', 'manga-inferior', 'antebraço direito', 'sleeve-long', 'right', 'lower'),
    component('legacy-upper-left', 'Manga longa 02 · esquerda · braço superior', 'manga-superior', 'braço esquerdo', undefined, undefined, 'upper'),
    component('legacy-lower-left', 'Manga longa 02 · esquerda · antebraço', 'manga-inferior', 'antebraço esquerdo', undefined, undefined, 'lower'),
    component('unpaired-lower-left', 'Manga longa 03 · esquerda · antebraço', 'manga-inferior', 'antebraço esquerdo', undefined, undefined, 'lower'),
    component('pants-thigh', 'Calça longa · coxa esquerda', 'calca-coxa', 'thigh-left', 'pants-one'),
    component('pants-thigh-right', 'Calça longa · coxa direita', 'calca-coxa', 'thigh-right', 'pants-one'),
    component('pants-shin', 'Calça longa · canela esquerda', 'calca-canela', 'calf-left', 'pants-one'),
    component('pants-shin-right', 'Calça longa · canela direita', 'calca-canela', 'calf-right', 'pants-one'),
    component('pants-two', 'Calça longa 02', 'calca-coxa', 'thigh-left', 'pants-two'),
    component('shorts', 'Bermuda', 'shorts'),
    component('glass-cloth', 'Óculos de roupa', 'oculos'),
    component('shoe-left-01', 'Sapato 01 · esquerda', 'sapato', 'foot-left', 'shoe-pair-01', 'left', 'whole'),
    component('shoe-right-01', 'Sapato 01 · direita', 'sapato', 'foot-right', 'shoe-pair-01', 'right', 'whole'),
    component('shoe-left-02', 'Sapato 02 · esquerda', 'sapato', 'foot-left', 'shoe-pair-02', 'left', 'whole'),
    component('shoe-right-02', 'Sapato 02 · direita', 'sapato', 'foot-right', 'shoe-pair-02', 'right', 'whole'),
    component('shoe-unpaired', 'Sapato extra · esquerda', 'sapato', 'foot-left', undefined, 'left', 'whole')
  ])
  const otherSlotSet = createSet('other-slot', 2, [component('other-shirt', 'Camisa', 'camisa')])
  const summaries = [
    { ...summary(mainSet.id), componentCount: mainSet.components.length },
    { ...summary(otherSlotSet.id), modelSlot: 2, componentCount: otherSlotSet.components.length }
  ]
  const faceSummary = {
    id: 'glasses-extra', modelSlot: 1, kind: 'head-extra', name: 'Óculos extra', width: 12, height: 8,
    updatedAt: '2026-10-29T00:00:00.000Z'
  }
  const faceAsset = {
    schemaVersion: 1, ...faceSummary,
    defaultTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    dataUrl: 'data:image/png;base64,AA=='
  }
  const wardrobeDetails = { '1:main': mainSet, '2:other-slot': otherSlotSet }
  const faceComponentDetails = { [faceAsset.id]: faceAsset }
  const index = createWardrobePanelCandidateIndex({
    panels,
    selectedModelSlot: 1,
    wardrobeSets: summaries,
    wardrobeDetails,
    faceComponentAssets: [faceSummary],
    faceComponentDetails
  })

  assert.equal(index.size, panels.length)
  assert.equal(new Set(panels.map((panel) => panel.id)).size, panels.length)
  for (const panel of panels) {
    assert.deepEqual(
      index.get(panel.id),
      wardrobePanelCandidates(panel, 1, summaries, wardrobeDetails, [faceSummary], faceComponentDetails)
    )
  }
  assert.equal(index.get('pants-left')?.length, 2)
  assert.deepEqual(index.get('pants-left')?.[0]?.components.map(({ id }) => id), ['pants-thigh', 'pants-thigh-right', 'pants-shin', 'pants-shin-right'])
  assert.deepEqual(index.get('pants-left')?.[1]?.components.map(({ id }) => id), ['pants-two'])
  assert.equal(index.get('pants-left')?.[0]?.component.id, 'pants-thigh')
  assert.deepEqual(index.get('upper-left')?.map((candidate) => candidate.components.map(({ id }) => id)), [
    ['upper-left', 'lower-left'], ['legacy-upper-left', 'legacy-lower-left']
  ])
  assert.deepEqual(index.get('upper-right')?.map((candidate) => candidate.components.map(({ id }) => id)), [['upper-right', 'lower-right']])
  assert.deepEqual(index.get('lower-left')?.map((candidate) => [candidate.component.id, candidate.components.map(({ id }) => id), candidate.pairedComponents.map(({ id }) => id)]), [
    ['lower-left', ['lower-left'], ['upper-left', 'lower-left']],
    ['legacy-lower-left', ['legacy-lower-left'], ['legacy-upper-left', 'legacy-lower-left']],
    ['unpaired-lower-left', ['unpaired-lower-left'], ['unpaired-lower-left']]
  ])
  assert.deepEqual(index.get('lower-right')?.map((candidate) => candidate.components.map(({ id }) => id)), [['lower-right']])
  assert.deepEqual(index.get('shoe-left')?.map((candidate) => [candidate.component.id, candidate.components.map(({ id }) => id)]), [
    ['shoe-left-01', ['shoe-left-01', 'shoe-right-01']],
    ['shoe-left-02', ['shoe-left-02', 'shoe-right-02']],
    ['shoe-unpaired', ['shoe-unpaired']]
  ])
  assert.deepEqual(index.get('shoe-right')?.map((candidate) => [candidate.component.id, candidate.components.map(({ id }) => id)]), [
    ['shoe-right-01', ['shoe-left-01', 'shoe-right-01']],
    ['shoe-right-02', ['shoe-left-02', 'shoe-right-02']]
  ])
  assert.deepEqual(wardrobePanelSelectionComponents(mainSet, lowerWardrobePanels.find((panel) => panel.id === 'shoe-left')).map(({ id }) => id), [
    'shoe-left-01', 'shoe-right-01', 'shoe-left-02', 'shoe-right-02', 'shoe-unpaired'
  ])
  assert.deepEqual(wardrobePanelSelectionComponents(mainSet, upperWardrobePanels.find((panel) => panel.id === 'lower-left')).map(({ id }) => id), [
    'upper-left', 'lower-left', 'legacy-upper-left', 'legacy-lower-left', 'unpaired-lower-left'
  ])
  assert.equal(upperWardrobePanels.some((panel) => panel.id === 'lower-left' || panel.id === 'lower-right'), true)
  const splitSleeve = index.get('upper-left')[0]
  const legacySplitGroups = [
    { modelSlot: 1, setId: 'main', category: 'manga-superior', componentId: 'upper-left' },
    { modelSlot: 1, setId: 'main', category: 'manga-inferior', componentId: 'lower-left' }
  ]
  assert.equal(isWardrobePanelCandidateSelected(splitSleeve, upperWardrobePanels.find((panel) => panel.id === 'upper-left'), legacySplitGroups), true)
  assert.equal(wardrobePanelGroupMatchesComponent(legacySplitGroups[1], upperWardrobePanels.find((panel) => panel.id === 'upper-left'), 1, 'main', splitSleeve.components[1]), true)
  const lowerSleeve = index.get('lower-left')[0]
  assert.equal(isWardrobePanelCandidateSelected(lowerSleeve, upperWardrobePanels.find((panel) => panel.id === 'lower-left'), legacySplitGroups), true)
  assert.equal(wardrobePanelGroupMatchesComponent(legacySplitGroups[1], upperWardrobePanels.find((panel) => panel.id === 'lower-left'), 1, 'main', lowerSleeve.component), true)
  assert.equal(isWardrobePanelCandidateSelected(index.get('shoe-left')[0], lowerWardrobePanels.find((panel) => panel.id === 'shoe-left'), [
    { modelSlot: 1, setId: 'main', category: 'sapato', componentId: 'shoe-right-01' }
  ]), true)

  const applyShoeCandidate = async (panelId, candidate) => {
    const character = { id: 'character', customization: { wardrobeGroups: [] } }
    let savedPatch
    const actions = useCustomizerWardrobePanelActions({
      selectedCharacter: character,
      selectedModelSlot: 1,
      selectedClothing: null,
      setSelectedClothing: () => {},
      charactersRef: { current: [character] },
      wardrobeSets: summaries,
      wardrobeDetails,
      saveCharacterCustomization: async (patch) => { savedPatch = patch }
    })
    await actions.applyWardrobePanel(lowerWardrobePanels.find((panel) => panel.id === panelId), candidate)
    return savedPatch.wardrobeGroups.map(({ componentId }) => componentId)
  }
  assert.deepEqual(await applyShoeCandidate('shoe-left', index.get('shoe-left')[0]), ['shoe-left-01', 'shoe-right-01'])
  assert.deepEqual(await applyShoeCandidate('shoe-right', index.get('shoe-right')[0]), ['shoe-left-01', 'shoe-right-01'])

  const leftShoeCandidate = index.get('shoe-left')[0]
  const rightShoeCandidate = index.get('shoe-right')[0]
  const shoePanels = {
    left: lowerWardrobePanels.find((panel) => panel.id === 'shoe-left'),
    right: lowerWardrobePanels.find((panel) => panel.id === 'shoe-right')
  }
  const shoeGroups = [
    { modelSlot: 1, setId: 'main', category: 'sapato', componentId: 'shoe-left-01', offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    { modelSlot: 1, setId: 'main', category: 'sapato', componentId: 'shoe-right-01', offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0 }
  ]
  const saveShoeLayerPreference = async (side, enabled) => {
    const character = { id: 'character', customization: { wardrobeGroups: shoeGroups } }
    let savedPatch
    const actions = useCustomizerWardrobePanelActions({
      selectedCharacter: character,
      selectedModelSlot: 1,
      selectedClothing: null,
      setSelectedClothing: () => {},
      charactersRef: { current: [character] },
      wardrobeSets: summaries,
      wardrobeDetails,
      saveCharacterCustomization: async (patch) => { savedPatch = patch }
    })
    const panel = shoePanels[side]
    const candidate = side === 'left' ? leftShoeCandidate : rightShoeCandidate
    await actions.setShoeBehindShinClothing(panel, candidate, enabled)
    return savedPatch
  }
  const enabledFromLeft = await saveShoeLayerPreference('left', true)
  const disabledFromRight = await saveShoeLayerPreference('right', false)
  assert.equal(enabledFromLeft.shoesBehindShinClothing, true)
  assert.equal(disabledFromRight.shoesBehindShinClothing, false)
  assert.equal(Object.hasOwn(enabledFromLeft, 'wardrobeGroups'), false)
  assert.equal(shoeGroups[0].renderBehindShinClothing, undefined)
  assert.equal(index.get('glasses')?.[0]?.headExtraAsset?.id, faceAsset.id)
  assert.equal(index.get('shirt')?.some((candidate) => candidate.summary.modelSlot === 2), false)
})

test('prévia da roupa desenha todas as partes agrupadas no mesmo candidato', async () => {
  const preview = await readFile('src/renderer/src/features/customizer/CustomizerAssetPreviews.tsx', 'utf8')
  assert.match(preview, /candidate\.components\.map\(\(component\) => component\.category\)/)
  assert.match(preview, /candidate\.components\.map\(\(component\) => component\.id\)/)
})

test('reabre manga longa antiga e restaura o antebraço pareado sem duplicar ou perder cores', () => {
  const upper = {
    id: 'upper-old', name: 'Manga longa 04 · esquerda · braço superior', category: 'manga-superior',
    attachedPartId: 'braço esquerdo', sleeveSegment: 'upper', x: 0, y: 0, width: 10, height: 20,
    rotation: 0, dataUrl: 'data:image/png;base64,AA=='
  }
  const lower = {
    id: 'lower-old', name: 'Manga longa 04 · esquerda · antebraço', category: 'manga-inferior',
    attachedPartId: 'antebraço esquerdo', sleeveSegment: 'lower', x: 0, y: 0, width: 10, height: 20,
    rotation: 0, dataUrl: 'data:image/png;base64,AA=='
  }
  const set = { schemaVersion: 1, edition: 1, id: 'old-sleeve', modelSlot: 1, modelName: 'Modelo', name: 'Conjunto antigo', width: 20, height: 20, components: [upper, lower], updatedAt: '2026-10-29T00:00:00.000Z' }
  const savedUpper = { modelSlot: 1, setId: set.id, category: 'manga-superior', componentId: upper.id, offsetX: 7, offsetY: 2, scaleX: 1.1, scaleY: 1, rotation: 3, hidden: true, colors: { base: '#123456' } }
  const restored = restoreMissingPairedWardrobeSleeves([savedUpper], new Map([[`1:${set.id}`, set]]))
  assert.deepEqual(restored.map(({ componentId, category }) => [componentId, category]), [
    ['upper-old', 'manga-superior'], ['lower-old', 'manga-superior']
  ])
  assert.deepEqual(restored[1], {
    modelSlot: 1, setId: set.id, category: 'manga-superior', componentId: 'lower-old',
    offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0,
    hidden: true, colors: { base: '#123456' }
  })
  assert.equal(restoreMissingPairedWardrobeSleeves(restored, new Map([[`1:${set.id}`, set]])).length, 2)
})

test('hidratação do Customizador aplica a restauração às referências antigas', async () => {
  const hydration = await readFile('src/renderer/src/features/customizer/useCustomizerWardrobeHydration.ts', 'utf8')
  assert.match(hydration, /restoreMissingPairedWardrobeSleeves\(migratedGroups, setsByKey\)/)
})

test('cancelamento impede publicar detalhes depois de trocar de área', async () => {
  let cancel = false
  let resolveSet
  let markStarted
  const started = new Promise((resolve) => { markStarted = resolve })
  const pendingSet = new Promise((resolve) => { resolveSet = resolve })
  const loaded = []
  const task = loadCustomizerWardrobeCatalog({
    summaries: [summary('slow')],
    categories: [],
    loadSet: async () => { markStarted(); return pendingSet },
    hasThumbnail: () => false,
    renderThumbnail: async () => null,
    isCancelled: () => cancel,
    onSetLoaded: () => loaded.push('set'),
    onThumbnailLoaded: () => loaded.push('thumbnail'),
    onError: (reason) => assert.fail(String(reason))
  })
  await started
  cancel = true
  resolveSet(set('slow', 'camisa'))
  await task

  assert.deepEqual(loaded, [])
})

test('falha de um conjunto é reportada e não bloqueia os demais', async () => {
  const loaded = []
  const errors = []
  await loadCustomizerWardrobeCatalog({
    summaries: [summary('broken'), summary('healthy')],
    categories: [],
    concurrency: 1,
    loadSet: async (item) => {
      if (item.id === 'broken') throw new Error('manifesto ilegível')
      return set(item.id, 'camisa')
    },
    hasThumbnail: () => false,
    renderThumbnail: async () => null,
    isCancelled: () => false,
    onSetLoaded: (item) => loaded.push(item.id),
    onThumbnailLoaded: () => {},
    onError: (reason) => errors.push(reason.message)
  })

  assert.deepEqual(errors, ['manifesto ilegível'])
  assert.deepEqual(loaded, ['healthy'])
})

test('página do Customizador delega a carga de detalhes e miniaturas ao hook da feature', async () => {
  const [page, hook, loader] = await Promise.all([
    readFile('src/renderer/src/features/customizer/CustomizerPage.tsx', 'utf8'),
    readFile('src/renderer/src/features/customizer/useCustomizerWardrobeCatalog.ts', 'utf8'),
    readFile('src/renderer/src/features/customizer/customizerWardrobeCatalog.ts', 'utf8')
  ])
  assert.match(page, /useCustomizerWardrobeCatalog\(/)
  assert.doesNotMatch(page, /listWardrobeSets\(|loadWardrobeSet\(|renderWardrobeThumbnail\(/)
  assert.match(hook, /listWardrobeSets\(selectedModelSlot\)/)
  assert.match(hook, /loadCustomizerWardrobeCatalog\(/)
  assert.match(loader, /concurrency = 3/)
  assert.match(loader, /mapConcurrentItems\(/)
})

test('detalhes dos cabelos têm concorrência limitada, ordem estável e cancelamento', async () => {
  const summaries = Array.from({ length: 10 }, (_, index) => ({ id: `hair-${index}` }))
  let active = 0
  let maximumActive = 0
  const details = await loadCustomizerHairDetails(summaries, () => false, async (id) => {
    active += 1
    maximumActive = Math.max(maximumActive, active)
    await new Promise((resolve) => setTimeout(resolve, 2))
    active -= 1
    return id === 'hair-4' ? null : { id }
  })

  assert.equal(maximumActive, 3)
  assert.deepEqual(details.map((style) => style.id), ['hair-0', 'hair-1', 'hair-2', 'hair-3', 'hair-5', 'hair-6', 'hair-7', 'hair-8', 'hair-9'])

  let cancelled = false
  const started = []
  const releases = []
  const task = loadCustomizerHairDetails(summaries, () => cancelled, async (id) => {
    started.push(id)
    await new Promise((resolve) => releases.push(resolve))
    return { id }
  })
  assert.deepEqual(started, ['hair-0', 'hair-1', 'hair-2'])
  cancelled = true
  releases.forEach((release) => release())
  assert.deepEqual(await task, [])
  assert.deepEqual(started, ['hair-0', 'hair-1', 'hair-2'])
})

test('Customizador delega o catálogo de cabelos ao hook e ao carregador limitado', async () => {
  const [page, catalogHook, libraryHook, loader] = await Promise.all([
    readFile('src/renderer/src/features/customizer/CustomizerPage.tsx', 'utf8'),
    readFile('src/renderer/src/features/customizer/useCustomizerHairCatalog.ts', 'utf8'),
    readFile('src/renderer/src/features/customizer/useCustomizerHairLibraryPage.ts', 'utf8'),
    readFile('src/renderer/src/features/customizer/customizerHairCatalog.ts', 'utf8')
  ])
  assert.match(page, /useCustomizerHairCatalog\(/)
  assert.doesNotMatch(page, /Promise\.all\(summaries\.map\(\(summary\) => window\.desktop\.fabricator\.loadHairStyle/)
  assert.match(catalogHook, /listHairStyles\(selectedModelSlot\)/)
  assert.match(page, /useCustomizerHairLibraryPage\(/)
  assert.match(libraryHook, /loadCustomizerHairLibraryPageDetails\(/)
  assert.match(loader, /concurrency = 3/)
  assert.match(loader, /mapConcurrentItems\(/)
})

test('Customizador memoiza candidatos de roupas e o workspace só consome o índice', async () => {
  const [page, workspace] = await Promise.all([
    readFile('src/renderer/src/features/customizer/CustomizerPage.tsx', 'utf8'),
    readFile('src/renderer/src/features/customizer/CustomizerWardrobeCatalogWorkspace.tsx', 'utf8')
  ])
  assert.match(page, /createWardrobePanelCandidateIndex\(/)
  assert.match(page, /const wardrobePanelCandidateIndex = useMemo\(/)
  assert.match(page, /candidatesByPanel: wardrobePanelCandidateIndex/)
  assert.doesNotMatch(page, /wardrobePanelCandidateIndex\.get\(panel\.id\)/)
  assert.match(workspace, /candidatesByPanel\.get\(panel\.id\)/)
  assert.doesNotMatch(page, /wardrobePanelCandidates\(/)
})

test('biblioteca de cabelos carrega só as miniaturas da página visível', async () => {
  const summaries = Array.from({ length: 45 }, (_, index) => ({
    ...summary(`hair-${index}`),
    category: 'rearHair',
    front: { width: 10, height: 10 }, back: null, fringe: null
  }))
  const page = getCustomizerHairLibraryPage(summaries, 'rearHair', 1)
  const loaded = []
  const details = await loadCustomizerHairLibraryPageDetails(
    page.visibleStyles,
    () => false,
    (item) => item.id === 'hair-20',
    async (id) => {
      loaded.push(id)
      return { id, modelSlot: 1, updatedAt: '2026-10-29T00:00:00.000Z' }
    }
  )

  assert.equal(page.page, 1)
  assert.equal(page.pageCount, 3)
  assert.deepEqual(page.visibleStyles.map((item) => item.id), Array.from({ length: 20 }, (_, index) => `hair-${index + 19}`))
  assert.equal(loaded.length, 19)
  assert.equal(loaded.includes('hair-20'), false)
  assert.equal(details.length, 19)
})

test('cache de cabelos mantém apenas assets do modelo selecionado', async () => {
  const details = {
    '1:front-a': { id: 'front-a' },
    '2:front-b': { id: 'front-b' },
    '20:front-c': { id: 'front-c' }
  }
  const selectedModel = retainCustomizerHairDetailsForModel(details, 2)
  assert.deepEqual(selectedModel, { '2:front-b': { id: 'front-b' } })
  assert.strictEqual(retainCustomizerHairDetailsForModel(selectedModel, 2), selectedModel)
  assert.deepEqual(retainCustomizerHairDetailsForModel(selectedModel, null), {})

  const page = await readFile('src/renderer/src/features/customizer/CustomizerPage.tsx', 'utf8')
  assert.match(page, /setActiveHairDetails/)
  assert.match(page, /const modelSlot = activeHairModelSlotRef\.current/)
  assert.match(page, /retainCustomizerHairDetailsForModel\(\s*current,\s*activeHairModelSlotRef\.current,\s*activeHairStyleIdsRef\.current/)
  assert.equal((page.match(/setHairDetails: setActiveHairDetails/g) ?? []).length, 2)
})

test('cache de cabelos mantém estilos selecionados e página atual, removendo páginas antigas', () => {
  const details = {
    '2:selected': { id: 'selected' },
    '2:visible-a': { id: 'visible-a' },
    '2:previous-page': { id: 'previous-page' },
    '1:other-model': { id: 'other-model' }
  }
  const retained = retainCustomizerHairDetailsForModel(details, 2, new Set(['selected', 'visible-a']))
  assert.deepEqual(retained, {
    '2:selected': { id: 'selected' },
    '2:visible-a': { id: 'visible-a' }
  })
})
