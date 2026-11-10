import { memo, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { EditorV6Document, EditorV6Timeline as Timeline, EditorV6TimelineBlock as Block, EditorV6TimelineTrack as Track } from '../../../../shared/editorV6'
import { orderEditorV6TimelineTracks, videoCharacterTrackColor } from '../../../../shared/editorV6'
import { frameTimecode } from '../../../../shared/editorV6TimelineCore'
import { editorV6VisibleMotionPlans } from './editorV6VisibleMotionPlans'
import { editorV6TimelineTrackFixedToBottom, editorV6TimelineTrackGroup, type TrackAction } from './editorV6TimelineTrackCommands'

const LABELS = { character: 'Personagem', speech: 'Fala', thought: 'Pensamento', object: 'Objetos', video: 'Vídeo', audio: 'Áudio' }

export type EditorV6TimelineRowsProps = {
  timeline: Timeline
  characterNameColors?: EditorV6Document['characterNameColors']
  pps: number
  width: number
  heading: number
  range: [number, number]
  selectedId: string | null
  onPointer: (event: ReactPointerEvent<HTMLElement>, track: Track, block: Block, mode: 'move' | 'resize') => void
  onSelect: (block: Block) => void
  onMenu: (x: number, y: number, track: Track, block: Block) => void
  onTrack: (track: Track, action: TrackAction, name?: string) => void
  onScrub: (event: ReactPointerEvent<HTMLElement>) => void
}

type DisplayRow = { key: string; track: Track; blocks: Block[]; backgroundLane: boolean; index: number }

/** Playback only moves the cursor overlay; these rows rerender on editing or scrolling. */
export const EditorV6TimelineRows = memo(function EditorV6TimelineRows({ timeline, characterNameColors, pps, width, heading, range, selectedId, onPointer, onSelect, onMenu, onTrack, onScrub }: EditorV6TimelineRowsProps) {
  const displayRows = useMemo<DisplayRow[]>(() => {
    const rows = orderEditorV6TimelineTracks(timeline.tracks).map((track, index) => ({ key: track.id, track, blocks: track.blocks.filter((block) => !block.background), backgroundLane: false, index }))
    const track = timeline.tracks.find((candidate) => candidate.kind === 'video') ?? { id: 'editor-v6-background-source', kind: 'video' as const, name: 'Vídeo', muted: false, locked: false, blocks: [] }
    rows.push({ key: `background:${track.id}`, track, blocks: track.blocks.filter((block) => Boolean(block.background)), backgroundLane: true, index: timeline.tracks.length })
    return rows
  }, [timeline])
  const sortedTracks = useMemo(() => new Map(displayRows.map(({ key, blocks }) => [key, [...blocks].sort((a, b) => a.startFrame - b.startFrame)])), [displayRows])
  const transitions = useMemo(() => new Map(displayRows.map(({ key, track }) => [key, editorV6VisibleMotionPlans(track, sortedTracks.get(key)!, range)])), [displayRows, sortedTracks, range])
  const [renameId, setRenameId] = useState<string | null>(null)
  const canMoveTrack = (index: number, direction: -1 | 1) => {
    if (editorV6TimelineTrackFixedToBottom(displayRows[index].track)) return false
    const neighbor = displayRows[index + direction]
    return Boolean(neighbor && editorV6TimelineTrackGroup(displayRows[index].track) === editorV6TimelineTrackGroup(neighbor.track))
  }

  return <>{displayRows.map(({ key, track, backgroundLane, index }) => <div className={`editor-v6-timeline-track${track.hidden || track.muted ? ' muted' : ''}${!backgroundLane && track.collapsed ? ' collapsed' : ''}`} key={key} style={{ gridTemplateColumns: `${heading}px ${width}px` }}>
    <div className="editor-v6-timeline-track-heading">
      {!backgroundLane && <button type="button" className="v6-track-collapse" onClick={() => onTrack(track, 'collapsed')} title={track.collapsed ? 'Expandir faixa' : 'Recolher faixa'}>{track.collapsed ? '▸' : '▾'}</button>}
      {backgroundLane ? <strong title="Estados do fundo">Fundo</strong> : renameId === track.id ? <input className="v6-track-name" autoFocus defaultValue={track.name} maxLength={80} onBlur={(event) => { const name = event.currentTarget.value.trim(); if (name && name !== track.name) onTrack(track, 'rename', name); setRenameId(null) }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenameId(null) }} /> : <strong title={`${track.name} · ${LABELS[track.kind]} · Duplo clique para renomear`} onDoubleClick={() => setRenameId(track.id)}>{track.name}</strong>}
      {!backgroundLane && <div className="editor-v6-track-actions">
        {track.kind === 'character' && <button type="button" aria-pressed={track.motionEnabled !== false} disabled={track.locked} onClick={() => onTrack(track, 'motion')} title="Animar trocas de pose e expressão nesta faixa (250 ms)">{track.motionEnabled === false ? '◇' : '◆'}</button>}<button type="button" onClick={() => onTrack(track, 'add')} disabled={track.locked} title="Adicionar bloco no cursor">＋</button>
        <button type="button" onClick={() => onTrack(track, 'hidden')} title={track.hidden || track.muted ? 'Mostrar faixa' : 'Ocultar faixa'}>{track.hidden || track.muted ? '◌' : '◉'}</button>
        <button type="button" onClick={() => onTrack(track, 'locked')} title={track.locked ? 'Desbloquear faixa' : 'Bloquear faixa'}>{track.locked ? '▣' : '▢'}</button>
        {!editorV6TimelineTrackFixedToBottom(track) && <>
          <button type="button" onClick={() => onTrack(track, 'up')} disabled={!canMoveTrack(index, -1) || track.locked} title="Mover faixa para cima">↑</button>
          <button type="button" onClick={() => onTrack(track, 'down')} disabled={!canMoveTrack(index, 1) || track.locked} title="Mover faixa para baixo">↓</button>
        </>}
      </div>}
    </div>
    <div className="editor-v6-timeline-lane" style={{ width, backgroundSize: `${pps}px 100%` }} onPointerDown={onScrub}>
      {transitions.get(key)!.map((plan) => <i key={`motion-${plan.blockId}`} className="v6-motion-range" style={{ left: plan.startFrame / 30 * pps, width: (plan.endFrame - plan.startFrame) / 30 * pps }} />)}
      {sortedTracks.get(key)!.filter((block) => block.startFrame <= range[1] && block.startFrame + block.durationFrames >= range[0]).map((block) => {
        const characterId = block.state?.characterId ?? block.characterId ?? track.characterId
        const characterColor = characterId ? characterNameColors?.[characterId] ?? videoCharacterTrackColor(characterId) : undefined
        return <div key={block.id}
        className={`editor-v6-timeline-block kind-${backgroundLane ? 'background' : track.kind}${selectedId === block.id ? ' selected' : ''}${track.locked ? ' locked' : ''}`}
        style={{ left: block.startFrame / 30 * pps, width: Math.max(3, block.durationFrames / 30 * pps), ...(characterColor ? { borderColor: characterColor, background: `linear-gradient(180deg, ${characterColor}28, ${characterColor}16)` } : {}) }}
        tabIndex={0} role="button" aria-label={`${block.label}, ${frameTimecode(block.startFrame)}, duração ${frameTimecode(block.durationFrames)}`}
        title={`${block.label}\nInício ${frameTimecode(block.startFrame)} · Fim ${frameTimecode(block.startFrame + block.durationFrames)} · Duração ${frameTimecode(block.durationFrames)}`}
        onPointerDown={(event) => { if (event.button === 0) onPointer(event, track, block, 'move'); else event.stopPropagation() }}
        onClick={(event) => { event.stopPropagation(); onSelect(block) }} onKeyDown={(event) => { if (event.key === 'Enter') onSelect(block) }}
        onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onMenu(event.clientX, event.clientY, track, block) }}>
        <span>{block.state?.visible === false ? '◌ ' : ''}{block.parentBlockId ? '↳ ' : ''}{block.label}</span>
        {(backgroundLane || !track.collapsed) && <small>{frameTimecode(block.durationFrames)}</small>}
        <i className="editor-v6-timeline-resize" onPointerDown={(event) => onPointer(event, track, block, 'resize')} aria-label="Alterar duração" />
      </div>
      })}
    </div>
  </div>)}</>
})
