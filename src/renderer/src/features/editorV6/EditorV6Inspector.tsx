import type { ReactNode } from 'react'
import { Icon } from '../../ui/components/Icon'

type InspectorTab = 'editor' | 'custom'
type InspectorCustomView = 'face' | 'presets'

type Props = {
  side: 'left' | 'right'
  tab: InspectorTab
  customView: InspectorCustomView
  editorPanel: ReactNode
  facePanel: ReactNode
  presetsPanel: ReactNode
  onSelectEditor: () => void
  onSelectCustom: () => void
  onSelectPresets: () => void
  onClose: () => void
}

/** Inspector shell; tab state and all editor actions remain owned by EditorV6Page. */
export function EditorV6Inspector({
  side,
  tab,
  customView,
  editorPanel,
  facePanel,
  presetsPanel,
  onSelectEditor,
  onSelectCustom,
  onSelectPresets,
  onClose
}: Props) {
  const presetsActive = tab === 'custom' && customView === 'presets'

  return (
    <aside className={`studio-inspector studio-inspector-${side}`} aria-label="Inspector da cena" onPointerDown={(event) => event.stopPropagation()}>
      <header className="v6-inspector-heading">
        <h2>Inspetor</h2>
        <button onClick={onClose} aria-label="Fechar inspetor" title="Fechar" type="button"><Icon name="close" /></button>
      </header>
      <div className="v6-inspector-views" role="group" aria-label="Seções do inspetor">
        <button aria-pressed={tab === 'editor'} onClick={onSelectEditor} type="button">Editor</button>
        <button aria-pressed={tab === 'custom' && customView === 'face'} onClick={onSelectCustom} type="button">Rosto</button>
        <button aria-pressed={presetsActive} onClick={onSelectPresets} type="button">Presets</button>
      </div>
      <div className="studio-inspector-content">
        {tab === 'editor' ? editorPanel : presetsActive ? presetsPanel : facePanel}
      </div>
    </aside>
  )
}
