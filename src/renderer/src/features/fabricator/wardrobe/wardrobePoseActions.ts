import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { FabricatorPose, FabricatorPoseSummary, ModelPart, WardrobeSet } from '../../../../../shared/fabricator'

type Setter<T> = Dispatch<SetStateAction<T>>
type PoseActionsOptions = {
  modelSlot: number
  sourceParts: Record<string, unknown> | null
  draft: WardrobeSet | null
  referenceBone: (partId: string) => ModelPart | undefined
  testPoseRequestRef: MutableRefObject<number>
  setError: Setter<string>
  setTestPosePickerOpen: Setter<boolean>
  setTestPoseLoading: Setter<boolean>
  setTestPoseSlots: Setter<FabricatorPoseSummary[]>
  setTestDragOffsets: Setter<Record<string, { x: number; y: number }>>
  setBodyOffsets: Setter<Record<string, { x: number; y: number }>>
  setMoveBodyMode: Setter<boolean>
  setTestPose: Setter<FabricatorPose | null>
}

/** Opens and loads pose previews without persisting scene or wardrobe data. */
export function createWardrobePoseActions({
  modelSlot, sourceParts, draft, referenceBone, testPoseRequestRef,
  setError, setTestPosePickerOpen, setTestPoseLoading, setTestPoseSlots,
  setTestDragOffsets, setBodyOffsets, setMoveBodyMode, setTestPose
}: PoseActionsOptions) {
  const openTestPosePicker = async () => {
    if (!sourceParts) { setError('Aguarde a referência original do corpo carregar antes de testar a pose.'); return }
    const missingOrigins = Array.from(new Set((draft?.components ?? []).filter((component) => {
      const bone = referenceBone(component.attachedPartId)
      return !bone?.sourceTransform
    }).map((component) => referenceBone(component.attachedPartId)?.name ?? component.name)))
    if (missingOrigins.length) {
      setError(`Calibre a origem na folha original antes do teste: ${missingOrigins.join(', ')}. Selecione cada peça do conjunto e use “Calibrar origem”.`)
      return
    }
    const requestId = ++testPoseRequestRef.current
    const requestedModelSlot = modelSlot
    setError('')
    setTestPosePickerOpen(true)
    setTestPoseLoading(true)
    try {
      const slots = await window.desktop.fabricator.listFabricatorPoseSlots(requestedModelSlot)
      if (requestId !== testPoseRequestRef.current) return
      setTestPoseSlots(slots.filter((slot): slot is NonNullable<typeof slot> => slot !== null))
    }
    catch (reason) { if (requestId === testPoseRequestRef.current) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as poses deste modelo.') }
    finally { if (requestId === testPoseRequestRef.current) setTestPoseLoading(false) }
  }
  const loadTestPose = async (slot: number) => {
    const requestId = ++testPoseRequestRef.current
    const requestedModelSlot = modelSlot
    setTestPoseLoading(true)
    try {
      const pose = await window.desktop.fabricator.loadFabricatorPose(requestedModelSlot, slot)
      if (requestId !== testPoseRequestRef.current) return
      if (!pose || pose.sourceModelSlot !== requestedModelSlot || pose.slot !== slot) throw new Error('Esta pose não está mais disponível para o modelo selecionado.')
      setTestDragOffsets({}); setBodyOffsets({}); setMoveBodyMode(false); setTestPose(pose); setTestPosePickerOpen(false); setError('')
    } catch (reason) { if (requestId === testPoseRequestRef.current) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir esta pose.') }
    finally { if (requestId === testPoseRequestRef.current) setTestPoseLoading(false) }
  }
  const exitTestPose = () => { testPoseRequestRef.current += 1; setTestPose(null); setTestPoseLoading(false); setTestDragOffsets({}) }

  return { openTestPosePicker, loadTestPose, exitTestPose }
}
