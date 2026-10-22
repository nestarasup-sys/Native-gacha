'use strict'
/** Runner de screenshots das TELAS REAIS do aplicativo.
 * Usa somente um sandbox gerado em out/dev-ai/runs e nunca toca no perfil do usuário.
 * Requer npm run build e executável Electron local (pós-instalação).
 */
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { randomUUID } = require('node:crypto')

const root = path.resolve(__dirname, '../..')
const id = randomUUID()
const runRoot = path.join(root, 'out', 'dev-ai', 'runs', id)
const sandbox = path.join(runRoot, 'sandbox')
const fixtureArg = process.argv.find(arg => arg.startsWith('--fixture='))
const baselineArg = process.argv.find(arg => arg.startsWith('--baseline='))
const syntheticComplete = process.argv.includes('--synthetic-complete')
if(syntheticComplete && fixtureArg)throw new Error('Escolha --fixture ou --synthetic-complete; nunca misture bibliotecas.')
if (!fs.existsSync(path.join(root, 'out', 'main', 'main.js'))) {
  console.error('Build não encontrado. Execute npm run build antes do teste visual.')
  process.exit(1)
}
fs.mkdirSync(sandbox, { recursive: true })
fs.writeFileSync(path.join(runRoot, '.dev-ai-sandbox.json'),
  JSON.stringify({ schemaVersion: 1, runId: id, syntheticOnly: true }, null, 2))
if (fixtureArg) {
  const fixture = path.resolve(fixtureArg.slice('--fixture='.length))
  if (!fs.statSync(fixture).isDirectory()) throw new Error('Fixture deve ser um diretório.')
  // Uma fixture pode conter fabricator/models, wardrobe, hair etc. Copiamos
  // APENAS para o perfil temporário, sem alterar sua origem.
  fs.cpSync(fixture, path.join(sandbox, 'electron-user-data', 'fabricator'), {
    recursive: true, force: false,
    filter: item => !fs.lstatSync(item).isSymbolicLink()
  })
}
if(syntheticComplete){
  const {createCompleteCharacterFixture}=require('./complete-character-fixture.cjs')
  void createCompleteCharacterFixture(path.join(sandbox,'electron-user-data')).then(()=>start()).catch(error=>{console.error(error);process.exitCode=1})
}else start()
function start(){
const env = {
  ...process.env,
  GACHA_DEV_AI_TEST: '1',
  GACHA_DEV_AI_SANDBOX: sandbox,
  GACHA_FABRICATOR_REAL_UI_CAPTURE: '1'
}
if (baselineArg) env.GACHA_FABRICATOR_VISUAL_BASELINE = path.resolve(baselineArg.slice('--baseline='.length))
const electron = require('electron')
const child = spawn(electron, [path.join(root, 'out', 'main', 'main.js')], { env, stdio: 'inherit' })
child.on('error', error => { console.error(error); process.exitCode = 1 })
child.on('exit', code => {
  const output = path.join(sandbox, 'fabricator-real-ui-captures')
  if (code === 0) console.log('Capturas reais do Fabricador:', output)
  process.exitCode = code ?? 1
})
}
