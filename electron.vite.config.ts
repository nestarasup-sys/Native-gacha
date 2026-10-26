import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  main: {
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
          editorV6ExportPreload: resolve(projectRoot, 'electron/editorV6ExportPreload.ts')
        },
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    root: resolve(projectRoot, 'src/renderer'),
    resolve: { alias: { '@': resolve(projectRoot, 'src/renderer/src') } },
    plugins: [react()],
    worker: { format: 'es' },
    build: { outDir: 'out/renderer', rollupOptions: { input: { index: resolve(projectRoot, 'src/renderer/index.html'), editorV6Export: resolve(projectRoot, 'src/renderer/editor-v6-export.html') } } }
  }
})
