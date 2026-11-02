import type { FabricatorPose, FabricatorPoseSummary } from '../../../../../shared/fabricator'

export type WardrobeTestPoseRequestRef = { current: number }

export type WardrobeTestPoseCommandDependencies = {
  requestRef: WardrobeTestPoseRequestRef
  listPoseSlots: (modelSlot: number) => Promise<FabricatorPoseSummary[]>
  loadPose: (modelSlot: number, poseSlot: number) => Promise<FabricatorPose | null>
  setPoseSlots: (slots: NonNullable<FabricatorPoseSummary>[]) => void
  setPose: (pose: FabricatorPose | null) => void
  setLoading: (loading: boolean) => void
  setPickerOpen: (open: boolean) => void
  clearDragOffsets: () => void
  disableJoinJoints: () => void
  setError: (error: string) => void
}

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback
}

export function createWardrobeTestPoseCommands(dependencies: WardrobeTestPoseCommandDependencies) {
  const invalidate = () => { dependencies.requestRef.current += 1 }

  return {
    openPicker: async (modelSlot: number): Promise<void> => {
      const requestId = ++dependencies.requestRef.current
      dependencies.setError('')
      dependencies.setPickerOpen(true)
      dependencies.setLoading(true)
      try {
        const slots = await dependencies.listPoseSlots(modelSlot)
        if (requestId !== dependencies.requestRef.current) return
        dependencies.setPoseSlots(slots.filter((slot): slot is NonNullable<FabricatorPoseSummary> => slot !== null))
      } catch (reason) {
        if (requestId === dependencies.requestRef.current) {
          dependencies.setError(errorMessage(reason, 'Não foi possível carregar as poses deste modelo.'))
        }
      } finally {
        if (requestId === dependencies.requestRef.current) dependencies.setLoading(false)
      }
    },

    loadPose: async (modelSlot: number, poseSlot: number): Promise<void> => {
      const requestId = ++dependencies.requestRef.current
      dependencies.setLoading(true)
      try {
        const pose = await dependencies.loadPose(modelSlot, poseSlot)
        if (requestId !== dependencies.requestRef.current) return
        if (!pose || pose.sourceModelSlot !== modelSlot || pose.slot !== poseSlot) {
          throw new Error('Esta pose não está mais disponível para o modelo selecionado.')
        }
        dependencies.clearDragOffsets()
        dependencies.disableJoinJoints()
        dependencies.setPose(pose)
        dependencies.setPickerOpen(false)
        dependencies.setError('')
      } catch (reason) {
        if (requestId === dependencies.requestRef.current) {
          dependencies.setError(errorMessage(reason, 'Não foi possível abrir esta pose.'))
        }
      } finally {
        if (requestId === dependencies.requestRef.current) dependencies.setLoading(false)
      }
    },

    closePicker: () => {
      invalidate()
      dependencies.setLoading(false)
      dependencies.setPickerOpen(false)
    },

    exitPose: () => {
      invalidate()
      dependencies.setPose(null)
      dependencies.setLoading(false)
      dependencies.clearDragOffsets()
    },

    invalidate
  }
}
