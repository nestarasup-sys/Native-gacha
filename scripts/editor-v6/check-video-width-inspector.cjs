const { build } = require('esbuild')
const { spawn } = require('node:child_process')
const { mkdtemp, writeFile } = require('node:fs/promises')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const { removeEditorV6TemporaryFixture } = require('./temporaryFixture.cjs')

async function main() {
  const root = resolve(__dirname, '../..')
  const prefix = 'editor-v6-width-inspector-'
  const folder = await mkdtemp(join(tmpdir(), prefix))
  try {
    await build({ entryPoints: [join(root, 'tests/editor-v6/videoWidthInspector.browser.tsx')],
      outfile: join(folder, 'renderer.js'), bundle: true, platform: 'browser', jsx: 'automatic' })
    await writeFile(join(folder, 'index.html'), '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="renderer.js"></script>')
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(require('electron'), [join(root, 'tests/editor-v6/videoWidthInspector.electron.cjs'), folder],
      { env, windowsHide: true, stdio: 'inherit' })
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
    if (code !== 0) throw Error(`Teste do Inspetor falhou com código ${code}.`)
  } finally { await removeEditorV6TemporaryFixture(folder, prefix) }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
