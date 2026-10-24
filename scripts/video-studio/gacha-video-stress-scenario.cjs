'use strict'

const scenarios = Object.freeze({
  basic: { characters: 1, texts: 1, videos: 0, speaking: false, transitions: true },
  intermediate: { characters: 2, texts: 2, videos: 0, speaking: true, transitions: true },
  heavy: { characters: 4, texts: 3, videos: 0, speaking: true, transitions: true },
  extreme: { characters: 8, texts: 5, videos: 0, speaking: true, transitions: true },
  mixed: { characters: 4, texts: 4, videos: 1, speaking: true, transitions: true },
})

function cloneState(state, element) {
  return { ...state, element: { ...state.element, ...element } }
}

/** Deterministic timeline factory shared by the stress and A/B benchmark harnesses. */
function configureGachaStressScenario(bootstrap, options = {}) {
  const scenario = options.scenario ?? 'mixed'
  const profile = scenarios[scenario]
  if (!profile) throw new Error(`Cenário Gacha desconhecido: ${scenario}.`)
  const durationFrames = options.durationFrames ?? bootstrap.snapshot.durationFrames
  if (!Number.isSafeInteger(durationFrames) || durationFrames < 300) throw new Error('O cenário Gacha exige pelo menos 300 frames.')
  const { studio, timeline } = bootstrap.snapshot
  const actor = studio.elements.find(element => element.kind === 'character')
  if (!actor) throw new Error('Fixture Gacha não contém personagem base.')
  const baseState = timeline.characterBases[actor.id]
  const secondState = timeline.characterKeys[0]?.state
  if (!baseState || !secondState) throw new Error('Fixture Gacha não contém duas poses renderizáveis.')
  const originalTexts = studio.elements.filter(element => ['narrator', 'speech', 'thought'].includes(element.kind))
  const templateText = originalTexts.find(element => element.kind === 'speech') ?? originalTexts[0]
  const originalTextClips = timeline.textClips.filter(clip => clip.kind === 'narrator')
  const title = originalTexts.find(element => element.kind === 'narrator') ?? templateText
  timeline.durationFrames = durationFrames
  timeline.frameRate = 60
  timeline.animateCharacterTransitions = true
  timeline.characterKeys = []
  timeline.characterGaps = []
  timeline.textClips = []
  timeline.videoClips = []
  timeline.videoAssets = []

  const sourceByAssetId = new Map()
  const actors = []
  const transitionSpacing = options.transitionSpacing ?? 30
  for (let index = 0; index < profile.characters; index++) {
    const id = index === 0 ? actor.id : `stress-actor-${index}`
    const column = index % 4
    const row = Math.floor(index / 4)
    const element = {
      ...actor,
      id,
      x: -36 + column * 24,
      y: -14 + row * 28,
      width: 20,
      height: 48,
      zIndex: actor.zIndex + index,
      characterCanvasWidth: 20,
    }
    if (index > 0) studio.elements.push(element)
    const start = cloneState(baseState, element)
    timeline.characterBases[id] = start
    actors.push(element)

    for (let frame = transitionSpacing; frame < durationFrames; frame += transitionSpacing) {
      const next = timeline.characterKeys.length % 2 === 0
      const template = next ? secondState : baseState
      const targetElement = {
        ...element,
        poseSlot: next ? 2 : 1,
        faceAppearance: {
          ...((template.element.faceAppearance ?? element.faceAppearance) ?? {}),
          expressionIndex: next ? 1 : 0,
          eyeState: 0,
          mouthOpen: false,
        },
      }
      const state = cloneState(template, targetElement)
      timeline.characterKeys.push({
        id: `stress-${scenario}-${index}-key-${frame}`,
        elementId: id,
        frame,
        poseSlot: next ? 2 : 1,
        expressionCollectionId: null,
        expressionPresetId: null,
        faceMode: 'idle',
        state,
      })
    }

    if (profile.speaking) {
      const speech = { ...templateText, id: `stress-speech-${index}`, speakerCharacterId: id, text: `Cena de estresse ${index + 1}: ação, você e coração.` }
      studio.elements.push(speech)
      timeline.textClips.push({
        id: `stress-speech-clip-${index}`, elementId: speech.id, kind: 'speech',
        startFrame: Math.floor(index * 7), endFrame: durationFrames,
      })
    }
  }

  const activeTexts = []
  for (let index = 0; index < profile.texts; index++) {
    const element = {
      ...title,
      id: `stress-title-${index}`,
      kind: 'narrator',
      text: `Native Gacha V5 · ${scenario.toUpperCase()} · ação ${index + 1}`,
      x: -38 + (index % 4) * 25,
      y: -43 + Math.floor(index / 4) * 9,
      zIndex: title.zIndex + index,
    }
    activeTexts.push(element)
    studio.elements.push(element)
    timeline.textClips.push({ id: `stress-title-clip-${index}`, elementId: element.id, kind: 'narrator', startFrame: 0, endFrame: durationFrames })
  }
  for (const element of originalTexts) {
    const at = studio.elements.indexOf(element)
    if (at >= 0) studio.elements.splice(at, 1)
  }
  void originalTextClips

  if (profile.videos) {
    const assetId = options.assetId ?? 'gacha-stress-video'
    const asset = {
      id: assetId, name: 'video-importado-deterministico.mp4', mimeType: 'video/mp4', extension: 'mp4',
      size: options.videoBytes ?? 1, durationFrames,
    }
    const clip = {
      id: 'gacha-stress-video-clip', assetId, startFrame: 0, endFrame: durationFrames,
      sourceStartFrame: 0, sourceEndFrame: durationFrames,
      transform: { x: 22, y: 8, width: 36, height: 32, rotation: -2 },
      ...(options.audio ? { audio: { volume: 0.55, muted: false } } : {}),
    }
    timeline.videoAssets = [asset]
    timeline.videoClips = [clip]
    timeline.videoAudio = options.audio ? { volume: 0.8, muted: false } : { volume: 1, muted: true }
    if (options.videoPath) sourceByAssetId.set(assetId, options.videoPath)
  } else {
    timeline.videoAudio = { volume: 1, muted: true }
  }

  const activeCharacterIds = new Set(actors.map(element => element.id))
  const activeSpeechIds = new Set(timeline.textClips.filter(clip => clip.kind === 'speech').map(clip => clip.elementId))
  const activeTitleIds = new Set(activeTexts.map(element => element.id))
  studio.elements = studio.elements.filter(element =>
    (element.kind === 'character' && activeCharacterIds.has(element.id))
    || (element.kind === 'speech' && activeSpeechIds.has(element.id))
    || (element.kind === 'narrator' && activeTitleIds.has(element.id)))
  studio.videoTimeline = timeline
  bootstrap.snapshot.durationFrames = durationFrames
  bootstrap.snapshot.frameRate = 60
  bootstrap.snapshot.timeline = timeline
  bootstrap.snapshot.studio = studio
  bootstrap.renderVariant = 'animated'
  return {
    sourceByAssetId,
    counts: {
      scenario,
      characters: profile.characters,
      textElements: profile.texts,
      speechElements: profile.speaking ? profile.characters : 0,
      videoClips: profile.videos,
      transitions: timeline.characterKeys.length,
      transitionsPerCharacter: Math.floor((durationFrames - 1) / transitionSpacing),
      audio: options.audio === true && profile.videos > 0,
    },
  }
}

module.exports = { configureGachaStressScenario, scenarios }
