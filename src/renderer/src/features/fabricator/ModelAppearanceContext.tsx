import { createContext, useCallback, useContext, useEffect, useMemo, type PropsWithChildren } from 'react'
import type { ModelPart } from '../../../../shared/fabricator'

type AppearanceContextValue = {
  slot: number | null
  previewUrls: Record<string, string>
  modelSkinTone?: string
  modelOutlineColor?: string
  setTargetSlot: (slot: number | null) => void
}

const ModelAppearanceContext = createContext<AppearanceContextValue | null>(null)

export function ModelAppearanceProvider({
  slot,
  previewUrls,
  modelSkinTone,
  modelOutlineColor,
  setTargetSlot,
  children
}: PropsWithChildren<AppearanceContextValue>) {
  const value = useMemo(() => ({ slot, previewUrls, modelSkinTone, modelOutlineColor, setTargetSlot }), [slot, previewUrls, modelSkinTone, modelOutlineColor, setTargetSlot])
  return <ModelAppearanceContext.Provider value={value}>{children}</ModelAppearanceContext.Provider>
}

/** Makes an area's model selection the target of the shared appearance controls. */
export function useModelAppearanceTarget(slot: number | null): void {
  const context = useContext(ModelAppearanceContext)
  const setTargetSlot = context?.setTargetSlot
  useEffect(() => {
    if (setTargetSlot && slot !== null) setTargetSlot(slot)
  }, [setTargetSlot, slot])
}

/** Returns a tinted preview for parts that belong to the currently selected base model. */
export function useModelPartAppearancePreview(slot: number | null) {
  const context = useContext(ModelAppearanceContext)
  return useCallback((part: Pick<ModelPart, 'id' | 'dataUrl'>) => {
    if (slot === null || context?.slot !== slot) return part.dataUrl
    return context.previewUrls[`${slot}:${part.id}`] ?? part.dataUrl
  }, [context, slot])
}

export function useModelAppearanceSettings(slot: number | null) {
  const context = useContext(ModelAppearanceContext)
  if (slot === null || context?.slot !== slot) return null
  return { modelSkinTone: context.modelSkinTone, modelOutlineColor: context.modelOutlineColor }
}
