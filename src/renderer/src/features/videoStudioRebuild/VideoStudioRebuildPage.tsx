import { useEffect, useMemo, useRef, useState } from 'react'
import type { StudioDocument, VideoStudioCardSummary } from '../../../../shared/studio'
import { VideoStudioFrameEngine } from '../../../../shared/videoStudioRebuild/frameEngine'
import { splitCharacterAt } from '../../../../shared/videoStudioRebuild/rebuildEditor'
import { applyVideoStudioEditorCommand } from '../../../../shared/videoStudioNext/editorCore'
import { GachaGpuStage } from './gachaGpuStage'
import { VideoStudioMediaEngine } from './mediaEngine'
import { VideoStudioPreviewTransport } from './previewTransport'
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
  const [status,setStatus]=useState('Selecione um projeto. Nenhum arquivo será modificado.')
  const [gpuStats,setGpuStats]=useState('')
  const [rendering,setRendering]=useState(false)
  const canvas=useRef<HTMLCanvasElement|null>(null)
  const transport=useRef<VideoStudioPreviewTransport|null>(null)
  const [presented,setPresented]=useState(0)
  const [skipped,setSkipped]=useState(0)

  const engine=useMemo(()=>studio?.videoTimeline ? new VideoStudioFrameEngine(studio):null,[studio])
  const duration=engine?.durationFrames??1
  const viewFrame=Math.min(frame,duration-1)
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
      setStudio(doc);setFrame(0);setSelected(doc.elements.find(e=>e.kind==='character')?.id??'')
      setStatus('Novo motor — edição local; use Salvar cópia para persistir.')
    }catch(e){setStatus(String(e))}
  }
  const close=()=>{
    pause();setStudio(null);setFrame(0)
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
    setStudio(doc);setFrame(0);setStatus('Projeto novo em memória. Use Salvar cópia.')
  }
  const copy=async()=>{
    if(!studio)return
    const stamp=now()
    const out:StudioDocument={...studio,id:crypto.randomUUID(),title:studio.title.includes('Novo motor')?studio.title:studio.title+' — Novo motor',
      createdAt:stamp,updatedAt:stamp,videoTimeline:studio.videoTimeline?{...studio.videoTimeline,playheadFrame:Math.min(transport.current?.snapshot().frame??viewFrame,duration),playing:false}:undefined}
    try{await window.desktop.saveVideoStudio(out);setStudio(out);setStatus('Cópia gravada sem alterar o projeto original.')}
    catch(e){setStatus('Falha ao salvar cópia: '+String(e))}
  }
  const edit=(action:(doc:StudioDocument)=>StudioDocument)=>{
    if(!studio)return
    pause()
    try{const next=action(studio);if(next!==studio){setStudio(next);setStatus('Alteração somente local — salve uma cópia para persistir.')}}catch(e){setStatus(String(e))}
  }
  // The transport, decoder cache, request queue, AV clock and GPU context
  // live OUTSIDE React. React receives only throttled presentation snapshots.
  useEffect(()=>{
    if(!studio||!engine||!canvas.current)return
    let graph:GachaGpuStage
    try{graph=new GachaGpuStage(canvas.current)}
    catch(e){setStatus('GPU indisponível: '+String(e));return}
    const media=new VideoStudioMediaEngine(studio.id,studio.videoTimeline?.videoAssets??[])
    const instance=new VideoStudioPreviewTransport(engine,graph,media,
      state=>{
        setFrame(state.frame)
        setPlaying(state.playing)
        setRendering(state.rendering)
        setPresented(state.presentedFrames)
        setSkipped(state.skippedFrames)
        setGpuStats(JSON.stringify({retainedEstimatedBytes:state.textureBytes}))
      },
      error=>setStatus('Falha da prévia GPU: '+error.message))
    transport.current=instance
    return()=>{
      if(transport.current===instance)transport.current=null
      instance.dispose()
    }
  },[engine,studio?.id])

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
          <p className="video-rebuild-note">Prévia GPU de estados visuais salvos. Transições faciais dinâmicas e máscaras PT ainda aguardam compilação de sprites e golden visual.</p>
          <small>{gpuStats}</small>
        </aside>
      </div>
      <section className="video-rebuild-timeline">
        <div className="video-rebuild-transport">
          <button onClick={togglePlayback}>{playing?'Pausar':'Reproduzir'}</button>
          <button onClick={()=>seek(0)}>Voltar ao início</button>
          <label>Frame <input aria-label="Frame absoluto" type="number" min="0" max={duration-1} value={viewFrame} onChange={e=>seek(Math.max(0,Math.min(duration-1,Math.round(Number(e.target.value)||0))))} /></label>
          <button disabled={!selected} onClick={()=>edit(doc=>splitCharacterAt(doc,selected,viewFrame,crypto.randomUUID(),now()))}>Dividir bloco</button>
          <button onClick={()=>edit(doc=>applyVideoStudioEditorCommand(doc,doc.videoTimeline!,{type:'set-character-transitions',enabled:doc.videoTimeline?.animateCharacterTransitions===false},now()))}>Alternar transições</button>
        </div>
        <input className="video-rebuild-scrub" aria-label="Buscar quadro" type="range" min="0" max={duration-1} value={viewFrame} onChange={e=>seek(Number(e.target.value))} />
        <div className="video-rebuild-keys">{studio.elements.filter(e=>e.kind==='character').map(e=><div className="video-rebuild-lane" key={e.id}><span>{e.speakerName||e.id.slice(0,8)}</span><div>{studio.videoTimeline?.characterKeys.filter(k=>k.elementId===e.id).map(k=><button key={k.id} title={'Quadro '+k.frame} style={{left:(k.frame/duration*100)+'%'}} onClick={()=>seek(k.frame)} />)}</div></div>)}</div>
      </section>
    </>}
    <footer role="status">{status}</footer>
  </div>
}
