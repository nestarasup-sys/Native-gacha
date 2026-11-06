# Pesquisa 08 — Studio, Roteiros e bibliotecas

**Status:** **ROTEIRO ABERTO — PESQUISA PROFUNDA NÃO EXECUTADA.**  
**Criado:** 06/11/2026 · **Base:** `Dev-V2@c636ff03` · **Pré-requisito:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md).

> Este arquivo define a investigação que falta fazer. Os links de código foram verificados na árvore do repositório; isso **não** significa que a tecnologia foi estudada profundamente ou que houve benchmark.

## Pergunta de pesquisa

Quais dados são compartilhados, snapshots ou referências vivas? Como Roteiros/Base de Vídeos/Studio influenciam o V6 e vice-versa?

## Caminhos reais do aplicativo a percorrer

- [`electron/domains/studio/documentPersistence.ts`](../../../../electron/domains/studio/documentPersistence.ts)
- [`electron/domains/studio/primaryIpc.ts`](../../../../electron/domains/studio/primaryIpc.ts)
- [`electron/domains/roteiros/service.ts`](../../../../electron/domains/roteiros/service.ts)
- [`electron/domains/baseVideos/service.ts`](../../../../electron/domains/baseVideos/service.ts)
- [`electron/domains/mediaLibrary/videoLibraryStore.ts`](../../../../electron/domains/mediaLibrary/videoLibraryStore.ts)
- [`electron/domains/mediaLibrary/mediaFileResponse.ts`](../../../../electron/domains/mediaLibrary/mediaFileResponse.ts)
- [`electron/domains/editorV6/mediaReferences.ts`](../../../../electron/domains/editorV6/mediaReferences.ts)

Para cada caminho: localizar importadores/chamadores, dono do dado, fonte do recurso, prévia, exportação, efeitos sobre Studio/Customizador/Fabricador e alterações persistidas. Conferir as chamadas no HEAD **e no checkout local**, não apenas no commit de base.

## Rodada de investigação obrigatória

1. [ ] **[CÓDIGO]** Mapear IDs e políticas de exclusão/referência entre biblioteca, projetos e Roteiros.
2. [ ] **[CÓDIGO + FONTE OFICIAL]** Comparar HTMLMediaElement (preview) com FFmpeg (render) para mesmo vídeo/áudio.
3. [ ] **[EXPERIMENTO]** Testar transação de cena+assets e conflito com gravações pendentes.
4. [ ] Inspecionar versões, APIs e limitações do binário Windows real.
5. [ ] Analisar alternativas, custo de migração, paridade visual, dados, riscos e rollback.
6. [ ] Publicar resultados negativos e pendências, e atualizar `MATRIZ_DE_OPORTUNIDADES.md`.

## Fontes oficiais candidatas (a confirmar na pesquisa)

- https://www.sqlite.org/foreignkeys.html — **fonte a verificar em profundidade na rodada 08; compatibilidade com o build ainda não comprovada**.
- https://nodejs.org/api/stream.html — **fonte a verificar em profundidade na rodada 08; compatibilidade com o build ainda não comprovada**.

**Regra:** não afirmar que a pesquisa desses sites está concluída só porque a URL consta aqui. Registrar páginas lidas, data, trecho relevante e vínculo com o código.

## Gate de teste e critério de conclusão

Mesmo conteúdo/propriedades entre módulos, nenhum asset órfão, seek e duração corretos.

### Risco que não pode ser ignorado

Não remover checks de referência nem substituir URLs autorizadas por file://.

## Integração com o plano

Abrir tarefas no [plano executável](../PLANO_EXECUTAVEL.md) somente após demonstrar o comportamento no código, registrar o que pode melhorar e propor experimento falsificável. Um resultado sem benchmark **não** autoriza refatoração em produção.

**Primeiro próximo passo:** completar a leitura dos arquivos acima, registrar chamadas cruzadas e classificar [CÓDIGO]/[FONTE OFICIAL]/[HIPÓTESE]/[A CONFIRMAR]/[MEDIDO].
