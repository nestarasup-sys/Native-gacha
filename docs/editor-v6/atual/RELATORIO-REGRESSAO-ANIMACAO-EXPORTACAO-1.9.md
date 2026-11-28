# Regressão de preparação e exportação — rodada 1.9

## Resultado

Corrigi a causa estrutural do custo extra na preparação: os limites transparentes do quadro-fonte estavam sendo contados como área ocupada no atlas. A geometria de origem continua usando o quadro completo para preservar escala e ancoragem; o atlas agora usa apenas os retângulos visíveis. Isso mantém a resolução nativa sem descartar transições.

O projeto V4 foi exportado em modo offscreen com Turbo, quatro workers, CPU, preset de cabelo 2 e timeline completa. O arquivo final tem 16.853 quadros a 1920×1080, 30 fps, H.264 High e áudio AAC estéreo. A validação do exportador passou, com 30/30 partes e todos os quadros e emendas verificados.

| Medida | Falha anterior | Execução após correção |
| --- | ---: | ---: |
| Preparação de movimentos | 132,872 s; 241 ignoradas | 60,654 s; 241 preparadas |
| Transições únicas | 198 solicitadas | 198 preparadas; 43 reutilizadas |
| Partes renderizadas | 18/30; interrompida em 63% | 30/30; 16.853/16.853 quadros |
| Resolução | Turbo 1920×1080 | 1920×1080, sem redução |
| Tempo de clique à validação | não concluído | 347,157 s (5 min 47 s) |

Os relatórios estáveis anteriores registram 56,895 s e 57,533 s de preparação. A nova execução ficou próxima desses números e abaixo dos 63 s mencionados pelo usuário; 55 s não foi tratado como critério obrigatório. O export completo levou mais tempo que a preparação e está discriminado acima.

## Causa e histórico

- `127cf672` tornou o quadro-fonte de expressão estável, preservando o canvas integral para não alterar enquadramento entre expressões.
- `cd7a461f` e `55e485f5` consolidaram a geometria facial estável. O mesmo quadro integral acabou sendo usado como tamanho de ocupação do atlas, embora a imagem visível tivesse margens transparentes.
- A diferença de 4.488×2.804 pixels (12.584.352 pixels) excedia o orçamento de 8.100.000. A preparação tentava as 241 transições por cerca de 132,9 s e terminava sem nenhuma preparada.
- `afb1df49` passou a tolerar transições acima do orçamento, expondo o descarte em vez de interromper cedo. `13a04c19` apenas silenciou um log do prewarm; nenhum dos dois resolve a área inflada.
- O código de ciclo de vida dos workers não mudou nesses commits. No relatório de falha, partes 13 e 15 excederam 60 s na etapa `workerStartup`; a parte 21 foi cancelada após a falha irmã. Não há registro de encerramento por falta de memória. Isso aponta para um bloqueio transitório de prontidão, não prova uma causa determinística no ciclo de vida.

## Correção

`measureEditorV6MotionSnapshot` agora mantém separadamente `crop` (geometria/quadro-fonte) e `atlasCrop` (ocupação visível). O layout do atlas e a preparação de amostras usam dimensões visíveis; a composição continua ancorada no crop de geometria original. Assim, eliminar margens vazias não redimensiona os personagens nem muda suas proporções.

O teste Turbo reproduzido depois da correção completou o projeto, cruzou os 63% sem timeout e terminou em 100%. Houve 30 inicializações de parte: todas concluíram, com maior prontidão abaixo de 9 s. Os picos medidos por processo chegaram a 11,4 GB de working set e 13,6 GB privados agregados, sem falha. O comportamento anterior de timeout não foi reproduzido; como o lifecycle dos workers não foi alterado, a execução bem-sucedida demonstra estabilidade nesta reprodução, mas não uma alteração específica de timeout.

## Integridade e limites da comparação visual

O export foi executado a partir de cópia de trabalho isolada; o hash do manifesto original foi conferido antes do teste e o projeto do usuário não foi alterado. O MP4 final está em `out/editor-v6-stress/runs/current-project-turbo-4workers/` e foi mantido para conferência.

O MP4 da execução estável anterior citado nos relatórios não estava mais disponível em Downloads. Portanto, não foi possível fazer uma comparação direta de pixels entre as duas versões. A validação disponível confirma codec, 1920×1080 nativo, 30 fps, duração, áudio, quadros e emendas; não afirma uma comparação visual A/B que não foi feita.

## Verificações

- `npm run typecheck` — passou.
- `npm run audit:architecture` — passou; 908 arquivos TS/TSX, sem imports locais ausentes ou violações de fronteira.
- `npm run build` — passou, incluindo o renderizador nativo e o build Electron/Vite.
- Testes de movimento/atlas — 42 testes passaram.
- Export Turbo integral do projeto V4 — relatório `passed: true`, vídeo final validado.
