import { useEffect, useMemo, useRef, useState } from 'react'
import type { StudioDocument, VideoStudioCardSummary } from '../../../../shared/studio'
import { VideoStudioFrameEngine } from '../../../../shared/videoStudioRebuild/frameEngine'
import { splitCharacterAt, moveCharacterKey, deleteCharacterKey } from '../../../../shared/videoStudioRebuild/rebuildEditor'
import { setTextClipContent, moveTextClip, moveVideoClip, setVideoClipAudio, setProjectVideoAudio, deleteTimelineClip } from '../../../../shared/videoStudioRebuild/timelineClipCommands'
import { setActorStageTransform } from '../../../../shared/videoStudioRebuild/actorTransformEditor'
import { splitTextClipAt, splitVideoClipAt } from '../../../../shared/videoStudioRebuild/rebuildClipEditor'
import { RebuildDocumentHistory } from '../../../../shared/videoStudioRebuild/documentHistory'
import { applyVideoStudioEditorCommand } from '../../../../shared/videoStudioNext/editorCore'
import { GachaGpuStage } from './gachaGpuStage'
import { VideoStudioMediaEngine } from './mediaEngine'
import { VideoStudioPreviewTransport } from './previewTransport'
import { CatalogGpuCompiler } from './catalogGpuCompiler'
import './rebuild.css'

type Props = { onEditorActiveChange?: (active: boolean) => void }
const now=()=>new Date().toISOString()
const formatFrame=(frame:number)=>String(Math.floor(frame/3600)).padStart(2,'0')+':'+String(Math.floor((frame%3600)/60)).padStart(2,'0')+':'+String(frame%60).padStart(2,'0')

/**
 * NEW editor route: no import, render or state from VideoStudioEditor.tsx.
 * Source data remains StudioDocument v1; saving is explicit and creates a
 * separate copy, so the existing user's project remains untouched.
 */
export function VideoStudioRebuildPage({onEditorActiveChange}:Props) {
  const [cards,setCards]=useState<VideoStudioCardSummary[]>([])
  const [studio,setStudio]=useState<StudioDocument|null>(null)
  const [frame,setFrame]=useState(0)
  const [playing,setPlaying]=useState(false)
  const [selected,setSelected]=useState('')
  const [selectedClip,setSelectedClip]=useState<{kind:'text'|'video';id:string}|null>(null)
  const [selectedKeyId,setSelectedKeyId]=useState<string|null>(null)
  const [status,setStatus]=useState('Selecione um projeto. Nenhum arquivo será modificado.')
  const [gpuStats,setGpuStats]=useState('')
  const [rendering,setRendering]=useState(false)
  const [catalogGpuExperimental,setCatalogGpuExperimental]=useState(false)
  const canvas=useRef<HTMLCanvasElement|null>(null)
  const transport=useRef<VideoStudioPreviewTransport|null>(null)
  const [presented,setPresented]=useState(0)
  const [skipped,setSkipped]=useState(0)
  const history=useRef(new RebuildDocumentHistory())
  const [,refreshHistory]=useState(0)
  const changedHistory=()=>refreshHistory(value=>value+1)

  const engine=useMemo(()=>studio?.videoTimeline ? new VideoStudioFrameEngine(studio):null,[studio])
  const duration=engine?.durationFrames??1
  const viewFrame=Math.min(frame,duration-1)
  const timeline=studio?.videoTimeline
  const selectedKey=timeline?.characterKeys.find(key=>key.id===selectedKeyId&&key.elementId===selected)
  const textClip=selectedClip?.kind==='text'?timeline?.textClips.find(clip=>clip.id===selectedClip.id):undefined
  const videoClip=selectedClip?.kind==='video'?timeline?.videoClips?.find(clip=>clip.id===selectedClip.id):undefined
  const activeClip=textClip??videoClip
  const activeActor=studio?.elements.find(e=>e.kind==='character'&&e.id===selected)
  const stageActor=activeActor?{...activeActor,...studio?.videoTimeline?.characterTransforms?.[selected]}:null
  useEffect(()=>{onEditorActiveChange?.(Boolean(studio));return()=>onEditorActiveChange?.(false)},[Boolean(studio),onEditorActiveChange])
  useEffect(()=>{
    let mounted=true
    void window.desktop.listVideoStudios().then(x=>{if(mounted)setCards(x)}).catch(e=>{if(mounted)setStatus(String(e))})
    return()=>{mounted=false}
  },[])

  const open=async(id:string)=>{
    pause()
    try{
      const doc=await window.desktop.loadVideoStudio(id)
      if(!doc?.videoTimeline)throw new Error('O projeto não possui timeline de vídeo.')
      history.current.reset(doc);changedHistory()
      setStudio(doc);setFrame(0);setSelectedClip(null);setSelectedKeyId(null);setSelected(doc.elements.find(e=>e.kind==='character')?.id??'')
      setStatus('Novo motor — edição local; use Salvar cópia para persistir.')
    }catch(e){setStatus(String(e))}
  }
  const close=()=>{
    pause();history.current.reset(null);changedHistory();setStudio(null);setFrame(0);setSelected('');setSelectedClip(null);setSelectedKeyId(null)
    void window.desktop.listVideoStudios().then(setCards).catch(()=>undefined)
  }
  const blank=()=>{
    const stamp=now(),id=crypto.randomUUID()
    const doc:StudioDocument={
      schemaVersion:1,id,title:'Novo vídeo Gacha (reconstruído)',color:'#526ea9',
      createdAt:stamp,updatedAt:stamp,backgroundColor:'#111725',backgroundAssetId:null,
      backgroundX:0,backgroundY:0,backgroundWidth:100,backgroundHeight:100,backgroundRotation:0,
      assets:[],elements:[],videoTimeline:{
        schemaVersion:1,frameRate:60,durationFrames:180*60,playheadFrame:0,playing:false,
        characterKeys:[],textClips:[],saveMarkers:[],
      }
    }
    history.current.reset(doc);changedHistory()
    setStudio(doc);setFrame(0);setSelected('');setSelectedClip(null);setSelectedKeyId(null);setStatus('Projeto novo em memória. Use Salvar cópia.')
  }
  const copy=async()=>{
    if(!studio)return
    const stamp=now()
    const out:StudioDocument={...studio,id:crypto.randomUUID(),title:studio.title.includes('Novo motor')?studio.title:studio.title+' — Novo motor',
      createdAt:stamp,updatedAt:stamp,videoTimeline:studio.videoTimeline?{...studio.videoTimeline,playheadFrame:Math.min(transport.current?.snapshot().frame??viewFrame,duration),playing:false}:undefined}
    try{await window.desktop.saveVideoStudio(out);history.current.reset(out);changedHistory();setStudio(out);setStatus('Cópia gravada sem alterar o projeto original.')}
    catch(e){setStatus('Falha ao salvar cópia: '+String(e))}
  }
  const edit=(action:(doc:StudioDocument)=>StudioDocument)=>{
    if(!studio)return
    pause()
    try{const next=action(studio);if(history.current.record(studio,next)){setStudio(next);changedHistory();setStatus('Alteração somente local — salve uma cópia para persistir.')}}catch(e){setStatus(String(e))}
  }
  const stepHistory=(direction:'undo'|'redo')=>{
    if(!studio)return
    pause()
    const restored=direction==='undo'?history.current.undo(studio):history.current.redo(studio)
    if(!restored)return
    setStudio(restored);changedHistory()
    setStatus(direction==='undo'?'Edição desfeita localmente.':'Edição refeita localmente.')
  }
  // The transport, decoder cache, request queue, AV clock and GPU context
  // live OUTSIDE React. React receives only throttled presentation snapshots.
  useEffect(()=>{
    if(!studio||!engine||!canvas.current)return
    let graph:GachaGpuStage
    try{graph=new GachaGpuStage(canvas.current)}
    catch(e){setStatus('GPU indisponível: '+String(e));return}
    const media=new VideoStudioMediaEngine(studio.id,studio.videoTimeline?.videoAssets??[],2,
      {master:studio.videoTimeline?.videoAudio,clips:studio.videoTimeline?.videoClips??[]})
    const catalog = catalogGpuExperimental
      ? new CatalogGpuCompiler(()=>transport.current?.refreshGpuSources()) : undefined
    const instance=new VideoStudioPreviewTransport(engine,graph,media,
      state=>{
        setFrame(state.frame)
        setPlaying(state.playing)
        setRendering(state.rendering)
        setPresented(state.presentedFrames)
        setSkipped(state.skippedFrames)
        setGpuStats(JSON.stringify({retainedEstimatedBytes:state.textureBytes}))
      },
      error=>setStatus('Falha da prévia GPU: '+error.message),catalog)
    transport.current=instance
    // Scene recompilation must retain the absolute playhead on Undo/Redo.
    instance.seek(Math.min(viewFrame,engine.durationFrames-1))
    return()=>{
      if(transport.current===instance)transport.current=null
      instance.dispose()
    }
  },[engine,studio?.id,catalogGpuExperimental])

  const seek=(nextFrame:number)=>{
    transport.current?.seek(nextFrame)
  }
  const togglePlayback=()=>{
    transport.current?.setPlaying(!transport.current.snapshot().playing)
  }
  const pause=()=>{
    transport.current?.setPlaying(false)
  }

  return <div className="video-rebuild">
    <header className="video-rebuild-header">
      <div><strong>Video Studio G-V5 — Novo Motor</strong><small>GPU WebGL2 · SceneEvaluator absoluto · preview sem pré-render serial</small></div>
      <div className="video-rebuild-actions">
        {studio?<><button onClick={close}>Biblioteca</button><button onClick={()=>void copy()}>Salvar cópia</button></>:
        <button onClick={blank}>Novo projeto</button>}
      </div>
    </header>
    {!studio?<div className="video-rebuild-library">
      <h2>Projetos salvos</h2><p>Abra um projeto sem alterar seu arquivo original.</p>
      <div className="video-rebuild-cards">{cards.map(c=><button key={c.id} onClick={()=>void open(c.id)}>{c.coverDataUrl&&<img src={c.coverDataUrl} alt="" />}<strong>{c.title}</strong><small>{c.updatedAt}</small></button>)}</div>
    </div>:<>
      <div className="video-rebuild-stage-row">
        <div className="video-rebuild-stage">
          <canvas ref={canvas} width={960} height={540} aria-label="Prévia GPU do novo Video Studio"/>
          {rendering&&<span className="video-rebuild-loading">Quadro em preparação sob demanda</span>}
        </div>
        <aside>
          <h3>{studio.title}</h3>
          <p>{formatFrame(viewFrame)} / {formatFrame(duration)}</p>
          <p>Quadros apresentados: {presented} · saltados: {skipped}</p>
          <p>{studio.elements.filter(e=>e.kind==='character').length} personagens · {studio.videoTimeline?.characterKeys.length??0} chaves</p>
          <h4>Personagens</h4>
          {studio.elements.filter(e=>e.kind==='character').map(e=><button className={selected===e.id?'selected':''} key={e.id} onClick={()=>setSelected(e.id)}>{e.speakerName||e.id.slice(0,8)}</button>)}
          {selected&&<button onClick={()=>edit(doc=>applyVideoStudioEditorCommand(doc,doc.videoTimeline!,{
            type:'set-track-settings',trackId:selected,
            settings:{...doc.videoTimeline?.trackSettings?.[selected],locked:!doc.videoTimeline?.trackSettings?.[selected]?.locked}
          },now()))}>{studio.videoTimeline?.trackSettings?.[selected]?.locked?'Desbloquear faixa':'Bloquear faixa'}</button>}
          {stageActor&&<div className="video-rebuild-actor-controls">
            <h4>Transformação do personagem</h4>
            {(['x','y','rotation','characterScale'] as const).map(field=><label key={field}>
              {field==='x'?'Posição X':field==='y'?'Posição Y':field==='rotation'?'Rotação':'Escala %'}
              <input aria-label={'Personagem '+field} type="number"
                min={field==='characterScale'?10:field==='rotation'?-360:-100}
                max={field==='characterScale'?400:field==='rotation'?360:100}
                value={stageActor[field]??(field==='characterScale'?100:0)}
                disabled={Boolean(studio.videoTimeline?.trackSettings?.[selected]?.locked)}
                onChange={event=>edit(doc=>setActorStageTransform(doc,selected,{[field]:Number(event.target.value)},now()))}/>
            </label>)}
            <button disabled={Boolean(studio.videoTimeline?.trackSettings?.[selected]?.locked)}
              onClick={()=>edit(doc=>setActorStageTransform(doc,selected,{flipX:!stageActor.flipX},now()))}>
              {stageActor.flipX?'Remover espelho horizontal':'Espelhar horizontalmente'}
            </button>
          </div>}
          {selectedKey&&<div className="video-rebuild-inspector">
            <h4>Keyframe selecionado</h4>
            <label>Quadro de destino
              <input aria-label="Mover keyframe para frame" type="number" min="1" max={duration-1}
                value={selectedKey.frame} disabled={Boolean(timeline?.trackSettings?.[selected]?.locked)}
                onChange={event=>edit(doc=>moveCharacterKey(doc,selected,selectedKey.id,Number(event.target.value),now()))}/>
            </label>
            <button disabled={Boolean(timeline?.trackSettings?.[selected]?.locked)}
              onClick={()=>{edit(doc=>deleteCharacterKey(doc,selected,selectedKey.id,now()));setSelectedKeyId(null)}}>
              Excluir keyframe
            </button>
          </div>}
          {activeClip&&<div className="video-rebuild-inspector">
            <h4>{textClip?'Fala / pensamento':'Vídeo'} selecionado</h4>
            <label>Início na timeline
              <input aria-label="Início do clipe" type="number" min="0" max={duration-1}
                value={activeClip.startFrame}
                disabled={Boolean(timeline?.trackSettings?.[textClip?.kind??'video']?.locked)}
                onChange={event=>edit(doc=>textClip
                  ?moveTextClip(doc,textClip.id,Number(event.target.value),now())
                  :moveVideoClip(doc,videoClip!.id,Number(event.target.value),now()))}/>
            </label>
            {textClip&&<label>Texto do balão
              <textarea aria-label="Texto do balão" rows={3}
                value={textClip.state?.text??studio.elements.find(e=>e.id===textClip.elementId)?.text??''}
                disabled={Boolean(timeline?.trackSettings?.[textClip.kind]?.locked)}
                onChange={event=>edit(doc=>setTextClipContent(doc,textClip.id,event.target.value,now()))}/>
            </label>}
            {videoClip&&<>
              <label>Volume do clipe (0 a 1)
                <input aria-label="Volume do clipe" type="number" min="0" max="1" step=".05"
                  value={videoClip.audio?.volume??1}
                  disabled={Boolean(timeline?.trackSettings?.video?.locked)}
                  onChange={event=>edit(doc=>setVideoClipAudio(doc,videoClip.id,{volume:Number(event.target.value)},now()))}/>
              </label>
              <label><input aria-label="Mudo do clipe" type="checkbox"
                checked={videoClip.audio?.muted??false}
                disabled={Boolean(timeline?.trackSettings?.video?.locked)}
                onChange={event=>edit(doc=>setVideoClipAudio(doc,videoClip.id,{muted:event.target.checked},now()))}/>
                Silenciar clipe
              </label>
            </>}
            <button disabled={Boolean(timeline?.trackSettings?.[textClip?.kind??'video']?.locked)}
              onClick={()=>{edit(doc=>deleteTimelineClip(doc,selectedClip!.kind,activeClip.id,now()));setSelectedClip(null)}}>
              Excluir clipe
            </button>
          </div>}
          <div className="video-rebuild-inspector">
            <h4>Áudio do projeto</h4>
            <label>Volume geral (0 a 1)
              <input aria-label="Volume geral" type="number" min="0" max="1" step=".05"
                value={timeline?.videoAudio?.volume??1}
                onChange={event=>edit(doc=>setProjectVideoAudio(doc,{volume:Number(event.target.value)},now()))}/>
            </label>
            <label><input aria-label="Mudo do projeto" type="checkbox"
              checked={timeline?.videoAudio?.muted??false}
              onChange={event=>edit(doc=>setProjectVideoAudio(doc,{muted:event.target.checked},now()))}/>
              Silenciar todos os vídeos
            </label>
          </div>
          <label className="video-rebuild-note">
            <input type="checkbox" aria-label="Camadas Gacha GPU experimentais"
              checked={catalogGpuExperimental}
              onChange={event=>setCatalogGpuExperimental(event.target.checked)}/>
            Ativar camadas reais de catálogo (experimental, fallback PNG, paridade ainda em validação)
          </label>
          <p className="video-rebuild-note">A GPU anima posição, escala e mistura snapshots nas transições. Boca, piscada, máscaras e pupilas PT independentes ainda exigem sprites do catálogo e golden visual Windows.</p>
          <small>{gpuStats}</small>
        </aside>
      </div>
      <section className="video-rebuild-timeline">
        <div className="video-rebuild-transport">
          <button onClick={togglePlayback}>{playing?'Pausar':'Reproduzir'}</button>
          <button onClick={()=>seek(0)}>Voltar ao início</button>
          <button disabled={!history.current.canUndo} onClick={()=>stepHistory('undo')}>Desfazer</button>
          <button disabled={!history.current.canRedo} onClick={()=>stepHistory('redo')}>Refazer</button>
          <label>Frame <input aria-label="Frame absoluto" type="number" min="0" max={duration-1} value={viewFrame} onChange={e=>seek(Math.max(0,Math.min(duration-1,Math.round(Number(e.target.value)||0))))} /></label>
          <button disabled={!selected} onClick={()=>edit(doc=>splitCharacterAt(doc,selected,viewFrame,crypto.randomUUID(),now()))}>Dividir personagem</button>
          <button disabled={!selectedClip} onClick={()=>edit(doc=>selectedClip?.kind==='video'
            ? splitVideoClipAt(doc,selectedClip.id,viewFrame,crypto.randomUUID(),now())
            : selectedClip ? splitTextClipAt(doc,selectedClip.id,viewFrame,crypto.randomUUID(),now()) : doc
          )}>Dividir clipe</button>
          <button onClick={()=>edit(doc=>applyVideoStudioEditorCommand(doc,doc.videoTimeline!,{type:'set-character-transitions',enabled:doc.videoTimeline?.animateCharacterTransitions===false},now()))}>Alternar transições</button>
        </div>
        <input className="video-rebuild-scrub" aria-label="Buscar quadro" type="range" min="0" max={duration-1} value={viewFrame} onChange={e=>seek(Number(e.target.value))} />
        <div className="video-rebuild-keys">
          {studio.elements.filter(e=>e.kind==='character').map(e=><div className="video-rebuild-lane" key={e.id}><span>{e.speakerName||e.id.slice(0,8)}</span><div>{studio.videoTimeline?.characterKeys.filter(k=>k.elementId===e.id).map(k=><button key={k.id} title={'Quadro '+k.frame} style={{left:(k.frame/duration*100)+'%'}} onClick={()=>{setSelected(e.id);setSelectedKeyId(k.id);setSelectedClip(null);seek(k.frame)}} />)}</div></div>)}
          {(['speech','thought'] as const).map(kind=><div className="video-rebuild-lane" key={kind}><span>{kind==='speech'?'Falas':'Pensamentos'}</span><div>{studio.videoTimeline?.textClips.filter(clip=>clip.kind===kind).map(clip=><button
            className={'video-rebuild-clip '+(selectedClip?.id===clip.id?'selected':'')} key={clip.id}
            title={kind+' · '+clip.startFrame+'–'+clip.endFrame}
            style={{left:(clip.startFrame/duration*100)+'%',width:((clip.endFrame-clip.startFrame)/duration*100)+'%'}}
            onClick={()=>{setSelectedClip({kind:'text',id:clip.id});setSelectedKeyId(null);seek(clip.startFrame)}}/>)}</div></div>)}
          {(studio.videoTimeline?.videoClips?.length??0)>0&&<div className="video-rebuild-lane"><span>Vídeos</span><div>{studio.videoTimeline?.videoClips?.map(clip=><button
            className={'video-rebuild-clip '+(selectedClip?.id===clip.id?'selected':'')} key={clip.id}
            title={'Vídeo · '+clip.startFrame+'–'+clip.endFrame}
            style={{left:(clip.startFrame/duration*100)+'%',width:((clip.endFrame-clip.startFrame)/duration*100)+'%'}}
            onClick={()=>{setSelectedClip({kind:'video',id:clip.id});setSelectedKeyId(null);seek(clip.startFrame)}}/>)}</div></div>}
        </div>
      </section>
    </>}
    <footer role="status">{status}</footer>
  </div>
}
