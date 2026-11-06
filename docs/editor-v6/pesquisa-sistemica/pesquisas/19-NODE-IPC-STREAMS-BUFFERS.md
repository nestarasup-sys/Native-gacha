# Pesquisa 19 — Node.js: child_process, streams, backpressure, Buffer, IPC e concorrência

**Status:** PESQUISADA EM CÓDIGO + FONTES OFICIAIS; EXPERIMENTOS RUNTIME PENDENTES.  
**Revisão estática:** `Dev-V2@5166de7`; **data:** 06/11/2026. Revalidar versões e HEAD antes de implementar. Este documento não declara benchmark realizado.

## Questão técnica e escopo

**Quanto custa mover cada frame BGRA e cada asset entre main, renderers e FFmpeg? Como reduzir cópias com filas limitadas e sem perder proteção contra concorrência/cancelamento?**

## Mapa de integrações efetivamente observadas no Native Gacha

1. **[CÓDIGO]** `electron/main.ts` importa módulos Node `fs/promises`, `path` e `crypto`; centraliza IO, IPC, catálogos e jobs privilegiados no Main.

2. **[CÓDIGO]** `electron/domains/editorV6/exportProcess.ts:19–42` usa `child_process.spawn(binary,args,{windowsHide:true,stdio:['pipe','pipe','pipe']})`, AbortSignal, timeout, fecha stdin e coleta status de saída do FFmpeg.

3. **[CÓDIGO]** `electron/domains/editorV6/exportRunner.ts:268–295` escreve BGRA bruto para stdin de FFmpeg e aguarda callback de `stdin.write` antes de novo frame naquela lane.

4. **[CÓDIGO]** `electron/domains/editorV6/exportWorkers.ts:97–142` aloca/reutiliza `Buffer` de 1920×1080×4 bytes e 2× para vídeo com overlay; devolve referência de buffer somente após o consumidor concluir escrita.

5. **[CÓDIGO]** `electron/domains/editorV6/exportWorkers.ts:129` usa `webContents.executeJavaScript` como fronteira main→renderer por frame, distinta de `worker_threads` Node; workers são **BrowserWindows Electron**, não threads JS Node.

6. **[CÓDIGO]** `electron/domains/editorV6/motionIpc.ts` gerencia lanes de bake e comunicação dedicada; cache de atlas e limite de concorrência acontecem em outra fase do workflow.

7. **[CÓDIGO]** `electron/domains/mediaLibrary/mediaFileResponse.ts:8–30` usa Node Readable para HTTP Range/stream de mídia com offsets e AbortSignal, permitindo seek Chromium.

8. **[CÓDIGO]** `electron/domains/storage/contentAddressedStore.cjs:59–98` usa pipeline stream para hashing/escrita de arquivos de mídia sem necessariamente carregar arquivo inteiro.

9. **[CÓDIGO]** `electron/domains/storage/keyedOperationQueue.ts` serializa por chave, e `pendingPersistenceIpc.ts` coordena flush entre renderer e Main.

10. **[CÓDIGO]** `electron/domains/editorV6/exportRunner.ts:34–94` distingue timers por fase de bytes e consumo do encoder; `ffmpegWriteMs` representa bloqueio até callback do pipe, não estatística de CPU do codec.

## Documentação oficial consultada e limites da API

1. **[FONTE OFICIAL] [Node Stream backpressure](https://nodejs.org/api/stream.html)** — `write()` com `false` exige espera de `drain`; ignorar backpressure aumenta buffers/RSS e pode causar crash.

2. **[FONTE OFICIAL] [Node worker_threads](https://nodejs.org/api/worker_threads.html)** — Workers Node permitem CPU paralelo e transferência de ArrayBuffer/SharedArrayBuffer; não beneficiam I/O que já é assíncrono nem substituem BrowserWindow DOM automaticamente.

3. **[FONTE OFICIAL] [Node child_process](https://nodejs.org/api/child_process.html)** — `spawn` cria processo com pipes, status e lifecycle; FFmpeg externo precisa de abort e cleanup.

4. **[FONTE OFICIAL] [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)** — Main, preload e renderer têm contextos separados e dados cruzam IPC com custos/segurança próprios.

5. **[FONTE OFICIAL] [Electron webContents](https://www.electronjs.org/docs/latest/api/web-contents)** — `executeJavaScript` e `capturePage` são interações assíncronas com o renderer, não referências de textura/Buffer zero-copy.

**Limitação:** fontes consultadas cobrem a API pública atual, não o build Electron/Node instalado nem as milhões de linhas do motor upstream. Disponibilidade, licenças e formatos precisam de prova na versão empacotada.

## Hipóteses e conclusões fundamentadas

### 1. O export já limita in-flight por lane

[CÓDIGO] `await stdin.write` e reutilização de Buffer previnem que centenas de quadros ocupem RAM simultaneamente. Não adicionar fila de 300 frames para 'paralelizar' encode; atinge gigabytes.

### 2. Volume de bytes enorme mesmo com vídeo curto

300 frames RGBA/BGRA 1080p representam 2,32 GiB de dados brutos. Uma cópia de BGRA a cada frame/worker pode ser relevante, mas esse volume não é uso simultâneo de RAM.

### 3. IPC de assets é diferente de IPC por frame

[HIPÓTESE] Catálogo e materiais de personagem são carregados durante prep; otimizar a fronteira do arquivo pode reduzir payloads repetidos, mas passar personagens gigantes em IPC por frame seria um antipadrão. Medir tamanho/contagem de mensagens por fase.

### 4. Node Worker não é solução automática para cabelo

[FONTE + CÓDIGO] O render de cabelo depende de Canvas/WebGL/DOM no Chromium. Mover cálculo matemático de deslocamento para worker_threads tem custo de transferência e não elimina raster/face/hair composition; avaliar somente após perfil.

### 5. Timeout/cancelamento são parte do contrato

[CÓDIGO] `waitForExport` gerencia AbortSignal e timeout; alteração de pipe/frames deve preservar shutdown do FFmpeg e não publicar candidato incompleto.

## Protocolo experimental que falta executar

1. **NODE-01:** Instrumentar bytes/tempo por `executeJavaScript`, captura bitmap e callbacks FFmpeg, sem registrar conteúdo de mídia.

2. **NODE-02:** Comparar 1 vs 2 lanes Turbo em fixture 300 frames, RSS, CPU, latência de escrita, stalls e throughput; manter mesmo vídeo/encoder.

3. **NODE-03:** PoC transferir batch de asset imutável uma vez em prep e reusar; medir custo total e integridade das revisões.

4. **NODE-04:** Stress de cancelamento no frame 1/150/299, exceção de worker e crash de FFmpeg; certificar liberação de buffers e estado.

5. **NODE-05:** No caso de fluxo novo, demonstrar backpressure bounded e compare `write()` false/drain sob encoder lento sintético.

## Riscos, compatibilidade e gates obrigatórios

- Preservar validação IPC e sandbox; não compartilhar handle Node privilegiado com renderer.
- Não assumir SharedArrayBuffer disponível sem header/CSP e política de isolamento no Electron real.
- Não publicar stdout/stderr de FFmpeg contendo paths privados em relatórios compartilhados.
- FrameId absoluto e duas lanes precisam manter ordem e seam; validar 300 frames.
- Zero regressão de cancelamento e publicação transacional do MP4.

## Próxima decisão

**Recomendação:** priorizar eliminar cópias/serializações demonstráveis e manter buffers bounded. Não reescrever workers Electron em Node threads sem primeiro provar que a etapa CPU pura, e não a renderização Chromium, domina.

**Verificações runtime deste documento:** **NÃO EXECUTADAS**. Ver [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md), [Plano executável](../PLANO_EXECUTAVEL.md) e [Progresso](../PROGRESSO_E_RESULTADOS.md).
