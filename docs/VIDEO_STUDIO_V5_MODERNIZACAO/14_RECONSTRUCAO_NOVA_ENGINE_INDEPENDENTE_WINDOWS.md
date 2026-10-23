# Video Studio G-V5 — reconstrução independente (Windows)
**Início:** 23/10/2026. **Branch:** feature/model-source-editor. **Não mesclar na main.**

## Objetivo desta implementação
O usuário rejeitou continuar estendendo o editor legado e determinou três princípios: (1) nenhuma preparação serial de todos os frames para dar Play; (2) motor Gacha próprio GPU com recursos persistentes; (3) serviço de mídia independente de React com relógio de vídeo/áudio e cancelamento. Esta é a **primeira fatia vertical executável**, e NÃO a reconstrução integral completa.

## Diretórios novos
- `src/shared/videoStudioRebuild/frameEngine.ts`: compile `StudioDocument v1` uma vez e avalie estado de quadro absoluto na `SceneIR`, independente de React/PNG.
- `src/shared/videoStudioRebuild/frameScheduler.ts`: uma solicitação de frame visível/seek por vez, prefetch máximo de 2 no novo editor, geração de cancelamento e `AbortSignal`. Não itera amostras das transições antes de Play. Cancelamento é cooperativo: **trabalho não cooperativo ainda não pode ser eliminado à força**.
- `src/renderer/src/features/videoStudioRebuild/gachaGpuStage.ts`: compositor **WebGL2 real**, shaders GPU, texturas persistentes por identidade, limite estimado de retenção de 96 MiB, LRU, blend alpha e perda/retorno de contexto. API aceita camadas separadas (body/wardrobe/hair/eye-L/eye-R/mouth), mas o primeiro pipeline lê a **imagem salva** dos personagens; o compilador do catálogo Gacha → sprites dinâmicos e golden PT ainda NÃO existe.
- `src/renderer/src/features/videoStudioRebuild/mediaEngine.ts`: serviço de vídeo/áudio independente de React: prepara proxies pela API da aplicação, mantém decoders HTMLVideoElement com limite 2, usa relógio nativo do vídeo ativo quando disponível e monotônico na ausência de áudio, suporta pause/seek/sync/stop/dispose. **Ainda está no processo renderer Electron; sem subprocesso de mídia supervisionado e sem mixagem AV completa.** Esse é o próximo marco obrigatório, não afirmar que o motor de mídia está definitivamente isolado.
- `src/shared/videoStudioRebuild/rebuildEditor.ts`: divisão de bloco imutável preservando o estado Gacha/PT e locks.
- `src/renderer/src/features/videoStudioRebuild/VideoStudioRebuildPage.tsx` + CSS: nova biblioteca/editor funcional básico independente do antigo, Play sem pré-render de todas as transições, seek, timeline de chaves, split, toggle de transições e salvar **cópia** sem alterar original.
- `VideoStudioPage.tsx`: rota principal passa a montar o novo editor. `VideoStudioEditor.tsx` permanece em código-fonte somente como referência temporária para paridade/migração, **não é instanciado na rota**.

## Segundo corte: subprocesso AV supervisionado (clock e sessão)

- `electron/videoStudioRebuild/mediaUtility.ts`: processo utilitário Node/Electron independente com relógio racional de 60 fps, sessão por identificador, seek, start/sync, audio-frame anchor, pause, cancel e close.
- `electron/videoStudioRebuild/mediaSupervisor.ts`: processo supervisionado iniciado por demanda, correlação de mensagens, timeout de **2s**, hard kill se parar de responder, rejeição de todas as solicitações pendentes e novo processo na próxima chamada.
- Build `electron.vite.config.ts` publica worker separado `out/main/media-engine-worker.js` no pacote da aplicação; IPC `video-engine:media:control` registrado fora do editor React.
- Contratos de transporte `src/shared/videoStudioRebuild/mediaContracts.ts` no preload; `VideoStudioMediaEngine` alimenta o relógio com a amostra real do `HTMLVideoElement.currentTime` se houver áudio ativo e usa clock monotônico quando não houver.
- Teste dedicado valida timebase, áudio, cancelamento, seek, rejeição IPC e reinício após morte do processo.

**Precisão do escopo:** isso isola e supervisiona o **relógio e a política AV**, não a decodificação nem a mixagem. Os HTMLVideoElements/decoders Chromium ainda vivem na surface; FFmpeg e o compositor próprio ainda precisam de workers isolados. Não declarar a terceira decisão inteiramente concluída até transferir decoders/export e validar PTS no Windows real.

## Limitações explícitas do primeiro corte
- Mostra estados PNGs Gacha **já salvos** carregados como texturas GPU persistentes. **Não** rasteriza pose/roupa/PT dinâmica por sprites ainda; transitions/face fidelity durante a interpolação não concluída. Não confundir Play sem bloqueios com paridade visual pronta.
- Não implementados nesta tela: criação/edição de expressão PT visual, edição completa de keyframe, balões interativos, filtros, trilha áudio independente, export, undo/redo e sincronização AV frame exata. Esses itens têm de ser reconstruídos, não redirecionados silenciosamente ao editor antigo.
- Serviço de mídia no renderer, embora independente de React e dono de decoders/áudio; subprocesso com supervisão, IPC tipado e hard-kill ainda falta.
- O `GPU texture byte ledger` é estimativa de RGBA retido, não medição da VRAM real.
- Nova UI explicitamente salva cópia; a biblioteca existente é lida sem migração.

## Gates seguintes (ordem)
1. CI Windows: typecheck, build, suíte nova, auditoria de arquitetura; corrigir violação atual `electron/main.ts` 2511/2500 sem relaxar orçamento.
2. Registrar preview real de 5 s, 15 s e 30 s com 4 personagens usando a **nova rota**, FPS real de frames apresentados, latência de Play, RAM/VRAM. Sem teste de 180s repetido automaticamente.
3. Catalog-to-GPU compile: body, roupa, cabelo diante/trás, olhos, pupilas esquerda/direita, boca, masks e efeitos por dirty flags. Goldens reais normal/PT em Windows. Nessa etapa o preview só pode ser declarado **visualmente correto** após esses testes.
4. Extrair MediaService para **subprocesso supervisionado**, PTS exatos e áudio clock autoritativo, interrupção verdadeira de worker/decoder/FFmpeg; fechar vídeo e áudio no novo editor.
5. ExportService usando `SceneEvaluator` e compositor da engine nova; verificar 1080p60, áudio PTS, salvamento, crash recovery e fidelidade preview/export 5/15/30s → 180s; só depois grandes escalas.

**Não reduzir o critério de paridade para fazer números de FPS parecerem melhores. A UI nova é uma fatia inicial da reconstrução, não uma entrega equivalente ao antigo Video Studio.**
