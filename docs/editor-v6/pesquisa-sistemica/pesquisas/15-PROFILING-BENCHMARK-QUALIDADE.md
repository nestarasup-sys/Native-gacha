# Pesquisa 15 — Tracing, profiling, métricas, benchmark frio e paridade visual

**Estado:** PESQUISADA EM CÓDIGO E DOCUMENTAÇÃO PRIMÁRIA · RUNTIME/TESTES NÃO EXECUTADOS.
**Data:** 06/11/2026. **Base estática:** Dev-V2 (commit `5166de7`, antes dos documentos deste Grupo A). Revalidar HEAD e working tree local antes de implementar.

## Questão e critério de saída

Como provar causalidade no salto de exportação de ~50s com cabelo para ~9s sem animação, mantendo mesmo documento, código, recursos, opções, cache e qualidade? Como medir Chromium, Electron, FFmpeg e persistência sem contaminar a baseline?

## Evidências verificadas no código do aplicativo

1. **[CÓDIGO]** `src/renderer/src/ui/performanceDiagnostics.ts:1–174` já fornece opt-in de métricas, React commits, long tasks e playback gap, limitado a amostras e sem armazenar nomes/caminhos.

2. **[CÓDIGO]** `src/renderer/src/features/editorV6/EditorV6Page.tsx:926,955` e `src/renderer/src/ui/App.tsx:33` usam Profiler e registram durações de UI.

3. **[CÓDIGO]** `exportRunner.ts:34–94` possui `EditorV6ExportReport` com fase, tentativas, partes, timings de frame e contadores, além de amostragem de RSS (linhas 163,326).

4. **[CÓDIGO]** `exportWorkers.ts:17–36` mede `capturePageMs`, `captureBitmapMs` e retentativas de token; `exportWorker.tsx:413` incrementa `hairRasterFrames`/pixels.

5. **[CÓDIGO]** `exportRunner.ts:283–285` mede `ffmpegWriteMs` por callback de escrita, mas não deve ser confundido com CPU total do encoder.

6. **[CÓDIGO]** `editorV6ExportCommands.ts:24–41` pode executar preparação de cabelo **antes do timer iniciado em `runEditorV6Export`**; medir clique→arquivo final é obrigatório.

7. **[CÓDIGO]** `scripts/editor-v6/benchmark-project-export.cjs:27` define `authorizedProjectTitle='Teste de Importação — Personagens do Pacote'`, enquanto o usuário relata `editor v6 06`; o script não é benchmark genérico e possui guardas de backup.

8. **[CÓDIGO]** `scripts/editor-v6/backup-authorized-project.cjs` copia/verifica fontes autorizadas por hashes, evitando tocar diretamente nos dados do usuário.

9. **[CÓDIGO]** `package.json` declara `test:editor-v6:quick`, `test:editor-v6:hair-motion-export`, `test:editor-v6:export-overlay`, `test:editor-v6:export` e stress trace, nem todos são testes igualmente leves.

10. **[CÓDIGO]** `src/shared/editorV6Export.ts:52` divide Turbo em até duas partes para intervalo válido; métricas somadas de duas lanes não são tempo total de parede.

## Pesquisa nas fontes oficiais

1. **[FONTE OFICIAL] [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/reference)** — Permite correlacionar Main, raster, GPU e quadros além do tempo JS/React.

2. **[FONTE OFICIAL] [Electron contentTracing](https://www.electronjs.org/docs/latest/api/content-tracing)** — Trace multiprocesso usado para identificar gargalos do Chromium; é overhead e precisa de janela de gravação controlada.

3. **[FONTE OFICIAL] [React Profiler](https://react.dev/reference/react/Profiler)** — Separa `actualDuration`/`baseDuration` por commit, mas não mede encode/capture.

4. **[FONTE OFICIAL] [Node stream](https://nodejs.org/api/stream.html)** — Backpressure e callback determinam comportamento de buffers em FFmpeg stdin.

5. **[FONTE OFICIAL] [FFprobe](https://ffmpeg.org/ffprobe.html)** — Validação de streams, packets e frames deve considerar codec, time base, B-frames e integridade do contêiner.

**Limite de proveniência:** informações de documentação oficial foram confrontadas conceitualmente com as APIs usadas no código, mas o EXE e as versões efetivas instaladas não foram executados. Não existe medição própria neste estudo.

## Análise causal e possibilidades de mudança

### 1. Métrica principal é o tempo desde o clique

[CÓDIGO] `hairPreparation` antes de job Main significa que apenas `exportRunner.report.milliseconds` pode subestimar custo do cabelo. Relatório deve agregar os dois sem dupla contagem.

### 2. A/B exige mesmo input, inclusive derivadas

[HIPÓTESE] Alternar hair ON/OFF pode alterar bundle, flags, atualização de imagens e cache. Registrar fingerprint de snapshot, builds, encoder, presets, media links, bits de export e ordem das repetições.

### 3. Medições de tempo têm escopos distintos

Soma de fase por worker, tempo de parede, CPU cumulativa, GPU ocupada, tempo de FFmpeg callback e elapsed de encode são grandezas diferentes. Não apresentar soma dos workers como duração total.

### 4. Bench frio e quente respondem perguntas distintas

Três corridas frias podem medir prep/primeiro arquivo, enquanto repetições quentes avaliam caching. Não declarar sucesso em metas de primeira exportação usando warm runs.

### 5. Tracing pode alterar desempenho

Iniciar todos os perfis e devtools no mesmo teste modifica custo; primeiro baseline sem instrumentation pesada, depois trace de amostra representativa.

### 6. Golden pixel antes de encoder

Para hair/face/roupa, comparar RGBA nos frames selecionados e só depois MP4 (H.264 com yuv420p admite diferença por compressão).

## Experimentos propostos (ainda não rodados)

1. **BENCH-01:** 3 ON / 3 OFF em ordem alternada no MESMO snapshot autorizado de 300 quadros, Windows, 1080p/30, encoder CPU, cache igual; medir clique→MP4 válido.

2. **BENCH-02:** Casos sintéticos com 0, 1 e múltiplas trocas de pose; separar rig prep, face, render, capture, FFmpeg.

3. **BENCH-03:** 150 quadros, uma lane/duas lanes Turbo e `startFrame>0`; testar seam em reação capilar atravessando divisão.

4. **BENCH-04:** MP4 com áudio/vídeo overlay; comparar contagem exata 150/300, bitrate/codec/PTS/audio sync sem falhas.

5. **BENCH-05:** Trace seletivo Electron `contentTracing` e GPU com `frameId`; registrar overhead e não usar trace como baseline.

6. **BENCH-06:** Fixture de falha/cancelamento, memória RSS/VRAM, handles e arquivo parcial.

## Gates de segurança, qualidade e integração

- Priorizar 3+3 corridas controladas e relatório sanitizado; só declarar [MEDIDO] com amostras reais.
- Não usar benchmark hardcoded de outro projeto para `editor v6 06` nem relaxar guards.
- Não limpar userData, modificar presets ou abrir fotos pessoais sem autorização.
- Qualidade de 1920×1080, 30fps, mouth, pose, hair, rosto, roupas, áudio e vídeo deve ser preservada.
- Confrontar clocks e wall times dos workers/FFmpeg antes de publicar porcentagem de ganho.

## Veredito da pesquisa

**A pesquisa de ferramentas de medição está concluída em nível estático e documental; a baseline dinâmica continua bloqueada até existir cópia autorizada do projeto real.** O primeiro ganho prático será evidência de qual estágio responde pelos 41 segundos. Reescrita de encoder/Chromium deve esperar esses dados.

**[A CONFIRMAR]** Medição reprodutível do projeto original e distribuição causal; versão de Electron/driver/FFmpeg e cold/cache do teste relatado.

**Rastreabilidade:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md), [Plano executável](../PLANO_EXECUTAVEL.md), [Matriz](../MATRIZ_DE_OPORTUNIDADES.md), [Fontes oficiais](../evidencias/FONTES-OFICIAIS.md).
