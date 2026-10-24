import { app, type IpcMain, type IpcMainInvokeEvent } from 'electron'
import { totalmem, freemem } from 'node:os'
import { videoStudioMemoryReport, type VideoStudioProcessFailure } from '../../src/shared/videoStudioNext/diagnostics'

/** The Windows-only report/capture implementation does not belong in Electron main. */
export function registerVideoStudioWindowsDiagnostics(
  ipcMain: IpcMain,
  assertTrustedSender: (event: IpcMainInvokeEvent) => void,
  failures: () => VideoStudioProcessFailure[]
): void {
  ipcMain.handle('video-studio:diagnostics:memory', event => {
    assertTrustedSender(event)
    if (process.platform !== 'win32') throw new Error('Diagnóstico de Video Studio somente no Windows.')
    return videoStudioMemoryReport(app.getAppMetrics(), {
      sampledAt:new Date().toISOString(),platform:process.platform,mainPid:process.pid,
      totalRamBytes:totalmem(),freeRamBytes:freemem(),mainRssBytes:process.memoryUsage().rss,
      recentProcessFailures:failures()
    })
  })
  ipcMain.handle('video-studio:stress:capture-page', async event => {
    assertTrustedSender(event)
    if(process.env.GACHA_VIDEO_STRESS_OFFSCREEN!=='1'||process.platform!=='win32')
      throw new Error('Capturas de página só estão disponíveis na sessão oculta de estresse do Windows.')
    const image=await event.sender.capturePage()
    const size=image.getSize()
    return {width:size.width,height:size.height,pngBase64:image.toPNG().toString('base64')}
  })
}
