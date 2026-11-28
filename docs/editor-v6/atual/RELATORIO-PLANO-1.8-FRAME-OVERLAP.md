# Plano 1.8 — triagem de sobreposição captura/envio

**Data:** 26/11/2026 · **Revisão:** `f4e9133c` · **Decisão:** não alterar o padrão ligado.

## Método e resultado

Um par curto alternou o pipeline padrão (`GACHA_EDITOR_V6_FRAME_OVERLAP` ausente, ligado) e o modo serial (`=0`), com o mesmo backup verificado, revisão/build, perfil UI, projeto `[0,1200)`, 1920×1080/30, quatro renderizadores, boca lote 300, CPU/libopenh264 e preset de cabelo 2. Os dois jobs passaram em FFprobe, com 1.200 quadros, áudio AAC e zero erros de limpeza.

| Configuração | Clique → MP4 validado | Renderização | Pico RSS principal |
|---|---:|---:|---:|
| Sobreposição ligada | 40,079 s | 20,825 s | 2,07 GiB |
| Sobreposição desligada | 40,701 s | 21,285 s | 1,81 GiB |

A configuração desligada ficou **1,55% mais lenta** no total e **2,21% mais lenta** na fase de render. A RSS principal observada caiu cerca de 0,26 GiB; a RSS do GPU foi 1,15/1,16 GiB. O corte único não representa mediana. Como a mudança ensaiada ficou abaixo do gate temporal e piorou a parede, não há razão para série integral nem promoção. O comportamento de produção permanece ligado. Não é alegada equivalência visual, pois o teste foi encerrado pelo gate de tempo.

## Proveniência

- Ligado: `out/editor-v6-stress/runs/plan18-frame-overlap-on-40s-retry-20261126/`; relatório SHA-256 `f742643b6abf53abea13300218c9c24b2297cae9cbc90e793f168edaaeead2df`; MP4 `1b128368-87c4-4cf8-aa48-8fdecddff614.mp4`, SHA-256 `252f8df73504782431ab0d143cd1c4f4262eb2f080b5260b937edca640b561a1`.
- Desligado: `out/editor-v6-stress/runs/plan18-frame-overlap-off-40s-20261126/`; relatório SHA-256 `e34a1c0dce2bcf56bb9d4a639f51031dbcee980571ec9f2ce832a153c565fba2`; MP4 `94a7401d-898b-4b8d-acb2-9d7273c028e1.mp4`, SHA-256 `d63c875192d1a964d71123665d7d218aaead9e651207931c2e02b2a4c339588c`.
- Um início de harness que encontrou `EADDRINUSE` gerou somente o marcador `out/editor-v6-stress/runs/plan18-frame-overlap-on-40s-20261126/.v6-benchmark-run.json` (105 B, SHA-256 `0cd253cf39f06358bf91b521e547fa426367930c3f43c6d4bba92555b9b1e9f5`). Sem MP4 ou conteúdo do app. Foi acrescentado à triagem reversível; nenhuma saída foi apagada ou movida.
