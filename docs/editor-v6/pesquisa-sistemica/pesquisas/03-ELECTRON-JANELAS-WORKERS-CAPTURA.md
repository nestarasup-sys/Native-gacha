# Pesquisa 03 — Electron: BrowserWindow, IPC, offscreen, paint e captura

**Status:** PESQUISADA EM CÓDIGO E FONTES PRIMÁRIAS · **BENCHMARK DE RUNTIME PENDENTE**
**Rodada:** 06/11/2026 · **Revisão estática:** `Dev-V2@5166de7bacb024a72ee15505f8289f81fc9889bd`. Atualizar commit antes de adotar conclusões. **Nenhum teste Windows/MP4 foi executado nesta rodada.**

## Pergunta principal

**Qual a quantidade de trabalho e cópias entre o pedido do frame e o bitmap BGRA entregue ao FFmpeg, e quais mecanismos Electron reduzem isso mantendo frameId, validação, cancelamento e sandbox?**

## 1. Evidências no Native Gacha (funções e comportamento)

1. **[CÓDIGO]** `electron/application/mainWindow.ts:19–49` cria janela interativa com `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true` e restrição de navegação; não confundir essa janela com workers offscreen.
2. **[CÓDIGO]** `electron/domains/editorV6/exportWorkers.ts:40–87` mantém `entries`, `activeWorkers` e `retiredWorkers`; cria BrowserWindow oculta com `offscreen:true`, `backgroundThrottling:false`, sandbox, preload isolado e **partição de sessão aleatória por worker**.
3. **[CÓDIGO]** `exportWorkers.ts:85` chama `setFrameRate(60)`, e `exportWorkers.ts:129` usa `executeJavaScript('window.renderEditorV6ExportFrame(...)')` para pedir o frame lógico. A sincronização não é mensagem IPC genérica por `<iframe>`.
4. **[CÓDIGO]** `exportWorkers.ts:17–36` captura a página (`capturePage`) com região `width + PAINT_TOKEN_SIZE`, extrai bitmap e valida token; a rota de imagem usa buffers reutilizáveis (`frameBitmap` e `layeredBitmap`) e contabiliza `captureReadbacks`.
5. **[CÓDIGO]** `exportWorkers.ts:61–85` registra protocolo `gacha-editor-media` *somente* para assets autorizados daquela exportação, restringe navegação, permissões e recursos. SharedTexture não está habilitado nessa configuração.
6. **[CÓDIGO]** `electron/editorV6ExportPreload.ts` e `electron/editorV6MotionPreload.ts` são bridges distintas da `electron/preload.ts` da UI, preservando o que cada worker pode chamar.
7. **[CÓDIGO]** `electron/domains/editorV6/motionIpc.ts` cria serviço de bakes, com lanes isoladas e cache; **worker de movimento ≠ worker de frame da exportação**.
8. **[CÓDIGO]** `electron/domains/editorV6/exportRunner.ts:274–285` aguarda `worker.frame(frame)` e callback de escrita de FFmpeg antes de pedir o próximo frame daquela parte. Isso já limita in-flight por parte, embora até duas partes Turbo possam rodar em paralelo.
9. **[CÓDIGO]** `electron/windowNavigation.ts:4–7` bloqueia novas janelas e navegação; `windowPermissions.ts` define permission checks; `windowResourcePolicy.ts` restringe origens e protocolos.

## 2. Pesquisa em documentação oficial — aplicabilidade e limitações

1. **[FONTE OFICIAL] [Electron Offscreen Rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering)** — Modos: GPU + bitmap em memória CPU (padrão); GPU shared texture (experimental; requer addon nativo); e software output com GPU desabilitada. No paint, só área suja é enviada; área por frame precisa ser corretamente recomposta.
2. **[FONTE OFICIAL] [Electron webContents](https://www.electronjs.org/docs/latest/api/web-contents)** — `capturePage(rect)` retorna `Promise<NativeImage>`; evento `paint` pode expor `texture` e `dirtyRect`; textura GPU exige `release()` explícito e gerência de ciclo de vida.
3. **[FONTE OFICIAL] [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)** — Isolamento entre main, renderer e preload e limites de Node no renderizador são parte fundamental do projeto.
4. **[FONTE OFICIAL] [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)** — Validar `sender`, sandbox, CSP, permissões, restrições de recursos e navegação; acesso privilegiado ao Main não pode ser liberado para resolver gargalo.
5. **[FONTE OFICIAL] [Electron contentTracing](https://www.electronjs.org/docs/latest/api/content-tracing)** — Pode registrar processos Chromium; overhead e arquivos de trace exigem sessão isolada e limpeza consentida de arquivos *de diagnóstico* apenas.

**Atenção:** documentação “latest” não garante a API ou o comportamento no build do Electron/Chromium/Node/FFmpeg instalado no PC. Não foram auditados os fontes upstream inteiros; o estudo abrange contratos públicos e código de integração.

## 3. Diagnóstico técnico e oportunidades (não são ganhos medidos)

### 3.1 O offscreen atual já tem GPU e captura

[CÓDIGO] `offscreen:true` sem `useSharedTexture` não garante zero-copy; `capturePage` é uma API de captura independente do evento `paint`. Isso explica por que qualquer hipótese de textura compartilhada deve ser implementada, não apenas ativada em `webPreferences`.

### 3.2 `paint` tem risco de retângulo parcial e evento assíncrono

[FONTE OFICIAL] A API entrega `dirtyRect`; comparar um único evento `paint` com frame inteiro pode gerar regiões pretas/obsoletas. É necessário canvas acumulador, token confirmado, controle de tamanho e teste de overlay por layer.

### 3.3 Texture compartilhada é um projeto nativo separado

[FONTE OFICIAL] `useSharedTexture` pode expor handle GPU, mas o código Electron precisa de addon importador, ownership, release, pixelFormat e sincronização. Se FFmpeg continuar recebendo BGRA CPU sem GPU DMA, o ganho pode desaparecer.

### 3.4 A barreira de pipe protege memória

[CÓDIGO] Uma parte não enfileira ilimitados frames: espera a escrita do bloco anterior. Ao otimizar, preservar backpressure e duas lanes com limite; não sacrificar estabilidade para elevar frames in-flight.


## 4. Experimentos reproduzíveis (propostos, NÃO EXECUTADOS)

1. **E0 — inventariar:** EXE empacotado: `process.versions`, GPU, formato BGRA e eventos `paint` disponíveis; duração de startup e preparo por worker.
2. **E1 — base:** A/B 150/300 frames fixados com `capturePage`, registrar `capturePageMs`, `captureBitmapMs`, retries, frame tokens, memória e total.
3. **E2 — paint:** Prototipar fora da produção `paint` + dirty rectangles recompostas + token do frame; no layer de vídeo externo registrar background e foreground separados.
4. **E3 — shared texture:** Somente após E2 e medição convincente: addon D3D nativo em PoC, `texture.release()` em success/failure/cancel, comparar uso CPU/GPU/VRAM.
5. **E4 — robustez:** Simular timeout, frame errado, janela fechando, context loss, fonte ausente, cancelamento, duas partes concorrentes, DPI Windows.

## 5. Invariantes, riscos e critérios para adotar

- **FrameId absoluto:** a mesma timeline pode cruzar uma emenda Turbo em meio a reação capilar, boca e vídeo.
- **Memória:** dois buffers BGRA de 1080p por frame e eventuais camadas não devem crescer sem limite.
- **Cancelamento:** handlers, listeners, sessão isolada, processo FFmpeg e texture handle devem ser liberados na falha.
- **Compatibilidade:** `setFrameRate` e `backgroundThrottling` não devem alterar duração lógica dos 30 FPS.
- **Segurança:** manter `sandbox`, canal do worker e verificação de `senderFrame` no Main.

## 6. Veredito de pesquisa e bloqueios

**Conclusão:** o protótipo mais conservador é `paint` com comprovação de frameId e dirty-rect integral, mas só é prioritário **depois de demonstrar** captura relevante no A/B do cabelo. `useSharedTexture` fica como spike de alta complexidade e não deve ser enviado à produção sem addon/driver testado.

**Ainda não sabemos:** tempo efetivo capture+convert por frame, região de paint real, presença de sincronização suficiente e suporte de textura compartilhada no Windows/driver alvo.

**Relações com outras pesquisas:** [Arquitetura do app](01-ARQUITETURA-GERAL-E-INTEGRACOES.md), [Plano executável](../PLANO_EXECUTAVEL.md), [Matriz de oportunidades](../MATRIZ_DE_OPORTUNIDADES.md) e [Fontes](../evidencias/FONTES-OFICIAIS.md).
