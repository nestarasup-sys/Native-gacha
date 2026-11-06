# Fontes oficiais — índice com status de consulta

**Data do índice:** 06/11/2026.

## Consultadas no contexto da Pesquisa 01

| Tecnologia | Fonte | O que foi verificado conceitualmente | Limite |
|---|---|---|---|
| Electron processos | https://www.electronjs.org/docs/latest/tutorial/process-model | Main, renderer, preload e contextBridge | Versão real em Windows pendente |
| Electron segurança | https://www.electronjs.org/docs/latest/tutorial/security | sandbox, navegação, IPC e CSP | Validar implementação por handler |
| Electron offscreen | https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering | bitmap CPU, paint e textura compartilhada GPU | Teste no build real pendente |
| Chromium | https://developer.chrome.com/docs/chromium/renderingng-architecture | Etapas de render e invalidação | Internals não são APIs diretas |
| SQLite | https://www.sqlite.org/wal.html | WAL e limites de leitura/escrita | Transações/fluxos do app exigem testes |

## Candidatas para aprofundamento — NÃO MARCAR COMO LIDAS NESTA RODADA

| Tecnologia | URL |
|---|---|
| Chrome DevTools Performance | https://developer.chrome.com/docs/devtools/performance/reference |
| Chromium RenderingNG | https://developer.chrome.com/docs/chromium/renderingng |
| Electron webContents | https://www.electronjs.org/docs/latest/api/web-contents |
| Canvas | https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API |
| SVG | https://developer.mozilla.org/en-US/docs/Web/SVG |
| WebGL | https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API |
| WebGPU | https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API |
| FFmpeg | https://ffmpeg.org/documentation.html |
| FFmpeg filters | https://ffmpeg.org/ffmpeg-filters.html |
| Sharp | https://sharp.pixelplumbing.com/api-composite/ |
| AMD AMF | https://gpuopen.com/advanced-media-framework/ |
| Microsoft Media Foundation | https://learn.microsoft.com/en-us/windows/win32/medfound/media-foundation-architecture |
| React Profiler | https://react.dev/reference/react/Profiler |
| Perfetto | https://perfetto.dev/ |
| Node Workers | https://nodejs.org/api/worker_threads.html |
| Skia CanvasKit | https://docs.skia.org/docs/user/modules/canvaskit/ |
| resvg | https://github.com/linebender/resvg |
| @napi-rs/canvas | https://github.com/Brooooooklyn/canvas |
| PixiJS | https://pixijs.com/ |
| Electron Builder | https://www.electron.build/ |

### Como registrar uma fonte após realmente pesquisá-la

Adicionar data, título, URL, seção lida, claims/versão aplicável, resultado no código do Native Gacha, limitações e vínculo com pesquisa numerada. Não confundir documentação mais recente com recursos garantidos no EXE do usuário.
