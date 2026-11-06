# Pesquisa 09 — Editor V6: timeline, prévia e estado

**Status:** **ROTEIRO ABERTO — PESQUISA PROFUNDA NÃO EXECUTADA.**  
**Criado:** 06/11/2026 · **Base:** `Dev-V2@c636ff03` · **Pré-requisito:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md).

> Este arquivo define a investigação que falta fazer. Os links de código foram verificados na árvore do repositório; isso **não** significa que a tecnologia foi estudada profundamente ou que houve benchmark.

## Pergunta de pesquisa

Qual é a fonte da verdade do frame e qual é o custo de scrub, drag, seleção, timeline longa, re-renderizações e face async?

## Caminhos reais do aplicativo a percorrer

- [`src/shared/editorV6TimelineScene.ts`](../../../../src/shared/editorV6TimelineScene.ts)
- [`src/shared/editorV6TimelineCore.ts`](../../../../src/shared/editorV6TimelineCore.ts)
- [`src/renderer/src/features/editorV6/EditorV6Page.tsx`](../../../../src/renderer/src/features/editorV6/EditorV6Page.tsx)
- [`src/renderer/src/features/editorV6/EditorV6Timeline.tsx`](../../../../src/renderer/src/features/editorV6/EditorV6Timeline.tsx)
- [`src/renderer/src/features/editorV6/useEditorV6Playback.ts`](../../../../src/renderer/src/features/editorV6/useEditorV6Playback.ts)
- [`src/renderer/src/features/editorV6/EditorV6PlaybackScene.tsx`](../../../../src/renderer/src/features/editorV6/EditorV6PlaybackScene.tsx)

Para cada caminho: localizar importadores/chamadores, dono do dado, fonte do recurso, prévia, exportação, efeitos sobre Studio/Customizador/Fabricador e alterações persistidas. Conferir as chamadas no HEAD **e no checkout local**, não apenas no commit de base.

## Rodada de investigação obrigatória

1. [ ] **[CÓDIGO]** Mapear frame lógico, RAF, seleção externa, reactCommit, virtualização horizontal e índices.
2. [ ] **[CÓDIGO + FONTE OFICIAL]** Provar igualdade de preview/export em seek, borda de bloco e transição.
3. [ ] **[EXPERIMENTO]** Inspecionar SceneSurface, face async e media element em projetos longos.
4. [ ] Inspecionar versões, APIs e limitações do binário Windows real.
5. [ ] Analisar alternativas, custo de migração, paridade visual, dados, riscos e rollback.
6. [ ] Publicar resultados negativos e pendências, e atualizar `MATRIZ_DE_OPORTUNIDADES.md`.

## Fontes oficiais candidatas (a confirmar na pesquisa)

- https://react.dev/reference/react/Profiler — **fonte a verificar em profundidade na rodada 09; compatibilidade com o build ainda não comprovada**.
- https://developer.chrome.com/docs/devtools/performance/reference — **fonte a verificar em profundidade na rodada 09; compatibilidade com o build ainda não comprovada**.

**Regra:** não afirmar que a pesquisa desses sites está concluída só porque a URL consta aqui. Registrar páginas lidas, data, trecho relevante e vínculo com o código.

## Gate de teste e critério de conclusão

Trace medido de scrub/drag/scroll e frames corretos, sem reintroduzir re-render de toda a página.

### Risco que não pode ser ignorado

Não trocar modelo determinístico por timestamp de renderizador, nem quebrar edição persistida.

## Integração com o plano

Abrir tarefas no [plano executável](../PLANO_EXECUTAVEL.md) somente após demonstrar o comportamento no código, registrar o que pode melhorar e propor experimento falsificável. Um resultado sem benchmark **não** autoriza refatoração em produção.

**Primeiro próximo passo:** completar a leitura dos arquivos acima, registrar chamadas cruzadas e classificar [CÓDIGO]/[FONTE OFICIAL]/[HIPÓTESE]/[A CONFIRMAR]/[MEDIDO].
