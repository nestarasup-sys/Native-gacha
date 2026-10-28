import type { CustomizerWardrobeGroup } from '../../../../shared/customizer'
import type { SelectedWardrobeComponent } from '../../characters/characterRenderer'
import { Icon } from '../../ui/components/Icon'
import type { ClothingAdjustEntry } from './customizerClothesAdjustmentModel'

type Transform = Pick<CustomizerWardrobeGroup,'offsetX'|'offsetY'|'scaleX'|'scaleY'|'rotation'>
type Props = {
  label: string
  hasCharacter: boolean
  entries: readonly ClothingAdjustEntry[]
  selected: ClothingAdjustEntry | undefined
  selectedPiece: SelectedWardrobeComponent | null
  transform: Transform
  onSelect: (piece: SelectedWardrobeComponent) => void
  onTransform: (transform: Transform) => void
  onToggleHidden: () => void
}

export function CustomizerClothesAdjustmentPanel({
  label,hasCharacter,entries,selected,selectedPiece,transform,onSelect,onTransform,onToggleHidden
}: Props) {
  const hidden = Boolean(selected?.group.hidden)
  const changeTransform = (patch: Partial<Transform>) => onTransform({...transform,...patch})
  const moveBy = (x:number,y:number) => changeTransform({offsetX:transform.offsetX+x,offsetY:transform.offsetY+y})
  return <section className="customizer-adjust-picker customizer-clothes-adjust-detail"
      aria-label={`Ajustes de roupas ${label.toLowerCase()}`}>
    <header className="customizer-adjust-heading customizer-clothes-adjust-detail-heading">
      <button className={`customizer-adjust-reset ${hidden?'is-restore':'is-delete'}`} type="button"
        disabled={!hasCharacter || !selected} onClick={onToggleHidden}
        title={hidden?`Restaurar ${selected?.component.name||'peça selecionada'}`:`Excluir ${selected?.component.name||'peça selecionada'}`}
        aria-label={hidden?`Restaurar ${selected?.component.name||'peça selecionada'}`:`Excluir ${selected?.component.name||'peça selecionada'}`}>
        <Icon name={hidden?'undo':'trash'}/><span>{hidden?'RESTAURAR':'EXCLUIR'}</span>
      </button>
      <h2>Ajustar roupas · {label}</h2>
    </header>
    {!hasCharacter && <p className="customizer-adjust-hint">Selecione um personagem para ver as peças dele.</p>}
    {hasCharacter && <div className="customizer-clothes-adjust-workspace">
      <section className="customizer-clothes-adjust-parts" aria-label={`Peças de roupas ${label.toLowerCase()}`}>
        <header><strong>Roupas · {label}</strong><small>{entries.length} peça(s)</small></header>
        {entries.length ? <div className="customizer-clothes-adjust-part-grid">{entries.map(({group,component,set,pairStart})=>{
          const chosen = selectedPiece?.modelSlot===group.modelSlot && selectedPiece.setId===group.setId
            && selectedPiece.category===group.category && selectedPiece.componentId===component.id
          return <div key={`${group.modelSlot}:${group.setId}:${component.id}`}
              className={`customizer-clothes-adjust-part${chosen?' selected':''}${group.hidden?' dimmed':''}${pairStart?' pair-start':''}`}>
            <button type="button" className="customizer-clothes-adjust-part-select" aria-pressed={chosen}
              onClick={()=>onSelect({modelSlot:group.modelSlot,setId:group.setId,category:group.category,componentId:component.id})}>
              <span className="customizer-clothes-adjust-part-preview"><img src={component.dataUrl} alt=""/></span>
              <strong title={component.name}>{component.name||component.attachedPartId}</strong><small>{set.name}</small>
            </button>
          </div>
        })}</div>
        : <p className="customizer-clothes-adjust-empty">Nenhuma peça aplicada em <strong>{label}</strong> neste personagem. Escolha uma peça nesta categoria para ajustar seus componentes.</p>}
      </section>
      {selected ? <section className="customizer-clothes-adjust-controls" aria-label="Controles da peça selecionada">
        <div className="customizer-clothes-adjust-position"><div className="customizer-clothes-adjust-pad" aria-label="Mover a peça">
          <button type="button" aria-label="Mover para cima" onClick={()=>moveBy(0,-1)}>↑</button>
          <button type="button" aria-label="Mover para a esquerda" onClick={()=>moveBy(-1,0)}>←</button>
          <span><Icon name="move"/></span>
          <button type="button" aria-label="Mover para a direita" onClick={()=>moveBy(1,0)}>→</button>
          <button type="button" aria-label="Mover para baixo" onClick={()=>moveBy(0,1)}>↓</button>
        </div></div>
        <div className="customizer-clothes-adjust-axis-grid">
          {([{key:'scaleX',label:'Largura',min:.05,max:5,step:.02},{key:'scaleY',label:'Altura',min:.05,max:5,step:.02}] as const)
            .map(({key,label,min,max,step})=><div className="customizer-clothes-adjust-axis" key={key}>
              <strong>{label} <output>{Math.round(transform[key]*100)}%</output></strong>
              <button type="button" aria-label={`Diminuir ${label.toLowerCase()}`}
                onClick={()=>changeTransform({[key]:Math.max(min,Number((transform[key]-step).toFixed(2)))})}>−</button>
              <button type="button" aria-label={`Aumentar ${label.toLowerCase()}`}
                onClick={()=>changeTransform({[key]:Math.min(max,Number((transform[key]+step).toFixed(2)))})}>+</button>
            </div>)}
        </div>
        <div className="customizer-clothes-adjust-rotation">
          <strong>Rotação <output>{Math.round(transform.rotation)}°</output></strong>
          <button type="button" aria-label="Girar para a esquerda" onClick={()=>changeTransform({rotation:transform.rotation-1})}>↶</button>
          <button type="button" aria-label="Girar para a direita" onClick={()=>changeTransform({rotation:transform.rotation+1})}>↷</button>
        </div>
      </section>:<div className="customizer-clothes-adjust-empty-controls">Selecione uma peça na lista para ajustar.</div>}
    </div>}
  </section>
}
