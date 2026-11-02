import type { BrowserWindow } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

async function waitFor(win: BrowserWindow, selector: string, description: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) throw new Error('Janela sintética da Logs Dev foi fechada.')
    const exists = await win.webContents.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`) as boolean
    if (exists) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Conteúdo da Logs Dev não abriu: ${description}`)
}

async function waitForRendered(win: BrowserWindow, selector: string, description: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let consecutive = 0
  while (Date.now() < deadline) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) throw new Error('Janela sintética da Logs Dev foi fechada.')
    const ready = await win.webContents.executeJavaScript(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)})
      if (!element || !element.isConnected) return false
      const rectangle = element.getBoundingClientRect()
      return rectangle.width > 0 && rectangle.height > 0 && !document.body.innerText.includes('Carregando área…')
    })()`) as boolean
    consecutive = ready ? consecutive + 1 : 0
    if (consecutive >= 4) return
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`A interface da Logs Dev não estabilizou: ${description}`)
}

async function clickText(win: BrowserWindow, selector: string, text: string): Promise<void> {
  const clicked = await win.webContents.executeJavaScript(`(() => {
    const target = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find(element => element.textContent?.trim() === ${JSON.stringify(text)})
    if (!target || target.matches(':disabled')) return false
    target.click()
    return true
  })()`) as boolean
  if (!clicked) throw new Error(`Ação sintética indisponível na Logs Dev: ${text}`)
}

async function waitForOverviewEvents(win: BrowserWindow): Promise<void> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const settled = await win.webContents.executeJavaScript(
      `document.querySelector('.options-health-copy strong')?.textContent?.trim() !== 'Carregando os registros locais'`
    ) as boolean
    if (settled) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('A visão geral da Logs Dev não terminou de carregar os eventos locais.')
}

export async function captureLogsDevRealScreens(win: BrowserWindow, outputDirectory: string): Promise<void> {
  await mkdir(outputDirectory, { recursive: true })
  await win.webContents.executeJavaScript("window.location.hash = '#/logs-dev'")
  await waitFor(win, 'main[aria-label="Logs Dev"] .options-overview-grid', 'Visão geral')
  await waitForRendered(win, 'main[aria-label="Logs Dev"] .options-overview-grid', 'Visão geral')
  await waitForOverviewEvents(win)

  async function capture(name: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 250))
    const image = await win.webContents.capturePage()
    await writeFile(join(outputDirectory, `${name}.png`), image.toPNG())
  }

  await capture('01-overview')
  await clickText(win, '[aria-label="Seções de Logs Dev"] button', 'Eventos e logs')
  await waitFor(win, 'section[aria-label="Eventos e logs"]', 'Eventos e logs')
  await waitForRendered(win, 'section[aria-label="Eventos e logs"]', 'Eventos e logs')
  await capture('02-events')
  await clickText(win, '[aria-label="Seções de Logs Dev"] button', 'Desempenho')
  await waitFor(win, 'section[aria-label="Leituras de desempenho"]', 'Desempenho')
  await waitForRendered(win, 'section[aria-label="Leituras de desempenho"]', 'Desempenho')
  await clickText(win, 'section[aria-label="Leituras de desempenho"] button', 'Medir agora')
  await waitFor(win, 'section[aria-label="Métricas por processo"]', 'Métricas por processo')
  await waitForRendered(win, 'section[aria-label="Métricas por processo"]', 'Métricas por processo')
  await waitFor(win, 'section[aria-label="Estatísticas agregadas de IPC"]', 'Latências IPC')
  await capture('03-performance')
  await clickText(win, '[aria-label="Seções de Logs Dev"] button', 'Armazenamento')
  await waitFor(win, 'section[aria-label="Armazenamento local"]', 'Armazenamento')
  await clickText(win, 'section[aria-label="Armazenamento local"] button', 'Medir armazenamento')
  await waitFor(win, '.options-storage-total', 'Resumo de armazenamento')
  await waitForRendered(win, 'section[aria-label="Armazenamento local"]', 'Armazenamento')
  await capture('04-storage')
  await clickText(win, '[aria-label="Seções de Logs Dev"] button', 'Backups e recuperação')
  await waitFor(win, 'section[aria-label="Backups e recuperação"]', 'Backups e recuperação')
  await waitForRendered(win, 'section[aria-label="Backups e recuperação"]', 'Backups e recuperação')
  await capture('05-backups')
  await clickText(win, '[aria-label="Seções de Logs Dev"] button', 'Ferramentas Dev')
  await waitFor(win, 'details.options-advanced summary', 'Ferramentas Dev')
  await win.webContents.executeJavaScript('document.querySelector("details.options-advanced summary")?.click()')
  await waitFor(win, 'section[aria-label="Migração de dados antigos"]', 'Migração legada')
  await waitForRendered(win, 'section[aria-label="Migração de dados antigos"]', 'Migração legada')
  await capture('06-tools')
}
