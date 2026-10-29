import type { WebContents } from 'electron'

/** Hash routes stay inside the app; only the main process loads documents. */
export function restrictRendererNavigation(contents: Pick<WebContents, 'on' | 'setWindowOpenHandler'>): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', event => event.preventDefault())
}
