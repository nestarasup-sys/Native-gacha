import { useEffect, useState } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { FaceExpressionPreset } from '../../../../shared/fabricator'
import { buildStudioExpressionAppearance, buildStudioExpressionTransforms } from '../../characters/studioExpressionTransforms'
import { renderSavedCharacter } from '../../characters/characterRenderer'
import type { ExpressionGaze } from '../../../../shared/portableExpression'

type Props = { modelSlot: number; preset: FaceExpressionPreset; gaze: ExpressionGaze; onClose: () => void }

/** Read-only comparison using the actual Studio composition path.
 * Character JSON, Presets DEV drafts, Studio documents and PNGs remain untouched.
 */
export function ExpressionCharacterPreview({modelSlot,preset,gaze,onClose}:Props) {
  const [characters,setCharacters] = useState<CustomizerCharacter[]>([])
  const [characterId,setCharacterId] = useState('')
  const [baseImage,setBaseImage] = useState('')
  const [resultImage,setResultImage] = useState('')
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  useEffect(()=>{
    let active=true
    void window.desktop.listCustomizerCharacters().then(items=>{
      if(!active)return
      const compatible=items.filter(item=>item.customization.modelSlot===modelSlot)
      setCharacters(compatible)
      setCharacterId(current=>compatible.some(item=>item.id===current)?current:compatible[0]?.id ?? '')
    }).catch(reason=>{if(active)setError(String(reason))})
    return ()=>{active=false}
  },[modelSlot])
  const signature=JSON.stringify([preset.id,preset.transforms,preset.portableMotion,preset.ptPupils,preset.ptPupilMotion,preset.selections,preset.expressionIndex,preset.effects,gaze])
  useEffect(()=>{
    let active=true
    const character=characters.find(item=>item.id===characterId)
    setBaseImage('');setResultImage('')
    if(!character){setLoading(false);setError('Escolha um personagem compatível com este modelo.');return}
    if(!character.customization.faceAppearance){
      setLoading(false);setError('Este personagem ainda não tem um rosto-base no Customizador.');return
    }
    setLoading(true);setError('')
    void (async()=>{
      try {
        const base=character.customization.faceAppearance!
        const next=await buildStudioExpressionAppearance(preset,base,id=>window.desktop.loadFaceCatalogItem(modelSlot,id))
        const transforms=await buildStudioExpressionTransforms(preset,next,{},
          id=>window.desktop.loadFaceComponentAsset(modelSlot,id),
          id=>window.desktop.loadFaceCatalogItem(modelSlot,id),gaze)
        const [neutral,expression]=await Promise.all([
          renderSavedCharacter(character),
          renderSavedCharacter({...character,customization:{...character.customization,faceAppearance:next}},transforms,preset.effects,'idle')
        ])
        if(active){setBaseImage(neutral.dataUrl);setResultImage(expression.dataUrl)}
      }catch(reason){if(active)setError(reason instanceof Error?reason.message:String(reason))}
      finally{if(active)setLoading(false)}
    })()
    return ()=>{active=false}
  },[characters,characterId,modelSlot,signature])
  return <section aria-label="Testar expressão em personagem do Customizador"
    style={{position:'fixed',left:'50%',top:'50%',transform:'translate(-50%,-50%)',zIndex:9000,
      width:'min(760px,calc(100vw - 32px))',maxHeight:'calc(100vh - 70px)',overflow:'auto',
      background:'#fff',border:'1px solid #d5ccdc',borderRadius:12,padding:16,boxShadow:'0 18px 60px #1b142e66'}}>
    <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
      <strong>Testar preset em outro personagem · {gaze==='left'?'PT — esquerda':'Normal — direita'}</strong>
      <button type="button" className="pose-button secondary" onClick={onClose} aria-label="Fechar teste de expressão">Fechar ×</button>
    </header>
    <label style={{display:'grid',gap:4,margin:'10px 0'}}>
      <span>Personagem criado no Customizador</span>
      <select value={characterId} onChange={event=>setCharacterId(event.target.value)} aria-label="Personagem para testar expressão">
        {!characters.length && <option value="">Nenhum personagem compatível</option>}
        {characters.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    <div style={{display:'flex',gap:12,alignItems:'center',justifyContent:'space-around',flexWrap:'wrap'}}>
      {[{title:'Base do Customizador',src:baseImage},{title:'Expressão aplicada',src:resultImage}].map(panel=>
        <div key={panel.title} style={{flex:'1 1 220px',minWidth:190,textAlign:'center'}}>
          <strong>{panel.title}</strong>
          {panel.src&&<img src={panel.src} alt={panel.title} style={{display:'block',maxWidth:'100%',maxHeight:300,objectFit:'contain',margin:'6px auto'}}/>}
        </div>)}
    </div>
    {loading && <small role="status">Compondo as duas versões sem alterar o personagem…</small>}
    {error && <p role="alert">{error}</p>}
    <small>Este teste usa o mesmo resolvedor do Studio Principal. Nenhum dado é salvo.</small>
  </section>
}
