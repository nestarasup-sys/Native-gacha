import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { rendererContentSecurityPolicyPlugin } from './electron/application/rendererContentSecurityPolicy.ts'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
// Compile the exact source revision into the desktop main bundle. Packaged
// portable builds do not ship .git, so runtime git lookups cannot identify
// the version that generated a report.
function gitOutput(...args: string[]) {
  try { return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] }).trim() }
  catch { return '' }
}
const shaFromEnvironment = process.env.NATIVE_GACHA_BUILD_SHA ?? process.env.GITHUB_SHA
const buildSha = shaFromEnvironment && /^[a-f0-9]{7,40}$/i.test(shaFromEnvironment)
  ? shaFromEnvironment : gitOutput('rev-parse', 'HEAD')
const buildWorkingTreeDirty = Boolean(gitOutput('status', '--porcelain', '--untracked-files=no'))


export default defineConfig({
  main: {
    define: {
      __NATIVE_GACHA_BUILD_SHA__: JSON.stringify(/^[a-f0-9]{7,40}$/i.test(buildSha) ? buildSha : ''),
      __NATIVE_GACHA_BUILD_DIRTY__: JSON.stringify(buildWorkingTreeDirty)
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: { input: resolve(projectRoot, 'electron/main.ts') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          preload: resolve(projectRoot, 'electron/preload.ts'),
          editorV6ExportPreload: resolve(projectRoot, 'electron/editorV6ExportPreload.ts'),
          editorV6MotionPreload: resolve(projectRoot, 'electron/editorV6MotionPreload.ts')
        },
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    root: resolve(projectRoot, 'src/renderer'),
    resolve: { alias: { '@': resolve(projectRoot, 'src/renderer/src') } },
    plugins: [react(), rendererContentSecurityPolicyPlugin()],
    worker: { format: 'es' },
    build: { outDir: 'out/renderer', rollupOptions: { input: { index: resolve(projectRoot, 'src/renderer/index.html'), editorV6Export: resolve(projectRoot, 'src/renderer/editor-v6-export.html') } } }
  }
})
