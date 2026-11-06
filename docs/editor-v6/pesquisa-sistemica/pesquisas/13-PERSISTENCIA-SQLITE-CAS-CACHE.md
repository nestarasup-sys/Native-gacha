# Pesquisa 13 — Persistência, SQLite, CAS e cache

**Status:** **ROTEIRO ABERTO — PESQUISA PROFUNDA NÃO EXECUTADA.**  
**Criado:** 06/11/2026 · **Base:** `Dev-V2@c636ff03` · **Pré-requisito:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md).

> Este arquivo define a investigação que falta fazer. Os links de código foram verificados na árvore do repositório; isso **não** significa que a tecnologia foi estudada profundamente ou que houve benchmark.

## Pergunta de pesquisa

Como preservar arquivos lógicos, manifestos, referências, snapshots, CAS e recuperação ao recompilar recursos visuais ou criar caches novos?

## Caminhos reais do aplicativo a percorrer

- [`electron/dataPlatform.cjs`](../../../../electron/dataPlatform.cjs)
- [`electron/domainFileSystem.cjs`](../../../../electron/domainFileSystem.cjs)
- [`electron/domains/storage/catalogSchema.cjs`](../../../../electron/domains/storage/catalogSchema.cjs)
- [`electron/domains/storage/contentAddressedStore.cjs`](../../../../electron/domains/storage/contentAddressedStore.cjs)
- [`electron/domains/storage/keyedOperationQueue.ts`](../../../../electron/domains/storage/keyedOperationQueue.ts)
- [`electron/domains/storage/pendingPersistenceIpc.ts`](../../../../electron/domains/storage/pendingPersistenceIpc.ts)
- [`electron/domains/editorV6/documentPersistence.ts`](../../../../electron/domains/editorV6/documentPersistence.ts)

Para cada caminho: localizar importadores/chamadores, dono do dado, fonte do recurso, prévia, exportação, efeitos sobre Studio/Customizador/Fabricador e alterações persistidas. Conferir as chamadas no HEAD **e no checkout local**, não apenas no commit de base.

## Rodada de investigação obrigatória

1. [ ] **[CÓDIGO]** Inventariar tabelas, domains, caminho do CAS e migrações, salvos JSON e recovery.
2. [ ] **[CÓDIGO + FONTE OFICIAL]** Estudar quais operações exigem fsync, temporário/rename, fila/flush e auditoria de referências.
3. [ ] **[EXPERIMENTO]** Definir identidade/eviction/invalidation para caches derivados sem replicar fonte canônica.
4. [ ] Inspecionar versões, APIs e limitações do binário Windows real.
5. [ ] Analisar alternativas, custo de migração, paridade visual, dados, riscos e rollback.
6. [ ] Publicar resultados negativos e pendências, e atualizar `MATRIZ_DE_OPORTUNIDADES.md`.

## Fontes oficiais candidatas (a confirmar na pesquisa)

- https://www.sqlite.org/wal.html — **fonte a verificar em profundidade na rodada 13; compatibilidade com o build ainda não comprovada**.
- https://www.sqlite.org/atomiccommit.html — **fonte a verificar em profundidade na rodada 13; compatibilidade com o build ainda não comprovada**.
- https://nodejs.org/api/fs.html — **fonte a verificar em profundidade na rodada 13; compatibilidade com o build ainda não comprovada**.

**Regra:** não afirmar que a pesquisa desses sites está concluída só porque a URL consta aqui. Registrar páginas lidas, data, trecho relevante e vínculo com o código.

## Gate de teste e critério de conclusão

Testes de falha/crash/migração e zero dados perdidos, cancelamento seguro.

### Risco que não pode ser ignorado

Não mudar journal_mode/synchronous ou deletar caches/userData para otimizar benchmarks.

## Integração com o plano

Abrir tarefas no [plano executável](../PLANO_EXECUTAVEL.md) somente após demonstrar o comportamento no código, registrar o que pode melhorar e propor experimento falsificável. Um resultado sem benchmark **não** autoriza refatoração em produção.

**Primeiro próximo passo:** completar a leitura dos arquivos acima, registrar chamadas cruzadas e classificar [CÓDIGO]/[FONTE OFICIAL]/[HIPÓTESE]/[A CONFIRMAR]/[MEDIDO].
