import { memo, type Dispatch, type SetStateAction } from 'react'
import type { EditorV6TimelineTrack as Track } from '../../../../shared/editorV6'
import type { TrackAction } from './editorV6TimelineTrackCommands'
import type { EditorV6TimelineDisplayRow } from './editorV6TimelineRowsModel'

const LABELS = { character: 'Personagem', speech: 'Fala', thought: 'Pensamento', object: 'Objetos', video: 'Vídeo', audio: 'Áudio' }

type Props = {
  row: EditorV6TimelineDisplayRow
  renameId: string | null
  setRenameId: Dispatch<SetStateAction<string | null>>
  onTrack: (track: Track, action: TrackAction, name?: string) => void
}

export const EditorV6TimelineTrackHeader = memo(function EditorV6TimelineTrackHeader({ row, renameId, setRenameId, onTrack }: Props) {
  const { track, backgroundLane } = row

  return <div className="editor-v6-timeline-track-heading">
    {!backgroundLane && <button type="button" className="v6-track-collapse" onClick={() => onTrack(track, 'collapsed')} title={track.collapsed ? 'Expandir faixa' : 'Recolher faixa'}>{track.collapsed ? '▸' : '▾'}</button>}
    {backgroundLane ? <strong title="Estados do fundo">Fundo</strong> : renameId === track.id ? <input className="v6-track-name" autoFocus defaultValue={track.name} maxLength={80} onBlur={(event) => { const name = event.currentTarget.value.trim(); if (name && name !== track.name) onTrack(track, 'rename', name); setRenameId(null) }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenameId(null) }} /> : <strong title={`${track.name} · ${LABELS[track.kind]} · Duplo clique para renomear`} onDoubleClick={() => setRenameId(track.id)}>{track.name}</strong>}
  </div>
})
