# Rodada 26 — Preparação restrita ao trecho MP4

**Data:** 04/11/2026 · **Branch:** Dev-V2 · **Escopo:** apenas a descoberta dos alvos de cabelo.

## Problema

A preparação de cabelo listava os retratos de **todas** as poses e expressões de todas as faixas do projeto, mesmo quando o usuário estava exportando apenas alguns segundos do vídeo. Isso obrigava a criar rigs, superfícies de rosto e texturas de poses que nunca apareciam no MP4 parcial.

## Implementação

`selectEditorV6HairTargetStates(project, exportRange)` conserva a seleção antiga quando nenhuma faixa é passada, e na exportação usa somente estados cujo intervalo de visibilidade cruza `[startFrame, endFrame)`.

- O estado inicial de `project.elements` é **sempre preservado**, protegendo a imagem-base e o comportamento de projetos antigos.
- Faixas de **personagem** têm estado persistente até o próximo bloco; a implementação não confia cegamente em `durationFrames` de documentos antigos. Inclui os dois estados nas transições de pose que cruzam o começo do trecho.
- Faixas que não são de personagem usam os limites explícitos do clip. Um bloco que termina no `startFrame` não é preparado para essa exportação.
- Estados de outros trechos deixam de exigir recorte de rosto, renderer sem cabelo, texturas e superfícies que não serão mostradas.
- O caminho sem faixa (chamadas legadas) mantém **os mesmos alvos e a mesma ordem**.
- Não altera timeline, snapshots ou personagens salvos; não reutiliza exportações anteriores.

## Aceite

Testes `hairTargetsExportRange.test.ts` verificam seleção legada, faixas não ordenadas, pose persistente, transição sobre a borda, imagens estáticas, clips curtos e preservação do documento. CI Windows continua com TypeScript, V6, PNG/RGBA, MP4 sintético e testes do Fabricador.

**Ganho depende da quantidade de estados fora da seleção.** Um export de todo o projeto mantém essencialmente o trabalho anterior. Medir preparo na primeira exportação de um projeto real isolado para confirmar os segundos poupados; não inferir redução total a partir dos testes unitários.
