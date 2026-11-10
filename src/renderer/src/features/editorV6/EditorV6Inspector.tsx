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
      <header className="studio-inspector-tabs">
        <button className={tab === 'editor' ? 'active' : ''} onClick={onSelectEditor} type="button">Editor</button>
        <button className={tab === 'custom' && customView === 'face' ? 'active' : ''} onClick={onSelectCustom} type="button">Custom</button>
        <button className="studio-inspector-close" onClick={onClose} aria-label="Fechar inspector" title="Fechar" type="button">×</button>
      </header>
      <button className={`studio-inspector-presets${presetsActive ? ' active' : ''}`} onClick={onSelectPresets} type="button"><Icon name="sparkles" />Presets</button>
      <div className="studio-inspector-content">
        {tab === 'editor' ? editorPanel : presetsActive ? presetsPanel : facePanel}
      </div>
    </aside>
  )
}
