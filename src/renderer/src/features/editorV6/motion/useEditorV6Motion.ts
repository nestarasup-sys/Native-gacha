import { useEffect, useMemo, useRef, useState } from 'react'
import type { CustomizerCharacter } from '../../../../../shared/customizer'
import type { EditorV6Document } from '../../../../../shared/editorV6'
import { attachEditorV6Motion, missingEditorV6Motions, type EditorV6MotionBakeResult } from '../../../../../shared/editorV6Motion'

const cache = new Map<string, EditorV6MotionBakeResult>()
function remember(key: string, result: EditorV6MotionBakeResult) {
  cache.delete(key); cache.set(key, result)
  while (cache.size > 8 || [...cache.values()].reduce((bytes, entry) => bytes + entry.asset.dataUrl.length, 0) > 24_000_000) cache.delete(cache.keys().next().value!)
}
/** One latest-revision bake at a time. Play/seek never call this preparation pipeline. */
export function useEditorV6Motion(project: EditorV6Document | null, characters: CustomizerCharacter[], enabled: boolean, update: (change: (project: EditorV6Document) => EditorV6Document) => void) {
  const missing = useMemo(() => project ? missingEditorV6Motions(project) : [], [project?.timeline, project?.assets])
  const current = missing[0], character = characters.find((item) => item.id === current?.characterId)
  const updateRef = useRef(update); updateRef.current = update
  const failure = useRef<{ key: string; error: string } | null>(null)
  const [status, setStatus] = useState(''), [retry, setRetry] = useState(0)
  const key = current ? JSON.stringify([current.key, character?.updatedAt]) : ''
  useEffect(() => {
    if (!enabled || !current || failure.current?.key === key) return
    if (!character) { const error = 'O personagem da animação não foi encontrado no Customizador.'; failure.current = { key, error }; setStatus(error); return }
    let stopped = false, requestId: string | null = null
    const timer = window.setTimeout(() => {
      setStatus(`Preparando animação de ${current.from.text}…`)
      const cached = cache.get(key)
      const operation = cached ? Promise.resolve(cached) : window.desktop.bakeEditorV6Motion({ id: requestId = crypto.randomUUID(), plan: current, character })
      void operation.then((result) => {
        remember(key, result)
        if (!stopped) { failure.current = null; updateRef.current((document) => attachEditorV6Motion(document, current.blockId, result)); setStatus('') }
      }).catch((error: unknown) => {
        if (!stopped) { const message = error instanceof Error ? error.message : String(error); failure.current = { key, error: message }; setStatus(message) }
      })
    }, 250)
    return () => { stopped = true; clearTimeout(timer); if (requestId) void window.desktop.cancelEditorV6Motion(requestId).catch(() => {}) }
  }, [key, enabled, retry, current?.blockId])
  return { pending: missing.length, ready: missing.length === 0, error: missing.length && failure.current?.key === key ? failure.current.error : undefined, message: missing.length ? status || 'Preparando animações de pose e expressão…' : '', retry: () => { failure.current = null; setRetry((value) => value + 1) } }
}
