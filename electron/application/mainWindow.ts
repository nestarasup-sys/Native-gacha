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
        // Normal windows retain Chromium's background throttling. Stress sessions
        // keep their preview clock active while the window stays off-display.
        backgroundThrottling: videoStressOffscreen || syntheticAiTest ? false : true
      }
    })

    if (videoStressOffscreen) {
      window.setSkipTaskbar(true)
      window.once('ready-to-show', () => {
        // A never-shown BrowserWindow is throttled by some Windows compositor
        // paths despite backgroundThrottling=false. An off-display native window
        // keeps real Electron rendering active without appearing on any monitor.
        window.setPosition(-32000, -32000)
        window.showInactive()
      })
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

    if (deps.rendererUrl) void window.loadURL(deps.rendererUrl)
    else void window.loadFile(deps.rendererPath)
    return window
  }
}
