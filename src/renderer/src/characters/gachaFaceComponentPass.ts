import type { FaceComponentPartId } from '../../../shared/customizer'
import type { GachaFacePass } from './gachaPreparedGpuLayers'

const complete: FaceComponentPartId[] = [
  'eye-left','eye-right','pupil-left','pupil-right','brow-left','brow-right'
]

/** The saved-character compositor keeps its full draw pass. A single GPU eye
 * or PT pupil only requests the chosen part plus its matching eye mask. */
export function catalogComponentIdsForPass(pass?: GachaFacePass): FaceComponentPartId[] {
  if(!pass)return complete
  if(pass==='pupil-left')return ['eye-left','pupil-left']
  if(pass==='pupil-right')return ['eye-right','pupil-right']
  if(pass==='eye-left'||pass==='eye-right'||pass==='brow-left'||pass==='brow-right')
    return [pass]
  return []
}
