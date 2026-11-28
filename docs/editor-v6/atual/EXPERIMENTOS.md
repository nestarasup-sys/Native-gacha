# Índice de experimentos do Editor V6

Inventário recuperado de [Execução 1.1](EXECUCAO-1.1.md), [Execução 1.2](EXECUCAO-1.2.md) e [Execução 1.3](EXECUCAO-1.3.md). Números reproduzidos dos relatórios, não reexecutados nesta rodada. Uma nova linha deve ser registrada antes de concluir cada experimento da 1.4.

| ID | Hipótese e resultado registrado | Decisão | Referência |
|---|---|---|---|
| 1.1-R0 | Otimizar scan de alpha: microbenchmark 0,36 ms vs. 1,76 ms/call, export integral sem ganho (`cropDetectionMs` 39,83→39,61 s) | Sem ganho de parede demonstrado | Execução 1.1 |
| 1.1-R1 | Quatro workers reduzem parede vs. 2; seis só −1,65 s com maior pico GPU | Promovido 4 CPU/2 GPU | Execução 1.1 |
| 1.1-R1b | Parte/lote 600: export 201,45 s, lote 1.200: 209,20 s e 99,53 GB vs. 94,56 GB | Lote 1.200 rejeitado | Execução 1.1 |
| 1.1-R1c | Renderizador nativo C++ excedeu 512 MiB de assets em 40 s e com lote 300 | Falhou antes de gerar MP4 | Execução 1.1 |
| 1.1-R1d | A/B lote de boca 300 vs. 600, `[0,6000)`: 194,502 s vs. 187,864 s (−3,4%) | Lote 600 promovido | Execução 1.1 |
| 1.1-R1e | Sobreposição ligada/desligada: 43,053 s vs. 43,366 s (+0,7%) | Sobreposição mantida | Execução 1.1 |
| 1.1-R1f | FFmpeg automático/2/4 threads: 43,053/43,431/43,618 s | Caps não promovidos | Execução 1.1 |
| 1.1-R1g | Cache LRU de geometria: full 187,864→179,714 s (−4,3%), preparo 44,770→37,007 s | Promovido | Execução 1.1 |
| 1.1-R2 | Concorrência de bake 1: 51,611 s vs. 43,053 s com 2 (+19,9%) | Removido | Execução 1.1 |
| 1.1-R3 | `ffconcat` precisa `option framerate 30`; não reduz quadros CFR | Removido | Execução 1.1 |
| 1.1-R4 | `h264_mf` reencode 40 s 3,70 s vs. OpenH264 7,06 s; SSIM 0,997073/0,996593 | Inconclusivo para captura | Execução 1.1 |
| 1.1-R5 | 2/4 workers em cortes curtos, mediana −6,6%; 2/6 −9,5% | Sem mudança padrão | Execução 1.1 |
| 1.1-R5b | Encoder MF vs. OpenH264 em export real de 40 s: 44,282 vs. 44,318 s | Empate, sem troca | Execução 1.1 |
| 1.1-R5c | Concorrência de boca 2/3 no corte completo: 163,760/163,869 s; lote 300 em 120 s: 104,713 s | Concorrência 2/lote 600 mantidos | Execução 1.1 |
| 1.1-R5d | Captura 60/120/30 Hz: 42,755/42,128/43,713 s, amostra única | Sem alteração de padrão | Execução 1.1 |
| 1.1-R6 | `paint-event` 120/60/30 Hz teve 19,8%/25%/31,1% de readbacks antigos | Sem ganho provado | Execução 1.1 |
| 1.1-R7 | `paint-event` igual em 321 bitmaps, mas export integral 165,836 s vs. 163,760 s | Descartado | Execução 1.1 |
| 1.1-R8 | Retry de captura 8 ms: 41,841 s vs. 41,147 s (+1,7%) | Descartado | Execução 1.1 |
| 1.1-R9 | Filtro `select` repetidos reconstrói hashes em fixture, mas export recebe mesmos 14,93 GB e leva 42,731 s vs. 42,148 s (+1,38%) | Descartado | Execução 1.1 |
| 1.1-R10 | Transporte em buffers separados: 43,693 s vs. 40,755 s (+7,2%) | Descartado | Execução 1.1 |
| 1.1-R11 | Preparar boca antes do render: 41,617 s vs. 40,920 s (+1,7%) | Descartado | Execução 1.1 |
| 1.1-R12 | Lookahead 2: 104,084 s vs. 104,417 s (+0,3%); ganho não sustentado | Descartado | Execução 1.1 |
| 1.1-R13 | 4 threads encoder vs. automático 3, medição isolada | Inconclusivo | Execução 1.1 |
| 1.1-R14 | Lote 1.200: 165,006 s vs. 163,760 s (+0,76%); bake 104,882 s vs. 55,999 s | Descartado | Execução 1.1 |
| 1.1-R15 | Pular IPC redundante: 40,705 s vs. 40,631 s (+0,18%) | Removido | Execução 1.1 |
| 1.1-R16 | PNG de quadros únicos: 60,422 s vs. 40,631 s (+48,7%); `paint-event` curto −1,5% | PNG removido; paint inconclusivo | Execução 1.1 |
| 1.1-R17 | Yield de captura 8 ms +0,693 s (+1,7%); gate RAF integral +0,379 s | Removido | Execução 1.1 |
| 1.1-R18 | IPC alternativo 40 s +2,3%; hashes iguais | Descartado | Execução 1.1 |
| 1.2-R0 | 200 s baseline em três repetições: 169,370/169,435/170,353 s; mediana 169,435 s | Linha de base | Execução 1.2 |
| 1.2-R0b | Índices por identidade: 4 edições/4 reconstruções para background e vídeo | Refuta hipótese ≤N nesses índices | Execução 1.2 |
| 1.2-R0c | Projeto antigo e novo, análise e export: leitura restrita; sem A/B adicional nesta rodada | Sem conclusão de migração | Relatório 1.2 |
| 1.2-R1 | Quadros repetidos 72,5% dos bytes; 40,21% de espera em pipe | Gate libera laboratório; não produto | Execução 1.2 |
| 1.2-R2 | NUT sintético 3 quadros/PTS 0,1,4 s reconstruiu 121 quadros | Inconclusivo sem A/B | Execução 1.2 |
| 1.2-R3 | WebCodecs `avc1.64001f` configurou software/hardware em 60 quadros pequenos | Inconclusivo | Execução 1.2 |
| 1.2-R4 | Tool rail 1,05 ms→0,02 ms/notificação; playback p95 16,8 ms | Promovido | Execução 1.2 |
| 1.2-R5 | 4 edições de background/video clips reconstruíram índice 4 vezes | Hipótese ≤N refutada para esses comandos | Execução 1.2 |
| 1.3-A5 | cc9d02b0 vs HEAD: 168,706 s vs. 168,225 s; −0,286% | Gate passa, sem causa para diferença antiga | Execução 1.3 |
| 1.3-B | 5 exports, `write UNKNOWN` não reproduzido; mediana diagnóstica 169,504 s | Inconclusivo; coleta opt-in mantida | Execução 1.3 |
| 1.3-C1 | CPU acumulada 915,6/909,6/911,0 CPU-s; ~5,4 threads ocupadas | Medido | Execução 1.3 |
| 1.3-C2 | Consumidor vídeo 4×: 105,6 fps; projeção 56,832 s/6.000 quadros | Medido | Execução 1.3 |
| 1.3-C2-AMF | AMF −1,035%; SSIM 0,987858, PSNR 43,705 dB | Não promovido | Execução 1.3 |
| 1.3-C3 | Produtor: mediana 61,651 s, faixa 60,465–62,944 s | Medido | Execução 1.3 |
| 1.3-D1 | Writer NUT sintético byte-idêntico | Aprovado isolado | commit 860b8da6 / Execução 1.3 |
| 1.3-D2/D3 | A/B 40 s −7,583%; divergência de pixels 500 bytes em A3/B3 | Integração removida; 200 s bloqueado | Execução 1.3 |
| 1.4-B/P | Export 6.000 quadros, diagnóstico off/on em 3 pares: +1,1160803611244052% clique→arquivo; CPU-s −0,6242038628065272%; `E=0,991721849814676` | Instrumentação mantida opt-in; sem otimização aprovada; preparo/renderer dominam e P3 inconclusivo | commits b273f0f3, ad85912a / Execução 1.4 |
| 1.4-C | C2: filtros sem vídeo −47,3635% parede; com vídeo −11,6602%; C3: remover decode/scale −37,9992%; C4 200 s: 4 workers venceram 3/3 pares por mediana 1,7724% | Manter 4 workers; investigar decode/scale como próximo custo | [Execução 1.4](EXECUCAO-1.4.md); brutos em `out/editor-v6-stress/round14-c-artifact-index.json` |
| 1.4-D0 | 3 capturas 600 quadros: 1×3 idêntico; pares 1×2 e 2×3 diferem em 1 quadro, 18 pixels, delta máximo 1, só foreground | Piso de determinismo registrado; causa interna inconclusiva | [Execução 1.4](EXECUCAO-1.4.md); comparações `out/editor-v6-stress/round14-monitor/d0-run*-vs-run*.json` |
| 1.4-F1 | 90 quadros sintéticos, 135 comparações BGRA; 0 diferenças; MP4 90 quadros/30 FPS; referência comprimida 984.152 B | Golden F1 aprovado dentro do piso D0; saída H.264 ainda sem comparação dourada pixel a pixel | [Execução 1.4](EXECUCAO-1.4.md); fixture `tests/editor-v6/fixtures/golden-export-v1/` |
| 1.4-D1 | Captura real 40 s: 1.200 quadros, 880/1.200 repetidos (73,8333% bytes evitáveis); replay CFR/NUT alternado, RGB24 idêntico em 1.200/1.200 quadros e nas emendas | Gate de equivalência passou; D2 pode testar integração opt-in; sem alegação de ganho de parede | [Execução 1.4](EXECUCAO-1.4.md); brutos `out/editor-v6-stress/dumps/round14-d1-capture/` e `out/editor-v6-stress/runs/round14-d1-replay-02/` |
| 1.4-D2 | Integração NUT 40 s: 3 pares alternados; ganho parede mediano `3,28121574%`, mínimo `2,74902872%`; CPU-s mediana `−5,909468%`; FFmpeg RSS maior em 3/3 pares; NUT2 excedeu piso CFR em amostras dos olhos | Removido; gate ≥5% e memória não passaram; 200 s bloqueado | commit `812e0c2b`; [Execução 1.4](EXECUCAO-1.4.md); brutos em `out/editor-v6-stress/runs/round14-d2-40s-series-05/` |
| 1.5-T | threads=2 (filtros e encoder) em 3 pares de 200 s: mediana −4,148 s/−2,474%; todos os pares favoreceram B | Promovido com o NUT após validação visual do conjunto | [Execução 1.5](EXECUCAO-1.5.md); `out/editor-v6-stress/runs/round15-threads-200s-instrumented/` |
| 1.5-D2 | NUT + threads=2 em 3 pares de 200 s: mediana −5,458 s/−3,326%; CPU-s menor; FFmpeg RSS mediano +79,6%; PCM idêntico; SSIM 0,999927–0,999994 | Promovido; todas as diferenças visuais críticas ficaram no piso CFR↔CFR ou imperceptíveis | [Execução 1.5](EXECUCAO-1.5.md); hash do relatório de qualidade `a7591e2d…` |
| 1.7-A1 | Omitir `rotate=0` altera geometria do fixture: 574×636→556×312 | Rejeitado | [Execução 1.7](EXECUCAO-1.7.md) |
| 1.7-A2 | 11 inputs/6 fontes em 10 jobs; reutilização só entre partes, sem repetição dentro do job; metadados indisponíveis | Sem otimização segura comprovada | [Execução 1.7](EXECUCAO-1.7.md) |
| 1.7-B1 | `willReadFrequently`: 63,5→81,9 ms total; atlas idêntico | Rejeitado, patch fora do repo | [Execução 1.7](EXECUCAO-1.7.md) |
| 1.7-B2 | 106 grupos; lanes 21.835/31.910 ms, sem preditor de custo pré-bake validado | Sem heurística | [Execução 1.7](EXECUCAO-1.7.md) |
| 1.7-C | Cache de boca, dois pares: +2,88% e +1,44%; PCM idêntico; mínimo <2% | Rejeitado; patch e teste preservados | [Execução 1.7](EXECUCAO-1.7.md) |
| 1.8-E1 | 40 s/lote 300: 4 vs. 2 workers CPU em 3 pares alternados; 4 venceu mediana −8,35%, mínimo −7,07%, SSIM ≥0,999984, PCM idêntico | Confirma política CPU=4 já existente; não é mudança de produto nem prova para 200 s/lote 600 | [Relatório 1.8](RELATORIO-PLANO-1.8-WORKERS-40S.md) |
| 1.8-E2 | `fast_bilinear`: 40 s com vídeo parcial −1,54%; janela com vídeo em 1.154/1.200 quadros +0,14% (lento); render sem ganho | Rejeitado no gate curto; protótipo removido, nenhum A/B integral | [Relatório 1.8](RELATORIO-PLANO-1.8-SCALER-40S.md) |
| 1.8-E3 | Concorrência de motion 2→3: 40 s −4,41%, mas 200 s −0,23%; SSIM 0,999990, PCM idêntico | Rejeitada: não alcançou o gate integral de 2%; padrão permanece 2 | [Relatório 1.8](RELATORIO-PLANO-1.8-MOTION-CONCURRENCY.md) |
| 1.8-E4 | NUT compara 4.346 frames repetidos de 8.294.400 B cada; 36.047.462.400 B, 3 medições seriais de 2.727–2.833 ms | Teto isolado <1,78% de 158,926 s e menor sob paralelismo; não chega ao gate de 2%, sem alteração no writer | [Plano 1.8](PLANO-1.8.md) |
| 1.8-E5 | Sobreposição de captura/envio ligada vs. desligada, um par de 40 s: 40,079/40,701 s; desligada +1,55% no tempo total e +2,21% na fase de render | Amostra única abaixo do critério de avanço; manter o padrão ligado, sem mudança de produto | [Relatório de sobreposição](RELATORIO-PLANO-1.8-FRAME-OVERLAP.md) |

Números históricos têm escopos diferentes. Consulte o relatório da execução antes de comparar; resultados acima não substituem artefatos brutos.
