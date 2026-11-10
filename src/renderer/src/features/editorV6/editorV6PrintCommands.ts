import type { EditorV6Document } from '../../../../shared/editorV6'

type TrackOperation = <T>(operation: () => Promise<T>) => Promise<T>

type EditorV6PrintCommandDependencies = {
  trackOperation: TrackOperation
  flushDocumentWrites: () => Promise<void>
  getFrame: () => number
  captureFrame: (project: EditorV6Document, frame: number, width: number, height: number, mimeType: string) => Promise<string>
  savePrint: (projectId: string, dataUrl: string) => Promise<string | null>
  openPrints: (projectId: string) => Promise<void>
  setError: (message: string | null) => void
  setNotice: (message: string) => void
}

/** Coordinates print capture and persistence while leaving EditorV6Page as the UI owner. */
export function createEditorV6PrintCommands(dependencies: EditorV6PrintCommandDependencies) {
  const exportPrint = (project: EditorV6Document | null) => {
    if (!project) return
    return dependencies.trackOperation(async () => {
      try {
        await dependencies.flushDocumentWrites()
        const image = await dependencies.captureFrame(project, dependencies.getFrame(), 1920, 1080, 'image/png')
        const path = await dependencies.savePrint(project.id, image)
        if (path) {
          dependencies.setError(null)
          dependencies.setNotice(`Print salvo em ${path}`)
        }
      } catch (reason) {
        dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível gerar o print.')
      }
    })
  }

  const openPrints = (projectId: string | null) => dependencies.trackOperation(async () => {
    if (!projectId) return
    try {
      await dependencies.openPrints(projectId)
    } catch (reason) {
      dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a pasta de prints.')
    }
  })

  return { exportPrint, openPrints }
}
