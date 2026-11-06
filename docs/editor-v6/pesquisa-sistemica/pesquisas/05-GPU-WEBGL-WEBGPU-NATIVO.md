# Pesquisa 05 — WebGL real do cabelo, recursos GPU, framebuffer e WebGL2

**Status:** PESQUISADA EM CÓDIGO E FONTES PRIMÁRIAS · **BENCHMARK DE RUNTIME PENDENTE**
**Rodada:** 06/11/2026 · **Revisão estática:** `Dev-V2@5166de7bacb024a72ee15505f8289f81fc9889bd`. Atualizar commit antes de adotar conclusões. **Nenhum teste Windows/MP4 foi executado nesta rodada.**

## Pergunta principal

**O WebGL do cabelo pode compor direto a camada final sem passar por múltiplas superfícies e conversões, e existe suporte real para WebGL2 readback assíncrono no Windows alvo?**

## 1. Evidências no Native Gacha (funções e comportamento)

1. **[CÓDIGO]** `exportHairMeshRenderer.ts:45` obtém contexto **`webgl`**, não `webgl2`, com `alpha:true`, `premultipliedAlpha:true`, `antialias:true`, `preserveDrawingBuffer:true`. Isso delimita as APIs disponíveis no caminho atual.
2. **[CÓDIGO]** `exportHairMeshRenderer.ts:6–26` mantém `WebGLRenderingContext`, buffers de posição/UV/índices e `WeakMap<HTMLImageElement, WebGLTexture>` para reuso; isso **já reduz uploads idênticos**, não deve ser refeito cegamente.
3. **[CÓDIGO]** `exportHairMeshRenderer.ts:73–84` usa `gl.bufferData` com UV/índices estáticos e posições dinâmicas; `texImage2D` da imagem ocorre ao alocar textura (linha 161). É mesh deformado, não vídeo 120fps renderizado.
4. **[CÓDIGO]** `exportHairMeshRenderer.ts:102–135` mantém um contexto reusável por worker, dimensiona canvas/viewport e controla dimensões de raster. O código diz que isso evita costuras entre tiras.
5. **[CÓDIGO]** `exportWorker.tsx:266–315` recebe mesh do WebGL e faz `CanvasRenderingContext2D.drawImage` para transformar pixels ao canvas do personagem; isso pode ser uma fronteira GPU→Canvas cujo custo precisa ser medido.
6. **[CÓDIGO]** `exportWorker.tsx:381–454` reaproveita canvases por id/frame mas compõe camadas completas, incluindo back hair antes do corpo/face e front hair depois. Essa ordem deve ser preservada em GPU.
7. **[CÓDIGO]** `electron/domains/editorV6/exportWorkers.ts:135–150` converte `capturePage` em BGRA; mesmo que um compositor intermediário seja GPU, o encoder CPU ainda espera bytes. Um framebuffer dedicado isolado não garante zero-copy total.

## 2. Pesquisa em documentação oficial — aplicabilidade e limitações

1. **[FONTE OFICIAL] [MDN WebGL Rendering Context](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext)** — WebGL1 é API de GPU baseada em contexto de canvas; `getContext('webgl')` não cria automaticamente WebGL2.
2. **[FONTE OFICIAL] [MDN WebGL readPixels](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/readPixels)** — Lê bloco de pixels da framebuffer atual para TypedArray ou offsets no WebGL2. Custo de sincronização precisa ser medido.
3. **[FONTE OFICIAL] [MDN WebGL2 fenceSync](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/fenceSync)** — Insere `WebGLSync` na command stream; **não existe em WebGL1**. Isoladamente não torna leitura BGRA assíncrona.
4. **[FONTE OFICIAL] [MDN WebGL framebuffer](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/bindFramebuffer)** — Framebuffer pode receber desenho e servir como origem de leitura; formatos, blend e ordem de layers precisam ser explicitados.
5. **[FONTE OFICIAL] [Electron Offscreen Rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering)** — Textura compartilhada na GPU pode evitar cópia de apresentação, mas requer addon nativo e gerenciamento de release.

**Atenção:** documentação “latest” não garante a API ou o comportamento no build do Electron/Chromium/Node/FFmpeg instalado no PC. Não foram auditados os fontes upstream inteiros; o estudo abrange contratos públicos e código de integração.

## 3. Diagnóstico técnico e oportunidades (não são ganhos medidos)

### 3.1 Hoje já existem otimizações internas de WebGL

[CÓDIGO] Reuso de shader/contexto/textura e buffers dinâmicos são boas escolhas. O próximo objetivo não é aumentar FPS da simulação de física; é reduzir **fronteiras de superfície** depois do mesh.

### 3.2 Um único compositor WebGL exigiria portar TODAS as regras visuais

[HIPÓTESE] Corpo, face, roupa, cabelo, objeto, backgrounds, texto, mouth loop e vídeo externo precisam manter blend/pivot/máscara/crop. Avaliar primeiro como camada lateral de cabelo, não migrar SceneSurface inteira.

### 3.3 WebGL2 pode experimentar PBO/fence, mas não está presente no atual render

[FONTE + CÓDIGO] Seria preciso fazer feature detection e criar contexto WebGL2 num spike isolado; fenceSync mais readPixels em PBO e polling com limite. Mesmo assim uma cópia final para FFmpeg CPU pode persistir.

### 3.4 O risco do GPU readback cresce com dimensões e concorrência

[HIPÓTESE] No Turbo são duas lanes; se ambas bloqueiam GPU para readback, o throughput pode cair. Medir fila, GPU e VRAM por worker, não apenas tempo de shader.

### 3.5 WebGPU ainda é candidato, não ferramenta existente

[CÓDIGO] Nenhum backend de export por WebGPU foi observado; o nome da pesquisa inclui futuro. Adotar WebGPU agora acrescentaria esforço de portabilidade/driver e reimplementação de paridade sem evidência causal.


## 4. Experimentos reproduzíveis (propostos, NÃO EXECUTADOS)

1. **G0 — capabilities:** No EXE Windows real, registrar tipo WebGL1/2, renderer/driver, MAX_TEXTURE_SIZE, extensões, context loss e formatos válidos.
2. **G1 — bypass parcial:** Em fixture sintética, desenhar mesh RGBA com camada de corpo estática dentro do mesmo framebuffer; registrar custo de `drawImage(mesh)` evitado e pixel diff.
3. **G2 — ROI:** GPU desenha apenas ROI afetado por back hair, com máscara de cabeça; demais camadas continuam exatamente como referência.
4. **G3 — WebGL2/PBO:** Spike WebGL2 offscreen com double/triple buffer e fence, sem alterar produção; comparar readPixels direto vs PBO, cancelamento e recursos liberados.
5. **G4 — concorrência:** Dois workers 1080p, 300 frames, context loss simulado, long tasks e GPU/VRAM, comparar ao caminho atual.
6. **G5 — end-to-end:** Conservar encoder e formato do MP4; descartar método se só shader acelerar e total não cair.

## 5. Invariantes, riscos e critérios para adotar

- **GPU de usuário:** driver, VRAM, reset de contexto e variações do Electron empacotado.
- **Camadas:** back hair deve ser desenhado ANTES da oclusão de cabeça; alpha premultiplicado e sampling.
- **Memory lifetime:** Texturas por ator/worker, release de WebGL buffers/framebuffers/syncs.
- **Transparência:** H.264 final não carrega alpha arbitrário; overlay precisa ser composto antes de encode final.
- **Paridade:** backup CPU e modo seguro em erro GPU; nunca degradar qualidade silenciosamente.

## 6. Veredito de pesquisa e bloqueios

**Conclusão:** melhorar o caminho do cabelo WebGL1 existente antes de trocar a stack para WebGPU. Medir GPU→Canvas e experimentar ROI; só depois WebGL2/PBO ou shared texture, com decisão baseada em ganho total.

**Ainda não sabemos:** capacidade real de WebGL2/driver, tempo de upload/warp/cópia em cada worker e custo mínimo de preservar a cena completa numa superfície GPU.

**Relações com outras pesquisas:** [Arquitetura do app](01-ARQUITETURA-GERAL-E-INTEGRACOES.md), [Plano executável](../PLANO_EXECUTAVEL.md), [Matriz de oportunidades](../MATRIZ_DE_OPORTUNIDADES.md) e [Fontes](../evidencias/FONTES-OFICIAIS.md).
