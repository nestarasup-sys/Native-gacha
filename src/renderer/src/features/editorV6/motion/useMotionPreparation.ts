import { useEffect, useRef } from 'react'
import type { EditorV6Document } from '../../../../../shared/editorV6'
import type { CustomizerCharacter } from '../../../../../shared/customizer'
import { missingEditorV6Motions } from '../../../../../shared/editorV6Motion'

/** Warm the bounded disk cache only while the saved editor is idle. */
export function useMotionPreparation(project: EditorV6Document | null, characters: CustomizerCharacter[], enabled: boolean) {
  const done = useRef(new Set<string>())
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
      for (const plan of unique.values()) {
        if (disposed || epoch !== generation) return
        const character = characters.find((item) => item.id === plan.characterId)
        if (!character) continue
        const key = JSON.stringify([plan.key, character])
        if (done.current.has(key)) continue
        const id = crypto.randomUUID()
        requestId = id
        try {
          await window.desktop.editorV6.prepareEditorV6Motion({ id, plan, character })
          if (disposed || epoch !== generation) return
          done.current.add(key)
          while (done.current.size > 256) done.current.delete(done.current.values().next().value!)
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
