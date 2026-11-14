import type { EditorV6Document, EditorV6Element } from './editorV6'
import { EDITOR_V6_REACT_IMPORT_FORMAT, editorV6ReactImportSchema, type EditorV6ReactImport } from './editorV6ReactImport'

/** Converts the authored timeline to the editable react interchange format. */
export function exportEditorV6React(project: EditorV6Document): { data: EditorV6ReactImport; warnings: string[] } {
  const warnings = new Set<string>()
  const elements = new Map(project.elements.map(element => [element.id, element]))
  const characters = new Map<string, EditorV6Element>()
  const tracks = project.timeline.tracks.filter(track => !track.hidden && !track.muted)
  for (const element of project.elements) if (element.kind === 'character' && element.characterId && element.visible !== false) {
    if (characters.has(element.characterId)) warnings.add('Personagens repetidos no elenco não são suportados pelo formato de roteiro.')
    else characters.set(element.characterId, element)
  }
  const cast: EditorV6ReactImport['cast'] = []
  for (const [id, element] of characters) {
    const track = tracks.find(item => item.kind === 'character' && item.characterId === id)
    const initial = track?.blocks.filter(block => block.state && block.startFrame === 0).sort((a, b) => a.id.localeCompare(b.id))[0]?.state ?? element
    const localGaze = initial.activeExpressionGaze
    const gaze = localGaze && initial.flipX ? (localGaze === 'left' ? 'right' : 'left') : localGaze
    cast.push({ character: id, x: initial.x, y: initial.y, scale: initial.characterScale ?? 121, flipX: Boolean(initial.flipX),
      ...(initial.poseSlot !== undefined ? { poseSlot: initial.poseSlot } : {}),
      ...(initial.activeExpressionPresetId ? { expression: initial.activeExpressionPresetId } : {}), ...(gaze ? { gaze } : {}) })
    if ((initial.characterScale ?? 121) !== 121 || (initial.characterWidthScale ?? 100) !== 100 || (initial.characterHeightScale ?? 100) !== 100 || initial.rotation !== 0) warnings.add('Escala ou rotação personalizada de personagem pode mudar na reimportação.')
  }
  const beats: EditorV6ReactImport['beats'] = []
  const lines: EditorV6ReactImport['lines'] = []
  const videos: EditorV6ReactImport['videos'] = []
  for (const track of tracks) for (const block of track.blocks) {
    const state = block.state ?? (block.elementId ? elements.get(block.elementId) : undefined)
    if (track.kind === 'character') {
      if (block.startFrame === 0 || !state?.characterId || !characters.has(state.characterId)) continue
      const initial = characters.get(state.characterId)!
      if (block.emptyGap) { warnings.add('Lacunas de personagem não são representadas no formato de roteiro.'); continue }
      if (state.x !== initial.x || state.y !== initial.y || state.rotation !== initial.rotation || state.flipX !== initial.flipX) warnings.add('Mudanças de posição, rotação ou espelhamento durante a timeline não são representadas no formato de roteiro.')
      const localGaze = state.activeExpressionGaze
      const gaze = localGaze && initial.flipX ? (localGaze === 'left' ? 'right' : 'left') : localGaze
      beats.push({ character: state.characterId, startSeconds: block.startFrame / 30,
        ...(state.poseSlot !== undefined ? { poseSlot: state.poseSlot } : {}),
        ...(state.activeExpressionPresetId ? { expression: state.activeExpressionPresetId } : {}), ...(gaze ? { gaze } : {}) })
    } else if (track.kind === 'speech' || track.kind === 'thought') {
      const character = block.characterId ?? state?.characterId
      if (!character || !characters.has(character) || !state?.text) { warnings.add('Um balão sem personagem vinculado ou texto não foi incluído.'); continue }
      lines.push({ character, kind: track.kind, text: state.text, startSeconds: block.startFrame / 30, durationSeconds: block.durationFrames / 30,
        x: state.x, y: state.y, width: state.width, height: state.height })
    } else if (track.kind === 'video') {
      const media = project.media?.find(item => item.id === block.mediaId)
      if (!media?.libraryVideoId) { warnings.add('Um vídeo local sem vínculo com a Base de Vídeos não foi incluído.'); continue }
      if (block.mediaInFrame) warnings.add('Cortes no início do vídeo não são representados no formato de roteiro.')
      videos.push({ videoId: media.libraryVideoId, startSeconds: block.startFrame / 30, durationSeconds: block.durationFrames / 30,
        ...(block.mediaLayout ? { layout: block.mediaLayout } : {}) })
    } else if (track.blocks.length) warnings.add('Trilhas de áudio e objetos não são representadas no formato de roteiro.')
  }
  if ((project.exportAudio ?? []).length) warnings.add('Áudios de exportação não são representados no formato de roteiro.')
  if (project.elements.some(element => element.kind === 'image' || element.kind === 'narrator')) warnings.add('Objetos e textos sem personagem não são representados no formato de roteiro.')
  const background = project.assets.find(asset => asset.id === project.backgroundAssetId)
  if (project.backgroundAssetId && !background?.libraryBackgroundId && !background?.libraryAssetId) warnings.add('A imagem de fundo local não é representada no formato de roteiro.')
  const data = editorV6ReactImportSchema.parse({ format: EDITOR_V6_REACT_IMPORT_FORMAT, title: project.title, seed: 1, backgroundColor: project.backgroundColor,
    ...(background?.libraryBackgroundId || background?.libraryAssetId ? { backgroundLibraryId: background.libraryBackgroundId ?? background.libraryAssetId } : {}),
    autoPoseEverySeconds: 0, autoListenerGaze: false, cast, videos, lines, beats, durationSeconds: project.timeline.durationFrames / 30 })
  return { data, warnings: [...warnings] }
}
