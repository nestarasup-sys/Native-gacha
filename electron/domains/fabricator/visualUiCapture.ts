/** Captura as telas reais do Fabricador, dentro do perfil de teste DEV AI.
 * Os dados da biblioteca de produção nunca são montados nem modificados.
 */
import type { BrowserWindow } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
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
  const results: Array<{ section: string; file: string; dimensions: string; changedPixels?: number }> = []
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
    const png = await win.webContents.capturePage()
    const image = png.toPNG()
    const name = key + '.png'
    await writeFile(join(output, name), image)
    const size = png.getSize()
    const result: { section: string; file: string; dimensions: string; changedPixels?: number } = {
      section: label, file: name, dimensions: size.width + 'x' + size.height
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
