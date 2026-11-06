# Pesquisa 02 — Chromium, Blink, Viz e Skia

**Status:** **ROTEIRO ABERTO — PESQUISA PROFUNDA NÃO EXECUTADA.**  
**Criado:** 06/11/2026 · **Base:** `Dev-V2@c636ff03` · **Pré-requisito:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md).

> Este arquivo define a investigação que falta fazer. Os links de código foram verificados na árvore do repositório; isso **não** significa que a tecnologia foi estudada profundamente ou que houve benchmark.

## Pergunta de pesquisa

Quais estágios de renderização são realmente acionados quando só boca/cabelo mudam? Como identificar repaint/raster/compositor sem confundir internals do Chromium com APIs públicas?

## Caminhos reais do aplicativo a percorrer

- [`src/renderer/src/features/editorV6/SceneSurface.tsx`](../../../../src/renderer/src/features/editorV6/SceneSurface.tsx)
- [`src/renderer/src/features/editorV6/exportWorker.tsx`](../../../../src/renderer/src/features/editorV6/exportWorker.tsx)
- [`electron/domains/editorV6/exportWorkers.ts`](../../../../electron/domains/editorV6/exportWorkers.ts)
- [`src/renderer/src/features/editorV6/EditorV6PlaybackScene.tsx`](../../../../src/renderer/src/features/editorV6/EditorV6PlaybackScene.tsx)

Para cada caminho: localizar importadores/chamadores, dono do dado, fonte do recurso, prévia, exportação, efeitos sobre Studio/Customizador/Fabricador e alterações persistidas. Conferir as chamadas no HEAD **e no checkout local**, não apenas no commit de base.

## Rodada de investigação obrigatória

1. [ ] **[CÓDIGO]** Rastrear commit React, SVG, foreignObject, paint/raster/compositor, seleção de frames e cache de camada; diferenciar janela UI e janela offscreen.
2. [ ] **[CÓDIGO + FONTE OFICIAL]** Registrar traces com cena em repouso, mouthLoop, 1 reação de cabelo e vídeo externo; identificar duração por estágio.
3. [ ] **[EXPERIMENTO]** Verificar se GPU raster substitui ou só desloca custo de PNG, DOM e captura.
4. [ ] Inspecionar versões, APIs e limitações do binário Windows real.
5. [ ] Analisar alternativas, custo de migração, paridade visual, dados, riscos e rollback.
6. [ ] Publicar resultados negativos e pendências, e atualizar `MATRIZ_DE_OPORTUNIDADES.md`.

## Fontes oficiais candidatas (a confirmar na pesquisa)

- https://developer.chrome.com/docs/chromium/renderingng — **fonte a verificar em profundidade na rodada 02; compatibilidade com o build ainda não comprovada**.
- https://developer.chrome.com/docs/chromium/renderingng-architecture — **fonte a verificar em profundidade na rodada 02; compatibilidade com o build ainda não comprovada**.
- https://developer.chrome.com/docs/devtools/performance/reference — **fonte a verificar em profundidade na rodada 02; compatibilidade com o build ainda não comprovada**.

**Regra:** não afirmar que a pesquisa desses sites está concluída só porque a URL consta aqui. Registrar páginas lidas, data, trecho relevante e vínculo com o código.

## Gate de teste e critério de conclusão

Trace sem alterar produção; provar que simplificar estágios reduz tempo total e preserva pixels.

### Risco que não pode ser ignorado

Não copiar interfaces internas Blink/Viz, não usar will-change global, nem desabilitar SVG sem paridade.

## Integração com o plano

Abrir tarefas no [plano executável](../PLANO_EXECUTAVEL.md) somente após demonstrar o comportamento no código, registrar o que pode melhorar e propor experimento falsificável. Um resultado sem benchmark **não** autoriza refatoração em produção.

**Primeiro próximo passo:** completar a leitura dos arquivos acima, registrar chamadas cruzadas e classificar [CÓDIGO]/[FONTE OFICIAL]/[HIPÓTESE]/[A CONFIRMAR]/[MEDIDO].
