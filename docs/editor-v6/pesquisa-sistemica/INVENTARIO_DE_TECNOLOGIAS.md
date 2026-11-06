# Inventário de tecnologias — instalado, embutido e candidato

**Base [CÓDIGO]:** `package.json`, `package-lock.json`, `electron.vite.config.ts` e leitura dos módulos da revisão `c636ff03`. `^` indica **range declarado**, NÃO versão instalada, nem versão do Chromium dentro do EXE.

## Dependências diretas em produção

| Pacote | Range declarado | Papel verificado / escopo |
|---|---|---|
| `react` / `react-dom` | `^19.2.0` | Interface, preview e export renderer |
| `react-router` | `^8.4.0` | HashRouter, navegação |
| `zustand` | `^5.0.16` | Estado de UI/documento |
| `immer` | `^11.2.9` | Atualização de estado |
| `zod` | `^4.6.7` | Schemas e validações de dados IPC/export |
| `better-sqlite3` | `^13.0.3` | Banco/catálogo, Roteiros e Base de Vídeos |
| `sharp` | `^0.35.5` | Normalização e manipulação nativa de imagens |

## Ferramentas de build/teste declaradas

| Pacote | Range |
|---|---|
| `electron` | `^45.1.0` |
| `electron-vite` | `^6.0.0` |
| `electron-builder` | `^26.18.0` |
| `vite` | `^8.3.5` |
| `@vitejs/plugin-react` | `^6.1.2` |
| `esbuild` | `0.28.2` |
| `typescript` (alias) | `npm:@typescript/typescript6@^6.0.2` |
| `@typescript/native` (alias) | `npm:typescript@^7.0.2` |
| `vitest` | `^5.0.5` |
| `@electron/rebuild` | `^4.2.1` |

Outras declarações de tipos: `@types/better-sqlite3`, `@types/react`, `@types/react-dom`.

## APIs/bibliotecas usadas sem pacote npm direto

- Chromium (embutido no Electron): DOM, CSS, SVG/`foreignObject`, Canvas 2D, WebGL, HTMLMediaElement, requestAnimationFrame, rasterização/compositor.
- Electron main/preloads: BrowserWindow, `webContents.capturePage`, `contextBridge`, `ipcMain`/`ipcRenderer`, session/protocol.
- Node: `fs`, streams, child processes, Buffer, crypto/sha256, paths, timers, abort.
- FFmpeg e ffprobe externos: `rawvideo` BGRA, H.264, filtros, áudio, concat e validação MP4.
- SQLite WAL/CAS SHA-256/arquivos JSON e filas transacionais.
- Processamento gráfico de pele/roupas/face/cabelo implementado internamente.

## Candidatos NÃO confirmados em produção

| Tecnologia | Interesse | Estado |
|---|---|---|
| WebGL2 framebuffer/readback | Compositor de camadas mais direto | EXPERIMENTO A PROPOR |
| WebGPU/Dawn/wgpu | Motor GPU alternativo | NÃO ADOTADO |
| Electron `offscreen.useSharedTexture` | Reduzir cópias GPU→CPU | NÃO HABILITADO no caminho lido |
| `@napi-rs/canvas` | Raster nativo | NÃO DECLARADO |
| `resvg-js`/resvg | SVG estático nativo | NÃO DECLARADO |
| CanvasKit/Skia dedicado | Raster nativo/WASM | NÃO DECLARADO |
| PixiJS | Sprite/rendering engine GPU | NÃO DECLARADO |
| Vello | Motor vetorial GPU/CPU | NÃO DECLARADO |
| WebCodecs como exportador | Encoder de frames no renderer | NÃO É O MP4 ATUAL |
| AMF/Media Foundation/Direct3D 11 | Encoder e superfícies nativas Windows | Encoder candidato/infra a verificar em runtime |

## Fonte oficial e reconciliação de versão

- [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model) — main, renderer e preload.
- [Electron Offscreen Rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering) — bitmap e textura compartilhada.
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security) — IPC e fronteiras de confiança.
- [SQLite WAL](https://www.sqlite.org/wal.html) — concorrência e durabilidade.
- [Chromium RenderingNG](https://developer.chrome.com/docs/chromium/renderingng-architecture) — fases da renderização.

**Pendente:** registrar `process.versions` do EXE real Windows, os binários FFmpeg/ffprobe de produção e capabilities AMD/GPU; não inferir disponibilidade de API por versão npm aproximada.
