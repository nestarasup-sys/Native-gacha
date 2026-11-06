# Pesquisa 03 — Electron, janelas, workers e captura

**Status:** **ROTEIRO ABERTO — PESQUISA PROFUNDA NÃO EXECUTADA.**  
**Criado:** 06/11/2026 · **Base:** `Dev-V2@c636ff03` · **Pré-requisito:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md).

> Este arquivo define a investigação que falta fazer. Os links de código foram verificados na árvore do repositório; isso **não** significa que a tecnologia foi estudada profundamente ou que houve benchmark.

## Pergunta de pesquisa

Qual custo de carregar/retirar janelas, IPC executeJavaScript, captura, sincronização e pintura? Podemos obter os mesmos pixels com menos cópias?

## Caminhos reais do aplicativo a percorrer

- [`electron/application/mainWindow.ts`](../../../../electron/application/mainWindow.ts)
- [`electron/preload.ts`](../../../../electron/preload.ts)
- [`electron/editorV6ExportPreload.ts`](../../../../electron/editorV6ExportPreload.ts)
- [`electron/editorV6MotionPreload.ts`](../../../../electron/editorV6MotionPreload.ts)
- [`electron/domains/editorV6/exportWorkers.ts`](../../../../electron/domains/editorV6/exportWorkers.ts)
- [`electron/domains/editorV6/motionIpc.ts`](../../../../electron/domains/editorV6/motionIpc.ts)
- [`electron/domains/editorV6/exportCaptureBitmap.ts`](../../../../electron/domains/editorV6/exportCaptureBitmap.ts)

Para cada caminho: localizar importadores/chamadores, dono do dado, fonte do recurso, prévia, exportação, efeitos sobre Studio/Customizador/Fabricador e alterações persistidas. Conferir as chamadas no HEAD **e no checkout local**, não apenas no commit de base.

## Rodada de investigação obrigatória

1. [ ] **[CÓDIGO]** Confirmar janelas, partitions, lifetime dos workers e retentativas de token/paint.
2. [ ] **[CÓDIGO + FONTE OFICIAL]** Contrastar capturePage com paint (dirty rect), sharedTexture (native addon/release) e buffers dedicados.
3. [ ] **[EXPERIMENTO]** Medir custo de IPC/JSON/BGRA, aquecimento de BrowserWindow e descarte de recursos.
4. [ ] Inspecionar versões, APIs e limitações do binário Windows real.
5. [ ] Analisar alternativas, custo de migração, paridade visual, dados, riscos e rollback.
6. [ ] Publicar resultados negativos e pendências, e atualizar `MATRIZ_DE_OPORTUNIDADES.md`.

## Fontes oficiais candidatas (a confirmar na pesquisa)

- https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering — **fonte a verificar em profundidade na rodada 03; compatibilidade com o build ainda não comprovada**.
- https://www.electronjs.org/docs/latest/api/web-contents — **fonte a verificar em profundidade na rodada 03; compatibilidade com o build ainda não comprovada**.
- https://www.electronjs.org/docs/latest/tutorial/process-model — **fonte a verificar em profundidade na rodada 03; compatibilidade com o build ainda não comprovada**.

**Regra:** não afirmar que a pesquisa desses sites está concluída só porque a URL consta aqui. Registrar páginas lidas, data, trecho relevante e vínculo com o código.

## Gate de teste e critério de conclusão

PoC isolado 150/300 frames, zero frame stale, cancelamento correto e memória com limite.

### Risco que não pode ser ignorado

Não remover tokens, sender validation, sandbox ou atribuir GPU zero-copy a offscreen=true.

## Integração com o plano

Abrir tarefas no [plano executável](../PLANO_EXECUTAVEL.md) somente após demonstrar o comportamento no código, registrar o que pode melhorar e propor experimento falsificável. Um resultado sem benchmark **não** autoriza refatoração em produção.

**Primeiro próximo passo:** completar a leitura dos arquivos acima, registrar chamadas cruzadas e classificar [CÓDIGO]/[FONTE OFICIAL]/[HIPÓTESE]/[A CONFIRMAR]/[MEDIDO].
