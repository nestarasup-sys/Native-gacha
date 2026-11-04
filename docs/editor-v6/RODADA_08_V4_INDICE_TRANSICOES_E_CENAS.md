# Editor V6 — Rodada 08 · Índice das transições e reaproveitamento da cena resolvida

**Branch:** `Dev-V2`. **Base:** `efbb7dacffdf618d233e16fa64025b6236204723`.
**Escopo:** caminho de exportação com cabelo experimental, sem alterar física, malhas, resolução ou o comportamento da prévia.

## Causa encontrada

Em `exportWorker.tsx`, a seleção de uma transição usava `Array.find` sobre todas as transições, seguido de `some` sobre os quadros do atlas. O processo era repetido no desenho do personagem e na preparação dos pontos de cabeça utilizados pela física. Em exports com várias poses/transições, esse trabalho cresce com a quantidade total de transições.

A função `ensureHeadPaths` também chamava `resolveEditorV6SceneAtFrame` para um quadro que o renderizador já havia resolvido. Quando uma cena inclui vídeo sobreposto, os passes de fundo/primeiro plano também resolviam a mesma timeline novamente.

## Mudanças

1. `exportHairTransitionIndex.ts`: mapa por elemento e número absoluto de quadro, calculado uma vez por worker, guardando a primeira transição elegível e sua amostra de atlas/interpolação. Preserva os filtros de limites estritos, falta de rigs/atlas e desempate por ordem original.
2. `exportWorker.tsx`: consultas constantes pelo índice nos pontos de uso mais frequentes e cache **de uma única cena bruta** para o quadro em renderização; não acumula documentos nem cenas por duração.
3. Testes de equivalência com o algoritmo linear antigo para limites, atlas duplicado, sobreposição, dados faltantes e 350 transições/5.000 quadros sintéticos.

## Garantias e limites

- A interpolação de movimento/cabelo, posição física da cabeça, `motionEase`, ordem de camadas, espelhamento, captura, 30 FPS, áudio e FFmpeg não foram alterados.
- A preparação física usa a **cena bruta**, antes de `applyMouthLoop`, para não trocar o rig físico ao mudar a expressão. Consultas de frames anteriores continuam resolvendo normalmente.
- O índice é por worker de exportação e não modifica a prévia, Fabricador ou dados salvos.
- Menos buscas lineares e resoluções redundantes são ganhos de complexidade algorítmica, **não** um percentual demonstrado de economia em segundos.
- Ainda é necessário medir o projeto real `Editor V6 06` com Preset 2, 300 quadros e MP4 validado em cópia isolada. A meta de 10–15 s continua não comprovada.
