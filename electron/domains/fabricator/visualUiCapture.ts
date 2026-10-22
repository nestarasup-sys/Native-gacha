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
/** E2E real sobre perfil descartável: cria personagem pela UI, salva customização
 * pelo IPC público, adiciona elenco pela UI e reinicia o Electron em fase 2.
 */
export async function captureCustomizerStudioRealScreens(win: BrowserWindow, output: string): Promise<void> {
  await mkdir(output, { recursive: true })
  const results: Array<{ section: string; file: string; dimensions: string; sha256: string }> = []
  const capture = async (section: string, file: string) => {
    await new Promise(resolve => setTimeout(resolve, 700))
    const png = (await win.webContents.capturePage()).toPNG()
    const info = await sharp(png).metadata()
    if (!info.width || !info.height) throw Error('Screenshot Electron sem dimensões: ' + section)
    await writeFile(join(output, file), png)
    results.push({ section, file, dimensions: info.width + 'x' + info.height, sha256: createHash('sha256').update(png).digest('hex') })
  }
  const name = 'Nymi E2E sintético'
  await win.webContents.executeJavaScript("window.location.hash = '#/customizar'")
  await waitFor(win, '.roster-panel')
  const createdByUi = await win.webContents.executeJavaScript(`(() => {
    const button = document.querySelector('button[aria-label="Adicionar personagem"]')
    if (!button) return false
    button.click()
    return true
  })()`) as boolean
  if (!createdByUi) throw Error('Botão de criação de personagem ausente no Customizador.')
  await waitFor(win, '#character-name')
  const submitted = await win.webContents.executeJavaScript(`(() => {
    const field = document.querySelector('#character-name')
    if (!(field instanceof HTMLInputElement)) return false
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (!set) return false
    set.call(field, ${JSON.stringify(name)})
    field.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`) as boolean
  if (!submitted) throw Error('Não foi possível inserir nome do personagem pela UI.')
  await waitFor(win, '.character-dialog .primary-button:not([disabled])')
  await win.webContents.executeJavaScript("document.querySelector('.character-dialog')?.requestSubmit()")
  const deadline = Date.now() + 20000
  let character: { id: string; name: string; customization: Record<string, unknown>; updatedAt: string } | null = null
  while (Date.now() < deadline) {
    character = await win.webContents.executeJavaScript(`window.desktop.listCustomizerCharacters().then(list => list.find(item => item.name === ${JSON.stringify(name)}) ?? null)`) as typeof character
    if (character) break
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  if (!character) throw Error('Personagem não persistiu após clique do formulário.')
  const id = character.id
  // Usa o MESMO contrato de personalização que a UI invoca, sem editar modelo-fonte.
  const changed = await win.webContents.executeJavaScript(`(async () => {
    const list = await window.desktop.listCustomizerCharacters()
    const character = list.find(item => item.id === ${JSON.stringify(id)})
    if (!character) return false
    await window.desktop.saveCustomizerCharacter({
      ...character,
      customization: { ...character.customization, modelSlot: 1, poseSlot: 1 },
      updatedAt: new Date().toISOString()
    })
    return true
  })()`) as boolean
  if (!changed) throw Error('Personalização não foi salva via API pública.')
  await win.webContents.executeJavaScript("window.location.hash = '#/estudio'")
  await waitFor(win, '.studio-page')
  await win.webContents.executeJavaScript("window.location.hash = '#/customizar'")
  await waitFor(win, '.roster-panel')
  await waitFor(win, '.character-card')
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
  if (!clicked) throw Error('Não foi possível criar cena no Studio real.')
  await waitFor(win, 'button.studio-card-open')
  const opened = await win.webContents.executeJavaScript(`(() => {
    const button = document.querySelector('button.studio-card-open')
    if (!button) return false
    button.click()
    return true
  })()`) as boolean
  if (!opened) throw Error('Não foi possível abrir cena no Studio real.')
  await waitFor(win, '.studio-scene-area')
  await waitFor(win, '.studio-cast-add-button')
  const castOpened = await win.webContents.executeJavaScript(`(() => {
    const button = document.querySelector('.studio-cast-add-button')
    if (!button) return false
    button.click()
    return true
  })()`) as boolean
  if (!castOpened) throw Error('Não foi possível abrir elenco na cena real.')
  await waitFor(win, '.studio-cast-modal-option')
  const castChosen = await win.webContents.executeJavaScript(`(() => {
    const option = [...document.querySelectorAll('.studio-cast-modal-option')]
      .find(item => item.textContent?.includes(${JSON.stringify(name)}))
    if (!option) return false
    option.click()
    return true
  })()`) as boolean
  if (!castChosen) throw Error('Personagem sintético não apareceu no seletor de elenco.')
  // React precisa renderizar o novo castSelection antes do callback de salvar.
  await waitFor(win, '.studio-cast-modal-option.selected')
  await win.webContents.executeJavaScript("document.querySelector('.studio-cast-modal-save')?.click()")
  await waitFor(win, '.studio-cast-item', 30000)
  const studios = await win.webContents.executeJavaScript('window.desktop.listStudios()') as Array<{ id: string; title: string; elements: Array<{ characterId?: string }> }>
  const studio = studios.find(item => item.elements.some(element => element.characterId === id))
  if (!studio) throw Error('Elenco não persistiu no Studio Principal.')
  await capture('Studio Principal — elenco salvo', 'studio.png')
  await writeFile(join(output, 'flow-state.json'), JSON.stringify({ schemaVersion: 1, syntheticOnly: true, characterId: id, studioId: studio.id, name }, null, 2))
  await writeFile(join(output, 'workspace-manifest.json'), JSON.stringify({
    schemaVersion: 1, mode: 'real-electron-workspaces', syntheticOnly: true,
    capturedAt: new Date().toISOString(), results
  }, null, 2), 'utf8')
}

/** Chamado num processo Electron NOVO, apontando para o mesmo perfil sintético.
 * Prova reidratação real por IPC e renderização da cena após reinicialização.
 */
export async function captureCustomizerStudioReopened(win: BrowserWindow, output: string): Promise<void> {
  const flow = JSON.parse(await readFile(join(output, 'flow-state.json'), 'utf8')) as {
    schemaVersion: number; syntheticOnly: boolean; characterId: string; studioId: string; name: string
  }
  if (flow.schemaVersion !== 1 || flow.syntheticOnly !== true) throw Error('Fixture de reinício inválida.')
  await win.webContents.executeJavaScript("window.location.hash = '#/customizar'")
  await waitFor(win, '.roster-panel')
  const characters = await win.webContents.executeJavaScript('window.desktop.listCustomizerCharacters()') as Array<{ id: string; name: string; customization: { modelSlot: number; poseSlot: number } }>
  const saved = characters.find(item => item.id === flow.characterId && item.name === flow.name)
  if (!saved || saved.customization.modelSlot !== 1 || saved.customization.poseSlot !== 1) throw Error('Customizador perdeu a personalização após reiniciar.')
  await win.webContents.executeJavaScript("window.location.hash = '#/estudio'")
  await waitFor(win, '.studio-page')
  const studios = await win.webContents.executeJavaScript('window.desktop.listStudios()') as Array<{ id: string; elements: Array<{ characterId?: string; assetId?: string }>; assets: Array<{ id: string; dataUrl: string }> }>
  const scene = studios.find(item => item.id === flow.studioId)
  if (!scene || !scene.elements.some(item => item.characterId === flow.characterId)) throw Error('Studio perdeu elenco após reiniciar.')
  if (scene.elements.some(element => element.characterId === flow.characterId &&
    !scene.assets.some(asset => asset.id === element.assetId && asset.dataUrl.startsWith('data:image/')))) {
    throw Error('Studio reabriu com imagem de personagem ausente.')
  }
  const opened = await win.webContents.executeJavaScript(`(() => {
    const button = document.querySelector('button.studio-card-open')
    if (!button) return false
    button.click()
    return true
  })()`) as boolean
  if (!opened) throw Error('Cena não reabriu na interface.')
  await waitFor(win, '.studio-cast-item', 30000)
  const image = (await win.webContents.capturePage()).toPNG()
  const info = await sharp(image).metadata()
  if (!info.width || !info.height) throw Error('Screenshot de reabertura sem dimensões.')
  const file = 'studio-reaberto.png'
  await writeFile(join(output, file), image)
  const manifest = JSON.parse(await readFile(join(output, 'workspace-manifest.json'), 'utf8')) as {
    results: Array<{ section: string; file: string; dimensions: string; sha256: string }>
  }
  manifest.results.push({
    section: 'Studio Principal — cena reaberta',
    file, dimensions: info.width + 'x' + info.height, sha256: createHash('sha256').update(image).digest('hex')
  })
  await writeFile(join(output, 'workspace-manifest.json'), JSON.stringify(manifest, null, 2))
}
