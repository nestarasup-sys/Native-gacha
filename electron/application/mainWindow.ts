import type { BrowserWindow, BrowserWindowConstructorOptions, WebContents } from 'electron'

export type MainWindowDependencies = {
  env: NodeJS.ProcessEnv
  createWindow: (options: BrowserWindowConstructorOptions) => BrowserWindow
  clearApplicationMenu: () => void
  iconPath: string
  preloadPath: string
  rendererPath: string
  rendererUrl?: string
  restrictNavigation: (contents: WebContents) => void
  onRendererLoaded: (window: BrowserWindow) => void
  onClosed: () => void
  flushRendererWrites: (window: BrowserWindow) => Promise<void>
  onFlushFailure: (window: BrowserWindow, reason: unknown) => void
}

/** Creates the app window and owns its navigation and persistence lifecycle. */
export function createMainWindowFactory(deps: MainWindowDependencies): () => BrowserWindow {
  return () => {
    deps.clearApplicationMenu()
    const videoStressOffscreen = deps.env.GACHA_VIDEO_STRESS_OFFSCREEN === '1'
    const syntheticAiTest = deps.env.GACHA_DEV_AI_TEST === '1'
    const window = deps.createWindow({
      show: !videoStressOffscreen && !syntheticAiTest,
      width: 1440,
      height: 900,
      minWidth: 1120,
      minHeight: 720,
      backgroundColor: '#f7f8fa',
      title: 'Gacha Nymi',
      icon: deps.iconPath,
      webPreferences: {
        preload: deps.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        ...(videoStressOffscreen ? { offscreen: true } : {}),
        // Normal windows retain Chromium's background throttling. Stress sessions
        // keep their preview clock active in a hidden offscreen BrowserWindow.
        backgroundThrottling: videoStressOffscreen || syntheticAiTest ? false : true
      }
    })

    if (videoStressOffscreen) {
      window.setSkipTaskbar(true)
    }

    deps.restrictNavigation(window.webContents)
    window.removeMenu()
    window.webContents.once('did-finish-load', () => deps.onRendererLoaded(window))
    window.on('closed', deps.onClosed)

    let closeAfterFlush = false
    let flushingBeforeClose = false
    window.on('close', (event) => {
      if (closeAfterFlush) return
      event.preventDefault()
      if (flushingBeforeClose) return
      flushingBeforeClose = true
      void deps.flushRendererWrites(window).then(() => {
        closeAfterFlush = true
        flushingBeforeClose = false
        if (!window.isDestroyed()) window.close()
      }).catch((reason: unknown) => {
        flushingBeforeClose = false
        deps.onFlushFailure(window, reason)
      })
    })

    const hairStressHarness = videoStressOffscreen && /^\d+$/.test(deps.env.GACHA_EDITOR_V6_STRESS_HAIR_PRESET_SLOT ?? '')
    if (deps.rendererUrl) {
      const url = new URL(deps.rendererUrl)
      if (hairStressHarness) {
        url.searchParams.set('editorV6StressHairPreparation', '1')
        url.hash = '/editor-v6-stress-hair-preparation'
      }
      void window.loadURL(url.href)
    } else {
      void window.loadFile(deps.rendererPath, hairStressHarness
        ? { query: { editorV6StressHairPreparation: '1' }, hash: '/editor-v6-stress-hair-preparation' }
        : undefined)
    }
    return window
  }
}
