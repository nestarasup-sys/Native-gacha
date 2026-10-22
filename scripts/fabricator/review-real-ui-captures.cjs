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

if (require.main === module) {
  const capture = process.argv.find(arg => arg.startsWith('--captures='))
  const baseline = process.argv.find(arg => arg.startsWith('--baseline='))
  if (!capture) {
    console.error('Uso: node scripts/fabricator/review-real-ui-captures.cjs --captures=PASTA [--baseline=PASTA_APROVADA]')
    process.exitCode = 2
  } else {
    verifyRealUiCaptures(capture.slice('--captures='.length), baseline?.slice('--baseline='.length))
      .then(result => console.log(JSON.stringify(result, null, 2)))
      .catch(reason => { console.error(reason); process.exitCode = 1 })
  }
}
module.exports = { verifyRealUiCaptures, expected }
