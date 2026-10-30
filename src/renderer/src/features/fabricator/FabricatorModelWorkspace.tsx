import type { FabricatorHistoryState, FabricatorProject, FabricatorSlotSummary } from '../../../../shared/fabricator'
import { Icon } from '../../ui/components/Icon'
import { FabricatorModelCanvas, type FabricatorModelCanvasProps } from './FabricatorModelCanvas'
import { FabricatorModelPanel, type FabricatorModelPanelProps } from './FabricatorModelPanel'
import { ModelSkinTonePicker } from './ModelSkinTonePicker'
import { MAX_CHROMA_TOLERANCE } from './models/modelSource'

type ModelSaveState = 'saved' | 'saving' | 'error'

type SlotActions = {
  select: (slot: number) => void
  delete: (slot: number) => void
  duplicate: () => void
  import: (slot: number) => void
}

type ModelActions = {
  undo: () => void
  redo: () => void
  chromaValueChange: (value: number) => void
  applyChroma: () => void
  openSourceEditor: () => void
  reset: () => void
  toggleMixer: () => void
  clearMixerStroke: () => void
  toggleJointPivots: () => void
  toggleThighDeformation: () => void
  resetTemporaryThighDeformation: () => void
  thighDeformationRadiusChange: (value: number) => void
  thighDeformationStrengthChange: (value: number) => void
  selectSkinTone: (tone: string) => void
  selectOutlineColor: (color: string | undefined) => void
  editFakeContours: () => void
  dismissError: () => void
}

export type FabricatorModelWorkspaceProps = {
  slots: FabricatorSlotSummary[]
  activeSlot: number
  project: FabricatorProject | null
  slotSwitching: boolean
  deletingSlot: number | null
  processing: boolean
  progress: number
  chromaApplying: boolean
  historyBusy: boolean
  modelSourcePublishing: boolean
  saveState: ModelSaveState
  history: FabricatorHistoryState
  chromaValue: number
  showJointPivots: boolean
  mixerActive: boolean
  thighDeformationActive: boolean
  hasTemporaryThighDeformation: boolean
  canDeformThigh: boolean
  thighDeformationRadius: number
  thighDeformationStrength: number
  error: string
  canvas: FabricatorModelCanvasProps | null
  panel: FabricatorModelPanelProps | null
  actions: SlotActions & ModelActions
}

export function FabricatorModelWorkspace({
  slots,
  activeSlot,
  project,
  slotSwitching,
  deletingSlot,
  processing,
  progress,
  chromaApplying,
  historyBusy,
  modelSourcePublishing,
  saveState,
  history,
  chromaValue,
  showJointPivots,
  mixerActive,
  thighDeformationActive,
  hasTemporaryThighDeformation,
  canDeformThigh,
  thighDeformationRadius,
  thighDeformationStrength,
  error,
  canvas,
  panel,
  actions
}: FabricatorModelWorkspaceProps) {
  const activeSlotSummary = slots[activeSlot - 1]
  const renderEmptyState = () => (
    <div className="model-empty-state">
      <div className="model-empty-symbol"><Icon name="sparkles" /></div>
      <p className="model-eyebrow">{activeSlotSummary?.recoveryRequired ? 'RECUPERAÇÃO DO MODEL SOURCE' : 'BIBLIOTECA DE MODELOS'}</p>
      <h1>{activeSlotSummary?.recoveryRequired ? 'Este slot precisa de uma decisão' : activeSlotSummary ? 'Abrindo projeto…' : 'Sua mesa de montagem'}</h1>
      <p>{activeSlotSummary?.recoveryRequired
        ? 'Foram encontrados vários backups válidos e o app não escolheu um automaticamente. Use “Excluir recuperação” para apagar permanentemente apenas os arquivos deste slot.'
        : 'Importe uma folha de peças. O Nymi remove o fundo, recorta cada elemento e abre o canvas para você montar e articular o modelo.'}</p>
      {!activeSlotSummary?.recoveryRequired && <button className="model-primary-button" onClick={() => actions.import(activeSlot)} type="button"><Icon name={activeSlotSummary ? 'reset' : 'plus'} /> {activeSlotSummary ? 'Reimportar imagem' : 'Importar imagem'}</button>}
      <span className="model-supported-formats">PNG · JPG · WEBP · processamento local</span>
    </div>
  )

  return (
    <section className="fabricator-model-editor" aria-label="Editor de modelos">
      <header className="model-slotbar">
        <div className="model-slot-title"><span className="model-slot-logo"><Icon name="sparkles" /></span><span><strong>Modelos</strong><small>10 espaços de trabalho</small></span></div>
        <div className="model-slots" role="tablist" aria-label="Slots de modelos">
          {slots.map((slot, index) => {
            const number = index + 1
            return <button key={number} className={`model-slot${activeSlot === number ? ' active' : ''}${slot ? ' filled' : ' empty'}`} onClick={() => actions.select(number)} disabled={deletingSlot !== null} role="tab" aria-selected={activeSlot === number} aria-label={`Slot ${number}, ${slot?.recoveryRequired ? 'recuperação pendente' : slot ? 'preenchido' : 'vazio'}`} title={slot ? `Slot ${number}: ${slot.name}${slot.recoveryRequired ? ' — vários backups válidos' : ` — ${slot.partCount} peças`}` : `Slot ${number}: vazio`} type="button">
              <span>{String(number).padStart(2, '0')}</span><small>{slot?.recoveryRequired ? 'Recuperação' : slot ? 'Preenchido' : 'Vazio'}</small>
            </button>
          })}
        </div>
        {activeSlotSummary && <button className="model-delete-compact" onClick={() => actions.delete(activeSlot)} disabled={slotSwitching || deletingSlot === activeSlot} title={activeSlotSummary.recoveryRequired ? 'Apagar permanentemente os backups e transações deste slot' : 'Excluir permanentemente este modelo'} type="button"><Icon name="trash" /><span>{deletingSlot === activeSlot ? 'Excluindo…' : activeSlotSummary.recoveryRequired ? 'Excluir recuperação' : 'Excluir modelo'}</span></button>}
        {project?.slot === activeSlot && <button className="model-duplicate-compact" onClick={actions.duplicate} disabled={slotSwitching || deletingSlot !== null || processing || chromaApplying || historyBusy || modelSourcePublishing} title="Criar uma cópia deste modelo em outro slot vazio" type="button"><Icon name="box" /><span>Duplicar modelo</span></button>}
        <button className="model-import-compact" onClick={() => actions.import(activeSlot)} disabled={Boolean(activeSlotSummary?.recoveryRequired) || slotSwitching || deletingSlot !== null || processing || chromaApplying || historyBusy || modelSourcePublishing} title={activeSlotSummary?.recoveryRequired ? 'Exclua a recuperação pendente antes de importar' : activeSlotSummary ? 'Substituir a imagem original preservando peças, poses, juntas e demais configurações' : 'Importar folha para este slot'} type="button"><Icon name={activeSlotSummary ? 'reset' : 'plus'} /><span>{activeSlotSummary?.recoveryRequired ? 'Recuperação' : activeSlotSummary ? 'Reimportar' : 'Importar'}</span></button>
      </header>

      {slotSwitching ? (
        <div className="model-editor-content model-editor-empty" aria-busy="true">
          <div className="model-processing"><div className="model-spinner" /><p className="model-eyebrow">BIBLIOTECA DE MODELOS</p><h2>Abrindo slot {String(activeSlot).padStart(2, '0')}…</h2><p>Salvando o projeto atual e carregando o próximo.</p></div>
        </div>
      ) : !project ? (
        <div className="model-editor-content model-editor-empty">
          {processing ? <div className="model-processing"><div className="model-spinner" /><p className="model-eyebrow">PROCESSANDO LOCALMENTE</p><h2>Separando as peças…</h2><p>Removendo o fundo e encontrando cada área da imagem.</p><div className="model-progress"><span style={{ width: `${progress}%` }} /></div><small>{progress}%</small></div> : renderEmptyState()}
        </div>
      ) : (
        <>
          <div className="model-editor-toolbar">
            <div className="model-history-controls" aria-label="Histórico de alterações">
              <button className="model-history-button" onClick={actions.undo} disabled={!history.undo.length || historyBusy || processing || chromaApplying} title={`Desfazer${history.undo.length ? ` — ${history.undo.length} alterações disponíveis` : ''}`} aria-label={`Desfazer, ${history.undo.length} alterações disponíveis`} type="button"><Icon name="undo" /></button>
              <button className="model-history-button" onClick={actions.redo} disabled={!history.redo.length || historyBusy || processing || chromaApplying} title={`Refazer${history.redo.length ? ` — ${history.redo.length} alterações disponíveis` : ''}`} aria-label={`Refazer, ${history.redo.length} alterações disponíveis`} type="button"><Icon name="redo" /></button>
              <small className="model-history-count" title="Histórico salvo localmente; mantém até 50 alterações">{history.undo.length}/50</small>
            </div>
            <div className="model-current-title" aria-label={`Modelo ${String(project.slot).padStart(2, '0')}`}><span className="model-eyebrow">MODELO {String(project.slot).padStart(2, '0')}</span></div>
            <div className="model-toolbar-actions">
              <span className={`model-save-state ${saveState}`}><i />{saveState === 'saving' ? 'Salvando…' : saveState === 'error' ? 'Erro ao salvar' : 'Salvo localmente'}</span>
              <div className="model-chroma-control">
                <div className="model-chroma-heading"><label htmlFor="model-chroma-range"><Icon name="sliders" />Chroma key</label><output htmlFor="model-chroma-range">{chromaValue}</output></div>
                <div className="model-chroma-adjust"><input id="model-chroma-range" aria-label="Intensidade do chroma key" type="range" min={project.chromaBaseTolerance ?? project.tolerance} max={MAX_CHROMA_TOLERANCE} value={Math.max(chromaValue, project.chromaBaseTolerance ?? project.tolerance)} disabled={chromaApplying || processing || historyBusy} onChange={(event) => actions.chromaValueChange(Number(event.target.value))} /><button className="model-chroma-apply" onClick={actions.applyChroma} disabled={chromaApplying || processing || historyBusy || chromaValue === project.tolerance} type="button">{chromaApplying ? 'Aplicando…' : 'Aplicar'}</button></div>
                <small>Arraste para ajustar em qualquer direção · Resetar restaura a importação</small>
              </div>
              <button className="model-tool-button" onClick={actions.openSourceEditor} disabled={processing || chromaApplying || historyBusy || modelSourcePublishing || saveState === 'error'} title="Alterar permanentemente a largura e a altura das peças na imagem de origem" type="button"><Icon name="edit" /><span>Editar imagem original</span></button>
              <button className="model-tool-button model-reset-button" onClick={actions.reset} disabled={processing || chromaApplying || historyBusy} title="Voltar o modelo inteiro ao estado da imagem importada" type="button"><Icon name="reset" /><span>{processing ? 'Resetando…' : 'Resetar'}</span></button>
              <button className={`model-tool-button model-mixer-toggle${mixerActive ? ' active' : ''}`} aria-pressed={mixerActive} onClick={actions.toggleMixer} disabled={processing || chromaApplying || historyBusy} title="Pinte sobre a junta: o pincel edita a peça visível mais alta, mesmo que outra esteja selecionada" type="button"><Icon name="brush" /><span>Misturador</span></button>
              <button className="model-tool-button model-mixer-clear" onClick={actions.clearMixerStroke} disabled={history.undo[history.undo.length - 1]?.action !== 'mixer' || historyBusy || processing || chromaApplying} title="Limpar o último traço do Misturador" aria-label="Limpar último traço do Misturador" type="button"><Icon name="eraser" /></button>
              <button className={`model-tool-button model-pivot-visibility${showJointPivots ? ' active' : ''}`} aria-pressed={showJointPivots} onClick={actions.toggleJointPivots} disabled={processing || chromaApplying || historyBusy} title={showJointPivots ? 'Ocultar bolinhas das juntas' : 'Mostrar bolinhas das juntas'} type="button"><Icon name={showJointPivots ? 'eye' : 'eyeOff'} /><span>{showJointPivots ? 'Ocultar bolinhas' : 'Mostrar bolinhas'}</span></button>
            </div>
          </div>
          <ModelSkinTonePicker value={project.modelSkinTone} outlineColor={project.modelOutlineColor} contourPartCount={project.parts.filter(part => part.fakeSkinContours?.length).length} disabled={processing || chromaApplying || historyBusy || modelSourcePublishing} thighDeformationActive={thighDeformationActive} hasTemporaryThighDeformation={hasTemporaryThighDeformation} thighDeformationDisabled={!canDeformThigh} thighDeformationRadius={thighDeformationRadius} thighDeformationStrength={thighDeformationStrength} onToggleThighDeformation={actions.toggleThighDeformation} onResetTemporaryThighDeformation={actions.resetTemporaryThighDeformation} onThighDeformationRadiusChange={actions.thighDeformationRadiusChange} onThighDeformationStrengthChange={actions.thighDeformationStrengthChange} onSelect={actions.selectSkinTone} onOutlineSelect={actions.selectOutlineColor} onEditContours={actions.editFakeContours} />
          <div className={`model-editor-content${processing || chromaApplying || historyBusy ? ' chroma-applying' : ''}`} aria-busy={processing || chromaApplying || historyBusy}>
            {canvas && <FabricatorModelCanvas {...canvas} />}
            {panel && <FabricatorModelPanel {...panel} />}
          </div>
        </>
      )}
      {error && <div className="model-toast" role="status"><span>{error}</span><button onClick={actions.dismissError} type="button" aria-label="Fechar aviso">×</button></div>}
      {processing && project && <div className="model-processing-overlay"><div className="model-spinner" /><span>Reanalisando imagem · {progress}%</span></div>}
    </section>
  )
}
