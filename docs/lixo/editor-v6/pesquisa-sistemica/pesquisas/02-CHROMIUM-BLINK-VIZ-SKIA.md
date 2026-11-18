# Pesquisa 02 — Chromium, Blink, Viz, RenderingNG, raster e invalidação

**Status:** PESQUISA APROFUNDADA EM CÓDIGO E FONTES OFICIAIS · **PERF/TESTES WINDOWS PENDENTES**
**Rodadas:** 06/11/2026 (reconhecimento + investigação aprofundada) · **Revisão estática:** `Dev-V2@5166de7bacb024a72ee15505f8289f81fc9889bd`. Atualizar commit antes de adotar conclusões. **Nenhum teste Windows/MP4 foi executado nesta rodada.**

## Pergunta principal

**Onde o Native Gacha perde tempo ao alterar um frame da cena: resolver JS, atualizar React/DOM/SVG, rasterizar, compor no Viz, capturar ou copiar o bitmap?** A pesquisa deve separar as fases reais do Chromium das operações que o app controla.

## 1. Evidências no Native Gacha (funções e comportamento)

1. **[CÓDIGO]** `SceneSurface.tsx:125–197` define `SceneLayer` memoizado, monta `<svg>` e, em `SceneLayer:160`, injeta `ExportRasterCanvas` por `foreignObject`. Isso é DOM+SVG com uma superfície rasterizada, não um framebuffer GPU independente.
2. **[CÓDIGO]** `SceneSurface.tsx:89–97` usa `ExportRasterCanvas`, um HTML canvas desenhado em camada do SVG, e a mídia é renderizada como `<video>` em outro `foreignObject` (linha 75). Diferentes tipos de conteúdo chegam à árvore de composição por caminhos distintos.
3. **[CÓDIGO]** `exportWorker.tsx:486–685` expõe `renderEditorV6ExportFrame(frame, layer, paintToken)`, resolve a cena, compõe face/cabelo, executa `flushSync` com `root.render(<SceneSurface...>)` (linha 653) e sinaliza o token. **`flushSync` não equivale a `raster concluído`**.
4. **[CÓDIGO]** `exportWorkers.ts:124–150` pede um frame via `webContents.executeJavaScript`, aguarda pintura tokenizada e executa `webContents.capturePage`, que devolve `NativeImage` convertido em bytes BGRA; o worker usa `webContents.setFrameRate(60)` (linha 85), embora o MP4 tenha **30 fps**. Esse 60 é teto de apresentação offscreen, não a taxa exportada.
5. **[CÓDIGO]** `exportWorkers.ts:17–36` tem tempo e retentativas de capture, invalida a janela se leitura obsoleta e valida token por pixels. **Remover esse protocolo cria risco de quadro errado/stale**.
6. **[CÓDIGO]** `useEditorV6Playback.ts:35–45` usa `requestAnimationFrame` da prévia; `editorV6TimelineScene.ts:25` calcula cena para frame lógico. A prévia e a exportação compartilham regras de cena mas não necessariamente a mesma sequência de atualização do DOM.
7. **[CÓDIGO]** `src/renderer/src/ui/performanceDiagnostics.ts:115–143` mede `sceneResolve` e React commit; `App.tsx:33` usa Profiler por rota e `EditorV6Page.tsx:926,955` cria perfis de cena e timeline.
8. **[CÓDIGO]** `exportRunner.ts:68–94` cria acumuladores de `sceneResolutionMs`, `faceCompositionMs`, `hairCompositionMs`, `reactCommitMs`, `capturePageMs`, `captureBitmapMs` e outras métricas; são subetapas e não devem ser somadas como tempo de parede em workers simultâneos.

## 2. Pesquisa em documentação oficial — aplicabilidade e limitações

1. **[FONTE OFICIAL] [RenderingNG architecture](https://developer.chrome.com/docs/chromium/renderingng-architecture)** — Pipeline composto de Animate, Style, Layout, Pre-paint, Paint, Commit, Layerize, Raster, Activate, Aggregate e Draw; **algumas fases podem ser puladas** quando a mudança não invalida propriedades que elas consomem.
2. **[FONTE OFICIAL] [RenderingNG data structures](https://developer.chrome.com/docs/chromium/renderingng-data-structures)** — Property trees de transform, clip, efeitos e scroll permitem reutilizar dados na composição; isso não transforma alterações arbitrárias de pixels de canvas em simples transform CSS.
3. **[FONTE OFICIAL] [Chromium RenderingNG](https://developer.chrome.com/docs/chromium/renderingng)** — Explica diferenças entre raster GPU e animações composited; API interna Blink/Viz não fica exposta para o aplicativo Electron como biblioteca de desenho.
4. **[FONTE OFICIAL] [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/reference)** — Trace de Main thread, Frames, raster, GPU e eventos permite diferenciar JS/layout/paint de GPU; perf de React sozinho não mede o compositor.
5. **[FONTE OFICIAL] [Electron contentTracing](https://www.electronjs.org/docs/latest/api/content-tracing)** — Coleta traces do Chromium no Main. É diagnóstico de alto custo, deve ser opt-in, com categorias e orçamento de armazenamento, e desativado após teste.

**Atenção:** documentação “latest” não garante a API ou o comportamento no build do Electron/Chromium/Node/FFmpeg instalado no PC. Não foram auditados os fontes upstream inteiros; o estudo abrange contratos públicos e código de integração.

## 3. Diagnóstico técnico e oportunidades (não são ganhos medidos)

### 3.1 A diferença entre reagir a transformação e recriar pixels

[CÓDIGO + FONTE OFICIAL] Mudar apenas posição/rotação de uma camada pronta pode em certas condições evitar Layout/Paint. Mudar conteúdo de canvas com `drawImage` força produzir novos pixels, mesmo que a árvore SVG não altere. Assim, `React.memo` ou `will-change` não eliminam automaticamente composição de cabelo.

### 3.2 `foreignObject` liga superfícies diferentes

[HIPÓTESE] WebGL do cabelo produz uma textura, o app a copia para Canvas2D e a insere no SVG; isso pode desencadear raster/cópias adicionais. Antes de propor substituir Chromium inteiro, isolar a ponte WebGL→Canvas→SVG e contar bytes/superfícies atualizadas.

### 3.3 A captura é uma barreira separada da pintura

[CÓDIGO] O token de pintura existe porque solicitar quadro lógico e obter frame composto são eventos distintos. Pipeline novo precisa de confirmação correta para o frame absoluto e para o layer background/foreground de vídeo externo.

### 3.4 Precisamos de profiling multicamada

[HIPÓTESE] O caso de cabelo sem reação pode pagar custos em React, renderização de imagem, WebGL ou download/readback mesmo com poucos pixels visivelmente mudando. Métrica decisiva é contar `hairRasterFrames`, `hairRasterPixels`, atualizações de canvas, `captureReadbacks` e tempos por fase, confrontando trace Chromium.


## 4. Experimentos reproduzíveis (propostos, NÃO EXECUTADOS)

1. **C0 — repouso:** 300 frames com personagem e boca animada, nenhuma troca de pose; cabelo habilitado e desabilitado; registrar alterações do DOM, reactCommit, paint/raster, GPU e capture.
2. **C1 — reação de pose:** Com mesmo personagem, criar uma troca de pose de 29 frames capilares, comparar atividades de compositor com C0; capturar pontos antes/depois do evento.
3. **C2 — overhead do SVG:** PoC em janela isolada que substitua apenas o `foreignObject` de cabelo por overlay Canvas ou textura, preservando geometria e ordenação; comparar RGBA antes da codificação.
4. **C3 — tracing:** Ativar `contentTracing` somente durante uma exportação de fixture autorizada e correlacionar frameId, timestamps Main/Renderer/GPU e contadores internos; documentar overhead do profiler.
5. **C4 — decisão de arquitetura:** Demonstrar em 150/300 quadros diferença de **total clique→MP4** com mesma resolução, encoder, cache e cenário; se não houver ganho, não adotar.

## 5. Invariantes, riscos e critérios para adotar

- **Paridade:** ordem de desenho de cabelo posterior, flipX, crop, transform, sombras, alpha e texto com o mesmo antialias.
- **Tempo:** `setFrameRate(60)` não deve ser confundido com 60 FPS no arquivo; 30 FPS é contrato do V6.
- **Segurança:** não habilitar flags Chromium não suportadas nem remover isolamento para ter acesso a compositor interno.
- **Fonte vs hipótese:** RenderingNG ser eficiente não demonstra que DOM/React domine o benchmark do usuário.
- **Mídia:** `<video>` e efeitos SVG devem manter o mesmo relógio e fronteiras de partes Turbo.

## 6. Veredito de pesquisa e bloqueios

**Conclusão:** não há evidência para reescrever Blink ou Skia nem para declarar Chromium o gargalo. O caminho economicamente promissor é reduzir **quantas superfícies visuais são invalidadas** antes de discutir substituição de renderer. Abrir `CHROM-001`: trace do export worker com comparação 0/1 reação, sem mudar produção.

**Ainda não sabemos:** custo real de Raster/Viz por frame no Windows do usuário; se `foreignObject` força cópias caras; recursos GPU acelerados presentes no Electron instalado; efeito de `paint` versus `capturePage`.

**Relações com outras pesquisas:** [Arquitetura do app](01-ARQUITETURA-GERAL-E-INTEGRACOES.md), [Plano executável](../PLANO_EXECUTAVEL.md), [Matriz de oportunidades](../MATRIZ_DE_OPORTUNIDADES.md) e [Fontes](../evidencias/FONTES-OFICIAIS.md).

---

## 7. Auditoria aprofundada: propósito, limites e metodologia

**Segunda rodada intensiva — 06/11/2026.** Esta seção amplia a Pesquisa 02 sem apagar a rodada de reconhecimento acima. **Escopo investigado:** Chromium (Blink, cc, Viz, compositor, GPU, Skia, vídeo), APIs web e Electron efetivamente usadas pelo Native Gacha, contornos de pixel/tempo entre componentes, instrumentação e experimentos falsificáveis. **Fontes primárias realmente consultadas via site:** Chrome for Developers, Chromium.org, Electron, Skia e MDN; URLs e conclusão de cada fonte na seção 20.

### 7.1 Tipos de evidência

- **[CÓDIGO]** leitura da versão `Dev-V2@d51a96a1f29e87894f60e57902bced07995062a7` para esta rodada; links de arquivo GitHub na seção 18. A branch local do usuário pode diferir.
- **[FONTE OFICIAL]** página pública do projeto/mantenedor, acessada em 06/11/2026; não implica que o binário Windows use exatamente aquela revisão da API.
- **[INFERÊNCIA]** interpretação técnica de código/documentação, sem medições no app.
- **[HIPÓTESE]** causa possível com teste explícito que pode demonstrar que ela é falsa.
- **[RELATO]** cerca de 50 s com cabelo ON e 9 s com cabelo OFF para os mesmos 10 segundos exportados, conforme relato do usuário. Falta relatório A/B de fases.
- **[MEDIDO]** somente experimentos com ambiente, commit/dirty, fixture, amostras, métricas e validação de artefato. **Nenhum [MEDIDO] novo nesta rodada.**

### 7.2 O que é "completa" nesta etapa

A pesquisa cobre o **contrato público e o caminho de integração utilizado** pelo Native Gacha, com inventário de possibilidades do Chromium, riscos, causas candidatas, plano de profiling, critérios de refutação e backlog executável. **Não** significa leitura de todo o repositório C++ do Chromium, compilação do Blink, trace Perfetto coletado no PC do usuário ou benchmark de GPU já executado. Propostas permanecem bloqueadas por medições e validação Windows.

### 7.3 Resultado resumido em uma frase

O RenderingNG é capaz de reutilizar trabalho de composição, mas o código de exportação **gera e apresenta novos pixels de Canvas/SVG** em certos quadros mesmo quando apenas boca/expressão mudam. A primeira tarefa é determinar se o custo dominante está em **preparar personagens**, **refazer pixels** ou **capturar/copiar o frame** — e reduzir a operação provada cara, sem reescrever Blink/Viz.

## 8. Arquitetura técnica de Chromium — componentes e fronteiras

### 8.1 Main Electron, renderer Blink, compositor cc e Viz

| Componente | Responsabilidade segundo fonte oficial | Correspondência no Native Gacha | Como medir |
|---|---|---|---|
| Electron Main / browser process | Criação de janelas, IPC, privilegiados, coordenação de captura | `electron/main.ts`, `exportWorkers.ts`, `exportRunner.ts` | Perf do Main, job logs, export timings |
| Renderer main thread | JavaScript, DOM, layout, CSS, APIs Canvas/SVG, React commit | `exportWorker.tsx`, `SceneSurface.tsx` | JS Performance, React Profiler, long tasks |
| Renderer compositor thread (`cc`) | Camadas, commit, animation/scroll, coordena raster | Implícito no Chromium; não importado pelo V6 | Electron `contentTracing` / DevTools |
| Viz/display compositor | Agrega render surfaces, tiles, desenha resultado na GPU | Implícito na captura offscreen | Trace GPU/Viz e tempo `capturePage` |
| GPU process / drivers | Comandos de GPU, WebGL, raster, composição, vídeo hardware | `exportHairMeshRenderer.ts` e backend Chromium | Trace GPU, WebGL timings, contexto/driver |
| Skia | Raster 2D/paths/texto/imagens para pipelines de browser; superfícies/draw lists | Embutido no Chromium, **não usado diretamente via biblioteca Skia no código V6** | Eventos raster/Skia no trace, sem chamar internals |
| FFmpeg externo | Codifica BGRA para H.264, sobrepõe vídeo, junta e valida | `exportRunner.ts` | Timers por fase/parte, ffprobe, wall-clock |

**[FONTE OFICIAL]** O RenderingNG separa renderer process, browser process e Viz process, e múltiplos threads de raster, Main e compositor. **[INFERÊNCIA]** Mesmo que a UI esteja ociosa, duas BrowserWindows offscreen do Turbo podem disputar GPU/Viz e memória, devendo ser analisadas em conjunto.

### 8.2 Todas as fases do RenderingNG e sua relevância ao V6

As fases oficiais são **Animate → Style → Layout → Pre-paint → Scroll (conforme caso) → Paint → Commit → Layerize → Raster/Decode → Activate → Aggregate → Draw**. Dependências não são necessariamente lineares em toda atualização; o Chromium pode **pular fases**.

| Fase | O que o motor faz | Exemplos no V6 | Hipótese de desperdício e evidência necessária |
|---|---|---|---|
| Animate | Calcula animações declarativas e propriedades visuais | Transforms CSS se algum elemento os utilizar; cabelo próprio não é CSS animation | Não confundir JS de física de cabelo com animação declarativa de compositor |
| Style | Computed style da árvore DOM/SVG | Alteração de atributos, style inline, máscaras, fontes | Medir `Recalculate Style`, não presumir sempre que canvas muda |
| Layout | Geometria/fragmentos do DOM | Dimensões do SVG/`foreignObject` e textos | `Layout` caro? Verificar árvore alterada e causa |
| Pre-paint | Property trees e invalidação de display lists/tiles | Máscara, transform, clip e raster do personagem | Verificar alteração de região e invalidação de tile |
| Scroll | Atualização de offset | Prévia/timeline; praticamente irrelevante ao worker oculto que não rola | Não otimizar scroll para corrigir export |
| Paint | Cria display list dos objetos visuais | SVG shapes, texto, imagem, superfície HTML canvas | Paint recorre em quadros de boca? Paint flashing e trace |
| Commit | Copia display list/propriedades ao compositor | Após commit React e atualizações DOM | `flushSync` JS não comprova que compositor consumiu frame |
| Layerize | Organiza paint chunks em camadas | SVG/`foreignObject`/vídeo/canvas, conforme heurísticas Chromium | Contar camadas/tiles; não presumir layer própria por elemento |
| Raster/decode | Converte display list e imagens em tiles ou decodifica assets | PNG de face, hair surfaces, imagens base, fundo | Image decode ou raster repetidos? `assetPreparationMs` e trace |
| Activate | Compositor prepara frame/tiles para exibição | Quadro pronto para Viz; evento assíncrono | Token capturado demonstra pixel correto, não tempo exato de Activate |
| Aggregate | Viz agrega superfícies da janela/processos | HTML media/canvas/SVG e possíveis overlays | Medir GPU/Viz; não afirmar custo por heurística de DOM |
| Draw | Composição GPU do resultado final | Quadro na BrowserWindow offscreen | Captura pode impor readback GPU→CPU adicional |

**[FONTE OFICIAL]** Chrome for Developers detalha as fases e diz que animações de propriedades visuais podem pular Style/Layout/Paint em condições favoráveis. **[INFERÊNCIA]** Uma mudança de pixels de canvas normalmente não é equivalente a mover uma camada já rasterizada: o aplicativo realmente produz novo conteúdo, potencialmente exigindo novos tiles/frames. Isso **não** implica necessariamente re-rasterizar a tela inteira; dirty regions e tiles podem limitar a atualização.

### 8.3 Estruturas de dados: o que podemos aproveitar como princípio

1. **Frame tree/local frame fragment:** composição de documentos e iframes. O V6 desenha em um documento export HTML, sem motivo identificado para inventar iframes de render.
2. **Immutable fragment tree:** geometria de layout. Para o V6, geometria da timeline/cena pode ser pré-resolvida em modelo JS; isso não elimina layout de HTML/SVG automaticamente.
3. **Property trees:** árvores de transform, clip, effects e scroll reutilizadas pelo compositor. **Otimização possível:** preservar textura do corpo e atualizar apenas transform da camada isolada.
4. **Display lists e paint chunks:** comandos gravados pelo Blink/Skia; objetos com identidade visual estável permitem reduzir invalidações. **Não são APIs que TypeScript pode importar do Chromium.**
5. **GPU texture tiles e render passes:** tiles permitem raster parcial. Um canvas full-rig redesenhado pode invalidar uma área significativamente maior que a mecha real.
6. **CompositorFrame e Viz aggregation:** render de diferentes superficies chega à composição final; **não** existe no V6 um objeto público `CompositorFrame` para enviar ao Viz.
7. **Surface/SkPicture/SkCanvas:** o Skia interno trabalha com comandos, blend, matrizes e surfaces. Uma biblioteca Skia independente pode ser candidata futura, mas seria **outro backend de desenho** e exigiria reimplementar texto, face, SVG e vídeo.

**[INFERÊNCIA]** A lição útil é **separar identidade dos materiais, geometria e região invalidada**. Não tentar portar C++ de Blink, copiar `PaintChunks` ou acessar Viz por APIs privadas.

### 8.4 Por que "ativar GPU" não resolve automaticamente

- WebGL do cabelo **já usa GPU**, via contexto `webgl` próprio; o desenho da textura com mesh pode ser rápido, mas o `drawImage(mesh)` pode sincronizar e copiar pixels entre superfícies.
- A janela Electron usa `offscreen: true` e ainda extrai `NativeImage`/`toBitmap` para encoder CPU. Isto não é zero-copy.
- Skia pode rasterizar na GPU ou CPU conforme caminho; o exportador ainda pode gastar trabalho em preparação, dom de SVG e readback.
- Desativar GPU globalmente para "software output" remove WebGL usado no cabelo: essa opção **não é válida para a configuração atual** sem portar o mesh ou abandonar um recurso.
- Esquemas como `--disable-gpu`, `--use-gl=angle`, "force GPU raster" ou flags Chromium internas só podem ser experimentos isolados com paridade, fallback e identificação do build — nunca recomendação de produção sem teste.

## 9. Fluxo real de execução por quadro — Main, renderer e FFmpeg

### 9.1 Prévia interativa (não confundir com export)

````text
UI React / EditorV6Page
  → useEditorV6Playback e editorV6PlaybackClock (RAF, frame lógico)
  → EditorV6PlaybackScene (resolveEditorV6SceneAtFrame)
  → compor face quando necessário
  → SceneSurface (SVG com <image>, <text>, máscara, canvas e vídeo)
  → Blink/cc/Viz → display da UI
````

- **[CÓDIGO]** `EditorV6Timeline.tsx` usa memoização/virtualização da janela de blocos. A prévia tem subscrição externa de frame; ela não precisa renderizar a página inteira a cada tick.
- **[CÓDIGO]** `SceneSurface` é compartilhada pela prévia e pelo worker de export, mas ambos os contextos **não usam a mesma política de captura e decodificação**.
- **[CÓDIGO]** vídeo no preview é um `HTMLVideoElement` em `foreignObject`; na exportação com overlay o FFmpeg trata mídia por pipeline próprio.
- **[FONTE OFICIAL]** VideoNG separa demux/decode/presentation; vídeo pode chegar a Viz por superfícies/overlays e não atravessar a mesma rasterização DOM de imagens estáticas.
- **[INFERÊNCIA]** Trocar um compositor de PNG não torna a renderização de vídeo externa automaticamente determinística; preservar tratamento de frames, PTS, cor e alpha.

### 9.2 Exportação padrão — cadeia exata

````text
EditorV6ExportPanel (clique)
  → runEditorV6ExportCommand / snapshot imutável
  → prepareEditorV6HairMotionBundle [se hair ON; antes do job do Main]
  → preload / exportIpc / exportRunner (Main)
      → prepareExportMotions e mouth loops
      → criar 1 ou 2 BrowserWindows offscreen + preload isolado
      → executeJavaScript(renderEditorV6ExportFrame(frame, layer, token))
          → resolveEditorV6SceneAtFrame
          → applyMouthLoop
          → comparar visual keys (skip se realmente igual)
          → composeEditorV6FaceReplacements (condicional)
          → composeHairFrame / composeMotionHairFrame (condicional)
          → selectEditorV6RenderableAssets + Image.decode
          → flushSync(React root render SceneSurface SVG)
          → waitForSvgImage + atualizar token fora da viewport
          → 1 requestAnimationFrame (handoff)
      → capturePage(width + 24 pixels de token)
      → NativeImage.toBitmap(scaleFactor=1)
      → validar pixels do token; copiar linhas BGRA excluindo faixa
      → FFmpeg stdin.rawvideo(bgra, 1920×1080, 30fps)
      → H.264, overlay/áudio, concat, ffprobe, publicar MP4
````

**Observação:** **O pipeline não produz um MP4 de 120fps intermediário**. O worker pede frames lógicos numerados em 30 fps; `setFrameRate(60)` limita a cadência de pintura de uma BrowserWindow, não o fps do MP4.

### 9.3 A função de cada arquivo: mapa verificável

| Arquivo | Função / linha aproximada | Responsabilidade |
|---|---|---|
| `EditorV6ExportPanel.tsx` | `start(...)`, defaults | Botão, escolhas, cabelo, 1080p Turbo, CPU |
| `editorV6ExportCommands.ts` | `runEditorV6ExportCommand` | Snapshot, preparar cabelo antes do job |
| `editorV6HairMotionPreparation.ts` | `prepareEditorV6HairMotionBundle` | Renderers original/hairless, wardrobe reusada, faces e PNGs |
| `exportWorkers.ts` | `createEditorV6WorkerFactory` | BrowserWindows offscreen, token, captura e buffers |
| `exportWorker.tsx` | `renderEditorV6ExportFrame` | Frame, composições, SVG React, rAF |
| `exportHairMeshRenderer.ts` | `createExportHairMeshRenderer` | Mesh WebGL1, textura e frame buffer |
| `SceneSurface.tsx` | `SceneLayer` e `SceneSurface` | SVG, foreignObject, clip, mouth/face/textos |
| `exportCaptureBitmap.ts` | `captureEditorV6FrameBitmap` | Check de marca + bytes BGRA + cópia por linha |
| `src/shared/editorV6Export.ts` | visual keys e timings | Reuso de frame/camada e métricas |
| `exportRunner.ts` | `runEditorV6Export` | Janela, encoder, partes, áudio, validação |
| `sceneFaceComposition.ts` | `composeEditorV6FaceReplacements` | Patches faciais e cache controlado |
| `src/renderer/src/ui/performanceDiagnostics.ts` | `snapshotUiPerformance` | React, longtasks, frames de playback |

### 9.4 O detalhe que evita falsos resultados de profiling

- O `exportRunner` inicia seu relógio **depois** da preparação de cabelo no renderer da UI. Separar pre-job e job sem esquecer clique→MP4.
- `frameRoundTripMs` pode incluir JS, raster, captura e espera; `hairMeshDrawMs` é CPU esperando chamadas JS de WebGL, **não timestamp GPU concluída**.
- Num Turbo de 2 lanes, somar `capturePageMs` de ambas as lanes produz trabalho acumulado, **não elapsed de parede**.
- `requestAnimationFrame` no worker é um handoff: não prova sozinho que Blink/Viz terminou o desenho. O token de pixel lido do `NativeImage` é a defesa usada pelo código.

## 10. Renderização de cabelos: onde o Chromium realmente trabalha

### 10.1 Preparação antes de iniciar FFmpeg

**[CÓDIGO]** `editorV6HairMotionPreparation.ts`:
1. Resolve materiais de personagem por fonte/pose.
2. Cria versão normal e versão sem cabelo (renderers separados), compartilhando prepared wardrobe entre ambas — **reuso já implementado**.
3. Compõe face, corpo, overlay e crop em Canvas2D; serializa algumas superfícies PNG com `canvas.toDataURL('image/png')`.
4. Monta rigs com dimensões do artwork, geometria, face, base, overlay e peças do cabelo posterior.
5. Encaminha bundle RGBA/PNG e catálogo para o worker, que decodifica as imagens.

**[HIPÓTESE]** Boa parte dos 41s extras relatados pode estar nessa preparação, fora da GPU capturada no worker. Um trace limitado ao export worker **não é suficiente para provar ou negar isso**.

### 10.2 Mesh WebGL1, não WebGL2

**[CÓDIGO]** `exportHairMeshRenderer.ts`:
- Usa `canvas.getContext('webgl', {alpha:true,premultipliedAlpha:true,antialias:true,preserveDrawingBuffer:true})`; é **WebGL1**.
- Mantém **um contexto e programa por worker**, buffers de índices/UV estáticos e posições dinâmicas.
- Guarda texturas de `HTMLImageElement` em `WeakMap` e deixa lista para liberação no dispose.
- Faz `gl.bufferSubData` das posições por desenho, e `gl.texImage2D` só ao criar textura inédita no mapa.
- Usa Canvas WebGL grow-only para evitar realloc por diferentes mechas e controla viewport/scissor; verifica limites GPU apenas uma vez por contexto.
- `gl.drawElements` emite comandos, mas a duração JS dessa chamada não mede a conclusão real da GPU. Diagnóstico GPU precisa trace ou timer query com extensão e controle de sync.
- `preserveDrawingBuffer:true` pode ser relevante para copiar os pixels após desenhar; remover essa flag sem comprovar invariantes pode causar imagens vazias.

**[CONCLUSÃO]** O código já realiza várias otimizações sensatas; a oportunidade provável não é "fazer a mesma malha com mais substeps", mas evitar o fluxo seguinte quando desnecessário.

### 10.3 Passagens e cópias depois da malha

````text
peça original (HTMLImageElement)
    → texImage2D (uma vez por textura recém-carregada)
    → mesh em contexto WebGL
    → drawImage(mesh, ...) para Canvas2D da mecha
    → drawHairPiece em Canvas2D do personagem inteiro
    → drawSurface(base, face, overlay) na ordem correta
    → ExportRasterCanvas dentro do foreignObject SVG
    → Blink/Skia/cc/Viz compõem a página
    → capturePage extrai NativeImage
    → toBitmap e cópia das linhas de 1920px
    → FFmpeg (BGRA)
````

**[INFERÊNCIA]** Esse é um pipeline com várias superfícies e potenciais sincronizações. Porém, não é correto afirmar que **cada** seta implica necessariamente uma leitura de GPU ou copia CPU: a implementação de `drawImage` e o backend do Chromium podem escolher caminhos de otimização. Só trace/benchmark pode confirmar quantas cópias reais ocorreram.

### 10.4 O modo por pose é um caso especial

- `hairPoseReactionOnly=true` e `hairPosteriorOnly=true` são defaults no painel; a reação após troca de pose é não looping e dura cerca de 29 quadros ativos a 30fps, com repouso depois.
- O motor tem simulação geral 120Hz, mas `sampleHairMotionPoseReaction` (modo default) amostra reação analítica; **não** presumir 4 substeps/quadros para o modo padrão.
- `motion/hairBakeBatch.ts` retorna `[]` para bakes extras sem cabelo quando só há reação de pose: **uma otimização existente**.
- `exportWorker.tsx` já distingue `hairNeedsFrame` e `reacting`, e preserva reuso de frames visualmente idênticos.
- Ainda assim, se **boca ou expressão** muda a identidade visual de um frame, o compositor pode chamar `composeHairFrame` de novo, desenhando uma superfície full-rig mesmo sem reação ativa. Não afirmar frequência exata sem `hairRasterFrames` e contadores por evento.

### 10.5 A oportunidade: separar a invalidação da boca da invalidação do cabelo

**[HIPÓTESE CHROM-CAB-01]** Definir superfícies conceituais independentes:

- `backgroundStatic` / object/texto conforme cena;
- `baseWithoutPosteriorHair` (corpo, roupas, cabeça, quando estáticos);
- `posteriorHairRGBA` com estado de repouso/quadros ativos da reação;
- `faceAndMouthPatch` independente do corpo e da reação;
- `frontDetails` / overlays/oclusão preservados.

Assim, a boca pode mudar sem reconstruir a malha/camada de cabelo em repouso. **Essa não é uma ordem para reescrever SceneSurface:** é proposta de prova de conceito de um único personagem sem vídeo.

**Oclusão:** cabelo posterior precisa ficar **atrás da cabeça**, não por cima do PNG final. A versão do personagem "sem posterior" e as peças front/overlays precisam ser verificadas pixel a pixel. Atualizar apenas 29 frames é viável **somente se** estados fora desse intervalo realmente forem idênticos à base e se duas reações próximas/transições não provocarem dependências extras.

## 11. Características do Chromium relevantes para otimização, com limites

### 11.1 Dirty rectangles, tiles e invalidação incremental

- **[FONTE OFICIAL]** RenderingNG divide viewport rasterizada em tiles; paint invalidation decide conteúdo que mudou. Uma pequena área pode ser repintada sem recompor a viewport inteira.
- **[CÓDIGO]** `composeHairFrame` limpa e desenha um canvas do tamanho do rig (`rig.outputWidth × rig.outputHeight`), incrementando `hairRasterPixels` pela área integral, sem ROI localizado na mecha.
- **[HIPÓTESE]** Se a área alterada é menor que o rig, separar um canvas ROI pode reduzir trabalho de Canvas e invalidação no Chromium; o motor não reduzirá automaticamente o custo JS da rotina `clearRect` + desenho da base feito pelo aplicativo.

### 11.2 Property trees e transformação de textura pronta

- **[FONTE OFICIAL]** Transform/opacity, clipping e effects podem ser aplicados às texturas já preparadas em compositor sem recriar a imagem.
- **[CÓDIGO]** `SceneSurface.tsx` usa `<g transform=...>`, `flipX`, máscara para substituição facial, `<image>` com assets PNG e Canvas em `foreignObject`.
- **[INFERÊNCIA]** Translação/rotação de personagem estático pode explorar reuso de textura; deformar cabelo por mesh **altera a geometria interna da textura**, logo não equivale a simples CSS transform de um bitmap único.
- **[HIPÓTESE]** Aplicar transformação já calculada a um ROI da mecha, sobre uma base estática, pode combinar as duas vantagens: menos pixels gerados + transform no compositor.
- **Limite:** SVG masks e a ordem da pintura podem exigir passes adicionais, que precisam de profiling.

### 11.3 CSS containment / content-visibility / will-change

- `contain: layout/paint` pode limitar propagação de alterações, **mas** `contain:paint` também recorta conteúdo fora dos bounds; recortar cabelo com overshoot é regressão.
- `content-visibility:auto` é útil para regiões fora da viewport em UI longa, não serve para omitir conteúdo que deve aparecer em todos os frames do MP4.
- `will-change` em excesso multiplica layers/texturas e VRAM. É antipadrão aplicar `will-change:transform` a todas as peças do personagem ou à página inteira; MDN recomenda uso pontual.
- O token de pintura já usa `contain:strict` num elemento de 24×16px fora da imagem: esta contenção **não** torna o canvas de personagem barato.

### 11.4 SVG `foreignObject`

- Permite HTML dentro da hierarquia SVG; no V6 é usado para `<video>` da prévia e para o canvas preparado do personagem.
- Remover `foreignObject` **sem** outro mecanismo de composição quebra pelo menos: vídeo, ordem de desenho, transform, clipping, máscara, tela transparente, conversão de coordenadas e escala.
- **[HIPÓTESE]** Uma implementação de overlay Canvas no mesmo root pode evitar uma etapa de composição em alguns frames, mas exige golden RGBA e comparação de capture/paint.
- **[FONTE OFICIAL]** `foreignObject` é elemento SVG padrão: sua existência não demonstra bug ou lentidão específica do Chromium.

### 11.5 Image decoding e caches

- `Image.decode()` e handlers `load/error` são usados para preparar fontes de PNG do hair bundle, e o worker tem cache limitado (`images` até 32 promessas).
- A lógica percorre `document.querySelectorAll('svg image')` e aguarda fontes usadas no quadro. Isso é uma barreira de qualidade; não remover para acelerar caso um PNG mude.
- **[HIPÓTESE]** Reutilizar assets por identidade imutável e evitar serializar PNG em todas as combinações de face pode reduzir a ida a decoder/raster; distinguir cache de imagem decodificada, cache de face e cache de canvas.

### 11.6 Skia: onde ele realmente aparece e por que não é API gratuita

- Skia fornece `SkCanvas`, `SkSurface`, `SkImage`, `SkPicture`, `SkPaint`, `SkBlendMode`, `SkMatrix` e raster CPU/GPU. Chrome o usa em caminhos de raster.
- O V6 **não** importa a biblioteca nativa Skia nem usa diretamente `SkCanvas`. Ele usa Web APIs executadas por Chromium.
- Um compositor nativo Skia, CanvasKit ou similar só é vantajoso se cobrir as regras que o SVG/Canvas atual já entrega (tipografia, máscara facial, foto, roupas, crop, cor, vídeo e hair mesh), e provar menor tempo total.
- Documentos históricos de GPU compositing no Chromium são úteis para command buffers/mailbox/sync e SkPicture, mas **não** devem ser tratados como blueprint exato do Chromium embutido no Electron 45.

### 11.7 Vídeo/VideoNG não é a mesma coisa que animação de cabelo

- Vídeo externo do usuário tem demux/decode/timestamp e pode ser renderizado como superfície do Viz por pipeline especial.
- O cabelo do V6 não é `HTMLVideoElement`; é textura/mesh/Canvas. Chamar animação transparente de "vídeo" introduziria um novo decoder/muxer, sincronização e custo de geração.
- A solução mais simples de testar é uma sequência RGBA/canvas por evento, sem arquivo de vídeo intermediário. Um clip RGBA pode ser segunda opção **se** diminuir total do primeiro export ou permitir reuso real.

## 12. Memória, largura de banda e cópias: números verificáveis (aritmética, não benchmark)

Para 1920×1080 e BGRA 8 bits por canal, o quadro ocupa:

| Grandeza | Fórmula | Resultado |
|---|---|---|
| Pixels por frame | `1920×1080` | `2.073.600` |
| Quadro BGRA | `1920×1080×4` | **8.294.400 bytes = ~7,91 MiB** |
| Imagem capturada com token de 24px | `(1920+24)×1080×4` | **8.398.080 bytes = ~8,01 MiB** |
| Faixa extra do token | `24×1080×4` | **103.680 bytes** |
| 150 quadros BGRA processados | `150×8.294.400` | **1.244.160.000 bytes (~1,16 GiB)** |
| 300 quadros BGRA processados | `300×8.294.400` | **2.488.320.000 bytes (~2,32 GiB)** |
| Buffer de duas layers BGRA | `2×8.294.400` | **16.588.800 bytes (~15,82 MiB)** |

**Interpretação obrigatória:** 2,32 GiB é volume **acumulado** de bytes no pipe ao longo de um vídeo de 10 segundos, **não** RAM simultânea nem volume duplicado automaticamente por cada operação. Contar o número real de readbacks/cópias com ferramentas; no Turbo duas partes coexistem, mas buffers e texturas podem ser reusados.

**[CÓDIGO]** `exportCaptureBitmap.ts` verifica `size.width ≥ width+24`, converte `NativeImage.toBitmap({scaleFactor:1})`, lê 24 células de marca BGRA, e faz `bitmap.copy(target,...)` em linhas da região 1920×1080. A cópia row-by-row foi escolhida para **eliminar a faixa lateral do token**; trocar por `toPNG` ou cropping de `NativeImage` adicionaria overhead e re-encode.

**[HIPÓTESE]** Menos capturas só são possíveis com frames realmente iguais; se mouth loop altera o frame, saída deve mudar. A otimização alvo deve ser reduzir a composição ANTES da captura ou o custo da própria extração, não suprimir quadros visíveis.

## 13. Cadência, 30 FPS, 60 Hz, 120 Hz e sincronização de pintura

| Frequência / clock | Onde aparece | Significado verdadeiro |
|---|---|---|
| 30 FPS | `editorV6Export.ts`, timeline e `exportRunner.ts` | Frames finais sequenciais, com posições absolutas; vídeo 10s tem 300 frames |
| 60 no `setFrameRate` | `exportWorkers.ts` | Teto/solicitação de cadência do renderizador offscreen, não output do MP4 |
| 120 Hz | `hairMotionEngine.ts` | Frequência do integrador de física genérica; não é vídeo intermediário |
| 29 frames ativos | Reação capilar por pose | Amostras após fim da troca; termina e repousa |
| `requestAnimationFrame` | `exportWorker.tsx` | Handoff ao ciclo de pintura; não certificado de captura final |
| token de 24 bits | `exportWorker.tsx` → `exportCaptureBitmap.ts` | Marca pixel lida na captura para distinguir frame antigo de novo |
| FFmpeg PTS | `exportRunner.ts` | Fixa sequência temporal/codec e áudio na saída |

### 13.1 O marcador de sincronização como contrato de segurança visual

1. Na página do worker, `rootElement` ocupa `width×height`.
2. É criado um `div` fixo à direita (`left=width`), 24×16 pixels e `contain:strict`.
3. O token inteiro de 24 bits é representado em 24 células 4×4 brancas/pretas.
4. O worker desenha a cena, muda o token e aguarda um `requestAnimationFrame`.
5. Main usa `capturePage({width:width+24,height})`, incluindo token fora da imagem.
6. `captureEditorV6FrameBitmap` verifica os 24 bits **na mesma captura** que terá seus pixels exportados.
7. Se não corresponder, `invalidate()`, espera uma janela curta e tenta de novo; ao vencer timeout cancela sem publicar vídeo errado.
8. Ao corresponder, copia apenas as colunas 1920 de cena para buffer de destino; o FFmpeg jamais vê o token.

**[DECISÃO]** Nenhuma tentativa de trocar `capturePage` por `paint`, `sharedTexture`, `OffscreenCanvas` ou captura direta pode remover a garantia de **frameId confirmado**. Se houver layer background/foreground, validar **as duas** capturas para o mesmo frame absoluto. Uma textura GPU compartilhada sem teste de token não atende critério de aceite.

### 13.2 Por que `paint` não é automaticamente substituto mais rápido

Segundo Electron, modo offscreen pode emitir evento `paint` com `dirtyRect`; o bitmap padrão pode requerer GPU→CPU. Mas há diferenças práticas:

- Evento é assíncrono; precisa associá-lo ao frame pedido, não ao último evento que chegou.
- Dirty rectangle pode conter apenas uma região alterada, não toda a imagem; exige acumular corretamente quando o consumidor quer 1920×1080 BGRA.
- Primeira imagem, resize, DPR, context loss, fundo transparente, token fora da cena e duas lanes complicam o protocolo.
- Se a cena inclui boca mudando ou camadas de vídeo separadas, é necessário provar estabilidade entre emissões.
- Repaint de 24 células de token em todo frame pode gerar paint mesmo quando o conteúdo da cena não mudou; essa é uma escolha deliberada para verificar captura.
- **Hipótese a testar:** o custo médio de `capturePageMs` pode ser maior que o de receber `paint` e copiar dirtyRect. **Não demonstrado.**

### 13.3 Shared texture: viabilidade futura, não feature flag fácil

- `webPreferences.offscreen.useSharedTexture` é uma opção **experimental** do Electron; o export atual usa `offscreen:true`, sem pedir textura compartilhada.
- Objetos de shared texture têm `textureInfo` com `pixelFormat`, `colorSpace`, `codedSize`, `visibleRect`/`contentRect`, `timestamp` e método `release()`.
- O código receptor precisa de **módulo nativo**, sincronização e política de ciclo de vida; o número de texturas pendentes é limitado.
- Mover textura GPU entre processos não é permitido simplesmente serializando o objeto: metadata é transmissível, a textura/handle exige integração.
- **Atenção crucial:** o encoder CPU padrão continua esperando BGRA em stdin. Se no final for necessário ler GPU→CPU do mesmo jeito, a estratégia pode não reduzir custo real e pode aumentar complexidade.
- Recomendação: avaliar somente após provar que captura/readback domina e depois de comparar `paint`; Windows/AMD/Direct3D pertencem à Pesquisa 12.

## 14. Inventário de otimizações JÁ EXISTENTES — não reinventar

| Código já presente | Benefício previsto | O que ainda medir |
|---|---|---|
| `SceneLayer` com `memo` e `sceneLayerPropsEqual` | Evita reconstruir SVG quando props visuais estáveis | Se `rasterFrame=scene.frame` invalida camadas de hair mesmo em repouso |
| Relógio de playback externo | Evita que o playhead cause render de toda a página | Scrub/seek/pausa e preview real |
| `TimelineRows` memoizado/virtualizado | Reduz blocos DOM fora da janela visível | Scroll e projetos longos |
| `editorV6VisualKey` e `editorV6LayerVisualKeys` | Permite skip de frames/camadas idênticos | Precisão das chaves e custo de `JSON.stringify` |
| `resolvedRawScene` memoizado por frame | Reuso nas capturas background/foreground do mesmo quadro | Se decodificação/media muda fora da cena |
| `selectEditorV6RenderableAssets` | Só envia assets realmente usados na camada/frame | Custo de criação do array/Index de imagem |
| `Image.decode()` + cache limitado | Evita decoder duplicado | Hit rate em mouth/face/hair |
| `staticHairWarpCanvases` | Reusa textura estática preparada da mecha | Se tela full-rig continua sendo redesenhada |
| `hairFrameCanvases` e `motionHairFrameSurfaces` | Reusa canvas por personagem/troca | Quantos `clearRect`/`drawSurface` em repouso |
| `WeakMap` de texturas, contexto WebGL grow-only | Evita reupload/canvas resize frequentes | Custos GPU e mem/VRAM |
| `hairBakeBatch` dispensa hairless transition extras em pose reaction | Menos bakes redundantes | Fases reais de prep com esse flag |
| `PAINT_TOKEN_SIZE` e captura de um só `NativeImage.toBitmap` | Protege quadro e evita duas conversões por captura | Custo do bitmap + row copy |
| Buffer BGRA reutilizável e `stdin.write` aguardado | Limita memória inflight | Stalls do encoder CPU e workers |
| Report fases (`hairCanvasBlitMs`, etc.) | Permite diagnosticar sem instrumentos novos pesados | Instrumentar somente lacunas faltantes |

**[CONCLUSÃO]** Uma refatoração total substituindo esses mecanismos deve justificar o risco e replicar suas garantias. A pesquisa busca **eliminar uma operação inteira** (composição de corpo em frame de boca), não reimplementar uma otimização existente com nome novo.

## 15. Matriz de hipóteses Chromium — ranking provisório e formas de refutar

| ID | Hipótese | Se verdadeira, o que observar | Como refutar |
|---|---|---|---|
| CHROM-01 | Preparação de personagem/face com cabelo domina diferença | `hairPreparation` grande, antes de exportRunner | Preparo pequeno e diferença majoritariamente no worker |
| CHROM-02 | Full-rig Canvas recomposto com cabelo em repouso quando boca muda | `hairRasterFrames` alto com 0 eventos e mouth on | Contador 0/baixo ou quadro/tempo sem diferença |
| CHROM-03 | WebGL→Canvas blit sincroniza ou copia caro | `hairCanvasBlitMs` ou trace GPU alto em frames ativos | Blit desprezível e tempo concentrado em outros caminhos |
| CHROM-04 | `foreignObject` causa paint/raster excessivo | Paint flashing/trace mostra raster ampla por alteração mínima | Tile/paint restrito e tempo pequeno |
| CHROM-05 | `capturePage` GPU→CPU domina após compor | `capturePageMs` e `captureBitmapMs` dominam frames de C0 e C1 | Captura semelhante e barata com cabelo ON/OFF |
| CHROM-06 | `Image.decode`/SVG image loading se repete em excesso | `assetPreparationMs` cresce com alteração facial, muitas misses | Assets decodificados estáveis |
| CHROM-07 | Token/rAF impõe espera de frame relevante | `rafWaitMs`/retry grande ou stale frequente | Wait pequeno e tokens sempre válidos |
| CHROM-08 | Duas lanes disputam GPU/Viz | GPU/VRAM saturada, wall-clock 2 lanes pior que 1 | Duas lanes sustentam maior throughput real |
| CHROM-09 | Mais camadas/buffers que o necessário elevam memória | RSS/VRAM por worker acompanha número de rigs/atlas | Memória bounded e sem impacto de performance |
| CHROM-10 | Skia/Chromium deve ser totalmente substituído | Todos os subgargalos persistem; spike alternativo reproduz features mais rápido | Correção local ROI/capture atinge meta sem reescrita |

**Prioridade inicial condicionada ao A/B:** CHROM-01, CHROM-02, CHROM-03, CHROM-05. CHROM-10 é o cenário **menos justificado antes dos experimentos**.

## 16. Programa de tracing e medição — guia para o Codex local

### 16.1 Pré-requisitos obrigatórios

- Confirmar `git branch --show-current`, `git status --short` e SHA do build (comparar fonte local com `Dev-V2`), além de `process.versions` Electron/Chromium/Node.
- Confirmar versão do FFmpeg/ffprobe efetivamente empacotado. CPU/GPU AMD/driver e disponibilidade WebGL podem mudar o resultado.
- Usar **cópia autorizada** do projeto `editor v6 06`, íntegra e fora de userData, com hashes e referências resolvidas. **Não** modificar o benchmark protegido de outro projeto para acessar arquivos pessoais.
- Garantir duas condições equivalentes: ON/OFF só muda animação capilar; mesmo intervalo 300 frames 1920×1080, encoder `cpu`, Turbo, áudio, vídeo, face/pose, presets e corpo.
- Fazer ao menos 3 corridas por condição, em ordem alternada ou frio controlado, com monitoramento de memória.
- Executar baseline **sem DevTools/contentTracing** e tracing posterior em amostras separadas; tracing altera desempenho.

### 16.2 Categorias de trace e workflow recomendado

A documentação atual do Electron `contentTracing` (Electron ≥45) passou a registrar **Perfetto protobuf**, não o JSON antigo. A API deve ser usada **após `app.ready`**, com `getCategories()` para verificar categorias que existem no build e `startRecording`/`stopRecording` em `try/finally`. Não copiar exemplos antigos que mandam abrir `chrome://tracing` se o build já emite protobuf.

**Categorias candidatas a verificar com `getCategories()` (não presumir todas disponíveis):**
- `blink`, `cc`, `viz`, `gpu` e `electron`;
- `disabled-by-default-devtools.timeline` / `disabled-by-default-devtools.timeline.frame` / `toplevel` e subtags, se disponíveis;
- `media`/`skia`, se retornadas, para subanálise de recursos.

Evitar `included_categories:['*']` no benchmark longo: o trace pode ficar enorme e alterar o custo. Preferir categorias restritas realmente retornadas no build, e registrar quais foram aceitas.

**Sequência segura (pseudocódigo — NÃO alterar produção automaticamente):**

````typescript
import { app, contentTracing } from 'electron';

async function withChromiumTrace(runFixture: () => Promise<void>, destination: string) {
  await app.whenReady();
  const available = new Set(await contentTracing.getCategories());
  const candidates = ['blink', 'cc', 'viz', 'gpu', 'electron', 'toplevel'];
  const included_categories = candidates.filter(name => available.has(name));
  if (!included_categories.length) throw Error('Nenhuma categoria solicitada está disponível.');
  await contentTracing.startRecording({ included_categories });
  try {
    await runFixture();   // Somente cópia autorizada, render isolado.
  } finally {
    const tracePath = await contentTracing.stopRecording(destination);
    // Electron 45+: trace protobuf, abrir no Perfetto UI;
    // registrar tamanho, duração e política de limpeza/sanitização.
    console.info('Trace gerado (não publicar arquivo bruto):', tracePath);
  }
}
````

**Observações:** exemplo é estrutura de laboratório, não script de produção pronto. Fazer tratamento de falha de `stopRecording` e de trace já em curso; algumas categorias podem exigir configuração TraceConfig. O destino temporário deve ser uma pasta de benchmark isolada autorizada. **Não incluir URL de mídia nem nomes de personagens nos marcadores ou logs compartilhados.**

### 16.3 Correlacionar trace com métricas já existentes

| Campo do app | Camada que cobre | Evento externo correspondente | Limitação |
|---|---|---|---|
| `sceneResolutionMs` | Resolve timeline JS | Main thread `Function Call` | Não inclui paint |
| `faceCompositionMs` | Compose/patch face | JS/Canvas/decoder | Pode misturar CPU e espera |
| `hairCompositionMs` | Composição Canvas/mesh | Main thread e GPU/Skia | Não inferir GPU concluída |
| `hairCanvasBlitMs` | `drawImage` WebGL→Canvas | Canvas/Skia trace | Tempo JS pode incluir sincronização |
| `hairMeshDrawMs` | `gl.drawElements` chamada | GPU command buffer | JS retorna antes da GPU concluir |
| `assetPreparationMs` | Image/SVG decode waits | ImageDecode, raster | Assets podem estar em cache |
| `reactCommitMs` | React→DOM | React Profiler/EventLoop | Não comprova Capture pronto |
| `rafWaitMs` | Handoff render | Frames / BeginFrame | Vsync/cadência não output fps |
| `capturePageMs` | Captura Chromium | Viz/Readback / Electron | Pode haver retries |
| `captureBitmapMs` | NativeImage→BGRA | Main CPU / memcpy | Buffers reused; row copy |
| `ffmpegWriteMs` | Pipe a encoder | Node event loop/FFmpeg external | Callback ≠ CPU codec |
| `captureStaleReadbacks` | Marcador obsoleto | Repetição de readback | Efeito do timing |
| `hairRasterFrames`, `hairRasterPixels` | Quantidade de trabalho gerado | Áreas de repaint | Conta canvas inteiro, não tile real |

### 16.4 O que medir separadamente

1. **Pre-job hair prep:** `prepareSavedCharacterRenderer` original/hairless, load de assets, `renderToCanvas`, crop, `canvasDataUrl` e construção do bundle.
2. **Worker startup:** criação BrowserWindow, HTML, preload, decode de assets iniciais e WebGL context.
3. **Por frame:** solução da timeline, mouth, face, hair/mesh, Canvas, upload/decoder, React, rAF e capture.
4. **Main:** tempo em `executeJavaScript`, cópia BGRA, retries token, FFmpeg pipe e probes.
5. **Sistema:** CPU por processo, threads, GPU/VRAM, RSS Main/Renderer/GPU, I/O de assets e bloqueios.
6. **Resultado:** clique→MP4 final validado, frame count/PTS/audio, cor, RGBA golden antes da compressão.

**Instrumentação adicional mínima sugerida, só se faltarem dados:**
- Contador `hairComposeAtRestFrames` (com reação INATIVA e cabelo ON);
- Contador `hairComposeOnReactionFrames`;
- Tempo `hairPreparationBeforeJobMs` explicitamente somado no relatório de parede;
- Contador de `rasterCanvas rebind/DOM replace` sem ler conteúdo da imagem;
- `assetDecodeMisses` vs hits e bytes de PNG do bundle;
- Medição de `timeToFirstFrame` e `timeToWorkerReady`;
- Gatilho `lastPoseChangeFrame` e `faceModeChanges` para associar causa ao quadro.

Não colocar console.log por mecha/frame em benchmark: I/O de log altera a amostra. Registrar agregados com limite de memória.

## 17. Experimentos detalhados, sequência e aceite

### CHROM-T0 — Baseline protegido

- **Entrada:** projeto autorizado de 10 s, hair ON/OFF, mouth e outras opções fixas.
- **Execução:** três corridas frias reais por condição, mais controle warm separado; hash dos assets/snapshot e versão do binário.
- **Coletar:** clique→MP4, pre-job, job, partes, capture, encoder, memory/VRAM.
- **Aceite:** tabelas de fase por condição, dispersão, sem perda de frames/áudio.
- **Refutação:** se tempo grande desaparecer com mesmo input, investigar cache/build/flag do teste relatado antes de mudar arquitetura.

### CHROM-T1 — Controle de repouso e boca

- 300 frames com personagem em mesma pose, sem evento capilar, mas boca animada; alternar cabelo ON/OFF.
- Coletar `hairRasterFrames` e `hairRasterPixels` **por frame**, número de mudanças em `visualKey` e tempo de Canvas full-rig.
- Se ON gera centenas de composições mesmo sem reação, **CHROM-02 ganha apoio**; se zero, refutada.

### CHROM-T2 — Única reação de pose

- Uma troca de pose terminando em frame conhecido; capturar golden frames `end-2`, `end-1`, `end`, `end+1...end+29`, `end+30` (ajustar ao contrato exato observado na fixture).
- Comparar transição, interpolação de rig e posição capilar, atividade de Canvas/GPU/paint/decoder.
- Se compositor full-rig continua após repouso, medir dependência da boca/face.

### CHROM-T3 — Tracing faseado

- Executar uma fixture sintética sem conteúdo privado com 0/1/3 reações.
- Sem trace: baseline. Com trace restrito: correlacionar JS, Blink Paint, raster, Viz, GPU e capture.
- Coletar p50/p95 por fase e contagens de tiles/pixels **quando trace contiver estes eventos**.
- Se eventos de GPU não estiverem disponíveis, marcar `NÃO OBSERVÁVEL` em vez de inventar.

### CHROM-T4 — Compositor ROI de cabelo

- Prototipar `baseWithoutPosteriorHair`, `posteriorHairRGBA`, `faceAndMouth` em cena de laboratório, não no exportador default.
- Usar **cabelo posterior somente**, sem vídeo intermediário inicialmente. Respeitar atrás/à frente da cabeça, face, ropa, flipX, crop, máscaras e cores.
- Aceitar somente com equivalência RGBA antes de H.264 e queda de tempo total de clique→MP4 incluindo preprocessamento.

### CHROM-T5 — Remover a ponte WebGL→Canvas apenas no laboratório

- Testar compor hair mesh numa textura do mesmo renderer final ou FBO intermediário (WebGL2 só após feature detection).
- Manter composição restante igual, comparar `hairCanvasBlitMs`, GPU stalls, VRAM e pixel diff.
- Se melhora local não resultar em MP4 mais rápido, não adotar.

### CHROM-T6 — `capturePage` versus `paint`

- Só executar se o baseline atribuir tempo relevante a captura.
- `paint` com dirtyRect acumulado, frameId confirmado, full viewport, token lateral, duas lanes e layeredVideo.
- Testar evento fora de ordem, resize, DPR, face, vídeos e cancelamento.
- Rejeitar se houver quadro stale, queda de qualidade ou overhead maior.

### CHROM-T7 — Renderer startup/preload

- Medir `create BrowserWindow→ready→first frame` com e sem hair bundle; analisar Image.decode/asset loading e cache.
- Comparar 1/2 lanes e isolamento de sessão; não usar sessão compartilhada insegura para simular cache.
- Se startup pequeno, não priorizar chunking/BrowserWindow.

### CHROM-T8 — `foreignObject` vs overlay preservando cena

- Só se rastros indicarem Paint/Raster excessivos de `foreignObject`.
- PoC que desenhe o mesmo Canvas em overlay de root com transform idêntico e z-order; **não remover vídeo** do teste de produção.
- Comparar alpha, máscaras, texto, crop, contraste, movimento e flip; validar que o compositor viu a mesma geometria.

### CHROM-T9 — Stress de GPU e memória

- Duas lanes Turbo 1920×1080, 300 frames e múltiplos atores: medir GPU/VRAM/RSS/threads.
- Validar context loss e teardown (deleteTexture, deleteBuffer, cancel jobs).
- Garantir que janelas de export/motion não permaneçam abertas, nem buffers cresçam indefinidamente.

### CHROM-T10 — Decisão arquitetural, nunca por intuição

- Calcular redução de tempo **total do primeiro export** por variante, p95/memória e esforço/risco.
- Se intervenção incremental ROI atingir resultado suficiente, não iniciar reescrita Chromium.
- Só propor outro backend se rotas incrementais falharem e spike resolver **todas** as exigências de qualidade e funcionalidades do projeto.

## 18. Inventário de arquivos e evidências verificáveis por link estável

Links abaixo fixam **uma revisão** para não deixar linhas mudarem silenciosamente em sessões posteriores:

- [`SceneSurface.tsx`, linhas 88–197](https://github.com/nestarasup-sys/Native-gacha/blob/d51a96a1f29e87894f60e57902bced07995062a7/src/renderer/src/features/editorV6/SceneSurface.tsx#L88-L197) — `ExportRasterCanvas`, comparação memo, SVG e foreignObject.
- [`exportWorker.tsx`, linhas 22–90](https://github.com/nestarasup-sys/Native-gacha/blob/d51a96a1f29e87894f60e57902bced07995062a7/src/renderer/src/features/editorV6/exportWorker.tsx#L22-L90) — token e espera de SVG image.
- [`exportWorker.tsx`, linhas 265–455](https://github.com/nestarasup-sys/Native-gacha/blob/d51a96a1f29e87894f60e57902bced07995062a7/src/renderer/src/features/editorV6/exportWorker.tsx#L265-L455) — WebGL→Canvas e composição full-rig.
- [`exportWorker.tsx`, linhas 488–682](https://github.com/nestarasup-sys/Native-gacha/blob/d51a96a1f29e87894f60e57902bced07995062a7/src/renderer/src/features/editorV6/exportWorker.tsx#L488-L682) — lógica de reuso, atualização de cena/React e rAF.
- [`exportHairMeshRenderer.ts`, linhas 45–202](https://github.com/nestarasup-sys/Native-gacha/blob/d51a96a1f29e87894f60e57902bced07995062a7/src/renderer/src/features/editorV6/exportHairMeshRenderer.ts#L45-L202) — WebGL1, cache de textura e estado GPU.
- [`exportWorkers.ts`, linhas 17–192](https://github.com/nestarasup-sys/Native-gacha/blob/d51a96a1f29e87894f60e57902bced07995062a7/electron/domains/editorV6/exportWorkers.ts#L17-L192) — janelas offscreen, capturePage, tokens e layers.
- [`exportCaptureBitmap.ts`, linhas 1–52](https://github.com/nestarasup-sys/Native-gacha/blob/d51a96a1f29e87894f60e57902bced07995062a7/electron/domains/editorV6/exportCaptureBitmap.ts#L1-L52) — BGRA, imagem de token e row copy.
- [`editorV6HairMotionPreparation.ts`, linhas 179–328](https://github.com/nestarasup-sys/Native-gacha/blob/d51a96a1f29e87894f60e57902bced07995062a7/src/renderer/src/features/editorV6/editorV6HairMotionPreparation.ts#L179-L328) — preparo normal/hairless, roupa, face e PNG.
- [`exportRunner.ts`, linhas 153–380](https://github.com/nestarasup-sys/Native-gacha/blob/d51a96a1f29e87894f60e57902bced07995062a7/electron/domains/editorV6/exportRunner.ts#L153-L380) — FFmpeg/partes/timings.
- [`src/shared/editorV6Export.ts`, linhas 73–95](https://github.com/nestarasup-sys/Native-gacha/blob/d51a96a1f29e87894f60e57902bced07995062a7/src/shared/editorV6Export.ts#L73-L95) — nomes de métricas e visual keys.
- [`motion/hairBakeBatch.ts`, linhas 30–52](https://github.com/nestarasup-sys/Native-gacha/blob/d51a96a1f29e87894f60e57902bced07995062a7/src/renderer/src/features/editorV6/motion/hairBakeBatch.ts#L30-L52) — pula bakes extras em pose-only.
- [`src/renderer/src/ui/performanceDiagnostics.ts`, linhas 115–165](https://github.com/nestarasup-sys/Native-gacha/blob/d51a96a1f29e87894f60e57902bced07995062a7/src/renderer/src/ui/performanceDiagnostics.ts#L115-L165) — diagnóstico React/RAF.
- [`scripts/editor-v6/benchmark-project-export.cjs`](https://github.com/nestarasup-sys/Native-gacha/blob/d51a96a1f29e87894f60e57902bced07995062a7/scripts/editor-v6/benchmark-project-export.cjs) — fixture autorizada específica; não adaptar removendo guardas.

**[A CONFIRMAR]** Arquivos do checkout local que ainda não foram enviados ao GitHub podem conter o toggle diagnóstico de cabelo, outros defaults e alterações no renderizador. Essas diferenças devem entrar no próximo trace antes de concluir causalidade.

## 19. Decisões propostas, dependências e critérios de aceite

| ID / fase | Entrega ao Codex | Pré-requisito | Aceite e motivo para rejeitar |
|---|---|---|---|
| `CHROM-AUD-001` | Instrumentar fases de preparo+composição+captura já existentes, agregado por quadro/evento | Cópia autorizada e perf sem dados privados | Relatório 0/1/muitas reações; não alterar pixels |
| `CHROM-AUD-002` | Trace Perfetto do compositor + correlação com tempos de export | `CHROM-AUD-001` | Mostrar tempo em Blink/cc/Viz/capture; se inconclusivo, marcar |
| `CHROM-SPIKE-001` | PoC de repouso: boca muda sem redraw do cabelo | Evidência CHROM-02 | Golden RGBA e menor wall clock; rejeitar se UI/face quebrar |
| `CHROM-SPIKE-002` | ROI posterior com oclusão e sem double hair | `CHROM-SPIKE-001` | Mesmo visual e menos pixels/tempo |
| `CHROM-SPIKE-003` | Alternativa `paint`/dirty rectangles/token | Captura demonstrada cara | 150/300 frames corretos, sem stale frame e ganho total |
| `CHROM-SPIKE-004` | Blit GPU direto / FBO WebGL | GPU blit demonstrado caro | RGB/alpha/crop idênticos, driver/VRAM estáveis |
| `CHROM-ADR-001` | Escolher não mudar / ROI / GPU / outro renderer | Comparativos anteriores | Racional, riscos, custo de implementação, rollback |
| `CHROM-REF-001` | Implementação incremental, se autorizada | ADR aceita | Canary/feature flag, testes V6/Studio/Fabricador, MP4 real |

### Critérios de paridade obrigatórios

- Imagem RGBA **antes do encoder**, com tolerância definida e golden para repouso, reação, face/mouth e troca de pose.
- H.264 1920×1080, 30fps, 150/300 quadros exatos, áudio e vídeo externo quando presentes; sem variação de duração/PTS.
- Personagens espelhados, escalados, múltiplos atores, mudanças de face, roupas, hair back/front e overlays.
- Duas lanes Turbo, inclusive reação cruzando a emenda de parte, frameId monotônico por worker e sem stale readbacks.
- Primeira exportação com preparo incluso, RAM/VRAM limitada, cancelamento limpo e nenhum arquivo parcial publicado.
- Nenhuma mudança de persistência, IDs, protocolos de mídia, IPC, isolamento/sandbox, biblioteca, Studio/Customizador/Fabricador.
- **Critério de rejeição:** ganho só no microbenchmark mas piora no MP4 completo; diferença visual; perda de áudio; dependência de driver sem fallback; textura não liberada.

## 20. Fontes oficiais desta rodada (links e tese que sustentam)

| Fonte oficial consultada 06/11/2026 | O que sustenta | Limitação/nota |
|---|---|---|
| [Chromium — RenderingNG](https://developer.chrome.com/docs/chromium/renderingng) | Direção para confiabilidade, raster GPU e extensão | Visão conceitual, não API de render V6 |
| [Chromium — RenderingNG architecture](https://developer.chrome.com/docs/chromium/renderingng-architecture) | Fases Animate→Draw; threads/processos e skipping | Publicação original histórica; verificar versão da arquitetura |
| [Chromium — Data structures](https://developer.chrome.com/docs/chromium/renderingng-data-structures) | Property trees, fragment, paint chunks, tiles/CompositorFrames | Internals não importáveis pelo Electron JS |
| [Chromium — GPU-accelerated compositing](https://www.chromium.org/developers/design-documents/gpu-accelerated-compositing-in-chrome/) | Command buffer, sync/mailboxes, SkPicture | Documento histórico, não usar como API atual |
| [Chromium — VideoNG](https://developer.chrome.com/docs/chromium/videong) | Demux/decode/timestamp e superficies/overlays em Viz | Vídeo da biblioteca ≠ animação própria do cabelo |
| [Skia — Documentation](https://skia.org/docs/) | Skia como biblioteca 2D que Chrome usa | Não significa Skia nativo instalado no app |
| [Skia — API/SkCanvas/SkSurface](https://skia.org/docs/user/api/) | Matrizes, clips, blend e comandos de desenho | Backend futuro exige reproduzir regras SVG/V6 |
| [Electron — Offscreen Rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering) | Bitmap CPU, `paint` dirtyRect, shared texture | `useSharedTexture` requer módulo nativo |
| [Electron — webContents](https://www.electronjs.org/docs/latest/api/web-contents) | `capturePage`, `setFrameRate`, `paint` | Validar versão do build |
| [Electron — OffscreenSharedTexture](https://www.electronjs.org/docs/latest/api/structures/offscreen-shared-texture) | Pixel formats, metadata e `release()` | Experimental, ciclo de vida obrigatório |
| [Electron — contentTracing](https://www.electronjs.org/docs/latest/api/content-tracing) | Captura multiprocesso e categorias | **Electron ≥45: protobuf Perfetto**, não JSON legado |
| [Chrome DevTools — Performance](https://developer.chrome.com/docs/devtools/performance/reference) | JS/Main, GPU, raster, frames | Overhead e instrumentação não são baseline |
| [Chrome DevTools — Rendering](https://developer.chrome.com/docs/devtools/rendering/performance) | Paint flashing, layer borders, FPS/GPU raster | Útil em UI/lab, worker tem `devTools:false` |
| [MDN — SVG foreignObject](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/foreignObject) | HTML dentro de SVG | Não prova custo no V6 sem trace |
| [MDN — Canvas drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage) | Semântica de cópia/desenho/crop | Backend e sincronização internos variam |
| [MDN — OffscreenCanvas transfer](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/transferControlToOffscreen) | Canvas transferível a Worker | Não transporta DOM/SVG inteiro |
| [MDN — CSS contain](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/contain) | Contenção de layout/paint e clipping | Pode cortar cabelo e mudar stacking context |
| [MDN — CSS will-change](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/will-change) | Hints de composição e custos | Uso excessivo piora memória e tempo |

## 21. Conclusão da rodada completa e regra de avanço

**O que foi confirmado nesta investigação:**

1. Chromium tem pipeline modular com reuso de propriedades/tiles, e a API pública acessível pelo V6 não é Blink/Viz C++.
2. O V6 usa DOM/SVG + Canvas + WebGL1 para compor personagem e `capturePage` para entregar BGRA ao FFmpeg.
3. A faixa de token é validada **no mesmo bitmap** antes de remover as 24 colunas extras; a sincronização correta é uma proteção visual que não pode ser abandonada.
4. Há reuso e deduplicação já implementados (scene keys, assets, canvas, WebGL textures, bakes de pose).
5. Em certos caminhos o rosto/boca pode mudar enquanto o código recompõe canvas full-rig do cabelo; **quantas vezes isso ocorre e quanto custa são perguntas ainda não respondidas**.
6. A preparação de cabelo antes do job Main é possível contribuinte dos 41s observados e precisa estar no timer.
7. FFmpeg codifica 30 FPS de quadros solicitados sequencialmente; nem `setFrameRate(60)` nem a física 120 Hz significam vídeo intermediário de 120fps.
8. Conteúdo oficial Electron 45 descreve traces **Perfetto protobuf**; a forma antiga JSON deve ser identificada como desatualizada no protocolo de profiling.
9. Nenhum benchmark foi executado nem há prova de que remover `foreignObject`, usar `paint`, instalar Skia ou trocar o Chromium melhoraria o tempo real.
10. **Primeira ação recomendada:** `CHROM-AUD-001` com medição de pre-job, repouso capilar, GPU→Canvas e captura, usando cópia autorizada e logs sem conteúdo privado.

**Gatilho para implementação futura:** somente depois de uma ADR com evidências de desempenho e RGBA/MP4 validados. O melhor resultado desta pesquisa não é "trocar de motor": é reduzir o espaço de decisão até encontrarmos a operação exata que pode ser eliminada.

**Status final:** **PESQUISA 02 APROFUNDADA EM CÓDIGO + FONTES OFICIAIS; PROFILE NO WINDOWS E PROVAS DE GANHO PENDENTES.**
