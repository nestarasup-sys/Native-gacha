/** Recarrega apenas a referência de imagem ao publicar Model Source.
 * Preserva rascunhos, animações e edições locais do consumidor.
 */
import { useEffect, useRef } from 'react'
import type { FabricatorProject } from '../../../../../shared/fabricator'
import { subscribeModelSourceUpdate } from './modelSourceEvents'

export function useModelSourceRefresh(
  slot: number | null,
  onSource: (project: FabricatorProject | null) => void
): void {
  const consumer = useRef(onSource)
  consumer.current = onSource
  useEffect(() => {
    if (slot === null || !Number.isInteger(slot) || slot < 1) return
    let active = true
    const unsubscribe = subscribeModelSourceUpdate(slot, () => {
      void window.desktop.loadFabricatorSlot(slot).then(project => {
        if (active) consumer.current(project)
      }).catch(() => {
        // Mantém a prévia anterior se o recarregamento falhar; não perde rascunho.
      })
    })
    return () => { active = false; unsubscribe() }
  }, [slot])
}
