# Pesquisa 10 — Reação posterior, boca e rosto: execução por evento e custo de composição

**Status:** PESQUISADA EM CÓDIGO E FONTES PRIMÁRIAS · **BENCHMARK DE RUNTIME PENDENTE**
**Rodada:** 06/11/2026 · **Revisão estática:** `Dev-V2@5166de7bacb024a72ee15505f8289f81fc9889bd`. Atualizar commit antes de adotar conclusões. **Nenhum teste Windows/MP4 foi executado nesta rodada.**

## Pergunta principal

**Como manter a mesma animação de cabelo posterior durante 29 quadros após troca de pose, mas deixar o restante do bloco estático sem preparar/renderizar personagem inteiro desnecessariamente?**

## 1. Evidências no Native Gacha (funções e comportamento)

1. **[CÓDIGO]** `hairMotionEngine.ts:74–76` define `HAIR_MOTION_SIMULATION_HZ=120` e `HAIR_MOTION_OUTPUT_FPS=30` no motor geral; `hairMotionEngine.ts:228–287` tem reação por pose de 30 quadros de janela, amostra analítica após fim da transição e retorno ao repouso. O output continua 30fps.
2. **[CÓDIGO]** `motion/hairBakeBatch.ts:39–45` retorna `[]` para bakes adicionais `hairless` quando `hairPoseReactionOnly=true`; **não** contar um bake redundante como inevitável nesse perfil padrão.
3. **[CÓDIGO]** `EditorV6ExportPanel.tsx:15` define 1080p/30, Turbo, encoder CPU, boca loop, `hairPoseReactionOnly:true` e `hairPosteriorOnly:true`. O botão de desativar cabelo pode alterar opções específicas de hair; A/B precisa comparar snapshot e todos os flags.
4. **[CÓDIGO]** `editorV6HairMotionPreparation.ts:179–220` prepara `originalRenderer` e `hairlessRenderer` com reuso de wardrobe para a mesma fonte; `renderToCanvas`, layers faciais e crop continuam trabalhos antes do job Main.
5. **[CÓDIGO]** `exportWorker.tsx:381–414` desenha back hair, corpo/face e front hair num canvas no tamanho do rig, com contador `hairRasterPixels`; `exportWorker.tsx:565–611` invoca composições por frame conforme estado/motion.
6. **[CÓDIGO]** `exportWorker.tsx:266–314` desenha hair mesh WebGL e copia pixels para Canvas2D. Pode haver custo de cópias além dos 120Hz internos.
7. **[CÓDIGO]** `sceneFaceComposition.ts:120–131` produz patch facial a partir de base e sprites e serializa PNG, de forma separada da física do cabelo.
8. **[CÓDIGO]** `src/shared/editorV6Export.ts:26–31` calcula boca por frame lógico; `exportRunner.ts:214–225` prepara mouth loop por trecho conforme fala. **Alteração de boca não deveria forçar reconstrução do cabelo em repouso, se separação visual for possível**.
9. **[CÓDIGO]** `src/shared/editorV6Export.ts:82–93` define visual keys para reuso; `exportWorker.tsx:505–611` também tenta reutilizar quando quadro é idêntico. Falar que todos os 300 frames são redesenhados é incorreto sem contadores.
10. **[CÓDIGO]** [RELATO] O mesmo projeto de 10s levou ~50s com hair ON e ~9s com hair OFF. É uma observação forte, mas não há relatórios brutos nesta pesquisa que isolem exatamente 41 segundos de uma função.

## 2. Pesquisa em documentação oficial — aplicabilidade e limitações

1. **[FONTE OFICIAL] [MDN WebGL API](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API)** — Deformação de mesh com textura na GPU é viável; composição de alpha/máscara e readback dependem do caminho usado.
2. **[FONTE OFICIAL] [MDN Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)** — Imagens e camadas podem ser compostas em regiões ou buffers distintos; custo de preparar uma camada não se confunde com custo de copiá-la por frame.
3. **[FONTE OFICIAL] [Electron Offscreen Rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering)** — A apresentação final em Chromium/Electron ainda tem captura; ganho no compositor isolado deve refletir no total.
4. **[FONTE OFICIAL] [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html)** — Overlay com alpha exige formato e tempo corretos; sidecar em vídeo pode adicionar decoder/filtro e não ser o caminho mais rápido.

**Atenção:** documentação “latest” não garante a API ou o comportamento no build do Electron/Chromium/Node/FFmpeg instalado no PC. Não foram auditados os fontes upstream inteiros; o estudo abrange contratos públicos e código de integração.

## 3. Diagnóstico técnico e oportunidades (não são ganhos medidos)

### 3.1 Cabelo parado não pode manter custo de reação

[HIPÓTESE] Se não existe evento ativo, usar camada preparada de repouso. Atenção: pose, posição, boca, expressão e efeito ainda podem mudar; separar no mínimo base/cabelo e face/mouth num plano de desenho que não recalcule uma área pela mudança da outra.

### 3.2 Cabelo posterior é elemento de fundo do personagem

[HIPÓTESE] Overlay por cima do PNG completo não é solução. Base sem posterior + reação + partes que ocluem (cabeça, roupas) preservam ordem. Para personagens com cabeça rotacionando/flip, ROI segue matriz de transformação correta.

### 3.3 Bake de reação pode ser usado como textura e não precisa ser vídeo

[HIPÓTESE] Três variantes: ROI WebGL sob demanda; atlas RGBA de até 29 frames (por preset/pose/transform compatível); clip alpha de formato adequado. Todas pagam preparação na primeira export; comparar tempo total, VRAM e reutilização.

### 3.4 Não culpar automaticamente 120Hz

[CÓDIGO] A rota analítica de reação por pose é distinta do integrador temporal 120Hz. Descer 120→60 pode alterar modos genéricos e não necessariamente melhorar o padrão; isso seria regressão arriscada sem causalidade.

### 3.5 O teste A/B também precisa provar o que mudou

[CÓDIGO] O flag OFF é uma mudança operacional além da renderização. Confirmar que não descarta mouth, pose, áudio, background, duração, frame count e nenhum recurso de personagem fora hair.


## 4. Experimentos reproduzíveis (propostos, NÃO EXECUTADOS)

1. **H0 — 0 reação:** Uma única pose, boca e blink ao longo de 300 frames; cabelo habilitado e desligado; contar prep, canvas e warps sem reação.
2. **H1 — 1 reação:** Um único fim de transição e 29 frames seguintes; capturar RGBA antes, dentro e após janela. Coletar count drawHairPiece, composições, pixels.
3. **H2 — várias reações:** Trocando poses antes da reação anterior terminar, Turbo 2 lanes; validar evento absoluto e bordas.
4. **H3 — compositor ROI:** Base sem posterior, máscara de oclusão, mesh ROI com back hair, usando mesmos pixels e pivot.
5. **H4 — cache:** Comparar preparação de rig normal/hairless com reuso por source/crop/face; não contar cache quente como primeira exportação.
6. **H5 — 3+3 A/B:** Mesmo snapshot 300 quadros, 1920×1080 e encoder CPU, alternar hair ON/OFF, medir total incluindo preparo e validar MP4.

## 5. Invariantes, riscos e critérios para adotar

- **Qualidade:** back hair atrás da cabeça, full-body transitions, mouth and blink, roupas, face patches.
- **Caches:** versão de catálogo, pose, source/wardrobe, face, cabelo, crop, modo de expressão e dimensões.
- **Tempo:** eventos em frames absolutos, sem loop e sem drift entre partes Turbo.
- **Alpha:** premultiplicação, sombras/antialias, corte e transparência em blocos.
- **Meta:** ~9s OFF é relato; ≤15s ON seria meta, não resultado, e não substituir benchmark.

## 6. Veredito de pesquisa e bloqueios

**Conclusão:** caminho com maior plausibilidade é composição incremental por evento/ROI preservando base sem cabelo posterior. Prioridade absoluta continua medir a decomposição dos ~41s: material/face/hair prep vs render por frame vs capture/encode. Os 120Hz por si só não são explicação comprovada.

**Ainda não sabemos:** dados brutos de export A/B, quanto custa `composeHairFrame` em repouso, como a face invalida os rigs, frequência de eventos por bloco e memória por variante.

**Relações com outras pesquisas:** [Arquitetura do app](01-ARQUITETURA-GERAL-E-INTEGRACOES.md), [Plano executável](../PLANO_EXECUTAVEL.md), [Matriz de oportunidades](../MATRIZ_DE_OPORTUNIDADES.md) e [Fontes](../evidencias/FONTES-OFICIAIS.md).
