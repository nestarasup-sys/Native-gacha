# Pesquisa 22 — Alocação de threads x264 na exportação V6

**Data:** 10/11/2026 · **Estado:** alocação dinâmica promovida no LAB após pilotos cruzados e um export integral frio; qualidade comparada em 600 quadros.

## Pergunta

A quantidade de threads entregue a cada processo x264 limita ou melhora o tempo total da exportação real? Com 12 processadores lógicos e duas lanes, a alocação anterior dava 6 threads.

## Evidência causal atual

- Uma exportação fria integral anterior mediu cerca de 58s de render e 18s de preparação de movimento. O FFmpeg atingiu pico amostrado de 498% CPU. Picos amostrados não indicam utilização média, saturação nem causalidade.
- Smoke executado com `resources/video-tools/ffmpeg.exe` do laboratório: `testsrc2` sintético 1920×1080, 30fps, 300 quadros; `libx264`, `ultrafast`, 12Mbps, pixel format `yuv420p`, saída null. Cada opção iniciou um processo FFmpeg novo; foi feita uma amostra por opção.

| Threads x264 | Tempo do smoke |
|---:|---:|
| 2 | 0,966s |
| 4 | 0,777s |
| 6 (alocação atual observada) | 0,684s |

O smoke indicava throughput sintético maior até 6 threads, mas não representava o Renderer. A comparação real posterior é a evidência usada para a decisão.

## Comparação no projeto real — 10/11/2026

- Os pares usaram o mesmo snapshot imutável, Preset 2 posterior-only, 1080p30, `ultrafast`, 12Mbps, 2 lanes, `capturePage`, cache Motion-fonte vazio e processos/sessões/app-data novos. O piloto usou os primeiros 600 quadros; foi feito um par 6→8 e um par cruzado 8→6 para reduzir viés de ordem.
- No par retido para qualidade: 6 threads = 23,94 s clique→MP4; 8 threads = 23,17 s, queda de 3,2%. MP4s validados mantiveram áudio e 600/600 quadros. Comparação decodificada FFmpeg entre as saídas: SSIM médio **0,999226** e PSNR médio **57,27 dB**.
- No par cruzado sem retenção: 8 threads = 22,70 s; 6 threads = 23,92 s, queda de 5,1%. Ambos validaram áudio e 600/600 quadros.
- Um export integral frio de 8 threads validou 2.394/2.394 quadros, 4 vídeos, 4 faixas de áudio e cache Motion com zero gravações. Clique→MP4 = **76,34 s**, Main = 67,85 s, Motion = 16,33 s, render = 48,43 s, finalização = 2,76 s. A comparação integral arquivada com a alocação antiga de 6 threads ficou em 88,51 s (79,49 s Main), diferença observada de 13,7%; é uma amostra de cada condição e a execução integral de 8 threads ocorreu depois de mais leituras, então não atribuir todo o ganho ao encoder.
- **Decisão:** manter o ganho conservador observado no par cruzado: para `libx264`, alocar `floor(availableParallelism / lanes × 4/3)`, limitado a 1–8. Outros encoders mantêm a divisão anterior. No host de 12 processadores lógicos e duas lanes, a interface escolhe 8 threads. Override manual segue apenas para o harness frio.

## Instrumentação adicionada no LAB

- `exportRunner.ts` aplica a nova margem automática proporcional somente a `libx264`, com limite de 8. `GACHA_EDITOR_V6_STRESS_X264_THREADS` continua isolado ao harness; encoders alternativos não recebem a margem.
- `benchmark-project-export.cjs` aceita `--x264-threads=1..8`, exige `--encoder=cpu` e remove qualquer override herdado do ambiente se o argumento não for passado. Assim, a condição sem override continua usando a alocação automática.
- O relatório registra `encoderThreads` efetivamente usados em cada tentativa. Uma rodada experimental com override é rotulada como `stress-custom`, sem ser confundida com o perfil integral padrão da interface.
- O preset/bitrate de usuário não mudou; a configuração automática de threads x264 passa a refletir a medição real.

## Próxima validação

1. Repetir ao menos uma exportação integral após a mudança automática para observar o comportamento sem override explícito.
2. Monitorar tempo e responsividade em máquinas com menos de 12 processadores lógicos; a fórmula é proporcional e limitada a 8, mas ainda precisa de validação em hardware inferior.
3. Prosseguir com a captura/transferência e o render comum, que seguem dominantes; 76 s ainda está muito acima da meta de 30 s.

## Verificações de instrumentação

- `npx vitest run --config vitest.editor-v6.config.ts tests/editor-v6/exportRunner.test.ts`: 5/5 passou; cobre x264 12/2→8, divisão proporcional em 12/4 e 8/2, limite 8, encoders alternativos e override restrito ao harness.
- `npm run typecheck`, `npm run build`, `npm run test:editor-v6:export` (81 quadros, emenda, áudio, fallback, cancelamento e full HD) e `npm run audit:architecture` (722 arquivos, 0 violações) passaram.
- Pilotos e export integral passaram pela validação interna. Os dois MP4 usados no SSIM/PSNR (~30MB cada) continuam nas pastas `quality-x264-threads6-20s` e `quality-x264-threads8-20s`; a tentativa de removê-los foi bloqueada pela política da execução, então ficaram temporários no LAB, nunca no `app-data` ou no projeto canônico.
