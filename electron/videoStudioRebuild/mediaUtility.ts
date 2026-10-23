export {}
/**
 * Dedicated Electron utility process: owns the canonical 60 fps AV clock and
 * accepts bounded clock/seek/cancel messages. No React or DOM dependencies.
 * Chromium decoders are still in the browser MediaService in the first cut;
 * moving decode/FFmpeg execution here remains the next gate.
 */
type Port = {
  on(event: 'message', listener: (event: {data: unknown}) => void): void
  postMessage(value: unknown): void
}
const utilityParent = (process as typeof process & { parentPort?: Port }).parentPort
if (!utilityParent) throw new Error('Video media utility must run in Electron utilityProcess.')
const port: Port = utilityParent

type Session = { frame: number; sinceNs: bigint; playing: boolean; audioMaster: boolean }
const sessions = new Map<string, Session>()
const clockNow = () => process.hrtime.bigint()
const clampFrame = (frame: number | undefined): frame is number => typeof frame === 'number' && Number.isSafeInteger(frame) && frame >= 0 && frame <= 24 * 3600 * 60
const frameNow = (s: Session): number =>
  s.playing ? Math.max(0,s.frame+Number((clockNow()-s.sinceNs)*60n/1000000000n)) : s.frame

port.on('message', event => {
  const message = event.data as {id?:number;op?:string;sessionId?:string;frame?:number;playing?:boolean;audioFrame?:number}
  const {id,op,sessionId}=message??{}
  if(!Number.isSafeInteger(id)||!sessionId||sessionId.length>100)return
  try {
    let session=sessions.get(sessionId)
    let result:{frame:number;playing:boolean;audioMaster:boolean}
    if(op==='close') {
      sessions.delete(sessionId)
      result={frame:0,playing:false,audioMaster:false}
    }else if(op==='status'){
      result=session?{frame:frameNow(session),playing:session.playing,audioMaster:session.audioMaster}:
        {frame:0,playing:false,audioMaster:false}
    }else if(op==='cancel'){
      if(session){session.frame=frameNow(session);session.playing=false;session.sinceNs=clockNow()}
      result=session?{frame:session.frame,playing:false,audioMaster:session.audioMaster}:
        {frame:0,playing:false,audioMaster:false}
    }else if(op==='sync'||op==='seek'){
      const absolute=message.audioFrame??message.frame
      if(!clampFrame(absolute))throw Error('Timestamp AV inválido.')
      const playing=op==='seek'?false:message.playing===true
      session={frame:absolute,sinceNs:clockNow(),playing,audioMaster:message.audioFrame!==undefined}
      sessions.set(sessionId,session)
      result={frame:session.frame,playing,audioMaster:session.audioMaster}
    }else throw Error('Comando de mídia desconhecido.')
    port.postMessage({id,ok:true,result})
  }catch(error){
    port.postMessage({id,ok:false,error:error instanceof Error?error.message:String(error)})
  }
})
