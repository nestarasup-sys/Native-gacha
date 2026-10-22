'use strict'
/** Verificador independente das screenshots REAIS geradas pelo Electron.
 * Não aprova baselines por conta própria: depende de revisão humana no Windows.
 */
const fs = require('node:fs/promises')
const { join, resolve } = require('node:path')
const { createHash } = require('node:crypto')
const sharp = require('sharp')

const expected = Object.freeze(['modelos', 'poses', 'roupas', 'olhos', 'rosto', 'expressoes', 'cabelos', 'animador'])
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
async function verifyRealUiCaptures(directory, baseline) {
  const folder = resolve(directory)
  const manifest = JSON.parse(await fs.readFile(join(folder, 'manifest.json'), 'utf8'))
  if (manifest.schemaVersion !== 1 || manifest.mode !== 'real-electron-ui' ||
      !Array.isArray(manifest.results) || manifest.results.length !== expected.length) {
    throw Error('Manifesto de capturas incompleto ou incompatível.')
  }
  const seen = new Set()
  const verified = []
  for (let index = 0; index < expected.length; index++) {
    const info = manifest.results[index]
    const name = expected[index] + '.png'
    if (info.file !== name || seen.has(name) ||
        typeof info.section !== 'string' || !info.section.trim()) {
      throw Error('Ordem, nome ou seção de captura inválida: ' + name)
    }
    if (name === 'roupas.png' && info.contentVerified !== 'three-fitted-garments') {
      throw Error('Screenshot Roupas Dev não comprovou três peças encaixadas no Fabricador.')
    }
    seen.add(name)
    const bytes = await fs.readFile(join(folder, name))
    const image = sharp(bytes)
    const metadata = await image.metadata()
    if (metadata.format !== 'png' || metadata.width < 320 || metadata.height < 240 ||
        info.dimensions !== metadata.width + 'x' + metadata.height ||
        info.sha256 !== hash(bytes)) {
      throw Error('PNG, dimensões ou SHA256 divergente: ' + name)
    }
    let changedPixels
    if (baseline) {
      const old = await sharp(join(resolve(baseline), name)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const current = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      if (current.info.width !== old.info.width || current.info.height !== old.info.height) {
        throw Error('Baseline com dimensões diferentes: ' + name)
      }
      changedPixels = 0
      for (let i = 0; i < old.data.length; i += 4) {
        if ([0,1,2,3].some(channel => Math.abs(current.data[i + channel] - old.data[i + channel]) > 8)) changedPixels++
      }
      if (changedPixels > current.info.width * current.info.height * .01) {
        throw Error('Regressão visual: ' + name + ' (' + changedPixels + ' pixels)')
      }
    }
    verified.push({ file: name, sha256: info.sha256, changedPixels })
  }
  return { verified, mode: baseline ? 'comparado-com-baseline' : 'capturas-integrias-revisao-pendente' }
}

/** Confirma que as outras duas capturas vieram do Electron real, não de mocks.
 * A aprovação do conteúdo visual ainda depende de inspeção humana.
 */
async function verifyWorkspaceCaptures(directory) {
  const folder = resolve(directory)
  const manifest = JSON.parse(await fs.readFile(join(folder, 'workspace-manifest.json'), 'utf8'))
  const expectedWorkspaces = [
    { section: 'Customizador', file: 'customizador.png' },
    { section: 'Customizador', file: 'customizador-pose2.png' },
    { section: 'Studio Principal — elenco salvo', file: 'studio.png' },
    { section: 'Studio Principal — cena reaberta', file: 'studio-reaberto.png' }
  ]
  if (manifest.schemaVersion !== 1 || manifest.mode !== 'real-electron-workspaces' ||
      manifest.syntheticOnly !== true || !Array.isArray(manifest.results) ||
      manifest.results.length !== expectedWorkspaces.length) {
    throw Error('Manifesto de workspaces gráficos incompleto.')
  }
  for (let i = 0; i < expectedWorkspaces.length; i++) {
    const expected = expectedWorkspaces[i]
    const item = manifest.results[i]
    if (item?.section !== expected.section || item?.file !== expected.file) {
      throw Error('Workspace capturado fora da ordem: ' + expected.file)
    }
    const bytes = await fs.readFile(join(folder, expected.file))
    const metadata = await sharp(bytes).metadata()
    if (metadata.format !== 'png' || !metadata.width || !metadata.height ||
        metadata.width < 320 || metadata.height < 240 ||
        item.dimensions !== metadata.width + 'x' + metadata.height ||
        item.sha256 !== hash(bytes)) {
      throw Error('Imagem ou hash do workspace inválido: ' + expected.file)
    }
  }
  const state = JSON.parse(await fs.readFile(join(folder, 'flow-state.json'), 'utf8'))
  if (state.schemaVersion !== 1 || state.syntheticOnly !== true || !state.characterId || !state.studioId) throw Error('Identidade de fluxo E2E inválida.')
  const alignment = JSON.parse(await fs.readFile(join(folder, 'wardrobe-pixels.json'), 'utf8'))
  if (alignment?.source !== 'customizer-overlay' || !Array.isArray(alignment.colors) || alignment.colors.length !== 3 ||
      alignment.colors.some((piece,index) => piece.name !== ['coat','sleeve-left','sleeve-right'][index] ||
        !Number.isFinite(piece.x) || !Number.isFinite(piece.y) || !Number.isInteger(piece.pixels) || piece.pixels < 15) ||
      alignment.colors[1].x >= alignment.colors[2].x - 30 ||
      alignment.colors[1].y <= alignment.colors[2].y + 6) {
    throw Error('Alinhamento visual X/Y das peças do Fabricador não confirmado no Customizador.')
  }
  const secondPose = JSON.parse(await fs.readFile(join(folder, 'wardrobe-pose2-pixels.json'), 'utf8'))
  if (secondPose?.source !== 'customizer-overlay' || secondPose.poseSlot !== 2 ||
      !Array.isArray(secondPose.colors) || secondPose.colors.length !== 3 ||
      !Number.isFinite(secondPose.centroidMovement) || secondPose.centroidMovement <= 10 ||
      secondPose.colors.some((piece,index) => piece.name !== alignment.colors[index].name ||
        !Number.isFinite(piece.x) || !Number.isFinite(piece.y) ||
        !Number.isInteger(piece.pixels) || piece.pixels < 15)) {
    throw Error('Segunda pose não comprovou as três roupas com posição alterada no Customizador.')
  }
  const performance = JSON.parse(await fs.readFile(join(folder,'electron-performance.json'),'utf8'))
  if (performance.schemaVersion !== 1 || performance.syntheticOnly !== true || performance.source !== 'real-electron-renderer') {
    throw Error('Medições reais de desempenho Electron ausentes ou incompatíveis.')
  }
  for(const sample of [performance.poseOne, performance.poseTwo]) {
    if (!sample || !Number.isFinite(sample.sampledFps) || sample.sampledFps <= 0 ||
        !Number.isFinite(sample.frameP95Ms) || sample.frameP95Ms <= 0 ||
        !Number.isFinite(sample.rendererPrivateKb) || sample.rendererPrivateKb <= 0 ||
        !Number.isFinite(sample.rendererSharedKb) || sample.rendererSharedKb < 0 ||
        (sample.jsHeapUsedBytes !== null && (!Number.isFinite(sample.jsHeapUsedBytes) || sample.jsHeapUsedBytes < 0))) {
      throw Error('Amostra FPS/memória inválida para a pose no Electron.')
    }
  }
  return expectedWorkspaces.map(item => item.file)
}

if (require.main === module) {
  const capture = process.argv.find(arg => arg.startsWith('--captures='))
  const baseline = process.argv.find(arg => arg.startsWith('--baseline='))
  const withWorkspaces = process.argv.includes('--with-workspaces')
  if (!capture) {
    console.error('Uso: node scripts/fabricator/review-real-ui-captures.cjs --captures=PASTA [--baseline=PASTA_APROVADA]')
    process.exitCode = 2
  } else {
    verifyRealUiCaptures(capture.slice('--captures='.length), baseline?.slice('--baseline='.length))
      .then(async result => ({ ...result, ...(withWorkspaces ? { workspaces: await verifyWorkspaceCaptures(capture.slice('--captures='.length)) } : {}) }))
      .then(result => console.log(JSON.stringify(result, null, 2)))
      .catch(reason => { console.error(reason); process.exitCode = 1 })
  }
}
module.exports = { verifyRealUiCaptures, verifyWorkspaceCaptures, expected }
