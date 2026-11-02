import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { FabricatorProject, WardrobeComponent, WardrobeSet } from '../../../../../shared/fabricator'
import { fixWardrobeGlue, releaseWardrobeGlue } from '../../../../../shared/wardrobeGlue'
import { createWardrobeGridHistory } from './wardrobeGridHistory'

type CreateWardrobeBindingCommandsOptions = {
  selected: WardrobeComponent | null
  referenceModel: FabricatorProject | null
  pairedGridHistoryRef: MutableRefObject<ReturnType<typeof createWardrobeGridHistory>>
  setDraft: Dispatch<SetStateAction<WardrobeSet | null>>
  setDirty: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string>>
}

/** Creates the explicit fix/release actions used by the garment binding controls. */
export function createWardrobeBindingCommands({
  selected,
  referenceModel,
  pairedGridHistoryRef,
  setDraft,
  setDirty,
  setError
}: CreateWardrobeBindingCommandsOptions) {
  return {
    fixSelectedBinding() {
      if (!selected) return
      const bone = referenceModel?.parts.find((part) => part.id === selected.attachedPartId)
      if (!bone) return
      setDraft((current) => {
        if (!current) return current
        pairedGridHistoryRef.current.record(current)
        return { ...current, components: current.components.map((piece) => piece.id === selected.id ? fixWardrobeGlue(piece, bone) : piece), updatedAt: new Date().toISOString() }
      })
      setDirty(true)
      setError('')
    },
    releaseSelectedBinding() {
      if (!selected) return
      setDraft((current) => {
        if (!current) return current
        pairedGridHistoryRef.current.record(current)
        return { ...current, components: current.components.map((piece) => piece.id === selected.id ? releaseWardrobeGlue(piece) : piece), updatedAt: new Date().toISOString() }
      })
      setDirty(true)
    }
  }
}
