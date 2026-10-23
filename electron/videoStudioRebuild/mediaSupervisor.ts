import { app, utilityProcess, type IpcMain, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
type UtilityProcess = ReturnType<typeof utilityProcess.fork>

import type { VideoEngineMediaRequest, VideoEngineMediaClock } from '../../src/shared/videoStudioRebuild/mediaContracts'
type Pending = { resolve: (value: VideoEngineMediaClock) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }

/**
 * Separate OS process, not a React hook. A hung worker is killed after 2s;
 * outstanding IPC callers are rejected and the next request starts a fresh
 * utility process. Native decoder/FFmpeg process ownership migrates here in a
 * later gate; it is currently the supervisor of the AV timebase only.
 */
export class VideoMediaEngineSupervisor {
  private child: UtilityProcess | null = null
  private pending = new Map<number, Pending>()
  private nextId = 0
  private closed = false

  private ensure(): UtilityProcess {
    if(this.closed)throw Error('Supervisor AV descartado.')
    if(this.child)return this.child
    const child=utilityProcess.fork(join(__dirname,'media-engine-worker.js'),[],{serviceName:'Gacha Video AV Clock'})
    this.child=child
    child.on('message',(message: unknown)=>{
      const response=message as {id?:number;ok?:boolean;result?:VideoEngineMediaClock;error?:string}
      if(!Number.isSafeInteger(response.id))return
      const pending=this.pending.get(response.id!)
      if(!pending)return
      this.pending.delete(response.id!);clearTimeout(pending.timer)
      if(response.ok&&response.result)pending.resolve(response.result)
      else pending.reject(new Error(response.error??'Resposta AV inválida.'))
    })
    child.on('exit',(code)=>{
      if(this.child===child)this.child=null
      this.rejectPending(new Error('Processo de mídia terminou; sessão AV cancelada (código '+code+').'))
    })
    return child
  }

  private rejectPending(error:Error) {
    for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error)}
    this.pending.clear()
  }

  async call(input:VideoEngineMediaRequest):Promise<VideoEngineMediaClock> {
    if(!input||!['sync','seek','status','cancel','close'].includes(input.op)
      ||typeof input.sessionId!=='string'||!input.sessionId||input.sessionId.length>100
      ||(input.frame!==undefined&&(!Number.isSafeInteger(input.frame)||input.frame<0))
      ||(input.audioFrame!==undefined&&(!Number.isSafeInteger(input.audioFrame)||input.audioFrame<0))) {
      throw new Error('Contrato AV inválido.')
    }
    const child=this.ensure(),id=++this.nextId
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        this.rejectPending(new Error('Timeout do processo AV; encerrando motor não responsivo.'))
        if(this.child===child){this.child=null;child.kill()}
      },2000)
      this.pending.set(id,{resolve,reject,timer})
      try{child.postMessage({id,...input})}
      catch(error){clearTimeout(timer);this.pending.delete(id);reject(error)}
    })
  }

  dispose() {
    if(this.closed)return
    this.closed=true
    this.rejectPending(new Error('Motor AV cancelado.'))
    this.child?.kill();this.child=null
  }
}

export function registerVideoMediaEngineHandlers(
  ipcMain:IpcMain,
  assertTrustedSender:(event:IpcMainInvokeEvent)=>void
):void{
  const supervisor=new VideoMediaEngineSupervisor()
  ipcMain.handle('video-engine:media:control',async(event,command:VideoEngineMediaRequest)=>{
    assertTrustedSender(event)
    if(process.platform!=='win32')throw new Error('Novo motor de mídia restrito a Windows.')
    return supervisor.call(command)
  })
  app.on('before-quit',()=>supervisor.dispose())
}
