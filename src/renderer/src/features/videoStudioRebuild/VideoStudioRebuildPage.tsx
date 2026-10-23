import { useEffect, useMemo, useRef, useState } from 'react'
import type { StudioDocument, VideoStudioCardSummary } from '../../../../shared/studio'
import { videoCharacterElementSize } from '../../../../shared/videoStageGeometry'
import { VideoStudioFrameEngine } from '../../../../shared/videoStudioRebuild/frameEngine'
import { VideoFrameScheduler } from '../../../../shared/videoStudioRebuild/frameScheduler'
import { splitCharacterAt } from '../../../../shared/videoStudioRebuild/rebuildEditor'
import { applyVideoStudioEditorCommand } from '../../../../shared/videoStudioNext/editorCore'
import { GachaGpuStage, type GachaGpuLayer } from './gachaGpuStage'
import { VideoStudioMediaEngine } from './mediaEngine'
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
  const gpu=useRef<GachaGpuStage|null>(null)
  const scheduler=useRef<VideoFrameScheduler|null>(null)
  const media=useRef<VideoStudioMediaEngine|null>(null)
  const imageCache=useRef(new Map<string,Promise<HTMLImageElement>>())
  const imageIds=useRef(new Map<string,number>())
  const lastFrame=useRef(0)
  const documentRef=useRef<StudioDocument|null>(null)
  documentRef.current=studio
  const engine=useMemo(()=>studio?.videoTimeline ? new VideoStudioFrameEngine(studio):null,[studio])
  const duration=engine?.durationFrames??1
  const viewFrame=Math.min(frame,duration-1)
  const scene=useMemo(()=>engine?.evaluate(viewFrame)??null,[engine,viewFrame])
  useEffect(()=>{onEditorActiveChange?.(Boolean(studio));return()=>onEditorActiveChange?.(false)},[studio,onEditorActiveChange])
  useEffect(()=>{
    let mounted=true
    void window.desktop.listVideoStudios().then(x=>{if(mounted)setCards(x)}).catch(e=>{if(mounted)setStatus(String(e))})
    return()=>{mounted=false}
  },[])

  const open=async(id:string)=>{
    setPlaying(false)
    try{
      const doc=await window.desktop.loadVideoStudio(id)
      if(!doc?.videoTimeline)throw new Error('O projeto não possui timeline de vídeo.')
      setStudio(doc);setFrame(0);setSelected(doc.elements.find(e=>e.kind==='character')?.id??'')
      setStatus('Novo motor — edição local; use Salvar cópia para persistir.')
    }catch(e){setStatus(String(e))}
  }
  const close=()=>{
    setPlaying(false);setStudio(null);setFrame(0)
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
      createdAt:stamp,updatedAt:stamp,videoTimeline:studio.videoTimeline?{...studio.videoTimeline,playheadFrame:Math.min(viewFrame,duration),playing:false}:undefined}
    try{await window.desktop.saveVideoStudio(out);setStudio(out);setStatus('Cópia gravada sem alterar o projeto original.')}
    catch(e){setStatus('Falha ao salvar cópia: '+String(e))}
  }
  const edit=(action:(doc:StudioDocument)=>StudioDocument)=>{
    if(!studio)return
    setPlaying(false)
    try{const next=action(studio);if(next!==studio){setStudio(next);setStatus('Alteração somente local — salve uma cópia para persistir.')}}catch(e){setStatus(String(e))}
  }
  const decode=(src:string):Promise<HTMLImageElement>=>{
    const cached=imageCache.current.get(src)
    if(cached)return cached
    const load=new Promise<HTMLImageElement>((resolve,reject)=>{
      const image=new Image()
      image.decoding='async'
      image.onload=()=>resolve(image)
      image.onerror=()=>reject(new Error('Asset visual do personagem indisponível.'))
      image.src=src
    })
    imageCache.current.set(src,load)
    void load.catch(()=>imageCache.current.delete(src))
    if(imageCache.current.size>96)imageCache.current.delete(imageCache.current.keys().next().value!)
    return load
  }

  // Canvas, GPU textures, media decoding and scheduling are owned outside React.
  useEffect(()=>{
    if(!studio||!engine||!canvas.current)return
    const schedule=new VideoFrameScheduler(2)
    let graph:GachaGpuStage
    try{graph=new GachaGpuStage(canvas.current)}
    catch(e){setStatus('GPU indisponível: '+String(e));return}
    const mediaEngine=new VideoStudioMediaEngine(studio.id,studio.videoTimeline?.videoAssets??[])
    gpu.current=graph;scheduler.current=schedule;media.current=mediaEngine
    imageCache.current.clear();imageIds.current.clear()
    return()=>{
      schedule.dispose();mediaEngine.dispose();graph.dispose()
      gpu.current=null;scheduler.current=null;media.current=null
      imageCache.current.clear();imageIds.current.clear()
    }
  },[studio?.id])

  useEffect(()=>{
    if(!scene||!gpu.current||!scheduler.current||!media.current)return
    let ignore=false
    const job=scheduler.current.request('frame:'+scene.frame,'visible',async(signal)=>{
      const layers:GachaGpuLayer[]=[]
      if(scene.background.assetDataUrl){
        const image=await decode(scene.background.assetDataUrl)
        if(signal.aborted)throw new Error('Frame cancelado')
        layers.push({textureId:'background:'+image.src,source:image,element:{
          x:scene.background.x,y:scene.background.y,width:scene.background.width,height:scene.background.height,rotation:scene.background.rotation,
        }})
      }
      media.current?.sync(scene,playing)
      for(const layer of scene.layers){
        if(signal.aborted)throw new Error('Frame cancelado')
        if(layer.type==='video'){
          const video=media.current?.activeFrameSources(scene).get(layer.clipId)
          if(video)layers.push({textureId:'video:'+layer.clipId,source:video,dynamic:true,
            element:{x:layer.transform?.x??0,y:layer.transform?.y??0,width:layer.transform?.width??100,height:layer.transform?.height??100,rotation:layer.transform?.rotation??0}})
          continue
        }
        const src=layer.assetDataUrl
        if(!src)continue
        const image=await decode(src)
        if(signal.aborted)throw new Error('Frame cancelado')
        const e=layer.element
        const size=videoCharacterElementSize(e)
        let token=imageIds.current.get(src)
        if(!token){token=imageIds.current.size+1;imageIds.current.set(src,token)}
        layers.push({textureId:'asset:'+token,source:image,element:{...e,...size}})
      }
      return layers
    })
    setRendering(true)
    void job.then(layers=>{
      if(ignore)return
      gpu.current?.draw(layers,scene.background.color)
      setGpuStats(JSON.stringify(gpu.current?.stats()??{}))
    }).catch(e=>{if(!ignore&&(e as Error)?.name!=='AbortError')setStatus(String(e))}).finally(()=>{if(!ignore)setRendering(false)})
    return()=>{ignore=true}
  },[scene,playing])

  useEffect(()=>{
    if(!playing||!engine)return
    const initial=frame
    const started=performance.now()
    let request=0
    const loop=()=>{
      const elapsed=Math.floor((performance.now()-started)*.06)
      const target=Math.min(duration-1,initial+elapsed)
      // Native media clock is authoritative when an audible video is active.
      const active=engine.evaluate(target)
      const clock=media.current?.currentFrame(target,active)??target
      const next=Math.max(0,Math.min(duration-1,clock))
      if(next!==lastFrame.current){lastFrame.current=next;setFrame(next)}
      if(next>=duration-1){setPlaying(false);return}
      request=requestAnimationFrame(loop)
    }
    request=requestAnimationFrame(loop)
    return()=>cancelAnimationFrame(request)
  },[playing,engine,duration])

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
          <p>{studio.elements.filter(e=>e.kind==='character').length} personagens · {studio.videoTimeline?.characterKeys.length??0} chaves</p>
          <h4>Personagens</h4>
          {studio.elements.filter(e=>e.kind==='character').map(e=><button className={selected===e.id?'selected':''} key={e.id} onClick={()=>setSelected(e.id)}>{e.speakerName||e.id.slice(0,8)}</button>)}
          <p className="video-rebuild-note">Prévia GPU de estados visuais salvos. Transições faciais dinâmicas e máscaras PT ainda aguardam compilação de sprites e golden visual.</p>
          <small>{gpuStats}</small>
        </aside>
      </div>
      <section className="video-rebuild-timeline">
        <div className="video-rebuild-transport">
          <button onClick={()=>setPlaying(v=>!v)}>{playing?'Pausar':'Reproduzir'}</button>
          <button onClick={()=>{setPlaying(false);setFrame(0)}}>Voltar ao início</button>
          <label>Frame <input aria-label="Frame absoluto" type="number" min="0" max={duration-1} value={viewFrame} onChange={e=>{setPlaying(false);setFrame(Math.max(0,Math.min(duration-1,Math.round(Number(e.target.value)||0))))}} /></label>
          <button disabled={!selected} onClick={()=>edit(doc=>splitCharacterAt(doc,selected,viewFrame,crypto.randomUUID(),now()))}>Dividir bloco</button>
          <button onClick={()=>edit(doc=>applyVideoStudioEditorCommand(doc,doc.videoTimeline!,{type:'set-character-transitions',enabled:doc.videoTimeline?.animateCharacterTransitions===false},now()))}>Alternar transições</button>
        </div>
        <input className="video-rebuild-scrub" aria-label="Buscar quadro" type="range" min="0" max={duration-1} value={viewFrame} onChange={e=>{setPlaying(false);setFrame(Number(e.target.value))}} />
        <div className="video-rebuild-keys">{studio.elements.filter(e=>e.kind==='character').map(e=><div className="video-rebuild-lane" key={e.id}><span>{e.speakerName||e.id.slice(0,8)}</span><div>{studio.videoTimeline?.characterKeys.filter(k=>k.elementId===e.id).map(k=><button key={k.id} title={'Quadro '+k.frame} style={{left:(k.frame/duration*100)+'%'}} onClick={()=>{setPlaying(false);setFrame(k.frame)}} />)}</div></div>)}</div>
      </section>
    </>}
    <footer role="status">{status}</footer>
  </div>
}
