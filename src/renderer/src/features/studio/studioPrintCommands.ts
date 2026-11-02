import type { StudioDocument } from '../../../../shared/studio'

type StudioPrintCommandDependencies = {
  trackOperation: <T>(operation: () => Promise<T>) => Promise<T>
  flushDocumentWrites: () => Promise<void>
  renderPrint: (studio: StudioDocument) => Promise<string>
  savePrint: (studioId: string, dataUrl: string) => Promise<string | null>
  trackIpcWrite: <T>(operation: Promise<T>) => Promise<T>
  openPrints: (studioId: string) => Promise<void>
  setError: (message: string | null) => void
  setNotice: (message: string) => void
}

/** Coordinates print rendering and persistence while leaving the Studio page as the UI owner. */
export function createStudioPrintCommands(dependencies: StudioPrintCommandDependencies) {
  const exportPrint = (studio: StudioDocument | null) => {
    if (!studio) return
    return dependencies.trackOperation(async () => {
      try {
        await dependencies.flushDocumentWrites()
        const image = await dependencies.renderPrint(studio)
        const path = await dependencies.trackIpcWrite(dependencies.savePrint(studio.id, image))
        if (path) {
          dependencies.setError(null)
          dependencies.setNotice(`Print salvo em ${path}`)
        }
      } catch (reason) {
        dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível gerar o print.')
      }
    })
  }

  const openPrints = (studioId: string | null) => dependencies.trackOperation(async () => {
    if (!studioId) return
    try {
      await dependencies.openPrints(studioId)
    } catch (reason) {
      dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a pasta de prints.')
    }
  })

  return { exportPrint, openPrints }
}
