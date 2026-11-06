# Fontes oficiais — registro da pesquisa do Grupo A

**Data:** 06/11/2026. A lista abaixo registra fontes técnicas efetivamente pesquisadas por site para **integração de APIs**, e cada linha aponta ao estudo com o código relacionado. Não demonstra acesso aos binários Windows nem inspeção de upstream inteiro.

## Grupo A: documentos oficiais estudados

| Tecnologia | URL | Pesquisa | Conclusão verificada conceitualmente |
|---|---|---|---|
| Chromium RenderingNG | https://developer.chrome.com/docs/chromium/renderingng-architecture | 02 | pipeline e fases puláveis |
| Chromium RenderingNG structures | https://developer.chrome.com/docs/chromium/renderingng-data-structures | 02 | property trees |
| Electron offscreen | https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering | 03 | bitmap/paint/shared texture |
| Electron webContents | https://www.electronjs.org/docs/latest/api/web-contents | 03 | capturePage, paint/texture/release |
| Electron security | https://www.electronjs.org/docs/latest/tutorial/security | 16 | sandbox, sender, IPC, CSP |
| Electron contentTracing | https://www.electronjs.org/docs/latest/api/content-tracing | 15 | trace Chromium |
| Canvas API | https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API | 04 | surfaces/2D |
| SVG | https://developer.mozilla.org/en-US/docs/Web/SVG | 04 | scene/layers/foreignObject |
| OffscreenCanvas | https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas | 04 | Worker canvas |
| ImageBitmap lifecycle | https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/transferToImageBitmap | 04 | transfer and close |
| WebGL readPixels | https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/readPixels | 05 | GPU→CPU |
| WebGL2 fenceSync | https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/fenceSync | 05 | GPU synchronization |
| FFmpeg formats | https://ffmpeg.org/ffmpeg-formats.html | 11 | concat compatibility |
| FFmpeg filters | https://ffmpeg.org/ffmpeg-filters.html | 11 | overlay/audio |
| FFprobe | https://ffmpeg.org/ffprobe.html | 11 | frames/packets/probes |
| Sharp composite | https://sharp.pixelplumbing.com/api-composite/ | 17 | alpha/blend/crop |
| Sharp performance | https://sharp.pixelplumbing.com/performance/ | 17 | libuv/libvips concurrency |
| Sharp Utility | https://sharp.pixelplumbing.com/api-utility/ | 17 | cache stats |
| React Profiler | https://react.dev/reference/react/Profiler | 18 | React actualDuration |
| React memo | https://react.dev/reference/react/memo | 18 | memo limits |
| React useSyncExternalStore | https://react.dev/reference/react/useSyncExternalStore | 18 | stable snapshot |
| Zustand useShallow | https://zustand.docs.pmnd.rs/learn/guides/prevent-rerenders-with-use-shallow.html | 18 | selectors |
| Zustand Immer | https://zustand.docs.pmnd.rs/reference/integrations/immer-middleware.html | 18 | immer middleware |
| Immer current | https://immerjs.github.io/immer/current/ | 18 | snapshots from draft |
| Node Streams | https://nodejs.org/api/stream.html | 19 | backpressure |
| Node worker_threads | https://nodejs.org/api/worker_threads.html | 19 | CPU-bound JS parallelism |
| WebCodecs | https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API | 20 | encode/decode not mux |
| WebCodecs VideoEncoder | https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder | 20 | supported codecs, queue |
| WebCodecs Usage | https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Using_the_WebCodecs_API | 20 | close, flush, bounded queue |
| electron-vite build | https://electron-vite.org/guide/build | 21 | entries/output |
| electron-vite deps | https://electron-vite.org/guide/dependency-handling | 21 | externalization/native |
| Vite build | https://vite.dev/guide/build | 21 | bundling/chunks |
| TypeScript narrowing | https://www.typescriptlang.org/docs/handbook/2/narrowing | 21 | type guards |
| Zod basics | https://zod.dev/basics | 21 | runtime parsing |
| SQLite WAL | https://www.sqlite.org/wal.html | 13 | one writer/checkpoint |

## Leitura aprofundada da Pesquisa 02 em 06/11/2026

| Tema | Fonte oficial efetivamente consultada | Evidência |
|---|---|---|
| RenderingNG e 12 fases | https://developer.chrome.com/docs/chromium/renderingng-architecture | Etapas, processos e fases que podem ser puladas |
| Data structures/tiles/property trees | https://developer.chrome.com/docs/chromium/renderingng-data-structures | Property trees, display lists, tiles, compositor frames |
| Chromium GPU compositing (histórico) | https://www.chromium.org/developers/design-documents/gpu-accelerated-compositing-in-chrome/ | Command buffer/sync; arquitetura antiga |
| VideoNG | https://developer.chrome.com/docs/chromium/videong | Pipeline vídeo e superfície Viz |
| Skia | https://skia.org/docs/user/api/ | SkCanvas, SkSurface, SkImage, SkPicture |
| Electron offscreen & sharedTexture | https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering | GPU bitmap vs shared texture e dirtyRect |
| Electron trace | https://www.electronjs.org/docs/latest/api/content-tracing | **Electron 45+: Perfetto protobuf** |
| Electron texture metadata | https://www.electronjs.org/docs/latest/api/structures/offscreen-shared-texture | release, pixel format, timestamp |
| Chrome DevTools | https://developer.chrome.com/docs/devtools/performance/reference | Main/GPU/Raster/Frames |
| SVG foreignObject | https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/foreignObject | HTML dentro do SVG |
| Canvas drawImage | https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage | Cropping e superfícies |
| CSS containment | https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/contain | Confinamento e clipping |
| CSS will-change | https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/will-change | Hints e riscos de VRAM |

**Nota:** a Pesquisa 02 contém a aplicação de cada fonte ao código do Native Gacha e distingue inferências de features em produção. Arquitetura upstream histórica não é prova da implementação do Electron atual.

## Pesquisa 03 aprofundada — Electron (06/11/2026)

| Fonte oficial consultada | Aplicação no V6 / conclusão específica |
|---|---|
| https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering | GPU bitmap versus textura compartilhada, dirtyRect e ausência de frames quando inativo |
| https://www.electronjs.org/docs/latest/api/web-contents | capturePage, paint, invalidate, startPainting/stopPainting, set/getFrameRate, stayHidden |
| https://www.electronjs.org/docs/latest/api/browser-window | offscreen, backgroundThrottling, janela oculta |
| https://www.electronjs.org/docs/latest/api/native-image | toBitmap retorna cópia e normaliza para sRGB por padrão desde Electron 43 |
| https://www.electronjs.org/docs/latest/api/structures/offscreen-shared-texture | handle/metadata/cor/format/release e limites |
| https://www.electronjs.org/docs/latest/api/shared-texture | Importação experimental de textura para VideoFrame; não é muxer MP4 |
| https://www.electronjs.org/docs/latest/api/session | Partition sem persist: é sessão em memória |
| https://www.electronjs.org/docs/latest/tutorial/ipc | Structured Clone e restrições de objetos DOM/Node |
| https://www.electronjs.org/docs/latest/tutorial/process-model | Main/renderer/preload |
| https://www.electronjs.org/docs/latest/tutorial/context-isolation | Bridge e limites de confiança |
| https://www.electronjs.org/docs/latest/tutorial/security | Sandbox, IPC, CSP e restrição de origens |
| https://www.electronjs.org/docs/latest/api/content-tracing | Trace Chromium em Perfetto protobuf no Electron atual |

**Proveniência:** fonte oficial confrontada com código da revisão indicada no documento 03; **não houve** validação de recursos com o EXE Windows, benchmark ou PoC. Cuidado com ambiguidades da documentação sobre dirtyRect versus imagem inteira.

## Grupo B e fontes de alternativas ainda por aprofundar

| Tema | Referência | Status |
|---|---|---|
| AMD AMF | https://gpuopen.com/advanced-media-framework/ | **PENDENTE de aprofundamento específico em 12/14** |
| Microsoft Media Foundation | https://learn.microsoft.com/en-us/windows/win32/medfound/media-foundation-architecture | **PENDENTE de aprofundamento específico em 12/14** |
| resvg | https://github.com/linebender/resvg | **PENDENTE de aprofundamento específico em 12/14** |
| PixiJS | https://pixijs.com/ | **PENDENTE de aprofundamento específico em 12/14** |
| Vello | https://github.com/linebender/vello | **PENDENTE de aprofundamento específico em 12/14** |

## Critério de evidência

- URL presente **não prova** runtime no Windows. O estudo deve registrar o recurso exato encontrado no código e classificar se a API é ativa, integrada ou alternativa.
- Documentações `latest` podem ser mais recentes que o binário real, especialmente Electron/Chromium, nodejs.org e electron-builder v27 (o app declara builder 26).
- Não reproduzir grandes trechos de terceiros; os estudos usam conclusões resumidas com links.
- Para uma medição [MEDIDO], anexar apenas dados sanitizados e log de commit, fixture autorizada, cache, hardware, duração, mp4/frames e método, nunca mídia privada ou paths pessoais.

**Próxima etapa:** documentar versões runtime/capabilities do EXE, A/B com e sem cabelo, e pesquisas 06/07/08/12/14 sem atribuir ganho antecipadamente.
