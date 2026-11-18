# Pesquisa 07 — Customizador, personagens e reuso

**Status:** **ROTEIRO ABERTO — PESQUISA PROFUNDA NÃO EXECUTADA.**  
**Criado:** 06/11/2026 · **Base:** `Dev-V2@c636ff03` · **Pré-requisito:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md).

> Este arquivo define a investigação que falta fazer. Os links de código foram verificados na árvore do repositório; isso **não** significa que a tecnologia foi estudada profundamente ou que houve benchmark.

## Pergunta de pesquisa

Como a instância do personagem seleciona fontes, guarda aparência e propaga revisões ao Studio/V6? Quais caches são legítimos?

## Caminhos reais do aplicativo a percorrer

- [`electron/domains/customizer/repository.ts`](../../../../electron/domains/customizer/repository.ts)
- [`electron/domains/customizer/service.ts`](../../../../electron/domains/customizer/service.ts)
- [`src/renderer/src/characters/characterSourceResolver.ts`](../../../../src/renderer/src/characters/characterSourceResolver.ts)
- [`src/renderer/src/characters/preparedCharacterMaterials.ts`](../../../../src/renderer/src/characters/preparedCharacterMaterials.ts)
- [`src/renderer/src/characters/editorV6CharacterRenderer.ts`](../../../../src/renderer/src/characters/editorV6CharacterRenderer.ts)
- [`src/renderer/src/features/editorV6/useEditorV6CharacterSources.ts`](../../../../src/renderer/src/features/editorV6/useEditorV6CharacterSources.ts)

Para cada caminho: localizar importadores/chamadores, dono do dado, fonte do recurso, prévia, exportação, efeitos sobre Studio/Customizador/Fabricador e alterações persistidas. Conferir as chamadas no HEAD **e no checkout local**, não apenas no commit de base.

## Rodada de investigação obrigatória

1. [ ] **[CÓDIGO]** Mapear mudanças de roupa, cabelo, pose, tom de pele, olhos, rosto e modelo.
2. [ ] **[CÓDIGO + FONTE OFICIAL]** Inspecionar save .tmp/backup, normalização, eventos, revisão e invalidação.
3. [ ] **[EXPERIMENTO]** Comparar preparação de personagem e estados faciais estáticos contra custo de cache/fingerprint.
4. [ ] Inspecionar versões, APIs e limitações do binário Windows real.
5. [ ] Analisar alternativas, custo de migração, paridade visual, dados, riscos e rollback.
6. [ ] Publicar resultados negativos e pendências, e atualizar `MATRIZ_DE_OPORTUNIDADES.md`.

## Fontes oficiais candidatas (a confirmar na pesquisa)

- https://react.dev/reference/react/useMemo — **fonte a verificar em profundidade na rodada 07; compatibilidade com o build ainda não comprovada**.
- https://www.electronjs.org/docs/latest/tutorial/process-model — **fonte a verificar em profundidade na rodada 07; compatibilidade com o build ainda não comprovada**.

**Regra:** não afirmar que a pesquisa desses sites está concluída só porque a URL consta aqui. Registrar páginas lidas, data, trecho relevante e vínculo com o código.

## Gate de teste e critério de conclusão

Renderização correta entre áreas e entre sessões frias/alterações, sem cache stale.

### Risco que não pode ser ignorado

Não construir cache permanente por characterId ou copiar arquivos canônicos sem contrato.

## Integração com o plano

Abrir tarefas no [plano executável](../PLANO_EXECUTAVEL.md) somente após demonstrar o comportamento no código, registrar o que pode melhorar e propor experimento falsificável. Um resultado sem benchmark **não** autoriza refatoração em produção.

**Primeiro próximo passo:** completar a leitura dos arquivos acima, registrar chamadas cruzadas e classificar [CÓDIGO]/[FONTE OFICIAL]/[HIPÓTESE]/[A CONFIRMAR]/[MEDIDO].
