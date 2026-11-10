import type { EditorV6ExportAudio } from '../../../../shared/editorV6Export'
import { editorV6ExportFramesToSeconds, editorV6ExportSecondsToFrames } from './editorV6ExportTime'

type Props = {
  clips: EditorV6ExportAudio[]
  disabled: boolean
  onUpdate: (id: string, values: Partial<EditorV6ExportAudio>) => void
  onRemove: (id: string) => void
  onChooseFromLibrary: () => void
}

/** Audio export controls; document updates and library linking remain owned by the export panel. */
export function EditorV6ExportAudioSettings({ clips, disabled, onUpdate, onRemove, onChooseFromLibrary }: Props) {
  return (
    <fieldset className="v6-export-audio-settings" disabled={disabled}>
      <legend>Opções adicionais · trilha sonora</legend>
      <p>Os áudios são referenciados por ID na Biblioteca V6. A mixagem é aplicada uma única vez ao vídeo final.</p>
      {clips.length > 0 ? <div className="v6-export-audio-list">{clips.map((clip) => <div className="v6-export-audio" key={clip.id}>
        <strong title={clip.name}>{clip.name}</strong>
        <label>Começa na edição (s)<input type="number" min={0} step={1 / 30} value={editorV6ExportFramesToSeconds(clip.startFrame)} onChange={(event) => onUpdate(clip.id, { startFrame: editorV6ExportSecondsToFrames(event.target.value) })} /></label>
        <label>Início no arquivo (s)<input type="number" min={0} max={editorV6ExportFramesToSeconds(clip.sourceFrames - 1)} step={1 / 30} value={editorV6ExportFramesToSeconds(clip.sourceInFrame)} onChange={(event) => { const sourceInFrame = editorV6ExportSecondsToFrames(event.target.value, clip.sourceFrames - 1); onUpdate(clip.id, { sourceInFrame, durationFrames: Math.min(clip.durationFrames, clip.sourceFrames - sourceInFrame) }) }} /></label>
        <label>Duração (s)<input type="number" min={1 / 30} max={editorV6ExportFramesToSeconds(clip.sourceFrames - clip.sourceInFrame)} step={1 / 30} value={editorV6ExportFramesToSeconds(clip.durationFrames)} onChange={(event) => onUpdate(clip.id, { durationFrames: Math.max(1, editorV6ExportSecondsToFrames(event.target.value, clip.sourceFrames - clip.sourceInFrame)) })} /></label>
        <label>Volume (%)<input type="number" min={0} max={200} value={Math.round(clip.gain * 100)} onChange={(event) => onUpdate(clip.id, { gain: Math.min(2, Math.max(0, Number(event.target.value) / 100 || 0)) })} /></label>
        <label className="v6-export-check"><input type="checkbox" checked={clip.muted} onChange={(event) => onUpdate(clip.id, { muted: event.target.checked })} />Silenciar</label>
        <button type="button" onClick={() => onRemove(clip.id)}>Remover</button>
      </div>)}</div> : <div className="v6-export-audio-empty"><span aria-hidden="true">♫</span><div><strong>Nenhuma trilha adicionada</strong><small>Adicione áudio para mixar no arquivo final.</small></div></div>}
      <button className="v6-export-add-audio" type="button" disabled={clips.length >= 32} onClick={onChooseFromLibrary}>＋ Selecionar da biblioteca</button>
    </fieldset>
  )
}
