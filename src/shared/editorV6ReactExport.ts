import { editorV6CardMatchesVideo, type EditorV6ScriptCard } from './editorV6Cards'
import { migrateEditorV6CardBlocks } from './editorV6CardMigration'
import type { EditorV6Document, EditorV6Element, EditorV6TimelineTrack } from './editorV6'
import { EDITOR_V6_REACT_IMPORT_FORMAT, editorV6ReactImportSchema, type EditorV6ReactImport } from './editorV6ReactImport'
import { EDITOR_V6_TIMELINE_FPS, secondsToFrame } from './editorV6Timing'
import { compareEditorV6TimelineBlocks } from './editorV6TimelineCore'
import type { EditorV6ReactIntro } from './editorV6Intro'
import { editorV6PoseCharactersRequiringNumericSlots, type EditorV6PoseCategoryIndex } from './editorV6PoseCategories'
import { poseCategoryLabel } from './fabricator'

function poseFields(characterId: string, poseSlot: number | null | undefined, categories?: EditorV6PoseCategoryIndex,
  numericPoseCharacters?: ReadonlySet<string>, warnings?: Set<string>) {
  if (poseSlot === undefined) return {}
  if (numericPoseCharacters?.has(characterId)) {
    if (categories) warnings?.add('Um ou mais personagens usam poseSlot porque todos os seus estados de pose precisam permanecer no formato numérico legado.')
    return { poseSlot }
  }
  if (poseSlot === null) return { poseSlot: null }
  const category = categories?.get(characterId)?.get(poseSlot)
  if (category) return { poseCategory: poseCategoryLabel(category) }
  if (categories) warnings?.add('Um ou mais personagens usam poseSlot porque todos os seus estados de pose precisam permanecer no formato numérico legado.')
  return { poseSlot }
}

function exportVideoPresentation(presentation: NonNullable<EditorV6Document['timeline']['tracks'][number]['blocks'][number]['videoPresentation']>, warnings: Set<string>) {
  const result = { ...presentation }
  const visible = <T extends { startSeconds: number; endSeconds: number }>(items: T[] | undefined) => {
    const filtered = items?.filter(item => secondsToFrame(item.endSeconds) > secondsToFrame(item.startSeconds))
    if (items && filtered && filtered.length !== items.length) warnings.add('Um intervalo de card menor que um quadro foi omitido do roteiro exportado.')
    return filtered
  }
  const bottomCards = visible(result.bottomCards)
  if (bottomCards?.length) result.bottomCards = bottomCards
  else delete result.bottomCards
  const timeCards = visible(result.timeCards)
  if (timeCards?.length) result.timeCards = timeCards
  else delete result.timeCards
  return result
}

function attachTimelineCards(presentation: NonNullable<EditorV6Document['timeline']['tracks'][number]['blocks'][number]['videoPresentation']> | undefined,
  videoBlock: EditorV6Document['timeline']['tracks'][number]['blocks'][number], cards: EditorV6Document['timeline']['tracks'][number]['blocks'][number][], warnings: Set<string>) {
  const result = presentation ? exportVideoPresentation(presentation, warnings) : {}
  const relativeSeconds = (frame: number) => (frame - videoBlock.startFrame) / EDITOR_V6_TIMELINE_FPS
  const videoEnd = videoBlock.startFrame + videoBlock.durationFrames
  const scheduled = cards.flatMap(block => {
    const card = block.videoCard
    if (!card || !('components' in card) || !editorV6CardMatchesVideo(card, videoBlock)) return []
    const start = Math.max(videoBlock.startFrame, block.startFrame)
    const end = Math.min(videoEnd, block.startFrame + block.durationFrames)
    if (end <= start) return []
    const encode = <T extends { text: string; enabled: boolean; startFrame: number; endFrame: number }>(item: T) => {
      const from = Math.max(start, block.startFrame + item.startFrame)
      const to = Math.min(end, block.startFrame + item.endFrame)
      return { text: item.text as T['text'], enabled: to > from && item.enabled,
        startSeconds: relativeSeconds(to > from ? from : start), endSeconds: relativeSeconds(to > from ? to : end) }
    }
    const entry: EditorV6ScriptCard = { startSeconds: relativeSeconds(start), endSeconds: relativeSeconds(end),
      temporal: encode(card.components.temporal), english: encode(card.components.english), portuguese: encode(card.components.portuguese) }
    return [entry]
  })
  if (scheduled.length) return { loadingGif: result.loadingGif, cards: scheduled }
  return Object.keys(result).length ? result : undefined
}

function collectIntro(tracks: EditorV6TimelineTrack[], characters: ReadonlyMap<string, EditorV6Element>, categories: EditorV6PoseCategoryIndex | undefined,
  numericPoseCharacters: ReadonlySet<string> | undefined, warnings: Set<string>) {
  const entries: EditorV6ReactIntro = []
  let endFrame = 0
  const blocks = tracks.filter(track => track.kind === 'intro').flatMap(track => track.blocks).sort(compareEditorV6TimelineBlocks)
  const firstContent = tracks.filter(track => track.kind === 'speech' || track.kind === 'thought' || track.kind === 'video')
    .flatMap(track => track.blocks.filter(block => !block.background))
    .reduce((first, block) => Math.min(first, block.startFrame), Infinity)
  for (const block of blocks) {
    const { intro, startFrame, durationFrames } = block
    if (!intro) continue
    if (intro.kind === 'character' && !characters.has(intro.characterId)) {
      warnings.add('Uma apresentação de personagem fora do elenco foi omitida do roteiro.')
      continue
    }
    if (startFrame < endFrame || startFrame + durationFrames > firstContent || entries.length >= 1000) {
      warnings.add('A Intro foi omitida do roteiro porque os blocos se sobrepõem ou avançam sobre o conteúdo principal.')
      return { entries: [], endFrame: 0 }
    }
    const startSeconds = startFrame / EDITOR_V6_TIMELINE_FPS
    const durationSeconds = durationFrames / EDITOR_V6_TIMELINE_FPS
    if (intro.kind === 'black') entries.push({ kind: 'black', startSeconds, durationSeconds, text: intro.text })
    else {
      const previous = entries.at(-1)
      const part = { text: intro.text, englishText: intro.englishText, flipX: intro.flipX,
        expression: intro.expression ?? null,
        ...(intro.face ? { face: intro.face } : {}),
        ...poseFields(intro.characterId, intro.poseSlot, categories, numericPoseCharacters, warnings),
        ...(intro.portraitLayout ? { portraitLayout: intro.portraitLayout } : {}) }
      if (startFrame === endFrame && previous?.kind === 'character' && previous.character === intro.characterId && previous.parts.length < 100) {
        const startSecondsInPart = startSeconds - (previous.startSeconds ?? 0)
        previous.parts.push({ ...part, startSeconds: startSecondsInPart })
        previous.durationSeconds = startSecondsInPart + durationSeconds
      } else entries.push({ kind: 'character', character: intro.characterId, startSeconds, durationSeconds, parts: [{ ...part, startSeconds: 0 }] })
    }
    endFrame = startFrame + durationFrames
  }
  return { entries, endFrame }
}

/** Converts the authored timeline to the editable react interchange format. */
export function exportEditorV6React(project: EditorV6Document, categories?: EditorV6PoseCategoryIndex): { data: EditorV6ReactImport; warnings: string[] } {
  const warnings = new Set<string>()
  const numericPoseCharacters = categories ? editorV6PoseCharactersRequiringNumericSlots(project, categories) : undefined
  const elements = new Map(project.elements.map(element => [element.id, element]))
  const characters = new Map<string, EditorV6Element>()
  const tracks = project.timeline.tracks.filter(track => !track.hidden && !track.muted)
  for (const element of project.elements) if (element.kind === 'character' && element.characterId && element.visible !== false) {
    if (characters.has(element.characterId)) warnings.add('Personagens repetidos no elenco não são suportados pelo formato de roteiro.')
    else characters.set(element.characterId, element)
  }
  const { entries: intro, endFrame: contentStartFrame } = collectIntro(tracks, characters, categories, numericPoseCharacters, warnings)
  const contentSeconds = (frame: number) => (frame - contentStartFrame) / EDITOR_V6_TIMELINE_FPS
  const cast: EditorV6ReactImport['cast'] = []
  for (const [id, element] of characters) {
    const track = tracks.find(item => item.kind === 'character' && item.characterId === id)
    const initial = track?.blocks.filter(block => block.state && block.startFrame <= contentStartFrame)
      .sort((a, b) => b.startFrame - a.startFrame || a.id.localeCompare(b.id))[0]?.state ?? element
    const localGaze = initial.activeExpressionGaze
    const gaze = localGaze && initial.flipX ? (localGaze === 'left' ? 'right' : 'left') : localGaze
    cast.push({ character: id, x: initial.x, y: initial.y, scale: initial.characterScale ?? 121, flipX: Boolean(initial.flipX),
      ...poseFields(id, initial.poseSlot, categories, numericPoseCharacters, warnings),
      ...(initial.activeExpressionPresetId ? { expression: initial.activeExpressionPresetId } : {}), ...(gaze ? { gaze } : {}) })
    if ((initial.characterScale ?? 121) !== 121 || (initial.characterWidthScale ?? 100) !== 100 || (initial.characterHeightScale ?? 100) !== 100 || initial.rotation !== 0) warnings.add('Escala ou rotação personalizada de personagem pode mudar na reimportação.')
  }
  const beats: EditorV6ReactImport['beats'] = []
  const lines: EditorV6ReactImport['lines'] = []
  const videos: EditorV6ReactImport['videos'] = []
  const cardBlocks = tracks.filter(track => track.kind === 'card').flatMap(track => migrateEditorV6CardBlocks(track.blocks)).sort(compareEditorV6TimelineBlocks)
  for (const track of tracks) for (const block of track.blocks) {
    const state = block.state ?? (block.elementId ? elements.get(block.elementId) : undefined)
    if (track.kind === 'character') {
      if (block.startFrame <= contentStartFrame || !state?.characterId || !characters.has(state.characterId)) continue
      const initial = characters.get(state.characterId)!
      if (block.emptyGap) { warnings.add('Lacunas de personagem não são representadas no formato de roteiro.'); continue }
      if (state.x !== initial.x || state.y !== initial.y || state.rotation !== initial.rotation || state.flipX !== initial.flipX) warnings.add('Mudanças de posição, rotação ou espelhamento durante a timeline não são representadas no formato de roteiro.')
      const localGaze = state.activeExpressionGaze
      const gaze = localGaze && initial.flipX ? (localGaze === 'left' ? 'right' : 'left') : localGaze
      beats.push({ character: state.characterId, startSeconds: contentSeconds(block.startFrame),
        ...poseFields(state.characterId, state.poseSlot, categories, numericPoseCharacters, warnings),
        ...(state.activeExpressionPresetId ? { expression: state.activeExpressionPresetId } : {}), ...(gaze ? { gaze } : {}) })
    } else if (track.kind === 'speech' || track.kind === 'thought') {
      const character = block.characterId ?? state?.characterId
      if (!character || !characters.has(character) || !state?.text) { warnings.add('Um balão sem personagem vinculado ou texto não foi incluído.'); continue }
      lines.push({ character, kind: track.kind, text: state.text, ...(state.englishText !== undefined ? { englishText: state.englishText } : {}), startSeconds: contentSeconds(block.startFrame), durationSeconds: block.durationFrames / EDITOR_V6_TIMELINE_FPS,
        x: state.x, y: state.y, width: state.width, height: state.height })
    } else if (track.kind === 'video') {
      const media = project.media?.find(item => item.id === block.mediaId)
      if (!media?.libraryVideoId) { warnings.add('Um vídeo local sem vínculo com a Base de Vídeos não foi incluído.'); continue }
      if (block.mediaInFrame) warnings.add('Cortes no início do vídeo não são representados no formato de roteiro.')
      const presentation = attachTimelineCards(block.videoPresentation, block, cardBlocks, warnings)
      videos.push({ videoId: media.libraryVideoId, startSeconds: contentSeconds(block.startFrame), durationSeconds: block.durationFrames / EDITOR_V6_TIMELINE_FPS,
        ...(block.mediaLayout ? { layout: block.mediaLayout } : {}),
        ...(presentation ? { presentation } : {}) })
    } else if (track.kind !== 'intro' && track.kind !== 'card' && track.blocks.length) warnings.add('Trilhas de áudio e objetos não são representadas no formato de roteiro.')
  }
  if ((project.exportAudio ?? []).length) warnings.add('Áudios de exportação não são representados no formato de roteiro.')
  if (project.elements.some(element => element.kind === 'image' || element.kind === 'narrator')) warnings.add('Objetos e textos sem personagem não são representados no formato de roteiro.')
  const background = project.assets.find(asset => asset.id === project.backgroundAssetId)
  if (project.backgroundAssetId && !background?.libraryBackgroundId && !background?.libraryAssetId) warnings.add('A imagem de fundo local não é representada no formato de roteiro.')
  const data = editorV6ReactImportSchema.parse({ format: EDITOR_V6_REACT_IMPORT_FORMAT, title: project.title, seed: 1, backgroundColor: project.backgroundColor,
    ...(background?.libraryBackgroundId || background?.libraryAssetId ? { backgroundLibraryId: background.libraryBackgroundId ?? background.libraryAssetId } : {}),
    ...(intro.length ? { intro } : {}), autoPoseEverySeconds: 0, autoListenerGaze: false, cast, videos, lines, beats, durationSeconds: contentSeconds(project.timeline.durationFrames) })
  return { data, warnings: [...warnings] }
}
