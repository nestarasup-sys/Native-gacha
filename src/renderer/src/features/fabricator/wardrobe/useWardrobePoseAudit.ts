import { useEffect, useRef, useState } from 'react'
import type { FabricatorProject, WardrobeSet } from '../../../../../shared/fabricator'
import { inspectWardrobePose, type WardrobePoseAuditResult } from '../../../../../shared/wardrobePoseAudit'

/** Read-only audit; no pose edits, model saves, PNG writes or library migrations. */
export function useWardrobePoseAudit(model: FabricatorProject | null, set: WardrobeSet | null) {
  const [running,setRunning] = useState(false)
  const [results,setResults] = useState<WardrobePoseAuditResult[]>([])
  const [error,setError] = useState('')
  const ticket = useRef(0)
  useEffect(() => {
    ticket.current++
    setResults([])
    setError('')
    setRunning(false)
  }, [model?.slot,model?.updatedAt,set?.id,set?.updatedAt])
  useEffect(() => () => { ticket.current++ }, [])
  const audit = async () => {
    if (!model || !set || running) return
    const mine = ++ticket.current
    setRunning(true)
    setResults([])
    setError('')
    try {
      const slots = (await window.desktop.fabricator.listFabricatorPoseSlots(model.slot))
        .filter(slot => slot !== null)
      const found: WardrobePoseAuditResult[] = []
      for(const summary of slots) {
        if (ticket.current !== mine) return
        const pose = await window.desktop.fabricator.loadFabricatorPose(model.slot,summary.slot)
        if (!pose) {
          found.push({slot:summary.slot,name:summary.name,status:'incompatible',
            warnings:['Pose não pôde ser carregada.'],checkedComponents:0})
        } else found.push(inspectWardrobePose(model,set,pose))
      }
      if (ticket.current === mine) setResults(found)
    } catch(reason) {
      if (ticket.current === mine) setError(reason instanceof Error ? reason.message : 'Falha ao conferir poses.')
    } finally { if(ticket.current === mine) setRunning(false) }
  }
  return {running,results,error,audit}
}
