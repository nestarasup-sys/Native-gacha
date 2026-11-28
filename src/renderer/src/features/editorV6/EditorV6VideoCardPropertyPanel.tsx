import type { EditorV6TimelineBlock } from '../../../../shared/editorV6'
import { editorV6CardRoles, editorV6CardContextSchema, type EditorV6CardComponents } from '../../../../shared/editorV6Cards'
import { EDITOR_V6_TIMELINE_FPS as FPS } from '../../../../shared/editorV6Timing'
import type { EditorV6PropertyPanelProps } from './editorV6PropertyPanelTypes'
import { Icon } from '../../ui/components/Icon'

type Props = {
  block: EditorV6TimelineBlock
  videoStartFrame?: number
  locked: boolean
  control: EditorV6PropertyPanelProps['control']
  onUpdate: EditorV6PropertyPanelProps['onUpdateVideoCard']
  onDelete: EditorV6PropertyPanelProps['onDeleteSelected']
}

const titles = { temporal: 'Card superior', english: 'Card inferior em inglês', portuguese: 'Card inferior em português' }

export function EditorV6VideoCardPropertyPanel({ block, videoStartFrame, locked, control, onUpdate, onDelete }: Props) {
  const card = block.videoCard
  if (!card || !('components' in card)) return null
  const offset = block.startFrame - (videoStartFrame ?? block.startFrame)
  const update = <K extends keyof EditorV6CardComponents>(role: K, item: EditorV6CardComponents[K], record = true) =>
    onUpdate?.(block.id, { videoCard: { ...card, components: { ...card.components, [role]: item } } }, record)

  return <div className="studio-side-content">
    <h2>Card selecionado</h2>
    <small>{videoStartFrame === undefined ? 'Vídeo de origem indisponível. Tempos relativos ao bloco.' : 'Tempos em segundos desde o início do vídeo. Use a timeline para mover ou redimensionar o bloco.'}</small>
    {editorV6CardRoles.map(role => {
      const item = card.components[role]
      const start = Math.min(item.startFrame, block.durationFrames - 1)
      const end = Math.min(item.endFrame, block.durationFrames)
      const seconds = (frame: number) => (offset + frame) / FPS
      const frame = (value: number) => Math.round(value * FPS) - offset
      return <fieldset className="studio-card-editor" key={role} disabled={locked}>
        <legend>{titles[role]}</legend>
        <label className="studio-card-visibility"><input type="checkbox" checked={item.enabled} onChange={event => update(role, { ...item, enabled: event.target.checked })} /> Exibir</label>
        {role === 'temporal' ? <label>Contexto temporal<select value={item.text} onChange={event =>
          update('temporal', { ...card.components.temporal, text: editorV6CardContextSchema.parse(event.target.value) })}>
          {editorV6CardContextSchema.options.map(context => <option key={context}>{context}</option>)}
        </select></label> : <label>Texto<textarea maxLength={240} value={item.text}
          onFocus={() => onUpdate?.(block.id, {}, true)}
          onChange={event => update(role, { ...item, text: event.target.value }, false)} /></label>}
        {control('Início', seconds(start), (value, record) => update(role, { ...item, startFrame: Math.max(0, Math.min(end - 1, frame(value))), endFrame: end }, record), seconds(0), seconds(end - 1), ' s', undefined, locked, 3)}
        {control('Fim', seconds(end), (value, record) => update(role, { ...item, startFrame: start, endFrame: Math.max(start + 1, Math.min(block.durationFrames, frame(value))) }, record), seconds(start + 1), seconds(block.durationFrames), ' s', undefined, locked, 3)}
        {control('Duração', (end - start) / FPS, (value, record) => update(role, { ...item, startFrame: start, endFrame: Math.min(block.durationFrames, start + Math.max(1, Math.round(value * FPS))) }, record), 1 / FPS, (block.durationFrames - start) / FPS, ' s', undefined, locked, 3)}
      </fieldset>
    })}
    <button className="studio-side-danger" type="button" disabled={locked} onClick={onDelete}><Icon name="trash" />Remover card da timeline</button>
  </div>
}
