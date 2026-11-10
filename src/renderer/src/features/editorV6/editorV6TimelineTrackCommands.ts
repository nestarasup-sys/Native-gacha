import type { EditorV6Document, EditorV6Element, EditorV6Timeline as Timeline, EditorV6TimelineBlock as Block, EditorV6TimelineTrack as Track } from '../../../../shared/editorV6'
import { EDITOR_V6_DEFAULT_BLOCK_FRAMES, orderEditorV6TimelineTracks } from '../../../../shared/editorV6'
import { editorV6ClipAtFrame, normalizeEditorV6Timeline } from '../../../../shared/editorV6TimelineCore'

export type TrackAction = 'motion' | 'add' | 'hidden' | 'locked' | 'collapsed' | 'up' | 'down' | 'rename'

export function editorV6TimelineTrackGroup(track: Track): number {
  return track.kind === 'character' ? 1 : track.kind === 'object' || track.kind === 'audio' ? 2 : 0
}

export function editorV6TimelineTrackFixedToBottom(track: Track): boolean {
  return track.kind === 'object' || track.kind === 'audio'
}

type Dependencies = {
  getDocument: () => EditorV6Document
  getFrame: () => number
  changeTimeline: (update: (timeline: Timeline) => Timeline) => void
  changeDocument: (update: (document: EditorV6Document) => EditorV6Document) => void
  seek: (frame: number) => void
  select: (block: Block) => void
  setNotice: (notice: string) => void
  createId: () => string
}

/** Owns track mutations and block creation while the timeline component handles input/rendering. */
export function createEditorV6TimelineTrackCommands(dependencies: Dependencies) {
  const onTrack = (track: Track, action: TrackAction, name?: string): void => {
    if (action !== 'hidden' && action !== 'locked' && action !== 'collapsed' && track.locked) return
    if ((action === 'up' || action === 'down') && editorV6TimelineTrackFixedToBottom(track)) return

    if (action === 'add') {
      const document = dependencies.getDocument()
      const frame = dependencies.getFrame()
      dependencies.seek(frame)
      if (track.kind === 'audio') {
        dependencies.setNotice('Use Importar áudio para copiar uma mídia para o projeto e criar um bloco.')
        return
      }
      if (track.kind === 'character' && track.blocks.some((block) => block.startFrame === frame)) {
        dependencies.select(track.blocks.find((block) => block.startFrame === frame)!)
        return
      }

      const base = track.kind === 'character'
        ? document.elements.find((element) => element.characterId === track.characterId && element.kind === 'character')
        : track.kind === 'object'
          ? document.elements.filter((element) => element.kind === 'image').find((element) => editorV6ClipAtFrame(document.timeline, element.id, frame)) ?? document.elements.find((element) => element.kind === 'image')
          : track.kind === 'video' ? document.elements.find((element) => element.kind === 'narrator') : undefined
      if (track.kind === 'object' && !base) {
        dependencies.setNotice('Importe uma imagem em Objetos para criar um bloco.')
        return
      }
      if (track.kind === 'video' && !base) {
        dependencies.setNotice('Use Selecionar vídeo para adicionar clipes à faixa Vídeo.')
        return
      }

      const element: EditorV6Element = base ? { ...(editorV6ClipAtFrame(document.timeline, base.id, frame)?.block.state ?? base) } : {
        id: dependencies.createId(),
        kind: track.kind === 'thought' ? 'thought' : 'speech',
        text: 'Digite aqui', x: 0, y: 0, width: 28, height: 16, rotation: 0,
        zIndex: Math.max(0, ...document.elements.map((item) => item.zIndex)) + 1
      }
      const block: Block = {
        id: dependencies.createId(), elementId: element.id, state: { ...element }, label: element.text || track.name,
        startFrame: frame, durationFrames: EDITOR_V6_DEFAULT_BLOCK_FRAMES
      }
      dependencies.changeDocument((current) => ({
        ...current,
        elements: base ? current.elements : [...current.elements, element],
        timeline: normalizeEditorV6Timeline({
          ...current.timeline,
          durationFrames: Math.max(current.timeline.durationFrames, frame + block.durationFrames),
          knownElementIds: [...new Set([...(current.timeline.knownElementIds ?? []), element.id])],
          tracks: current.timeline.tracks.map((candidate) => candidate.id === track.id ? { ...candidate, blocks: [...candidate.blocks, block] } : candidate)
        })
      }))
      dependencies.select(block)
      return
    }

    dependencies.changeTimeline((current) => {
      if (action === 'up' || action === 'down') {
        const tracks = orderEditorV6TimelineTracks(current.tracks)
        const index = tracks.findIndex((candidate) => candidate.id === track.id)
        if (index < 0) return current
        const next = action === 'up' ? index - 1 : index + 1
        if (next >= 0 && next < tracks.length && editorV6TimelineTrackGroup(tracks[index]) === editorV6TimelineTrackGroup(tracks[next])) [tracks[index], tracks[next]] = [tracks[next], tracks[index]]
        return { ...current, tracks }
      }
      const tracks = current.tracks.map((candidate) => candidate.id !== track.id ? candidate : action === 'rename' ? { ...candidate, name: name ?? candidate.name } : action === 'hidden' ? { ...candidate, hidden: !(candidate.hidden || candidate.muted), muted: false } : action === 'motion' ? { ...candidate, motionEnabled: candidate.motionEnabled === false } : action === 'locked' || action === 'collapsed' ? { ...candidate, [action]: !candidate[action] } : candidate)
      return { ...current, tracks }
    })
  }

  return { onTrack }
}
