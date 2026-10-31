const { build } = require('esbuild')
const { spawn } = require('node:child_process')
const { mkdtemp, readFile, mkdir, writeFile, copyFile } = require('node:fs/promises')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')

async function main() {
  const root = resolve(__dirname, '../..')
  const folder = await mkdtemp(join(tmpdir(), 'editor-v6-face-export-'))
  const output = join(root, 'out/editor-v6-face-export-check')
  await mkdir(output, { recursive: true })
  const bakeFixture = join(root, 'out/editor-v6-motion-check/high-resolution-mouth-fixture.json')
  const { execFileSync } = require('node:child_process')
  execFileSync(process.execPath, [join(root, 'scripts/editor-v6/check-motion.cjs')], { windowsHide: true, stdio: 'inherit' })
  await writeFile(join(output, 'result.json'), JSON.stringify({ passed: false, state: 'running', fixtureDirectory: folder }))
  const entry = join(folder, 'face-export.electron.cjs')
  await build({ entryPoints: [join(root, 'tests/editor-v6/faceExport.electron.ts')], outfile: entry, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'warning' })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(require('electron'), [entry, root, folder, bakeFixture], { windowsHide: true, stdio: 'inherit', env })
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
  process.exitCode = typeof code === 'number' ? code : 1
  if (code !== 0) {
    await writeFile(join(output, 'result.json'), JSON.stringify({ passed: false, state: 'failed', exitCode: code, fixtureDirectory: folder }))
    return
  }
  const contents = await readFile(join(folder, 'result.json'), 'utf8')
  const result = JSON.parse(contents)
  if (result.passed !== true) throw Error('A validação silenciosa de faces não concluiu as verificações.')
  for (const video of result.highResolutionMouthExports ?? []) {
    const copy = join(output, `mouth-local-composition-${video.resolution}.mp4`)
    await copyFile(video.output, copy)
    video.output = copy
  }
  const comparisonImage = join(output, 'face-mouth-compare-1080.png')
  const comparisonVideo = join(output, 'mouth-local-composition-1080p.mp4')
  execFileSync(join(root, 'resources/video-tools/ffmpeg.exe'), ['-v', 'error', '-y', '-i', comparisonVideo, '-filter_complex', "[0:v]select='eq(n,7)',scale=960:540[before];[0:v]select='eq(n,16)',scale=960:540[during];[before][during]hstack=inputs=2", '-frames:v', '1', comparisonImage], { windowsHide: true })
  result.comparisonImage = comparisonImage
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2))
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
