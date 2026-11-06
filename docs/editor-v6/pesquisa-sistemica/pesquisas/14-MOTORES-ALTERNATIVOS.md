# Pesquisa 14 — Motores alternativos de renderização

**Status:** **ROTEIRO ABERTO — PESQUISA PROFUNDA NÃO EXECUTADA.**  
**Criado:** 06/11/2026 · **Base:** `Dev-V2@c636ff03` · **Pré-requisito:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md).

> Este arquivo define a investigação que falta fazer. Os links de código foram verificados na árvore do repositório; isso **não** significa que a tecnologia foi estudada profundamente ou que houve benchmark.

## Pergunta de pesquisa

Quando seria melhor usar Canvas nativo, resvg, CanvasKit, PixiJS, WebGPU ou compositor próprio em vez do Chromium atual?

## Caminhos reais do aplicativo a percorrer

- [`src/shared/editorV6ExportDrawPlan.ts`](../../../../src/shared/editorV6ExportDrawPlan.ts)
- [`src/shared/editorV6PartRasterRenderer.ts`](../../../../src/shared/editorV6PartRasterRenderer.ts)
- [`src/shared/editorV6PartMotionPrototype.ts`](../../../../src/shared/editorV6PartMotionPrototype.ts)
- [`src/renderer/src/features/editorV6/SceneSurface.tsx`](../../../../src/renderer/src/features/editorV6/SceneSurface.tsx)
- [`src/renderer/src/features/editorV6/exportHairMeshRenderer.ts`](../../../../src/renderer/src/features/editorV6/exportHairMeshRenderer.ts)

Para cada caminho: localizar importadores/chamadores, dono do dado, fonte do recurso, prévia, exportação, efeitos sobre Studio/Customizador/Fabricador e alterações persistidas. Conferir as chamadas no HEAD **e no checkout local**, não apenas no commit de base.

## Rodada de investigação obrigatória

1. [ ] **[CÓDIGO]** Registrar features suportadas/não suportadas no protótipo DrawPlan.
2. [ ] **[CÓDIGO + FONTE OFICIAL]** Comparar fidelidade de texto, SVG, roupas, pele, rosto, boca, cabelo, vídeo, alpha e flip.
3. [ ] **[EXPERIMENTO]** Montar spikes pequenos, não substituir exportador antes de paridade.
4. [ ] Inspecionar versões, APIs e limitações do binário Windows real.
5. [ ] Analisar alternativas, custo de migração, paridade visual, dados, riscos e rollback.
6. [ ] Publicar resultados negativos e pendências, e atualizar `MATRIZ_DE_OPORTUNIDADES.md`.

## Fontes oficiais candidatas (a confirmar na pesquisa)

- https://github.com/Brooooooklyn/canvas — **fonte a verificar em profundidade na rodada 14; compatibilidade com o build ainda não comprovada**.
- https://github.com/linebender/resvg — **fonte a verificar em profundidade na rodada 14; compatibilidade com o build ainda não comprovada**.
- https://pixijs.com/ — **fonte a verificar em profundidade na rodada 14; compatibilidade com o build ainda não comprovada**.

**Regra:** não afirmar que a pesquisa desses sites está concluída só porque a URL consta aqui. Registrar páginas lidas, data, trecho relevante e vínculo com o código.

## Gate de teste e critério de conclusão

Comparativo de ROI + implementação estimada + compatibilidade portátil Windows.

### Risco que não pode ser ignorado

Não vender resvg como suporte automático a foreignObject/WebGL.

## Integração com o plano

Abrir tarefas no [plano executável](../PLANO_EXECUTAVEL.md) somente após demonstrar o comportamento no código, registrar o que pode melhorar e propor experimento falsificável. Um resultado sem benchmark **não** autoriza refatoração em produção.

**Primeiro próximo passo:** completar a leitura dos arquivos acima, registrar chamadas cruzadas e classificar [CÓDIGO]/[FONTE OFICIAL]/[HIPÓTESE]/[A CONFIRMAR]/[MEDIDO].
