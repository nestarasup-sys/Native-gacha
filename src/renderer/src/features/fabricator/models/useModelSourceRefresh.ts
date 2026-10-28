/** Recarrega a fonte da versão oficial e ignora respostas assíncronas obsoletas.
 * Não limpa rascunhos nem assets de poses salvas.
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
    let sequence = 0
    const unsubscribe = subscribeModelSourceUpdate(slot, update => {
      const requested = ++sequence
      void window.desktop.fabricator.loadFabricatorSlot(slot).then(project => {
        // sourceAssetName muda a cada publicação: cache antigo jamais substitui o novo.
        if (active && requested === sequence && project?.sourceAssetName === update.sourceAssetName) {
          consumer.current(project)
        }
      }).catch(() => {
        // A interface mantém a última referência íntegra; não perde trabalho.
      })
    })
    return () => { active = false; sequence++; unsubscribe() }
  }, [slot])
}
