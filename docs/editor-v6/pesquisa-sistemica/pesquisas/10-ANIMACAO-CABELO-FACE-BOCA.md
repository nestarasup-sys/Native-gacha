# Pesquisa 10 — Animação de cabelo, face e boca

**Status:** **ROTEIRO ABERTO — PESQUISA PROFUNDA NÃO EXECUTADA.**  
**Criado:** 06/11/2026 · **Base:** `Dev-V2@c636ff03` · **Pré-requisito:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md).

> Este arquivo define a investigação que falta fazer. Os links de código foram verificados na árvore do repositório; isso **não** significa que a tecnologia foi estudada profundamente ou que houve benchmark.

## Pergunta de pesquisa

Como reagir apenas ao final de troca de pose por 29 quadros, sem compor personagem inteiro nos quadros estáticos e sem perder ordem das camadas?

## Caminhos reais do aplicativo a percorrer

- [`src/shared/hairMotionEngine.ts`](../../../../src/shared/hairMotionEngine.ts)
- [`src/renderer/src/features/editorV6/editorV6HairMotionPreparation.ts`](../../../../src/renderer/src/features/editorV6/editorV6HairMotionPreparation.ts)
- [`src/renderer/src/features/editorV6/exportWorker.tsx`](../../../../src/renderer/src/features/editorV6/exportWorker.tsx)
- [`src/renderer/src/features/editorV6/exportHairMeshRenderer.ts`](../../../../src/renderer/src/features/editorV6/exportHairMeshRenderer.ts)
- [`src/renderer/src/features/editorV6/motion/hairBakeBatch.ts`](../../../../src/renderer/src/features/editorV6/motion/hairBakeBatch.ts)
- [`src/renderer/src/features/editorV6/sceneFaceComposition.ts`](../../../../src/renderer/src/features/editorV6/sceneFaceComposition.ts)

Para cada caminho: localizar importadores/chamadores, dono do dado, fonte do recurso, prévia, exportação, efeitos sobre Studio/Customizador/Fabricador e alterações persistidas. Conferir as chamadas no HEAD **e no checkout local**, não apenas no commit de base.

## Rodada de investigação obrigatória

1. [ ] **[CÓDIGO]** Distinguir 120Hz interno da saída 30fps e da reação analítica posterior.
2. [ ] **[CÓDIGO + FONTE OFICIAL]** Quantificar renderers original/hairless, face, PNG, warps, pixels raster e composição em repouso.
3. [ ] **[EXPERIMENTO]** Testar RGBA posterior/ROI, oclusão e boca/blink sem queda de qualidade.
4. [ ] Inspecionar versões, APIs e limitações do binário Windows real.
5. [ ] Analisar alternativas, custo de migração, paridade visual, dados, riscos e rollback.
6. [ ] Publicar resultados negativos e pendências, e atualizar `MATRIZ_DE_OPORTUNIDADES.md`.

## Fontes oficiais candidatas (a confirmar na pesquisa)

- https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API — **fonte a verificar em profundidade na rodada 10; compatibilidade com o build ainda não comprovada**.
- https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API — **fonte a verificar em profundidade na rodada 10; compatibilidade com o build ainda não comprovada**.

**Regra:** não afirmar que a pesquisa desses sites está concluída só porque a URL consta aqui. Registrar páginas lidas, data, trecho relevante e vínculo com o código.

## Gate de teste e critério de conclusão

3+3 exports com relatório completo e paridade de pixels nos 29 frames/evento.

### Risco que não pode ser ignorado

Não atribuir 41s aos substeps sem medição; não produzir MP4 H.264 esperando alpha.

## Integração com o plano

Abrir tarefas no [plano executável](../PLANO_EXECUTAVEL.md) somente após demonstrar o comportamento no código, registrar o que pode melhorar e propor experimento falsificável. Um resultado sem benchmark **não** autoriza refatoração em produção.

**Primeiro próximo passo:** completar a leitura dos arquivos acima, registrar chamadas cruzadas e classificar [CÓDIGO]/[FONTE OFICIAL]/[HIPÓTESE]/[A CONFIRMAR]/[MEDIDO].
