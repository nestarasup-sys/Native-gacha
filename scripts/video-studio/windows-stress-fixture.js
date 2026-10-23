/*
 * Renderer-side builder for the Windows Video Studio soak. The Node runner
 * evaluates this file inside the normal hidden Electron renderer so every
 * read, character save, project save, media import and preview uses app APIs.
 */
window.__runNativeGachaStressFixture = async function runNativeGachaStressFixture(mediaPaths) {
  const startedAt = performance.now()
  window.__nativeGachaStressProgress = { phase: 'catalog', completedCharacters: 0, currentCharacter: '', completedKeys: 0, expectedKeys: 0 }
  const desktop = window.desktop
  const targetTitle = 'STRESS TEST — 4 GACHA — 180 SEGUNDOS'
  const names = ['STRESS_Aurora', 'STRESS_Nix', 'STRESS_Brisa', 'STRESS_Dorian']
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  const uuid = () => crypto.randomUUID()
  const unique = (values) => [...new Set(values)]

  const slots = (await desktop.listFabricatorSlots()).filter(Boolean)
  const model = slots.find((entry) => entry.slot === 1) ? await desktop.loadFabricatorSlot(1) : null
  assert(model, 'O Fabricador não retornou o modelo real do slot 1.')
  const poses = (await desktop.listFabricatorPoseSlots(1)).filter(Boolean)
  assert(poses.length >= 2, 'O catálogo real só tem uma pose; o teste exige duas poses para variar.')
  const poseBySlot = new Map(poses.map((pose) => [pose.slot, pose]))
  const wardrobeListing = await desktop.listWardrobeSetsDetailed(1)
  assert(!wardrobeListing.issues.length && wardrobeListing.sets.length, 'O conjunto real de roupa está indisponível ou com falhas de catálogo.')
  const wardrobe = await desktop.loadWardrobeSet(1, wardrobeListing.sets[0].id)
  assert(wardrobe && wardrobe.components.length > 0, 'O conjunto de roupa real não carregou suas peças.')
  const hairSummaries = await desktop.listHairStyles(1)
  const frontHair = hairSummaries.find((style) => style.category === 'rearHair' && style.front)
  const backHair = hairSummaries.find((style) => style.category === 'backHair' && style.back)
  assert(frontHair && backHair, 'O catálogo real não contém cabelos frontal e posterior compatíveis.')
  const hairStyles = await Promise.all([desktop.loadHairStyle(1, frontHair.id), desktop.loadHairStyle(1, backHair.id)])
  assert(hairStyles.every(Boolean), 'Um dos estilos de cabelo reais não carregou.')

  const faceKinds = ['eye', 'pupil', 'eyebrow', 'eye-closed', 'head-extra']
  const faceSummaryByKind = Object.fromEntries(await Promise.all(faceKinds.map(async (kind) => [kind, await desktop.listFaceComponentAssets(1, kind)])))
  const componentNames = {
    'eye-left': /olho esquerdo/i,
    'eye-right': /olho direito/i,
    'pupil-left': /pupila esquerda/i,
    'pupil-right': /pupila direita/i,
    'brow-left': /sobrancelha esquerda/i,
    'brow-right': /sobrancelha direita/i,
  }
  const components = {}
  for (const [part, pattern] of Object.entries(componentNames)) {
    const kind = part.startsWith('eye-') ? 'eye' : part.startsWith('pupil-') ? 'pupil' : 'eyebrow'
    components[part] = faceSummaryByKind[kind].find((asset) => pattern.test(asset.name))
    assert(components[part], `Asset facial real ausente: ${part}.`)
  }
  const headAccessory = faceSummaryByKind['head-extra'].find((asset) => asset.name)
  const faceCatalog = await desktop.listFaceCatalog(1)
  const catalogFor = (category) => faceCatalog.find((item) => item.category === category)
  const nose = catalogFor('nose')
  const mouthClosed = catalogFor('mouth-closed')
  const mouthOpen = catalogFor('mouth-open')
  assert(nose && mouthClosed && mouthOpen, 'O catálogo real não oferece nariz e folhas de boca aberta/fechada.')
  const facePresets = (await desktop.listFaceExpressionPresets(1))
    .filter((preset) => (preset.collectionId ?? 'standard') === 'standard' && Number.isInteger(preset.expressionIndex) && preset.expressionIndex >= 0 && preset.expressionIndex <= 20)
    .sort((left, right) => left.expressionIndex - right.expressionIndex || left.name.localeCompare(right.name, 'pt-BR'))
  const presets = await Promise.all(facePresets.map((summary) => desktop.loadFaceExpressionPreset(1, summary.id)))
  const usablePresets = presets.filter(Boolean)
  assert(usablePresets.length >= 18, `Há somente ${usablePresets.length} presets reais utilizáveis no conjunto padrão.`)
  const normalPreset = usablePresets.find((preset) => preset.name.toLocaleLowerCase('pt-BR') === 'normal')
  assert(normalPreset, 'O conjunto de expressões padrão não tem preset Normal.')
  const componentIds = new Set(Object.values(components).map((item) => item.id))
  const catalogIds = new Set(faceCatalog.map((item) => item.id))
  const brokenPresets = usablePresets.filter((preset) => {
    const referenced = [
      ...Object.values(preset.selections.eyes), ...Object.values(preset.selections.pupils), ...Object.values(preset.selections.eyebrows),
      preset.selections.nose?.catalogId, preset.selections.mouth?.catalogId,
    ].filter(Boolean)
    return referenced.some((id) => !componentIds.has(id) && !catalogIds.has(id))
  })
  assert(!brokenPresets.length, `Há referências de assets ausentes em ${brokenPresets.length} presets padrão.`)

  const existingCharacters = await desktop.listCustomizerCharacters()
  const existingByName = new Map(existingCharacters.map((character) => [character.name, character]))
  const existingStressCharacters = names.map((name) => existingByName.get(name)).filter(Boolean)
  assert(existingStressCharacters.length === 0 || existingStressCharacters.length === names.length,
    'Há somente parte dos personagens STRESS_*; os dados existentes foram preservados e não serão substituídos.')
  const existingProjectCards = await desktop.listVideoStudios()
  const existingProject = existingProjectCards.find((card) => card.title === targetTitle)
  if (existingProject) {
    const document = await desktop.loadVideoStudio(existingProject.id)
    const characterCount = document?.elements.filter((element) => element.kind === 'character').length ?? 0
    const characterElements = document?.elements.filter((element) => element.kind === 'character') ?? []
    const counts = Object.fromEntries(names.map((name) => [name, document?.elements.find((element) => element.text === name)?.characterId ?? null]))
    assert(document?.videoTimeline?.durationFrames === 10800 && characterCount === 4
      && names.every((name) => counts[name] && document.videoTimeline.characterKeys.filter((key) => key.elementId === document.elements.find((element) => element.text === name)?.id).length >= 40),
      'Já existe um projeto com o título solicitado, mas ele não corresponde a este teste; foi preservado sem alterações.')
    const videoAssets = document.videoTimeline.videoAssets ?? []
    const mediaPreviews = await Promise.all(videoAssets.map((asset) => desktop.prepareVideoPreviewMedia(document.id, asset)))
    const contactSheetCanvas = window.document.createElement('canvas')
    contactSheetCanvas.width = 1600; contactSheetCanvas.height = 650
    const contactContext = contactSheetCanvas.getContext('2d')
    assert(contactContext, 'Não foi possível criar a captura dos personagens persistidos.')
    contactContext.fillStyle = '#E7EDF3'; contactContext.fillRect(0, 0, contactSheetCanvas.width, contactSheetCanvas.height)
    for (let index = 0; index < characterElements.length; index++) {
      const element = characterElements[index]
      const asset = document.assets.find((entry) => entry.id === element.assetId)
      assert(asset?.dataUrl, `O personagem ${element.text} perdeu a imagem-base do projeto.`)
      const image = new Image()
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error(`Imagem persistida inválida: ${element.text}.`)); image.src = asset.dataUrl })
      const left = index * 400
      contactContext.fillStyle = '#FFFFFF'; contactContext.fillRect(left + 12, 12, 376, 590)
      contactContext.drawImage(image, left + 32, 24, 336, 520)
      contactContext.fillStyle = '#2D3541'; contactContext.font = 'bold 22px sans-serif'; contactContext.textAlign = 'center'
      contactContext.fillText(element.text, left + 200, 630)
    }
    window.__nativeGachaStressContactSheet = contactSheetCanvas.toDataURL('image/png')
    const memory = await desktop.getVideoStudioMemoryReport()
    return {
      reused: true, projectId: document.id, title: document.title,
      environment: { platform: memory.platform, mainPid: memory.mainPid, totalRamBytes: memory.totalRamBytes, freeRamBytes: memory.freeRamBytes, gpuDedicatedBytes: memory.gpuDedicatedBytes },
      source: {
        model: { slot: model.slot, name: model.name, partCount: model.parts.length },
        poses: poses.map((pose) => ({ slot: pose.slot, name: pose.name, category: pose.category, partCount: pose.partCount })),
        wardrobe: { id: wardrobe.id, name: wardrobe.name, componentCount: wardrobe.components.length },
        hairStyles: [{ id: frontHair.id, category: frontHair.category, name: frontHair.name }, { id: backHair.id, category: backHair.category, name: backHair.name }],
        faceCatalog: { eyes: components['eye-left'].id, pupils: components['pupil-left'].id, eyebrows: components['brow-left'].id, nose: nose.id, mouthClosed: mouthClosed.id, mouthOpen: mouthOpen.id, headAccessory: headAccessory?.id ?? null },
        standardExpressionPresetCount: usablePresets.length,
      },
      characters: existingStressCharacters.map((character) => ({
        name: character.name, id: character.id, modelSlot: character.customization.modelSlot, poseSlot: character.customization.poseSlot,
        wardrobeComponentCount: character.customization.wardrobeGroups?.length ?? 0,
        hairParts: Object.entries(character.customization.hairAppearance?.parts ?? {}).map(([part, id]) => ({ part, id })),
        hairColorRoles: Object.keys(character.customization.hairAppearance?.colors ?? {}),
        faceComponentCount: Object.values(character.customization.faceAppearance?.components ?? {}).filter((value) => value?.assetId).length,
        faceAssets: { nose: character.customization.faceAppearance?.noseCatalogId, mouthClosed: character.customization.faceAppearance?.mouthClosedCatalogId, mouthOpen: character.customization.faceAppearance?.mouthOpenCatalogId, glasses: Boolean(character.customization.faceAppearance?.headExtras?.glasses) },
      })),
      durationFrames: document.videoTimeline.durationFrames, frameRate: document.videoTimeline.frameRate, characterCount,
      characterNames: characterElements.map((element) => element.text),
      keysPerCharacter: Object.fromEntries(names.map((name) => { const element = characterElements.find((candidate) => candidate.text === name); return [name, document.videoTimeline.characterKeys.filter((key) => key.elementId === element?.id).length] })),
      keyCount: document.videoTimeline.characterKeys.length, textClipCount: document.videoTimeline.textClips.length,
      videoClipCount: document.videoTimeline.videoClips?.length ?? 0, gapCount: document.videoTimeline.characterGaps?.length ?? 0,
      mediaPreviews: mediaPreviews.map((preview, index) => ({ assetId: videoAssets[index].id, proxyUrl: preview.proxyUrl, hasWaveform: Boolean(preview.waveformUrl) })),
      persistence: { libraryCardVisible: true, loadRoundTrip: true, charactersAfterSave: existingCharacters.filter((character) => names.includes(character.name)).length },
      priorRenderAssertions: { normalPtNormalDifferAndRestored: true, manualLeftPupilOnly: true },
      capabilities: { stageTransformsAreProjectWide: true, standaloneAudioImport: false },
    }
  }

  const paletteSpecs = [
    { name: names[0], hair: '#E8C97E', skin: '#F2D4C2', outfit: '#DEE4EE', poseSlot: poses[0].slot,
      hairColors: { base: '#E6C56F', fade: '#FFF0BE', outline: '#8D5939', highlight: '#FFFBE6', accent: '#D78C53' },
      outfitColors: { base: '#E6E9EF', fade: '#BAC8DC', outline: '#596984', highlight: '#FFFFFF', accent: '#80B7DA' },
      mouthBlushColor: '#DD8496', accessory: null, x: -31, y: 4, scale: 96, rotation: -1.5, flipX: false, zIndex: 3 },
    { name: names[1], hair: '#29283A', skin: '#D5A98F', outfit: '#55394D', poseSlot: poses[1].slot,
      hairColors: { base: '#28263A', fade: '#44384F', outline: '#11131C', highlight: '#8A769D', accent: '#C44B63' },
      outfitColors: { base: '#3B2D40', fade: '#714454', outline: '#17151E', highlight: '#AA7890', accent: '#CE495A' },
      mouthBlushColor: '#BA6578', accessory: null, x: -10, y: 6, scale: 100, rotation: 1, flipX: true, zIndex: 6 },
    { name: names[2], hair: '#58C9BE', skin: '#E8B8A8', outfit: '#5BB8B1', poseSlot: poses[0].slot,
      hairColors: { base: '#42C9C2', fade: '#A1EEE0', outline: '#3A3268', highlight: '#F4DFFF', accent: '#D85CB8' },
      outfitColors: { base: '#49B9B3', fade: '#90DDD0', outline: '#354966', highlight: '#E6FFF2', accent: '#D85DB3' },
      mouthBlushColor: '#E6769A', accessory: headAccessory?.id ?? null, x: 11, y: 4, scale: 104, rotation: 2, flipX: false, zIndex: 4 },
    { name: names[3], hair: '#B77952', skin: '#DAB596', outfit: '#7F8963', poseSlot: poses[1].slot,
      hairColors: { base: '#B56F48', fade: '#E9B579', outline: '#4A393C', highlight: '#FFF0D0', accent: '#73504E' },
      outfitColors: { base: '#596D53', fade: '#A8AA77', outline: '#2D3B35', highlight: '#E7D2A0', accent: '#B17A50' },
      mouthBlushColor: '#D27877', accessory: null, x: 32, y: 6, scale: 94, rotation: -2, flipX: true, zIndex: 5 },
  ]

  const wardrobeGroupsFor = (spec) => wardrobe.components.map((component) => {
    const bone = model.parts.find((part) => part.id === component.attachedPartId)
    assert(bone, `A peça real ${component.name} não tem osso compatível no modelo selecionado.`)
    const category = component.category === 'calca-coxa' || component.category === 'calca-canela' ? 'calca' : component.category
    return {
      modelSlot: 1, setId: wardrobe.id, category, componentId: component.id,
      offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0,
      adjustmentReference: { version: 1, boneId: bone.id, width: bone.width, height: bone.height, rotation: bone.rotation },
      colors: { ...spec.outfitColors },
    }
  })

  for (const spec of paletteSpecs) {
    let character = existingByName.get(spec.name)
    if (!character) character = await desktop.createCustomizerCharacter(spec.name)
    const faceAppearance = {
      modelSlot: 1,
      components: Object.fromEntries(Object.entries(components).map(([part, asset]) => [part, { assetId: asset.id }])),
      linkedSides: { eye: false, pupil: false, eyebrow: false },
      noseCatalogId: nose.id, mouthClosedCatalogId: mouthClosed.id, mouthOpenCatalogId: mouthOpen.id,
      ...(spec.accessory ? { headExtras: { glasses: spec.accessory } } : {}),
      eyeState: 0, eyebrows: true, noseIndex: 0, expressionIndex: normalPreset.expressionIndex, mouthOpen: false,
      mouthBlushEnabled: spec.name === names[0] || spec.name === names[2], mouthBlushColor: spec.mouthBlushColor, mouthBlushOpacity: 0.32,
    }
    if (existingStressCharacters.length) {
      const appearance = character.customization.faceAppearance
      assert(character.customization.modelSlot === 1 && appearance?.mouthOpenCatalogId === mouthOpen.id
        && Object.values(appearance.components ?? {}).filter((value) => value?.assetId).length >= 6,
        `O personagem existente ${spec.name} não contém os assets reais esperados; não foi modificado.`)
      continue
    }
    character = {
      ...character, hair: spec.hair, outfit: spec.outfit, skin: spec.skin,
      customization: {
        ...character.customization, modelSlot: 1, poseSlot: spec.poseSlot,
        partOverrides: {}, layerOrder: [], modelSkinTone: spec.skin,
        wardrobeGroups: wardrobeGroupsFor(spec), faceAppearance,
        hairAppearance: { modelSlot: 1, parts: { backHair: backHair.id, rearHair: frontHair.id }, colors: { ...spec.hairColors } },
      },
      updatedAt: new Date().toISOString(),
    }
    await desktop.saveCustomizerCharacter(character)
  }
  const persistedCharacters = await desktop.listCustomizerCharacters()
  const characters = names.map((name) => persistedCharacters.find((character) => character.name === name))
  assert(characters.every(Boolean), 'Nem todos os quatro personagens foram confirmados no Customizador.')

  const { prepareSavedCharacterRenderer } = await import('/src/characters/characterRenderer.ts')
  const { trimTransparentImage, faceRenderGeometry } = await import('/src/features/videoStudio/characterGeometry.ts')
  const { fitStudioCharacterToStage } = await import('/@fs/C:/TRABALHO%202/OUTROS/GACHA%20LARAPIO/src/shared/studioCharacterGeometry.ts')
  const { buildStudioExpressionAppearance, buildStudioExpressionTransforms } = await import('/src/characters/studioExpressionTransforms.ts')
  const renderers = new Map()
  const rendererFor = async (character, poseSlot) => {
    const key = `${character.id}:${poseSlot ?? 'neutral'}`
    if (!renderers.has(key)) {
      const posed = { ...character, customization: { ...character.customization, poseSlot } }
      renderers.set(key, prepareSavedCharacterRenderer(posed, undefined))
    }
    return renderers.get(key)
  }
  const imageFrom = async (dataUrl, maxSide = 640) => {
    const image = new Image()
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('PNG de personagem inválido.')); image.src = dataUrl })
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    assert(context, 'Canvas de imagem não pôde ser criado.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return { dataUrl: canvas.toDataURL('image/png'), width: image.naturalWidth, height: image.naturalHeight, storedWidth: canvas.width, storedHeight: canvas.height }
  }
  const previewSummaries = []
  const stageWidth = 1000, stageHeight = 562
  const studioAssets = []
  const characterElements = []
  const characterBases = {}
  const characterTransforms = {}
  const characterPositions = {}
  const keys = []
  const actorFirstState = new Map()
  const independentPupilCheck = []
  const allFrames = [0, 15, 45, 120, 240, 480, 750, 930, 1050, 1200,
    1230, 1290, 1410, 1680, 1850, 2160, 2400, 2640,
    2700, 2730, 2790, 2910, 3150, 3510, 3630, 4050,
    4200, 4230, 4320, 4500, 4800, 5250, 5580,
    5700, 5820, 6000, 6300, 6600, 6900, 7080,
    7200, 7380, 7560, 7800, 8160, 8520, 8820,
    9000, 9030, 9120, 9360, 9720, 10200, 10500, 10799]
  const expressionFrameChoices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
  const expressionByIndex = new Map(usablePresets.map((preset) => [preset.expressionIndex, preset]))
  const loadComponent = async (id) => desktop.loadFaceComponentAsset(1, id)
  const loadCatalog = async (id) => desktop.loadFaceCatalogItem(1, id)
  const renderCache = new Map()
  window.__nativeGachaStressProgress = { phase: 'characters', completedCharacters: 0, currentCharacter: '', completedKeys: 0, expectedKeys: 0 }
  const createRender = async (character, element, preset, gaze, faceMode, adjustOnlyLeftPupil) => {
    const cacheKey = JSON.stringify([character.id, element.poseSlot, preset.id, gaze, faceMode, adjustOnlyLeftPupil])
    if (renderCache.has(cacheKey)) return renderCache.get(cacheKey)
    const promise = (async () => {
      const baseAppearance = character.customization.faceAppearance
      const appearance = await buildStudioExpressionAppearance(preset, baseAppearance, loadCatalog)
      const transforms = await buildStudioExpressionTransforms(preset, appearance, {}, loadComponent, loadCatalog, gaze)
      let finalTransforms = transforms
      if (adjustOnlyLeftPupil) {
        finalTransforms = structuredClone(transforms)
        const leftKey = 'expression-component:pupil-left'
        const rightKey = 'expression-component:pupil-right'
        const leftBefore = transforms[leftKey]?.sourceTransformOverride
        const rightBefore = transforms[rightKey]?.sourceTransformOverride
        assert(leftBefore && rightBefore, 'O preset PT não forneceu duas pupilas separadas para o teste de movimento.')
        finalTransforms[leftKey] = { ...finalTransforms[leftKey], sourceTransformOverride: { ...leftBefore, x: leftBefore.x + 6 } }
        independentPupilCheck.push({ characterId: character.id, presetId: preset.id, leftDeltaX: 6, rightDeltaX: finalTransforms[rightKey].sourceTransformOverride.x - rightBefore.x })
      }
      const renderer = await rendererFor(character, element.poseSlot)
      const rendered = await renderer.render(appearance, finalTransforms, preset.effects, faceMode)
      const crop = await trimTransparentImage(rendered.dataUrl)
      const source = crop?.dataUrl ?? rendered.dataUrl
      const image = await imageFrom(source)
      const withGeometry = { ...element, characterCanvasWidth: element.characterCanvasWidth }
      const geometry = faceRenderGeometry(withGeometry, rendered, crop, stageWidth, stageHeight)
      return {
        appearance, transforms: finalTransforms, effects: preset.effects, faceMode,
        imageDataUrl: image.dataUrl, imageBytes: image.dataUrl.length,
        geometry, renderedWidth: rendered.width, renderedHeight: rendered.height,
        cropWidth: crop?.width ?? rendered.width, cropHeight: crop?.height ?? rendered.height,
        storedWidth: image.storedWidth, storedHeight: image.storedHeight,
      }
    })()
    renderCache.set(cacheKey, promise)
    return promise
  }

  for (let actorIndex = 0; actorIndex < characters.length; actorIndex++) {
    const character = characters[actorIndex]
    const spec = paletteSpecs[actorIndex]
    const neutralRenderer = await rendererFor(character, null)
    const neutral = await neutralRenderer.render(character.customization.faceAppearance, {}, undefined, 'idle')
    const neutralCrop = await trimTransparentImage(neutral.dataUrl)
    const currentRenderer = await rendererFor(character, character.customization.poseSlot)
    const initial = await currentRenderer.render(character.customization.faceAppearance, {}, undefined, 'idle')
    const initialCrop = await trimTransparentImage(initial.dataUrl)
    const fitted = fitStudioCharacterToStage(
      neutral, { width: neutralCrop?.width ?? neutral.width, height: neutralCrop?.height ?? neutral.height },
      initial, { width: initialCrop?.width ?? initial.width, height: initialCrop?.height ?? initial.height }, stageWidth, stageHeight,
    )
    const actorId = uuid(), assetId = uuid()
    const cropped = await imageFrom(initialCrop?.dataUrl ?? initial.dataUrl)
    const timelineColor = ['#7768c8', '#5277b8', '#478f83', '#aa8264'][actorIndex]
    const element = {
      id: actorId, kind: 'character', assetId, characterId: character.id,
      timelineColor, characterSourceUpdatedAt: character.updatedAt, faceRendererVersion: 7,
      activeExpressionCollectionId: 'standard', activeExpressionPresetId: null, activeExpressionGaze: 'right', activeFaceMode: 'idle',
      positionLocked: false, characterScale: spec.scale, characterWidthScale: 100, characterHeightScale: 100,
      expressionBase: { appearance: structuredClone(character.customization.faceAppearance), transforms: {} },
      faceAppearance: structuredClone(character.customization.faceAppearance), faceTransforms: {}, poseSlot: character.customization.poseSlot,
      characterCanvasWidth: fitted.characterCanvasWidth,
      text: character.name, x: spec.x, y: spec.y, width: fitted.width, height: fitted.height,
      rotation: spec.rotation, flipX: spec.flipX, zIndex: spec.zIndex,
    }
    const baseData = { ...element, width: fitted.width, height: fitted.height }
    studioAssets.push({ id: assetId, category: 'character', name: character.name, mimeType: 'image/png', dataUrl: cropped.dataUrl })
    characterElements.push(element)
    characterTransforms[actorId] = {
      x: element.x, y: element.y, width: element.width, height: element.height,
      rotation: element.rotation, flipX: element.flipX, characterScale: element.characterScale,
      characterWidthScale: element.characterWidthScale, characterHeightScale: element.characterHeightScale, zIndex: element.zIndex,
    }
    characterPositions[actorId] = { x: element.x, y: element.y }

    const actorPoints = actorIndex === 2
      ? allFrames.filter((frame) => ![5820, 6000, 6300, 6600].includes(frame))
      : actorIndex === 3
        ? [...allFrames.filter((frame) => ![7380, 7560, 7800, 8160].includes(frame)), 7920].sort((a, b) => a - b)
        : allFrames
    assert(actorPoints.length >= 40 && actorPoints.length <= 60, `${character.name} não atende a faixa de 40–60 blocos.`)
    window.__nativeGachaStressProgress = { phase: 'rendering', completedCharacters: actorIndex, currentCharacter: character.name, completedKeys: 0, expectedKeys: actorPoints.length }
    let renderedUnique = new Set()
    for (let index = 0; index < actorPoints.length; index++) {
      const frame = actorPoints[index]
      let preset
      if (index <= 2) preset = normalPreset
      else preset = expressionByIndex.get(expressionFrameChoices[(index + actorIndex * 5) % expressionFrameChoices.length]) ?? normalPreset
      const pupilIsolationCase = actorIndex === 0 && frame === 120
      const gaze = index === 1 || pupilIsolationCase || index >= 3 && (index + actorIndex) % 7 === 4 ? 'left' : 'right'
      const faceMode = index === 1 || index === 2 ? 'idle' : index % 12 === 4 ? 'talk' : index % 12 === 5 ? 'blink' : index % 12 === 6 ? 'talk' : 'idle'
      const adjustOnlyLeftPupil = pupilIsolationCase
      const baseState = {
        ...baseData, poseSlot: index < 3 ? character.customization.poseSlot : (index % 3 === 0 ? poses[0].slot : poses[1].slot),
      }
      const result = await createRender(character, baseState, preset, gaze, faceMode, adjustOnlyLeftPupil)
      const stateElement = {
        ...baseState, faceAppearance: result.appearance, faceTransforms: result.transforms,
        activeExpressionCollectionId: preset.collectionId ?? 'standard', activeExpressionPresetId: preset.id,
        activeExpressionPresetUpdatedAt: preset.updatedAt, activeExpressionGaze: gaze,
        activeExpressionEffects: result.effects, activeFaceMode: faceMode,
        width: result.geometry.width, height: result.geometry.height,
      }
      const state = { element: stateElement, imageDataUrl: result.imageDataUrl }
      renderedUnique.add(result.imageDataUrl)
      if (index === 0) {
        characterBases[actorId] = structuredClone(state)
        actorFirstState.set(character.id, { normal: result.imageDataUrl, normalPresetId: preset.id })
      } else if (index === 1) actorFirstState.get(character.id).pt = result.imageDataUrl
      else if (index === 2) actorFirstState.get(character.id).returnedNormal = result.imageDataUrl
      keys.push({ id: uuid(), elementId: actorId, frame, poseSlot: stateElement.poseSlot, expressionCollectionId: preset.collectionId ?? 'standard', expressionPresetId: preset.id, faceMode, state })
      if (index % 5 === 4 || index === actorPoints.length - 1) {
        window.__nativeGachaStressProgress = { phase: 'rendering', completedCharacters: actorIndex, currentCharacter: character.name, completedKeys: index + 1, expectedKeys: actorPoints.length }
      }
    }
    assert(renderedUnique.size >= 3, `${character.name} gerou menos de três variações visuais reais.`)
    const first = actorFirstState.get(character.id)
    assert(first.normal !== first.pt && first.normal === first.returnedNormal, `${character.name} não distinguiu PT da expressão normal ou não voltou à imagem original.`)
    previewSummaries.push({
      name: character.name, id: character.id, modelSlot: character.customization.modelSlot,
      startingPose: character.customization.poseSlot, availablePoses: poses.map((pose) => ({ slot: pose.slot, name: pose.name, category: pose.category })),
      wardrobeSet: wardrobe.name, wardrobeComponents: character.customization.wardrobeGroups.length,
      hairParts: Object.entries(character.customization.hairAppearance.parts).map(([part, id]) => ({ part, id })),
      faceAssets: { eyes: 2, pupils: 2, eyebrows: 2, nose: nose.id, mouthClosed: mouthClosed.id, mouthOpen: mouthOpen.id, glasses: Boolean(spec.accessory) },
      keyCount: actorPoints.length, distinctRenderedPngs: renderedUnique.size,
      normalVsPtVisiblePngsDiffer: first.normal !== first.pt, normalRestoredExactly: first.normal === first.returnedNormal,
      pngBytesAcrossKeys: keys.filter((key) => key.elementId === actorId).reduce((sum, key) => sum + key.state.imageDataUrl.length, 0),
    })
  }
  assert(independentPupilCheck.length === 1 && independentPupilCheck[0].leftDeltaX === 6 && independentPupilCheck[0].rightDeltaX === 0,
    'O teste da pupila independente não manteve a pupila direita intacta.')

  const actorByCharacterId = new Map(characterElements.map((element) => [element.characterId, element]))
  const speechText = [
    'Chegamos a tempo?', 'Sim, o plano está pronto.', 'Vamos olhar o cenário.', 'A luz mudou bastante.',
    'Temos duas opções.', 'Prefiro a ideia da Brisa.', 'Posso mostrar um detalhe?', 'Claro, pode falar.',
    'A primeira parte está fechada.', 'E a próxima?', 'Vamos trocar de posição.', 'Assim fica melhor.',
    'Eu vejo um movimento ali.', 'Foi só um teste.', 'Continuem, está funcionando.', 'O fundo está bonito.',
    'Vou anotar esse ponto.', 'Não esqueçam a pausa.', 'A resposta chegou.', 'Então seguimos juntos.',
    'Essa expressão ficou ótima.', 'Quero comparar as duas.', 'Um segundo, estou pensando.', 'Agora entendi.',
    'A voz veio mais baixa.', 'Podemos repetir?', 'A transição está suave.', 'Olhem para a frente.',
    'A pose combina com a fala.', 'Tem mais uma mudança.', 'Faltam poucos segundos.', 'Não percam o ritmo.',
    'Vou deixar essa parte quieta.', 'A gente volta depois.', 'Tudo está salvo?', 'Sim, conferi agora.',
    'Preparem o encerramento.', 'As quatro em cena.', 'Mais uma fala curta.', 'E uma última pausa.',
    'Quase no final.', 'O movimento continua.', 'As camadas estão corretas.', 'Vamos fechar o plano.',
    'Cada detalhe ficou no lugar.', 'A cena pode terminar.', 'Pronto para exportar.', 'Fim do teste.',
  ]
  const clipDurations = [45, 60, 90, 150, 240, 420, 30, 120, 180, 720, 1200]
  const textElements = []
  const textClips = []
  for (let index = 0; index < 48; index++) {
    const speaker = characterElements[index % characterElements.length]
    const character = characters.find((item) => item.id === speaker.characterId)
    let startFrame = Math.max(0, Math.round(index * 10800 / 48) + ((index % 7) - 3) * 12)
    if (index === 10) startFrame = 1800
    if (index === 11) startFrame = 1800
    if (index === 20) startFrame = 2400
    if (index === 21) startFrame = 2445
    const requestedDuration = index === 8 ? 420 : index === 26 ? 720 : index === 36 ? 1200 : clipDurations[index % clipDurations.length]
    const endFrame = Math.min(10800, startFrame + requestedDuration)
    const id = uuid()
    const kind = index === 10 || index === 11 ? 'speech' : index % 3 === 2 ? 'thought' : 'speech'
    const bubble = {
      id, kind, characterId: undefined, speakerCharacterId: speaker.characterId,
      speakerName: character?.name ?? speaker.text, speakerColor: speaker.timelineColor,
      text: speechText[index], x: speaker.x, y: Math.max(-36, speaker.y - 36), width: 20, height: 13,
      rotation: index % 2 === 0 ? -1 : 1, zIndex: 30 + index,
    }
    textElements.push(bubble)
    textClips.push({ id: uuid(), elementId: id, kind, startFrame, endFrame, state: structuredClone(bubble) })
  }

  const gaps = [
    { elementId: characterElements[0].id, startFrame: 2640, endFrame: 2700 },
    { elementId: characterElements[1].id, startFrame: 4500, endFrame: 4590 },
    { elementId: characterElements[2].id, startFrame: 6900, endFrame: 7140 },
    { elementId: characterElements[3].id, startFrame: 9300, endFrame: 9450 },
  ].map((gap) => ({ id: uuid(), ...gap }))

  const projectId = uuid()
  const mediaSpecs = [
    { name: 'synthetic-moving-24fps-audio440hz.mp4', durationFrames: 480, expectedSize: 491742 },
    { name: 'synthetic-moving-30fps-audio660hz.mp4', durationFrames: 420, expectedSize: 314488 },
  ]
  const mediaLibrary = await desktop.listVideoLibrary()
  window.__nativeGachaStressProgress = { phase: 'media', completedCharacters: 4, currentCharacter: '', completedKeys: keys.length, expectedKeys: keys.length }
  const media = []
  for (let index = 0; index < mediaSpecs.length; index++) {
    const spec = mediaSpecs[index]
    let item = mediaLibrary.find((candidate) => candidate.name === spec.name)
    if (item) {
      assert(item.size === spec.expectedSize && item.durationFrames === spec.durationFrames && item.available,
        `A mídia sintética existente ${spec.name} não corresponde ao fixture; foi preservada.`)
    } else {
      const imported = await desktop.importVideoLibrary(mediaPaths?.[index])
      assert(imported?.name === spec.name && imported.size === spec.expectedSize, `A mídia real ${spec.name} não entrou na biblioteca.`)
      item = await desktop.finishVideoLibraryImport(imported.id, spec.durationFrames)
    }
    media.push(item)
  }
  const videoAssets = await desktop.attachVideoLibraryItems(projectId, media.map((item) => item.id))
  assert(videoAssets.length === 2, 'O projeto não recebeu os dois vídeos sintéticos da biblioteca.')

  const videoClips = [
    { id: uuid(), assetId: videoAssets[0].id, startFrame: 2700, endFrame: 3180, sourceStartFrame: 0, sourceEndFrame: 480, audio: { volume: 0.3, muted: false }, transform: { x: -31, y: 25, width: 31, height: 31, rotation: -1 } },
    { id: uuid(), assetId: videoAssets[1].id, startFrame: 2880, endFrame: 3300, sourceStartFrame: 0, sourceEndFrame: 420, audio: { volume: 0.65, muted: false }, transform: { x: 31, y: 25, width: 31, height: 31, rotation: 1 } },
  ]
  const now = new Date().toISOString()
  const timeline = {
    schemaVersion: 1, frameRate: 60, durationFrames: 10800, playheadFrame: 0, playing: false,
    animateCharacterTransitions: true, characterPositionsLocked: false, timelineZoom: 12, timelineHeight: 300,
    trackSettings: {
      ...Object.fromEntries(characterElements.map((element, index) => [element.id, { visible: true, locked: false, label: element.text, collapsed: false, order: index }])),
      speech: { visible: true, locked: false, label: 'Falas', collapsed: false, order: 4 },
      thought: { visible: true, locked: false, label: 'Pensamentos', collapsed: false, order: 5 },
      video: { visible: true, locked: false, label: 'Vídeos', collapsed: false, order: 6 },
    },
    characterBases, characterPositions, characterTransforms,
    characterGaps: gaps,
    characterTrackEnds: Object.fromEntries(characterElements.map((element) => [element.id, 10800])),
    videoAssets, videoClips, videoAudio: { volume: 0.7, muted: false },
    characterKeys: keys, textClips,
    saveMarkers: [2700, 5400, 8100, 10800].map((frame) => ({ id: uuid(), frame, affectedTrackIds: [...characterElements.map((element) => element.id), 'speech', 'thought', 'video'] })),
  }
  const studioDocument = {
    schemaVersion: 1, id: projectId, title: targetTitle, color: '#7189CC',
    createdAt: now, updatedAt: now, backgroundColor: '#DCE8F0', backgroundAssetId: null,
    backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    assets: studioAssets, elements: [...characterElements, ...textElements], videoTimeline: timeline,
  }
  await desktop.saveVideoStudio(studioDocument)
  window.__nativeGachaStressProgress = { phase: 'saved', completedCharacters: 4, currentCharacter: '', completedKeys: keys.length, expectedKeys: keys.length }
  const storedCard = (await desktop.listVideoStudios()).find((card) => card.id === projectId)
  assert(storedCard?.title === targetTitle, 'A biblioteca do Video Studio não listou o projeto recém-salvo.')
  const loaded = await desktop.loadVideoStudio(projectId)
  assert(loaded?.videoTimeline?.durationFrames === 10800 && loaded.videoTimeline.frameRate === 60
    && loaded.videoTimeline.characterKeys.length === keys.length
    && loaded.videoTimeline.textClips.length === 48 && loaded.videoTimeline.videoClips?.length === 2
    && loaded.elements.filter((element) => element.kind === 'character').length === 4,
    'O serviço de persistência não reabriu o projeto com 180 segundos e o conteúdo esperado.')
  const mediaPreviews = await Promise.all(videoAssets.map((asset) => desktop.prepareVideoPreviewMedia(projectId, asset)))
  const memory = await desktop.getVideoStudioMemoryReport()
  const contactSheetCanvas = document.createElement('canvas')
  contactSheetCanvas.width = 1600; contactSheetCanvas.height = 650
  const contactContext = contactSheetCanvas.getContext('2d')
  assert(contactContext, 'Não foi possível criar uma captura comparativa dos personagens.')
  contactContext.fillStyle = '#E7EDF3'; contactContext.fillRect(0, 0, contactSheetCanvas.width, contactSheetCanvas.height)
  for (let index = 0; index < studioAssets.length; index++) {
    const asset = studioAssets[index]
    const image = new Image()
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error(`Captura não abriu o PNG de ${asset.name}.`)); image.src = asset.dataUrl })
    const left = index * 400
    contactContext.fillStyle = '#FFFFFF'; contactContext.fillRect(left + 12, 12, 376, 590)
    contactContext.drawImage(image, left + 32, 24, 336, 520)
    contactContext.fillStyle = '#2D3541'; contactContext.font = 'bold 22px sans-serif'; contactContext.textAlign = 'center'
    contactContext.fillText(asset.name, left + 200, 630)
  }
  window.__nativeGachaStressContactSheet = contactSheetCanvas.toDataURL('image/png')
  return {
    reused: false, projectId, title: targetTitle,
    environment: { platform: memory.platform, mainPid: memory.mainPid, totalRamBytes: memory.totalRamBytes, freeRamBytes: memory.freeRamBytes, gpuDedicatedBytes: memory.gpuDedicatedBytes },
    source: {
      model: { slot: model.slot, name: model.name, partCount: model.parts.length },
      poses: poses.map((pose) => ({ slot: pose.slot, name: pose.name, category: pose.category, partCount: pose.partCount })),
      wardrobe: { id: wardrobe.id, name: wardrobe.name, componentCount: wardrobe.components.length },
      hairStyles: [{ id: frontHair.id, category: frontHair.category, name: frontHair.name }, { id: backHair.id, category: backHair.category, name: backHair.name }],
      faceCatalog: { eyes: components['eye-left'].id, pupils: components['pupil-left'].id, eyebrows: components['brow-left'].id, nose: nose.id, mouthClosed: mouthClosed.id, mouthOpen: mouthOpen.id, headAccessory: headAccessory?.id ?? null },
      expressionPresetCount: usablePresets.length,
    },
    characters: previewSummaries,
    timeline: {
      frameRate: timeline.frameRate, durationFrames: timeline.durationFrames, seconds: timeline.durationFrames / timeline.frameRate,
      characterCount: characterElements.length, characterKeys: keys.length,
      keysPerCharacter: Object.fromEntries(characterElements.map((element) => [element.text, keys.filter((key) => key.elementId === element.id).length])),
      textClips: textClips.length, videoClips: videoClips.length, gaps: gaps.length,
      animateCharacterTransitions: timeline.animateCharacterTransitions,
      overlappingSpeechStartFrames: textClips.filter((clip) => clip.startFrame === 1800 && clip.kind === 'speech').map((clip) => clip.elementId),
      overlappingVideoFrames: Math.max(0, Math.min(videoClips[0].endFrame, videoClips[1].endFrame) - Math.max(videoClips[0].startFrame, videoClips[1].startFrame)),
      videoRates: ['24/1', '30/1'], audio: 'AAC sine tones embedded in the two moving MP4 clips; clip volume 0.30/0.65, master 0.70, silence in timeline gaps',
      saveMarkerFrames: timeline.saveMarkers.map((marker) => marker.frame),
    },
    media: media.map((item, index) => ({ id: item.id, name: item.name, sizeBytes: item.size, durationFrames: item.durationFrames, available: item.available, previewProxy: mediaPreviews[index].proxyUrl, waveform: Boolean(mediaPreviews[index].waveformUrl) })),
    persistence: { libraryCardVisible: true, loadRoundTrip: true, charactersAfterSave: persistedCharacters.filter((character) => names.includes(character.name)).length },
    pupilIsolation: independentPupilCheck,
    bytes: { keyPngDataUrlChars: keys.reduce((sum, key) => sum + (key.state?.imageDataUrl.length ?? 0), 0), elapsedMs: performance.now() - startedAt },
    capabilities: { stageTransformsAreProjectWide: true, standaloneAudioImport: false },
  }
}
