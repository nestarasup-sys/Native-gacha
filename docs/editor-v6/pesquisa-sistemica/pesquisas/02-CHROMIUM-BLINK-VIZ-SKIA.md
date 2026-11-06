# Pesquisa 02 — Chromium, Blink, Viz, RenderingNG, raster e invalidação

**Status:** PESQUISADA EM CÓDIGO E FONTES PRIMÁRIAS · **BENCHMARK DE RUNTIME PENDENTE**
**Rodada:** 06/11/2026 · **Revisão estática:** `Dev-V2@5166de7bacb024a72ee15505f8289f81fc9889bd`. Atualizar commit antes de adotar conclusões. **Nenhum teste Windows/MP4 foi executado nesta rodada.**

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
