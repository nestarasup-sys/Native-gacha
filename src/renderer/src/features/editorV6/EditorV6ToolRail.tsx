import type { ReactNode } from 'react'
import { Icon } from '../../ui/components/Icon'
import { sceneEditorTools, type SceneTextElementKind } from '../../ui/sceneEditorDefaults'

type ToolId = typeof sceneEditorTools[number]['id']

type Props = {
  visible: boolean
  activeTool: ToolId | null
  canUndo: boolean
  canRedo: boolean
  saved: boolean
  faceAssetRefreshRequired: boolean
  characterSourceRefreshRequired: boolean
  selectedCharacterLabel: string | null
  error: string | null
  notice: string | null
  onBack: () => void
  onSave: () => void
  onUndo: () => void
  onRedo: () => void
  onSelectTool: (tool: ToolId) => void
  onAddText: (kind: SceneTextElementKind) => void
  onImportTimelineMedia: (kind: 'video' | 'audio') => void
  onOpenCastManager: () => void
  onExport: () => void
  onPrint: () => void
  onOpenPrints: () => void
  onEnterFullView: () => void
}

/** Renders Editor V6 actions; project state and command behavior stay in the page. */
export function EditorV6ToolRail({
  visible,
  activeTool,
  canUndo,
  canRedo,
  saved,
  faceAssetRefreshRequired,
  characterSourceRefreshRequired,
  selectedCharacterLabel,
  error,
  notice,
  onBack,
  onSave,
  onUndo,
  onRedo,
  onSelectTool,
  onAddText,
  onImportTimelineMedia,
  onOpenCastManager,
  onExport,
  onPrint,
  onOpenPrints,
  onEnterFullView
}: Props) {
  if (!visible) return null

  return (
    <aside className="studio-editor-rail studio-editor-left v6-tool-rail" aria-label="Ferramentas do Editor V6">
      <div className="studio-editor-quick-actions">
        <button className="studio-round-action" onClick={onBack} title="Salvar automaticamente e voltar" aria-label="Voltar para Editor V6" type="button"><span>←</span></button>
        <button className="studio-round-action" onClick={onSave} title="Salvar agora no computador" aria-label="Salvar Editor V6" type="button"><Icon name="save" /></button>

        <button className="studio-round-action" disabled={!canUndo} onClick={onUndo} title="Desfazer (Ctrl+Z)" aria-label="Desfazer" type="button"><Icon name="undo" /></button>
        <button className="studio-round-action" disabled={!canRedo} onClick={onRedo} title="Refazer (Ctrl+Y)" aria-label="Refazer" type="button"><Icon name="redo" /></button>
      </div>
      <nav className="v6-tool-groups" aria-label="Ferramentas da cena">
        <ToolGroup title="Cena">
          <button className="studio-tool-button" onClick={onOpenCastManager} type="button"><Icon name="user" /><span>Elenco</span></button>
          {sceneEditorTools.map((tool) => <button className={`studio-tool-button${activeTool === tool.id ? ' active' : ''}`} key={tool.id} onClick={() => onSelectTool(tool.id)} type="button"><Icon name={tool.icon} /><span>{tool.label}</span></button>)}
        </ToolGroup>
        <ToolGroup title="Texto">
          <button className="studio-tool-button" onClick={() => onAddText('narrator')} type="button"><Icon name="message" /><span>Narrador</span></button>
          <button className="studio-tool-button" onClick={() => onAddText('speech')} disabled={selectedCharacterLabel === null} title={selectedCharacterLabel !== null ? `Adicionar fala a ${selectedCharacterLabel}` : 'Selecione um personagem na cena'} aria-label="Adicionar fala ao personagem selecionado" type="button"><Icon name="message" /><span>Fala</span></button>
          <button className="studio-tool-button" onClick={() => onAddText('thought')} disabled={selectedCharacterLabel === null} title={selectedCharacterLabel !== null ? `Adicionar pensamento a ${selectedCharacterLabel}` : 'Selecione um personagem na cena'} aria-label="Adicionar pensamento ao personagem selecionado" type="button"><Icon name="face" /><span>Pensamento</span></button>
        </ToolGroup>
        <ToolGroup title="Mídia">
          <button className="studio-tool-button" onClick={() => onImportTimelineMedia('video')} type="button"><b>▣</b><span>Selecionar vídeo</span></button>
          <button className="studio-tool-button" onClick={() => onImportTimelineMedia('audio')} type="button"><b>♪</b><span>Selecionar áudio</span></button>
        </ToolGroup>
        <ToolGroup title="Exportação e visualização">
          <button className="studio-tool-button" onClick={onExport} disabled={characterSourceRefreshRequired} title={characterSourceRefreshRequired ? 'Sincronizando o Customizador com os snapshots do projeto' : undefined} type="button"><Icon name="download" /><span>{characterSourceRefreshRequired ? 'Atualizando personagem…' : 'Exportar MP4'}</span></button>
          <button className="studio-tool-button" onClick={onPrint} type="button"><Icon name="download" /><span>Capturar cena</span></button>
          <button className="studio-tool-button" onClick={onOpenPrints} type="button"><Icon name="folder" /><span>Abrir capturas</span></button>
          <button className="studio-tool-button studio-view-button" onClick={onEnterFullView} type="button"><Icon name="expand" /><span>Tela cheia</span></button>
        </ToolGroup>
      </nav>
      <small className={`studio-save-indicator${saved ? '' : ' unsaved'}`}><i />{saved ? 'Salvo automaticamente' : 'Salvando alterações…'}</small>
      {faceAssetRefreshRequired && <small className="studio-save-notice" role="status">Atualizando as aparências salvas para a prévia e a exportação usarem as fontes mais recentes.</small>}
      {error && <small className="studio-error-message" role="alert">{error}</small>}
      {notice && <small className="studio-save-notice" role="status">{notice}</small>}
    </aside>
  )
}

function ToolGroup({ title, children }: { title: string; children: ReactNode }) {
  return <section className="v6-tool-group" aria-label={title}>
    <h2>{title}</h2>
    <div className="studio-tool-list">{children}</div>
  </section>
}
