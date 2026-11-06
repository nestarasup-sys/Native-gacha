# Pesquisa 16 — Segurança, build e distribuição

**Status:** **ROTEIRO ABERTO — PESQUISA PROFUNDA NÃO EXECUTADA.**  
**Criado:** 06/11/2026 · **Base:** `Dev-V2@c636ff03` · **Pré-requisito:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md).

> Este arquivo define a investigação que falta fazer. Os links de código foram verificados na árvore do repositório; isso **não** significa que a tecnologia foi estudada profundamente ou que houve benchmark.

## Pergunta de pesquisa

Uma alteração experimental preserva sandbox, IPC, CSP, armazenamento, recovery e funcionamento do EXE portátil Windows?

## Caminhos reais do aplicativo a percorrer

- [`electron/application/mainWindow.ts`](../../../../electron/application/mainWindow.ts)
- [`electron/application/rendererContentSecurityPolicy.ts`](../../../../electron/application/rendererContentSecurityPolicy.ts)
- [`electron/windowResourcePolicy.ts`](../../../../electron/windowResourcePolicy.ts)
- [`electron/windowPermissions.ts`](../../../../electron/windowPermissions.ts)
- [`electron/preload.ts`](../../../../electron/preload.ts)
- [`electron.vite.config.ts`](../../../../electron.vite.config.ts)
- [`electron/domains/editorV6/exportIpc.ts`](../../../../electron/domains/editorV6/exportIpc.ts)

Para cada caminho: localizar importadores/chamadores, dono do dado, fonte do recurso, prévia, exportação, efeitos sobre Studio/Customizador/Fabricador e alterações persistidas. Conferir as chamadas no HEAD **e no checkout local**, não apenas no commit de base.

## Rodada de investigação obrigatória

1. [ ] **[CÓDIGO]** Revisar entradas IPC/sender/validação e protocolos autorizados.
2. [ ] **[CÓDIGO + FONTE OFICIAL]** Examinar build/preloads/chunks, empacotamento de addons e FFmpeg/DLLs.
3. [ ] **[EXPERIMENTO]** Testar shutdown/flush e portabilidade do Windows sem dev server.
4. [ ] Inspecionar versões, APIs e limitações do binário Windows real.
5. [ ] Analisar alternativas, custo de migração, paridade visual, dados, riscos e rollback.
6. [ ] Publicar resultados negativos e pendências, e atualizar `MATRIZ_DE_OPORTUNIDADES.md`.

## Fontes oficiais candidatas (a confirmar na pesquisa)

- https://www.electronjs.org/docs/latest/tutorial/security — **fonte a verificar em profundidade na rodada 16; compatibilidade com o build ainda não comprovada**.
- https://www.electronjs.org/docs/latest/tutorial/process-model — **fonte a verificar em profundidade na rodada 16; compatibilidade com o build ainda não comprovada**.
- https://www.electron.build/ — **fonte a verificar em profundidade na rodada 16; compatibilidade com o build ainda não comprovada**.

**Regra:** não afirmar que a pesquisa desses sites está concluída só porque a URL consta aqui. Registrar páginas lidas, data, trecho relevante e vínculo com o código.

## Gate de teste e critério de conclusão

Build portátil abre offline, mantém segurança e dados salvos, testes de regressão aprovados.

### Risco que não pode ser ignorado

Não desativar CSP, sandbox ou migrar storage só para fazer ferramenta funcionar.

## Integração com o plano

Abrir tarefas no [plano executável](../PLANO_EXECUTAVEL.md) somente após demonstrar o comportamento no código, registrar o que pode melhorar e propor experimento falsificável. Um resultado sem benchmark **não** autoriza refatoração em produção.

**Primeiro próximo passo:** completar a leitura dos arquivos acima, registrar chamadas cruzadas e classificar [CÓDIGO]/[FONTE OFICIAL]/[HIPÓTESE]/[A CONFIRMAR]/[MEDIDO].
