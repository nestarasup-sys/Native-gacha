# Pesquisa 04 — Canvas, SVG, imagens e alpha

**Status:** **ROTEIRO ABERTO — PESQUISA PROFUNDA NÃO EXECUTADA.**  
**Criado:** 06/11/2026 · **Base:** `Dev-V2@c636ff03` · **Pré-requisito:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md).

> Este arquivo define a investigação que falta fazer. Os links de código foram verificados na árvore do repositório; isso **não** significa que a tecnologia foi estudada profundamente ou que houve benchmark.

## Pergunta de pesquisa

Por que o pipeline recompõe corpo/face/hair no Canvas e o entrega a SVG? Qual etapa exige readback, encode PNG/base64 ou transparência?

## Caminhos reais do aplicativo a percorrer

- [`src/renderer/src/features/editorV6/SceneSurface.tsx`](../../../../src/renderer/src/features/editorV6/SceneSurface.tsx)
- [`src/renderer/src/characters/editorV6CharacterRenderer.ts`](../../../../src/renderer/src/characters/editorV6CharacterRenderer.ts)
- [`src/renderer/src/characters/characterLayerRenderer.ts`](../../../../src/renderer/src/characters/characterLayerRenderer.ts)
- [`src/renderer/src/features/editorV6/sceneFaceComposition.ts`](../../../../src/renderer/src/features/editorV6/sceneFaceComposition.ts)
- [`src/renderer/src/features/editorV6/motion/bakeMotion.ts`](../../../../src/renderer/src/features/editorV6/motion/bakeMotion.ts)
- [`electron/imageIngestion.cjs`](../../../../electron/imageIngestion.cjs)

Para cada caminho: localizar importadores/chamadores, dono do dado, fonte do recurso, prévia, exportação, efeitos sobre Studio/Customizador/Fabricador e alterações persistidas. Conferir as chamadas no HEAD **e no checkout local**, não apenas no commit de base.

## Rodada de investigação obrigatória

1. [ ] **[CÓDIGO]** Seguir drawImage, getImageData, toDataURL, load de PNG e Canvas adotado.
2. [ ] **[CÓDIGO + FONTE OFICIAL]** Documentar alpha premultiplicado, contornos, crop e máscara face/cabelo.
3. [ ] **[EXPERIMENTO]** Comparar ROI/canvas direto contra PNG atlas de pose e composição full canvas.
4. [ ] Inspecionar versões, APIs e limitações do binário Windows real.
5. [ ] Analisar alternativas, custo de migração, paridade visual, dados, riscos e rollback.
6. [ ] Publicar resultados negativos e pendências, e atualizar `MATRIZ_DE_OPORTUNIDADES.md`.

## Fontes oficiais candidatas (a confirmar na pesquisa)

- https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API — **fonte a verificar em profundidade na rodada 04; compatibilidade com o build ainda não comprovada**.
- https://developer.mozilla.org/en-US/docs/Web/SVG — **fonte a verificar em profundidade na rodada 04; compatibilidade com o build ainda não comprovada**.
- https://sharp.pixelplumbing.com/api-composite/ — **fonte a verificar em profundidade na rodada 04; compatibilidade com o build ainda não comprovada**.

**Regra:** não afirmar que a pesquisa desses sites está concluída só porque a URL consta aqui. Registrar páginas lidas, data, trecho relevante e vínculo com o código.

## Gate de teste e critério de conclusão

Mesma imagem RGBA de pose, boca, rosto, cabelo e oclusão, ganhos de wall clock.

### Risco que não pode ser ignorado

Evitar halos, double draw do cabelo posterior e pixels iguais só após compressão H.264.

## Integração com o plano

Abrir tarefas no [plano executável](../PLANO_EXECUTAVEL.md) somente após demonstrar o comportamento no código, registrar o que pode melhorar e propor experimento falsificável. Um resultado sem benchmark **não** autoriza refatoração em produção.

**Primeiro próximo passo:** completar a leitura dos arquivos acima, registrar chamadas cruzadas e classificar [CÓDIGO]/[FONTE OFICIAL]/[HIPÓTESE]/[A CONFIRMAR]/[MEDIDO].
