import { useEffect, useState } from 'react'
import type { FabricatorPose } from '../../../../../shared/fabricator'

/** Read the Customizer's initial pose (slot 1 when present), without editing it. */
export function useWardrobeComparisonPose(modelSlot: number, enabled: boolean): FabricatorPose | null {
  const [pose,setPose] = useState<FabricatorPose | null>(null)
  useEffect(()=>{
    let live=true
    setPose(null)
    if(!enabled) return
    void (async()=>{
      try {
        const summaries=(await window.desktop.listFabricatorPoseSlots(modelSlot)).filter(p=>p!==null)
        const first=summaries.find(p=>p.slot===1) ?? summaries[0]
        if(!first)return
        const loaded=await window.desktop.loadFabricatorPose(modelSlot,first.slot)
        if(live)setPose(loaded)
      } catch { if(live)setPose(null) }
    })()
    return ()=>{live=false}
  },[modelSlot,enabled])
  return pose
}
