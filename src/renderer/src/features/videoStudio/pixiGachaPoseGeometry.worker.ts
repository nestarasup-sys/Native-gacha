import { interpolateGachaPoseGeometry, type GachaPoseGeometry } from './pixiGachaPoseGeometry'
import type { PoseArtwork } from '../../../../shared/videoCharacterInterpolation'

type Init = { kind:'init'; session:number; from:PoseArtwork; to:PoseArtwork }
type Frame = { kind:'frame'; session:number; request:number; progress:number }
type Stop = { kind:'stop'; session:number }
type Request = Init | Frame | Stop
type Response =
  | { kind:'ready'; session:number }
  | { kind:'result'; session:number; request:number; geometry:GachaPoseGeometry }
  | { kind:'error'; session:number; request:number; message:string }

let current: { session:number; from:PoseArtwork; to:PoseArtwork } | null = null
self.onmessage = (event: MessageEvent<Request>) => {
  const data = event.data
  if (data.kind==='init') {
    current={session:data.session,from:data.from,to:data.to}
    self.postMessage({kind:'ready',session:data.session} satisfies Response)
    return
  }
  if(data.kind==='stop') {
    if(current?.session===data.session)current=null
    return
  }
  if (!current || current.session!==data.session) return
  try {
    const geometry=interpolateGachaPoseGeometry(current.from,current.to,data.progress)
    self.postMessage({kind:'result',session:data.session,request:data.request,geometry} satisfies Response)
  } catch (error) {
    self.postMessage({kind:'error',session:data.session,request:data.request,
      message:error instanceof Error ? error.message:String(error)} satisfies Response)
  }
}
