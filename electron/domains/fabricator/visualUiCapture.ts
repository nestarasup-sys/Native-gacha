/** Captura as telas reais do Fabricador, dentro do perfil de teste DEV AI.
 * Os dados da biblioteca de produção nunca são montados nem modificados.
 */
import type { BrowserWindow } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const sections = [
  ['modelos', 'Modelos Dev'], ['poses', 'Poses Dev'], ['roupas', 'Roupas Dev'],
  ['olhos', 'Olhos Dev'], ['rosto', 'Rosto Dev'], ['expressoes', 'Preset Expressão Dev'],
  ['cabelos', 'Cabelos Dev'], ['animador', 'Animador Dev']
] as const

async function waitFor(win: BrowserWindow, selector: string, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) throw new Error('Janela de captura foi fechada.')
    const present = await win.webContents.executeJavaScript(
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`
    ) as boolean
    if (present) return
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error('Tela não abriu: ' + selector)
}
async function compareScreenshot(image: Buffer, baselinePath: string): Promise<number> {
  const [a, b] = await Promise.all([
    sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(await readFile(baselinePath)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  ])
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) throw new Error('Dimensões da baseline diferentes: ' + baselinePath)
  let changed = 0
  // Tolerância de 8 por canal para diferenças de anti-aliasing entre drivers.
  for (let i = 0; i < a.data.length; i += 4) {
    if ([0, 1, 2, 3].some(ch => Math.abs(a.data[i + ch] - b.data[i + ch]) > 8)) changed++
  }
  return changed
}

export async function captureFabricatorRealScreens(win: BrowserWindow, output: string, baseline?: string): Promise<void> {
  await mkdir(output, { recursive: true })
  await win.webContents.executeJavaScript("window.location.hash = '#/fabricador-dev'")
  await waitFor(win, '.fabricator-section-list')
  const results: Array<{ section: string; file: string; dimensions: string; sha256: string; changedPixels?: number }> = []
  for (const [key, label] of sections) {
    const clicked = await win.webContents.executeJavaScript(`(() => {
      const label = ${JSON.stringify(label)}
      const button = [...document.querySelectorAll('.fabricator-section-button')]
        .find(item => item.textContent?.trim() === label)
      if (!button) return false
      button.click()
      return true
    })()`) as boolean
    if (!clicked) throw new Error('Seção real ausente: ' + label)
    await waitFor(win, '.fabricator-section-button[aria-pressed="true"]')
    await new Promise(resolve => setTimeout(resolve, 900))
    const active = await win.webContents.executeJavaScript(`(() => {
      const active = [...document.querySelectorAll('.fabricator-section-button')]
        .filter(item => item.getAttribute('aria-pressed') === 'true')
      return active.map(item => item.textContent?.trim() ?? '')
    })()`) as string[]
    if (!active.includes(label)) throw new Error('Captura selecionou seção errada: ' + label + ' (ativos: ' + active.join(', ') + ')')
    const png = await win.webContents.capturePage()
    const image = png.toPNG()
    const name = key + '.png'
    await writeFile(join(output, name), image)
    const size = png.getSize()
    const result: { section: string; file: string; dimensions: string; sha256: string; changedPixels?: number } = {
      section: label, file: name, dimensions: size.width + 'x' + size.height,
      sha256: createHash('sha256').update(image).digest('hex')
    }
    if (baseline) {
      const changed = await compareScreenshot(image, join(baseline, name))
      result.changedPixels = changed
      if (changed > size.width * size.height * .01) {
        throw new Error('Regressão visual na seção ' + label + ': ' + changed + ' pixels diferentes.')
      }
    }
    results.push(result)
  }
  await writeFile(join(output, 'manifest.json'), JSON.stringify({ schemaVersion:1, mode:'real-electron-ui', capturedAt:new Date().toISOString(), results }, null, 2), 'utf8')
}

/** Smoke gráfico de Customizador e Studio: navega no Electron REAL e cria
 * uma cena apenas no perfil sintético do runner. Requer GACHA_DEV_AI_TEST.
 * Não confundir screenshot integridade com aprovação visual humana.
 */
export async function captureCustomizerStudioRealScreens(win: BrowserWindow, output: string): Promise<void> {
  await mkdir(output, { recursive: true })
  const result: Array<{ section: string; file: string; dimensions: string; sha256: string }> = []
  const capture = async (section: string, file: string) => {
    await new Promise(resolve => setTimeout(resolve, 850))
    const png = (await win.webContents.capturePage()).toPNG()
    const info = await sharp(png).metadata()
    if (!info.width || !info.height) throw new Error('Screenshot real sem dimensões: ' + section)
    await writeFile(join(output, file), png)
    result.push({ section, file, dimensions: info.width + 'x' + info.height, sha256: createHash('sha256').update(png).digest('hex') })
  }
  await win.webContents.executeJavaScript("window.location.hash = '#/customizar'")
  await waitFor(win, '.roster-panel')
  await capture('Customizador', 'customizador.png')

  await win.webContents.executeJavaScript("window.location.hash = '#/estudio'")
  await waitFor(win, '.studio-page')
  await waitFor(win, 'button.studio-action-primary:not([disabled])')
  const clicked = await win.webContents.executeJavaScript(`(() => {
    const button = document.querySelector('button.studio-action-primary:not([disabled])')
    if (!button) return false
    button.click()
    return true
  })()`) as boolean
  if (!clicked) throw new Error('Não foi possível criar cena no Studio real.')
  await waitFor(win, '.studio-scene-area')
  await capture('Studio Principal — cena criada', 'studio.png')
  await writeFile(join(output, 'workspace-manifest.json'), JSON.stringify({
    schemaVersion: 1, mode: 'real-electron-workspaces', syntheticOnly: true,
    capturedAt: new Date().toISOString(), results: result
  }, null, 2), 'utf8')
}
