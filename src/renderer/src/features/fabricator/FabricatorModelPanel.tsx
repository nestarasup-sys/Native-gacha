import type { FabricatorProject, ModelPart } from '../../../../shared/fabricator'
import { Icon } from '../../ui/components/Icon'
import { headSizePercent, isHeadPart } from './models/resize'
import { isTorsoPart } from './models/rigEditing'

export type FabricatorPanelTab = 'parts' | 'layers' | 'joints'

type LayerDragRef = { current: string | null }

type FabricatorModelPanelActions = {
  addSheet: (slot: number) => void
  setTab: (tab: FabricatorPanelTab) => void
  setFilter: (filter: string) => void
  handlePartClick: (partId: string, toggle: boolean) => void
  rename: {
    begin: (partId: string) => void
    update: (partId: string, name: string) => void
    finish: () => void
  }
  transform: {
    setCoordinate: (partId: string, axis: 'x' | 'y', value: string) => void
    setRotation: (partId: string, value: string) => void
    restoreHeadSize: (partId: string) => void
    setHeadSize: (partId: string, axis: 'width' | 'height', value: number) => void
    startGesture: () => void
    finishGesture: () => void
  }
  removePart: (partId: string) => void
  splitSelected: (axis: 'horizontal' | 'vertical') => Promise<void>
  mergeSelected: () => Promise<void>
  layers: {
    dragRef: LayerDragRef
    setDragging: (partId: string | null) => void
    drop: (sourceId: string, targetId: string) => void
    select: (partId: string) => void
    move: (partId: string, direction: -1 | 1) => void
    toggleFix: (partId: string) => void
    toggleVisibility: (partId: string) => void
  }
  joints: {
    autoConnect: () => void
    toggleConnectMode: () => void
    rotateBranch: (jointId: string, degrees: number) => void
    disconnect: (jointId: string) => void
  }
}

export type FabricatorModelPanelProps = {
  project: FabricatorProject
  panelTab: FabricatorPanelTab
  filter: string
  visibleParts: ModelPart[]
  selectedPart: ModelPart | null
  selectedIds: string[]
  frontToBackLayers: ModelPart[]
  hiddenPartIds: string[]
  layerDragId: string | null
  renamingPartId: string | null
  connectMode: boolean
  contourConnecting: boolean
  jointConnectMessage: string
  processing: boolean
  chromaApplying: boolean
  historyBusy: boolean
  modelSourcePublishing: boolean
  partPreviewSource: (part: ModelPart) => string
  actions: FabricatorModelPanelActions
}

export function FabricatorModelPanel({
  project,
  panelTab,
  filter,
  visibleParts,
  selectedPart,
  selectedIds,
  frontToBackLayers,
  hiddenPartIds,
  layerDragId,
  renamingPartId,
  connectMode,
  contourConnecting,
  jointConnectMessage,
  processing,
  chromaApplying,
  historyBusy,
  modelSourcePublishing,
  partPreviewSource,
  actions
}: FabricatorModelPanelProps) {
  const hiddenIds = new Set(hiddenPartIds)

  return (
    <aside className="model-parts-panel model-work-panel" aria-label="Painel de edição">
      <div className="model-panel-header">
        <div>
          <span className="model-eyebrow">MONTAGEM</span>
          <h2>
            {panelTab === 'parts' ? 'Peças' : panelTab === 'layers' ? 'Camadas' : 'Articulações'}
            {' '}<small>{panelTab === 'joints' ? project.joints.length : project.parts.length}</small>
          </h2>
        </div>
        <button className="model-icon-button" title="Adicionar outra folha" onClick={() => actions.addSheet(project.slot)} type="button">
          <Icon name="plus" />
        </button>
      </div>
      <div className="model-panel-tabs" role="tablist" aria-label="Ferramentas do modelo">
        {([['parts', 'Peças'], ['layers', 'Camadas'], ['joints', 'Juntas']] as const).map(([tab, label]) => (
          <button key={tab} role="tab" aria-selected={panelTab === tab} className={panelTab === tab ? 'active' : ''} onClick={() => actions.setTab(tab)} type="button">
            {label}
          </button>
        ))}
      </div>
      {panelTab === 'parts' && <div className="model-panel-body">
        <label className="model-part-search">
          <Icon name="search" />
          <input placeholder="Buscar peça…" value={filter} onChange={(event) => actions.setFilter(event.target.value)} />
        </label>
        <div className="model-part-grid">
          {visibleParts.map((part) => (
            <button
              key={part.id}
              className={`model-part-card${selectedIds.includes(part.id) ? ' selected' : ''}`}
              onClick={(event) => actions.handlePartClick(part.id, event.ctrlKey || event.metaKey)}
              type="button"
              title={`${part.name} · selecione ou arraste no canvas`}
            >
              <span className="model-part-thumb"><img src={partPreviewSource(part)} alt="" /></span>
              <span className="model-part-card-name">{part.name}</span>
              <small>{Math.round(part.width)} × {Math.round(part.height)}</small>
            </button>
          ))}
          {visibleParts.length === 0 && <p className="model-no-parts">Nenhuma peça encontrada.</p>}
        </div>
        {selectedPart && <div className="model-selected-tools">
          <div className="model-selected-name">
            {renamingPartId === selectedPart.id
              ? <input
                autoFocus
                value={selectedPart.name}
                onBlur={actions.rename.finish}
                onChange={(event) => actions.rename.update(selectedPart.id, event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') actions.rename.finish() }}
              />
              : <><strong>{selectedPart.name}</strong><button title="Renomear peça" onClick={() => actions.rename.begin(selectedPart.id)} type="button"><Icon name="edit" /></button></>}
          </div>
          <div className="model-transform-controls">
            <strong>Transformação</strong>
            <label title={isTorsoPart(selectedPart) ? 'O tronco fica fixo como âncora da montagem.' : undefined}>
              X<input
                type="number"
                step="1"
                value={Number(selectedPart.x.toFixed(1))}
                disabled={isTorsoPart(selectedPart)}
                onChange={(event) => actions.transform.setCoordinate(selectedPart.id, 'x', event.target.value)}
              />
            </label>
            <label title={isTorsoPart(selectedPart) ? 'O tronco fica fixo como âncora da montagem.' : undefined}>
              Y<input
                type="number"
                step="1"
                value={Number(selectedPart.y.toFixed(1))}
                disabled={isTorsoPart(selectedPart)}
                onChange={(event) => actions.transform.setCoordinate(selectedPart.id, 'y', event.target.value)}
              />
            </label>
            <label>Rotação<input
              type="number"
              step="1"
              value={Number(selectedPart.rotation.toFixed(1))}
              onChange={(event) => actions.transform.setRotation(selectedPart.id, event.target.value)}
            /></label>
          </div>
          {isTorsoPart(selectedPart) && <small style={{ color: '#a9b5c4' }}>O tronco fica fixo como âncora; monte as demais peças ao redor dele.</small>}
          {isHeadPart(selectedPart) && <div className="model-head-resize">
            <div className="model-head-resize-heading">
              <div><strong>Formato da cabeça</strong><small>Ajuste cada direção sem soltar o encaixe do pescoço.</small></div>
              <button type="button" onClick={() => actions.transform.restoreHeadSize(selectedPart.id)}>Restaurar 100%</button>
            </div>
            {(['width', 'height'] as const).map((axis) => (
              <label className="model-head-resize-row" key={axis}>
                <span>{axis === 'width' ? 'Largura' : 'Altura'}</span>
                <input
                  type="range"
                  min="20"
                  max="300"
                  step="1"
                  value={headSizePercent(selectedPart, axis)}
                  onPointerDown={actions.transform.startGesture}
                  onPointerUp={actions.transform.finishGesture}
                  onPointerCancel={actions.transform.finishGesture}
                  onChange={(event) => actions.transform.setHeadSize(selectedPart.id, axis, Number(event.target.value))}
                />
                <span className="model-head-resize-number">
                  <input type="number" min="20" max="300" step="1" value={headSizePercent(selectedPart, axis)} onChange={(event) => actions.transform.setHeadSize(selectedPart.id, axis, Number(event.target.value))} />%
                </span>
              </label>
            ))}
          </div>}
          <div className="model-action-row">
            <button className="model-tool-button" onClick={() => void actions.splitSelected('vertical')} disabled={selectedPart.rotation !== 0 || selectedPart.width < 2} type="button">
              Dividir ↔
            </button>
            <button className="model-tool-button" onClick={() => void actions.splitSelected('horizontal')} disabled={selectedPart.rotation !== 0 || selectedPart.height < 2} type="button">
              Dividir ↕
            </button>
            <button className="model-tool-button danger" onClick={() => actions.removePart(selectedPart.id)} type="button">Excluir</button>
          </div>
          {selectedIds.length > 1 && <button className="model-merge-button" onClick={() => void actions.mergeSelected()} type="button">Mesclar {selectedIds.length} peças selecionadas</button>}
        </div>}
        <div className="model-source-info"><span><Icon name="frame" /> Fonte</span><small title={project.sourceName}>{project.sourceName}</small></div>
      </div>}
      {panelTab === 'layers' && <div className="model-panel-body model-layer-panel">
        <p className="model-panel-intro">
          Arraste uma linha ou use as setas. O item no topo fica na frente. Fixar cria uma conexão automática quando a peça ainda não tem uma e faz o encaixe acompanhar os próximos movimentos.
        </p>
        <div className="model-layer-list">
          {frontToBackLayers.map((part, index) => {
            const joint = project.joints.find((item) => item.childPartId === part.id)
            const fixed = Boolean(joint?.fixed)
            const canFix = !isTorsoPart(part) && project.parts.length > 1
            const selected = selectedIds.includes(part.id)
            const hidden = hiddenIds.has(part.id)
            const fixTitle = joint ? fixed ? 'Desfixar conexão' : 'Fixar conexão' : 'Criar conexão automática e fixar'
            const fixLabel = joint
              ? fixed ? `Desfixar ${part.name}` : `Fixar ${part.name}`
              : `Criar conexão automática e fixar ${part.name}`

            return (
              <div
                key={part.id}
                draggable
                className={`model-layer-row${selected ? ' selected' : ''}${layerDragId === part.id ? ' dragging' : ''}`}
                onDragStart={(event) => {
                  actions.layers.dragRef.current = part.id
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', part.id)
                  actions.layers.setDragging(part.id)
                }}
                onDragEnd={() => {
                  actions.layers.dragRef.current = null
                  actions.layers.setDragging(null)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const sourceId = event.dataTransfer.getData('text/plain') || actions.layers.dragRef.current
                  if (sourceId) actions.layers.drop(sourceId, part.id)
                  actions.layers.dragRef.current = null
                  actions.layers.setDragging(null)
                }}
              >
                <button className="model-layer-select" onClick={() => actions.layers.select(part.id)} type="button">
                  <span className="model-layer-thumb"><img src={partPreviewSource(part)} alt="" /></span>
                  <span>
                    <strong>{part.name}</strong>
                    <small>Camada {frontToBackLayers.length - index} · {hidden ? 'Oculta' : 'Visível'}{joint ? ` · ${fixed ? 'Fixada' : 'Solta'}` : ' · Sem junta'}</small>
                  </span>
                </button>
                <div className="model-layer-controls">
                  <button title="Mover para frente" aria-label={`Mover ${part.name} para frente`} disabled={index === 0} onClick={() => actions.layers.move(part.id, -1)} type="button">↑</button>
                  <button
                    title="Mover para trás"
                    aria-label={`Mover ${part.name} para trás`}
                    disabled={index === frontToBackLayers.length - 1}
                    onClick={() => actions.layers.move(part.id, 1)}
                    type="button"
                  >↓</button>
                  <button
                    className={`model-layer-fix${fixed ? ' fixed' : ''}`}
                    title={fixTitle}
                    aria-label={fixLabel}
                    aria-pressed={fixed}
                    disabled={!canFix}
                    onClick={() => actions.layers.toggleFix(part.id)}
                    type="button"
                  ><Icon name="link" /></button>
                  <button
                    title={hidden ? 'Mostrar peça' : 'Ocultar peça'}
                    aria-label={hidden ? `Mostrar ${part.name}` : `Ocultar ${part.name}`}
                    aria-pressed={!hidden}
                    onClick={() => actions.layers.toggleVisibility(part.id)}
                    type="button"
                  >{hidden ? '○' : '◉'}</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>}
      {panelTab === 'joints' && <div className="model-panel-body model-joint-panel">
        <button className="model-auto-connect" onClick={actions.joints.autoConnect} disabled={contourConnecting || processing || chromaApplying || historyBusy || modelSourcePublishing} type="button">
          <Icon name="sparkles" />
          <span><strong>{contourConnecting ? 'Corrigindo juntas…' : 'Conectar / corrigir automaticamente'}</strong><small>Reconhece antebraço/canela pelo nome e lado</small></span>
        </button>
        {jointConnectMessage && <p className="model-connect-hint" role="status">{jointConnectMessage}</p>}
        <button className={`model-tool-button model-manual-connect${connectMode ? ' active' : ''}`} onClick={actions.joints.toggleConnectMode} type="button">
          <span className="model-link-dot" />{connectMode ? 'Selecione duas peças no canvas' : 'Ligar peças manualmente'}
        </button>
        {connectMode && <p className="model-connect-hint">Clique primeiro na peça que ficará parada e depois na peça que ela movimenta.</p>}
        <p className="model-panel-intro">
          Cada peça conectada tem uma única bolinha. Todas as conexões dessa peça usam o mesmo pivô; selecione a peça para destacar e arraste essa bolinha. O tronco é o centro e não recebe bolinha.
        </p>
        <div className="model-joint-legend"><span><i className="loose" />Solta</span><span><i className="selected" />Selecionada</span><span><i className="fixed" />Fixada</span></div>
        <div className="model-joint-list">
          <div className="model-joint-list-heading"><strong>Conexões do esqueleto</strong><small>{project.joints.length}</small></div>
          {project.joints.length === 0
            ? <p className="model-joint-empty">Ainda não há conexões. Use a sugestão automática ou ligue duas peças manualmente.</p>
            : project.joints.map((joint) => {
              const parent = project.parts.find((part) => part.id === joint.parentPartId)
              const child = project.parts.find((part) => part.id === joint.childPartId)
              return (
                <div className="model-joint-row" key={joint.id}>
                  <span className="model-joint-row-name">
                    <b>{parent?.name ?? 'Peça'}</b><Icon name="chevronRight" /><b>{child?.name ?? 'Peça'}</b>
                    {joint.suggested && <small>AUTO</small>}
                  </span>
                  <span className="model-joint-controls">
                    <button title="Girar ramo à esquerda" onClick={() => actions.joints.rotateBranch(joint.id, -15)} type="button">−15°</button>
                    <button title="Girar ramo à direita" onClick={() => actions.joints.rotateBranch(joint.id, 15)} type="button">+15°</button>
                    <button title="Desconectar" onClick={() => actions.joints.disconnect(joint.id)} type="button">×</button>
                  </span>
                </div>
              )
            })}
        </div>
      </div>}
    </aside>
  )
}
