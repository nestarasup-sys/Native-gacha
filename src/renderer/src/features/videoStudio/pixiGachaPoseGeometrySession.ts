import type { PoseArtwork } from '../../../../shared/videoCharacterInterpolation'
import { restoreGachaPoseTextures, stripGachaPoseTextures, type GachaPoseGeometry } from './pixiGachaPoseGeometry'

type Response =
  | {kind:'ready';session:number}
  | {kind:'result';session:number;request:number;geometry:GachaPoseGeometry}
  | {kind:'error';session:number;request:number;message:string}

type Pending = { resolve:(value:PoseArtwork)=>void; reject:(error:unknown)=>void; signal?:AbortSignal; onAbort?:()=>void; progress:number }

/**
 * One persistent animation session owns one Worker and one pair of authored
 * endpoint poses. Large PNG data URLs NEVER cross the worker boundary.
 * A new seek/revision cancels stale pending frames; results are generation-
 * checked so a late worker response cannot repaint the previous character.
 *
 * This is an experimental Pixi-only geometry path. It is not yet attached to
 * the legacy Canvas preview and does not change exports.
 */
export class PixiGachaPoseGeometrySession {
  private readonly worker: Worker
  private readonly pending = new Map<number,Pending>()
  private session = 1
  private nextRequest = 0
  private ready = false
  private disposed = false
  private readonly from: PoseArtwork
  private readonly to: PoseArtwork
  private readonly onMessage = (event: MessageEvent<Response>):void => {
    const response=event.data
    if(this.disposed || response.session!==this.session)return
    if(response.kind==='ready'){this.ready=true;return}
    const entry=this.pending.get(response.request)
    if(!entry)return
    this.pending.delete(response.request)
    if(entry.signal&&entry.onAbort)entry.signal.removeEventListener('abort',entry.onAbort)
    if(response.kind==='error')entry.reject(new Error(response.message))
    else {
      try{entry.resolve(restoreGachaPoseTextures(this.from,this.to,entry.progress,response.geometry))}
      catch(error){entry.reject(error)}
    }
  }
  private readonly onError=(event:ErrorEvent):void=>{
    this.cancelPending(new Error(event.message || 'Falha no Worker de pose Gacha.'))
  }

  constructor(from: PoseArtwork,to: PoseArtwork,worker?:Worker){
    this.from=from;this.to=to
    this.worker=worker??new Worker(new URL('./pixiGachaPoseGeometry.worker.ts',import.meta.url),{type:'module'})
    this.worker.addEventListener('message',this.onMessage)
    this.worker.addEventListener('error',this.onError)
    this.worker.postMessage({kind:'init',session:this.session,
      from:stripGachaPoseTextures(from),to:stripGachaPoseTextures(to)})
  }

  get initialized():boolean{return this.ready}

  interpolate(progress:number,signal?:AbortSignal):Promise<PoseArtwork>{
    if(this.disposed)return Promise.reject(new Error('Worker Gacha descartado.'))
    if(signal?.aborted)return Promise.reject(signal.reason ?? new Error('Animação cancelada.'))
    if(!Number.isFinite(progress)||progress<0||progress>1)return Promise.reject(new Error('Progresso de pose inválido.'))
    const request=++this.nextRequest
    return new Promise<PoseArtwork>((resolve,reject)=>{
      const onAbort=()=>{
        const current=this.pending.get(request)
        if(!current)return
        this.pending.delete(request)
        signal?.removeEventListener('abort',onAbort)
        reject(signal?.reason ?? new Error('Animação cancelada.'))
      }
      this.pending.set(request,{resolve,reject,signal,onAbort,progress})
      signal?.addEventListener('abort',onAbort,{once:true})
      this.worker.postMessage({kind:'frame',session:this.session,request,progress})
    })
  }

  cancelPending(reason:unknown=new Error('Transição substituída pelo seek.')):void{
    for(const [,entry]of this.pending){
      if(entry.signal&&entry.onAbort)entry.signal.removeEventListener('abort',entry.onAbort)
      entry.reject(reason)
    }
    this.pending.clear()
  }

  dispose():void{
    if(this.disposed)return
    this.cancelPending()
    this.worker.postMessage({kind:'stop',session:this.session})
    this.worker.removeEventListener('message',this.onMessage)
    this.worker.removeEventListener('error',this.onError)
    this.worker.terminate()
    this.disposed=true
  }
}
