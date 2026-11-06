# Pesquisa 15 — Profiling, benchmark e qualidade

**Status:** **ROTEIRO ABERTO — PESQUISA PROFUNDA NÃO EXECUTADA.**  
**Criado:** 06/11/2026 · **Base:** `Dev-V2@c636ff03` · **Pré-requisito:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md).

> Este arquivo define a investigação que falta fazer. Os links de código foram verificados na árvore do repositório; isso **não** significa que a tecnologia foi estudada profundamente ou que houve benchmark.

## Pergunta de pesquisa

Como medir um resultado reproduzível de ponta a ponta sem misturar preparação, paralelismo, cache aquecido e perfil sintético com projeto real?

## Caminhos reais do aplicativo a percorrer

- [`scripts/editor-v6/benchmark-project-export.cjs`](../../../../scripts/editor-v6/benchmark-project-export.cjs)
- [`scripts/editor-v6/backup-authorized-project.cjs`](../../../../scripts/editor-v6/backup-authorized-project.cjs)
- [`scripts/editor-v6/compare-real-export.cjs`](../../../../scripts/editor-v6/compare-real-export.cjs)
- [`electron/domains/editorV6/exportRunner.ts`](../../../../electron/domains/editorV6/exportRunner.ts)
- [`electron/domains/editorV6/exportWorkers.ts`](../../../../electron/domains/editorV6/exportWorkers.ts)

Para cada caminho: localizar importadores/chamadores, dono do dado, fonte do recurso, prévia, exportação, efeitos sobre Studio/Customizador/Fabricador e alterações persistidas. Conferir as chamadas no HEAD **e no checkout local**, não apenas no commit de base.

## Rodada de investigação obrigatória

1. [ ] **[CÓDIGO]** Definir fixture/cópia hash-verificada, warm/cold, commit/dirty, CPU/GPU/driver.
2. [ ] **[CÓDIGO + FONTE OFICIAL]** Analisar métricas por etapa e linha sem somar workers em paralelo.
3. [ ] **[EXPERIMENTO]** Validar MP4 bruto, pixel parity, frames, seam, áudio, RAM e cancelamento.
4. [ ] Inspecionar versões, APIs e limitações do binário Windows real.
5. [ ] Analisar alternativas, custo de migração, paridade visual, dados, riscos e rollback.
6. [ ] Publicar resultados negativos e pendências, e atualizar `MATRIZ_DE_OPORTUNIDADES.md`.

## Fontes oficiais candidatas (a confirmar na pesquisa)

- https://developer.chrome.com/docs/devtools/performance/reference — **fonte a verificar em profundidade na rodada 15; compatibilidade com o build ainda não comprovada**.
- https://perfetto.dev/ — **fonte a verificar em profundidade na rodada 15; compatibilidade com o build ainda não comprovada**.
- https://www.electronjs.org/docs/latest/tutorial/performance — **fonte a verificar em profundidade na rodada 15; compatibilidade com o build ainda não comprovada**.

**Regra:** não afirmar que a pesquisa desses sites está concluída só porque a URL consta aqui. Registrar páginas lidas, data, trecho relevante e vínculo com o código.

## Gate de teste e critério de conclusão

Relatório A/B com 3 corridas equivalentes e evidências sanitizadas de wall-clock.

### Risco que não pode ser ignorado

Script de benchmark atual exige título fixo de outro projeto; não remover guardas.

## Integração com o plano

Abrir tarefas no [plano executável](../PLANO_EXECUTAVEL.md) somente após demonstrar o comportamento no código, registrar o que pode melhorar e propor experimento falsificável. Um resultado sem benchmark **não** autoriza refatoração em produção.

**Primeiro próximo passo:** completar a leitura dos arquivos acima, registrar chamadas cruzadas e classificar [CÓDIGO]/[FONTE OFICIAL]/[HIPÓTESE]/[A CONFIRMAR]/[MEDIDO].
