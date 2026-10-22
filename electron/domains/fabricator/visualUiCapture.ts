/** Captura as telas reais do Fabricador, dentro do perfil de teste DEV AI.
 * Os dados da biblioteca de produção nunca são montados nem modificados.
 */
import { app, type BrowserWindow } from 'electron'
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
/** Não aceitar screenshot do Suspense ou do skeleton de navegação.
 * Exigir DOM estável e conteúdo visível antes de cada captura de workspace.
 */
async function waitForRendered(win: BrowserWindow, selector: string, timeoutMs = 30000): Promise<void> {
  const until = Date.now() + timeoutMs
  let consecutive = 0
  while (Date.now() < until) {
    const ready = await win.webContents.executeJavaScript(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)})
      if (!element || !element.isConnected) return false
      const rectangle = element.getBoundingClientRect()
      return rectangle.width > 0 && rectangle.height > 0 &&
        !document.body.innerText.includes('Carregando área')
    })()`) as boolean
    consecutive = ready ? consecutive + 1 : 0
    if (consecutive >= 4) return
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Tela não terminou de renderizar (evitando screenshot de loading): ' + selector)
}

/** Regressão de pixels: peça com deslocamentos X/Y deve continuar no lado
 * correto do personagem. Nada é alterado na biblioteca pessoal do Fabricador.
 */
async function inspectSyntheticWardrobePreview(win: BrowserWindow, requirePoseOneOffsets = true): Promise<{
  source: 'customizer-overlay'; colors: Array<{ name: string; pixels: number; x: number; y: number }>
}> {
  await waitForRendered(win, 'img.customizer-wardrobe-overlay', 30000)
  const uri = await win.webContents.executeJavaScript(
    "document.querySelector('img.customizer-wardrobe-overlay')?.getAttribute('src') ?? null"
  ) as string | null
  if (!uri?.startsWith('data:image/png;base64,')) throw Error('Customizador não compôs a roupa em PNG.')
  const image = await sharp(Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64')).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const expected = [
    { name: 'coat', rgba: [212,82,115] },
    { name: 'sleeve-left', rgba: [42,174,207] },
    { name: 'sleeve-right', rgba: [237,177,60] }
  ]
  const colors = expected.map(item => {
    let sumX = 0, sumY = 0, count = 0
    for (let y = 0; y < image.info.height; y++) for (let x = 0; x < image.info.width; x++) {
      const index = (y * image.info.width + x) * 4
      if (image.data[index+3] < 160 || item.rgba.some((value,channel) => Math.abs(value-image.data[index+channel]) > 9)) continue
      sumX += x; sumY += y; count++
    }
    if (count < 15) throw Error('Peça sintética não apareceu na composição do Customizador: ' + item.name)
    return { name: item.name, pixels: count, x: sumX/count, y: sumY/count }
  })
  const left = colors[1], right = colors[2]
  if (requirePoseOneOffsets && (left.x >= right.x - 30 || left.y <= right.y + 6)) {
    throw Error('Offsets X/Y do Fabricador não sobreviveram no Customizador: ' + JSON.stringify(colors))
  }
  return { source: 'customizer-overlay', colors }
}

/** Sample the ACTUAL Chromium renderer in the synthetic Electron profile.
 * The screen may be idle; sampled FPS is diagnostic, not a gaming benchmark.
 * Never run this sampling or retain memory readings from production profiles.
 */
async function sampleElectronPerformance(win: BrowserWindow): Promise<{ sampledFps: number; frameP95Ms: number; rendererWorkingSetKb: number; rendererPrivateKb: number | null; jsHeapUsedBytes: number | null }> {
  const samples = await win.webContents.executeJavaScript(`new Promise(resolve => {
    const gaps = []; let previous = null
    function sample(now) {
      if (previous !== null) gaps.push(now - previous)
      previous = now
      if (gaps.length < 20) requestAnimationFrame(sample)
      else {
        gaps.sort((a,b) => a-b)
        const average = gaps.reduce((a,b) => a+b,0) / gaps.length
        const used = performance.memory?.usedJSHeapSize
        resolve({ sampledFps: 1000/average, frameP95Ms: gaps[Math.ceil(gaps.length*.95)-1],
          jsHeapUsedBytes: Number.isFinite(used) ? used : null })
      }
    }
    requestAnimationFrame(sample)
  })`) as { sampledFps: number; frameP95Ms: number; jsHeapUsedBytes: number | null }
  const rendererPid = win.webContents.getOSProcessId()
  const processMetric = app.getAppMetrics().find(item => item.pid === rendererPid)
  if (!processMetric?.memory || processMetric.memory.workingSetSize <= 0) throw Error('Processo renderizador Electron não forneceu métricas de memória.')
  return { ...samples, rendererWorkingSetKb: processMetric.memory.workingSetSize,
    rendererPrivateKb: processMetric.memory.privateBytes ?? null }
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
    await waitForRendered(win, '.fabricator-section-button[aria-pressed="true"]')
    if (key === 'roupas') {
      // Não fotografar biblioteca vazia: abrir a roupa sintética realmente salva.
      await waitForRendered(win, '.wardrobe-workspace')
      await waitFor(win, '.wardrobe-set-row', 30000)
      const opened = await win.webContents.executeJavaScript(`(() => {
        const item = [...document.querySelectorAll('.wardrobe-set-row')]
          .find(button => button.textContent?.includes('Jaqueta de teste'))
        if (!item) return false
        item.click()
        return true
      })()`) as boolean
      if (!opened) throw Error('Roupas Dev não listou o conjunto sintético.')
      await waitForRendered(win, '.wardrobe-preview-part', 30000)
      const count = await win.webContents.executeJavaScript(
        "document.querySelectorAll('.wardrobe-preview-part').length"
      ) as number
      if (count !== 3) throw Error('Prévia do Fabricador não mostra as três peças: ' + count)
    }
    await new Promise(resolve => setTimeout(resolve, 800))
    await waitForRendered(win, '.fabricator-section-button[aria-pressed="true"]')
    if (key === 'roupas') {
      // A contagem precisa continuar válida no instante da foto. O elemento
      // pode ter existido antes e a tela voltar ao placeholder ao hidratar.
      await waitForRendered(win, '.wardrobe-preview-part')
      const ready = await win.webContents.executeJavaScript(`(() => ({
        count: document.querySelectorAll('.wardrobe-preview-part').length,
        selectedSet: !!document.querySelector('.wardrobe-set-row.active'),
        activePiece: !!document.querySelector('.wardrobe-component-row.active')
      }))()`) as { count: number; selectedSet: boolean; activePiece: boolean }
      if (ready.count !== 3 || !ready.selectedSet || !ready.activePiece) {
        throw Error('Prévia de Roupas Dev não está estável no instante da foto: ' + JSON.stringify(ready))
      }
    }
    const active = await win.webContents.executeJavaScript(`(() => {
      const active = [...document.querySelectorAll('.fabricator-section-button')]
        .filter(item => item.getAttribute('aria-pressed') === 'true')
      return active.map(item => item.textContent?.trim() ?? '')
    })()`) as string[]
    if (!active.includes(label)) throw new Error('Captura selecionou seção errada: ' + label + ' (ativos: ' + active.join(', ') + ')')
    const png = await win.webContents.capturePage()
    const image = png.toPNG()
    const postCapture = await win.webContents.executeJavaScript(`(() => ({
      loading: document.body.innerText.includes('Carregando área'),
      garmentCount: document.querySelectorAll('.wardrobe-preview-part').length
    }))()`) as { loading: boolean; garmentCount: number }
    if (postCapture.loading || (key === 'roupas' && postCapture.garmentCount !== 3)) {
      throw Error('Screenshot capturado durante transição ou sem roupa: ' + key + ' ' + JSON.stringify(postCapture))
    }
    const name = key + '.png'
    await writeFile(join(output, name), image)
    const size = png.getSize()
    const result: { section: string; file: string; dimensions: string; sha256: string; changedPixels?: number; contentVerified?: string } = {
      section: label, file: name, dimensions: size.width + 'x' + size.height,
      sha256: createHash('sha256').update(image).digest('hex'),
      ...(key === 'roupas' ? { contentVerified: 'three-fitted-garments' } : {})
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
  const startedAt = Date.now()
  const results: Array<{ section: string; file: string; dimensions: string; sha256: string }> = []
  const capture = async (section: string, file: string) => {
    const selector = section === 'Customizador' ? '.roster-panel' : '.studio-scene-area'
    await waitForRendered(win, selector)
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
    character = await win.webContents.executeJavaScript(`window.desktop.listCustomizerCharacters().then(list => list.find(item => item.name === ${JSON.stringify(name)}) ?? null)`) as { id: string; name: string; customization: Record<string, unknown>; updatedAt: string } | null
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
    const wardrobe = await window.desktop.loadWardrobeSet(1, 'uniform')
    if (!wardrobe || wardrobe.components.length !== 3 ||
        new Set(wardrobe.components.map(component => component.dataUrl)).size !== 3) {
      throw new Error('Roupas Dev retornou manga duplicada ou perdeu componente.')
    }
    const wardrobeGroups = wardrobe.components.map(component => ({
      modelSlot: 1, setId: wardrobe.id, category: component.category,
      componentId: component.id, offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0
    }))
    await window.desktop.saveCustomizerCharacter({
      ...character,
      customization: { ...character.customization, modelSlot: 1, poseSlot: 1, wardrobeGroups },
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
  const focused = await win.webContents.executeJavaScript(`(() => {
    const card = [...document.querySelectorAll('.character-card')]
      .find(item => item.textContent?.includes(${JSON.stringify(name)}))
    if (!card) return false
    card.click()
    return true
  })()`) as boolean
  if (!focused) throw Error('Personagem salvo não apareceu no elenco da UI.')
  let garmentPixels: Awaited<ReturnType<typeof inspectSyntheticWardrobePreview>>
  try { garmentPixels = await inspectSyntheticWardrobePreview(win) }
  catch (error) {
    const diagnostic = await win.webContents.executeJavaScript(`(() => ({
      character: document.querySelector('.customizer-preview-character-name')?.textContent,
      selected: [...document.querySelectorAll('.character-card.selected')].map(e => e.textContent),
      renderedBody: !!document.querySelector('img.customizer-selected-artwork'),
      renderedClothes: !!document.querySelector('img.customizer-wardrobe-overlay'),
      loading: document.querySelector('.customizer-preview-loading')?.textContent,
      errors: [...document.querySelectorAll('[role="alert"]')].map(e => e.textContent?.slice(0,350)),
      view: document.body.innerText.slice(0,850)
    }))()`)
    throw Error('Composição visual Customizador falhou: ' + String(error) + '; DOM=' + JSON.stringify(diagnostic))
  }
  await writeFile(join(output, 'wardrobe-pixels.json'), JSON.stringify(garmentPixels, null, 2))
  await capture('Customizador', 'customizador.png')
  const poseOnePerformance = await sampleElectronPerformance(win)

  // Exercise a SECOND saved pose in the actual Electron/Customizer renderer.
  // The fixture lives in the isolated DEV AI sandbox; restore pose 1 before
  // carrying on with Studio and the reopen check.
  const changeSyntheticPose = async (slot: number) => {
    const applied = await win.webContents.executeJavaScript(
      "(async () => { const list = await window.desktop.listCustomizerCharacters();" +
      " const character = list.find(item => item.id === " + JSON.stringify(id) + ");" +
      " if (!character) return false;" +
      " await window.desktop.saveCustomizerCharacter({...character, customization: {...character.customization, poseSlot: " + slot + "}, updatedAt: new Date().toISOString()}); return true; })()"
    ) as boolean
    if (!applied) throw Error('Falha ao selecionar pose sintética ' + slot)
    await win.webContents.executeJavaScript("window.location.hash = '#/estudio'")
    await waitFor(win, '.studio-page')
    await win.webContents.executeJavaScript("window.location.hash = '#/customizar'")
    await waitFor(win, '.roster-panel')
    await waitFor(win, '.character-card')
    const clicked = await win.webContents.executeJavaScript(`(() => {
      const card = [...document.querySelectorAll('.character-card')]
        .find(item => item.textContent?.includes(${JSON.stringify(name)}))
      if (!card) return false
      card.click()
      return true
    })()`) as boolean
    if (!clicked) throw Error('Personagem sintético sumiu ao mudar de pose.')
  }
  await changeSyntheticPose(2)
  let secondPosePixels: Awaited<ReturnType<typeof inspectSyntheticWardrobePreview>> | null = null
  let distance = 0
  const secondPoseDeadline = Date.now() + 20000
  while (Date.now() < secondPoseDeadline) {
    try {
      const observed = await inspectSyntheticWardrobePreview(win, false)
      const moved = observed.colors.reduce((sum, color, index) =>
        sum + Math.abs(color.x - garmentPixels.colors[index].x) + Math.abs(color.y - garmentPixels.colors[index].y), 0)
      if (moved > 10) { secondPosePixels = observed; distance = moved; break }
    } catch { /* Retry while the second pose is loading. */ }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!secondPosePixels) throw Error('A roupa não acompanhou a segunda pose no Customizador Electron.')
  await writeFile(join(output, 'wardrobe-pose2-pixels.json'), JSON.stringify({
    ...secondPosePixels, poseSlot: 2, centroidMovement: distance
  }, null, 2))
  await capture('Customizador', 'customizador-pose2.png')
  const poseTwoPerformance = await sampleElectronPerformance(win)
  await changeSyntheticPose(1)
  await inspectSyntheticWardrobePreview(win)
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
  await writeFile(join(output, 'electron-performance.json'), JSON.stringify({
    schemaVersion: 1, syntheticOnly: true, source: 'real-electron-renderer',
    poseOne: poseOnePerformance, poseTwo: poseTwoPerformance
  }, null, 2))

  await writeFile(join(output, 'workspace-manifest.json'), JSON.stringify({
    schemaVersion: 1, mode: 'real-electron-workspaces', syntheticOnly: true,
    capturedAt: new Date().toISOString(), results,
    timingsMs: { firstProcessFlow: Date.now() - startedAt }
  }, null, 2), 'utf8')
}

/** Chamado num processo Electron NOVO, apontando para o mesmo perfil sintético.
 * Prova reidratação real por IPC e renderização da cena após reinicialização.
 */
export async function captureCustomizerStudioReopened(win: BrowserWindow, output: string): Promise<void> {
  const startedAt = Date.now()
  const flow = JSON.parse(await readFile(join(output, 'flow-state.json'), 'utf8')) as {
    schemaVersion: number; syntheticOnly: boolean; characterId: string; studioId: string; name: string
  }
  if (flow.schemaVersion !== 1 || flow.syntheticOnly !== true) throw Error('Fixture de reinício inválida.')
  await win.webContents.executeJavaScript("window.location.hash = '#/customizar'")
  await waitFor(win, '.roster-panel')
  const characters = await win.webContents.executeJavaScript('window.desktop.listCustomizerCharacters()') as Array<{ id: string; name: string; customization: { modelSlot: number; poseSlot: number; wardrobeGroups?: Array<{ setId: string; componentId?: string }> } }>
  const saved = characters.find(item => item.id === flow.characterId && item.name === flow.name)
  if (!saved || saved.customization.modelSlot !== 1 || saved.customization.poseSlot !== 1) throw Error('Customizador perdeu a personalização após reiniciar.')
  const garmentIds = ['coat', 'sleeve-left', 'sleeve-right']
  const equipped = saved.customization.wardrobeGroups ?? []
  if (!garmentIds.every(id => equipped.some(group => group.setId === 'uniform' && group.componentId === id))) {
    throw Error('Customizador perdeu a roupa individual após reiniciar.')
  }
  const garment = await win.webContents.executeJavaScript("window.desktop.loadWardrobeSet(1, 'uniform')") as { components: Array<{ id: string; dataUrl: string }> } | null
  if (!garment || garment.components.length !== 3 ||
      new Set(garment.components.map(piece => piece.dataUrl)).size !== 3) {
    throw Error('Mangas e camisa foram duplicadas após reabrir o Electron.')
  }
  await win.webContents.executeJavaScript("window.location.hash = '#/estudio'")
  await waitFor(win, '.studio-page')
  const studios = await win.webContents.executeJavaScript('window.desktop.listStudios()') as Array<{ id: string; elements: Array<{ characterId?: string; assetId?: string }>; assets: Array<{ id: string; dataUrl: string }> }>
  const scene = studios.find(item => item.id === flow.studioId)
  if (!scene || !scene.elements.some(item => item.characterId === flow.characterId)) throw Error('Studio perdeu elenco após reiniciar.')
  if (scene.elements.some(element => element.characterId === flow.characterId &&
    !scene.assets.some(asset => asset.id === element.assetId && asset.dataUrl.startsWith('data:image/')))) {
    throw Error('Studio reabriu com imagem de personagem ausente.')
  }
  await waitFor(win, 'button.studio-card-open')
  const opened = await win.webContents.executeJavaScript(`(() => {
    const button = document.querySelector('button.studio-card-open')
    if (!button) return false
    button.click()
    return true
  })()`) as boolean
  if (!opened) throw Error('Cena não reabriu na interface.')
  await waitFor(win, '.studio-cast-item', 30000)
  await waitForRendered(win, '.studio-scene-area')
  const image = (await win.webContents.capturePage()).toPNG()
  const info = await sharp(image).metadata()
  if (!info.width || !info.height) throw Error('Screenshot de reabertura sem dimensões.')
  const file = 'studio-reaberto.png'
  await writeFile(join(output, file), image)
  const manifest = JSON.parse(await readFile(join(output, 'workspace-manifest.json'), 'utf8')) as {
    results: Array<{ section: string; file: string; dimensions: string; sha256: string }>
    timingsMs?: Record<string, number>
  }
  manifest.timingsMs = { ...manifest.timingsMs, reopenedFlow: Date.now() - startedAt }
  manifest.results.push({
    section: 'Studio Principal — cena reaberta',
    file, dimensions: info.width + 'x' + info.height, sha256: createHash('sha256').update(image).digest('hex')
  })
  await writeFile(join(output, 'workspace-manifest.json'), JSON.stringify(manifest, null, 2))
}
