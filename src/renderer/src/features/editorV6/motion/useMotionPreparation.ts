import { useEffect, useRef } from 'react'
import type { EditorV6Document } from '../../../../../shared/editorV6'
import type { CustomizerCharacter } from '../../../../../shared/customizer'
import { missingEditorV6Motions } from '../../../../../shared/editorV6Motion'
import { createCompletedMotionPreparation, hasCompletedMotionPreparation, indexMotionPreparationCharacters, rememberCompletedMotionPreparation } from './motionPreparationModel'

/** Warm the bounded disk cache only while the saved editor is idle. */
export function useMotionPreparation(project: EditorV6Document | null, characters: CustomizerCharacter[], enabled: boolean) {
  const doneRef = useRef<ReturnType<typeof createCompletedMotionPreparation> | null>(null)
  if (!doneRef.current) doneRef.current = createCompletedMotionPreparation()
  const done = doneRef.current
  useEffect(() => {
    if (!project || !enabled) return
    let disposed = false, generation = 0, timer = 0, requestId: string | undefined, pointerHeld = false
    const cancelRequest = () => {
      generation++; window.clearTimeout(timer)
      const id = requestId; requestId = undefined
      if (id) void window.desktop.editorV6.cancelEditorV6Motion(id).catch(() => {})
    }
    async function prepare(epoch: number) {
      const unique = new Map(missingEditorV6Motions(project!).map((plan) => [plan.key, plan]))
      const characterIndex = indexMotionPreparationCharacters(characters)
      for (const plan of unique.values()) {
        if (disposed || epoch !== generation) return
        const indexedCharacter = characterIndex.get(plan.characterId)
        if (!indexedCharacter || hasCompletedMotionPreparation(done, plan.key, indexedCharacter)) continue
        const id = crypto.randomUUID()
        requestId = id
        try {
          await window.desktop.editorV6.prepareEditorV6Motion({ id, plan, character: indexedCharacter.character })
          if (disposed || epoch !== generation) return
          rememberCompletedMotionPreparation(done, plan.key, indexedCharacter)
        } catch (error) {
          if (!disposed && epoch === generation) console.warn('Preparação antecipada de transição adiada:', error)
          return
        } finally { if (requestId === id) requestId = undefined }
        await new Promise<void>((resolve) => window.setTimeout(resolve, 150))
      }
    }
    const schedule = () => {
      cancelRequest()
      if (disposed || pointerHeld) return
      const epoch = generation
      timer = window.setTimeout(() => { void prepare(epoch) }, 2500)
    }
    const pointerDown = () => { pointerHeld = true; cancelRequest() }
    const pointerUp = () => { pointerHeld = false; schedule() }
    document.addEventListener('pointerdown', pointerDown, true)
    document.addEventListener('pointerup', pointerUp, true)
    document.addEventListener('pointercancel', pointerUp, true)
    document.addEventListener('keydown', schedule, true)
    document.addEventListener('wheel', schedule, { capture: true, passive: true })
    schedule()
    return () => {
      disposed = true; cancelRequest()
      document.removeEventListener('pointerdown', pointerDown, true)
      document.removeEventListener('pointerup', pointerUp, true)
      document.removeEventListener('pointercancel', pointerUp, true)
      document.removeEventListener('keydown', schedule, true)
      document.removeEventListener('wheel', schedule, true)
    }
  }, [project, characters, enabled])
}
