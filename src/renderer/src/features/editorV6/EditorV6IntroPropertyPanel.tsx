import type { TimelineClip } from '../../../../shared/editorV6TimelineCore'
import { EDITOR_V6_TIMELINE_FPS } from '../../../../shared/editorV6Timing'
import { resolveEditorV6IntroPortrait, type EditorV6IntroPortraitUpdate } from '../../../../shared/editorV6Intro'

export function EditorV6IntroPropertyPanel({ clip, onUpdate, onUpdatePortrait, onReplicate }: {
  clip: TimelineClip
  onUpdate: (id: string, field: 'text' | 'englishText', value: string) => void
  onUpdatePortrait: (id: string, values: EditorV6IntroPortraitUpdate, record?: boolean) => void
  onReplicate: (id: string, property: 'characterScale' | 'characterWidthScale' | 'characterHeightScale' | 'position' | 'rotation' | 'flipX') => void
}) {
  const { block, track } = clip
  const intro = block.intro
  if (!intro) return null
  const field = (name: 'text' | 'englishText', label: string, value: string) => <label className="studio-text-control">
    {label}
    <textarea key={name + value} defaultValue={value} disabled={track.locked} maxLength={800} rows={4}
      onBlur={(event) => {
        const next = event.currentTarget.value.trim()
        event.currentTarget.value = next || value
        if (next && next !== value) onUpdate(block.id, name, next)
      }} />
  </label>
  const portrait = intro.kind === 'character' ? resolveEditorV6IntroPortrait(intro) : null
  return <div className={portrait ? 'v6-intro-portrait-controls' : 'studio-side-content'}>
    <h2>{intro.kind === 'black' ? 'Tela preta' : 'Apresentação'}</h2>
    <small>Duração de {(block.durationFrames / EDITOR_V6_TIMELINE_FPS).toFixed(2)} s. Ajuste pelas bordas do bloco na timeline.</small>
    {intro.kind === 'character' && field('englishText', 'Inglês', intro.englishText)}
    {field('text', intro.kind === 'character' ? 'Português' : 'Texto central', intro.text)}
    {portrait && <>
      <label className="studio-color-control">Travar posição no palco
        <input type="checkbox" checked={portrait.positionLocked}
          onChange={event => onUpdatePortrait(block.id, { positionLocked: event.currentTarget.checked })} />
      </label>
      <div className="v6-intro-replicate-heading"><strong>Padronizar personagens</strong><small>Aplicar somente o ajuste escolhido a toda a Intro</small></div>
      <div className="v6-intro-replicate-grid">
      {([
        ['characterScale', 'Escala'], ['characterWidthScale', 'Largura'], ['characterHeightScale', 'Altura'],
        ['position', 'Posição X e Y'], ['rotation', 'Rotação'], ['flipX', 'Espelhamento']
      ] as const).map(([property, label]) => <button key={property} type="button"
        onClick={() => onReplicate(block.id, property)}><span>{label}</span><span aria-hidden="true">↗</span></button>)}
      </div>
    </>}
  </div>
}
