# Pesquisa 22 — Alocação de threads x264 na exportação V6

**Data:** 06/11/2026 · **Estado:** instrumentação isolada e smoke sintético; benchmark frio do projeto pendente.

## Pergunta

A quantidade de threads entregue a cada processo x264 limita ou melhora o tempo total da exportação real? O exportador calcula hoje `clamp(floor(availableParallelism / lanes), 1, 8)` para cada processo FFmpeg; com 12 CPUs disponíveis e duas lanes, o valor observado é 6.

## Evidência causal atual

- Uma exportação fria integral anterior mediu cerca de 58s de render e 18s de preparação de movimento. O FFmpeg atingiu pico amostrado de 498% CPU. Picos amostrados não indicam utilização média, saturação nem causalidade.
- Smoke executado com `resources/video-tools/ffmpeg.exe` do laboratório: `testsrc2` sintético 1920×1080, 30fps, 300 quadros; `libx264`, `ultrafast`, 12Mbps, pixel format `yuv420p`, saída null. Cada opção iniciou um processo FFmpeg novo; foi feita uma amostra por opção.

| Threads x264 | Tempo do smoke |
|---:|---:|
| 2 | 0,966s |
| 4 | 0,777s |
| 6 (alocação atual observada) | 0,684s |

O smoke indica maior throughput sintético entre 2 e 6 threads nesta amostra. Ele não tem a carga concorrente do Renderer, não usa os quadros do projeto e não mede MP4, áudio, qualidade visual nem tempo clique→arquivo validado; portanto não autoriza mudar o padrão.

## Instrumentação adicionada no LAB

- `exportRunner.ts` calcula o padrão atual e aplica `GACHA_EDITOR_V6_STRESS_X264_THREADS` somente quando `GACHA_VIDEO_STRESS_OFFSCREEN=1`, encoder `libx264` e valor inteiro de 1 a 8. Encoders alternativos e a interface normal ignoram esse override.
- `benchmark-project-export.cjs` aceita `--x264-threads=1..8`, exige `--encoder=cpu` e remove qualquer override herdado do ambiente se o argumento não for passado. Assim, a condição sem override continua usando a alocação automática.
- O relatório registra `encoderThreads` efetivamente usados em cada tentativa. Uma rodada experimental com override é rotulada como `stress-custom`, sem ser confundida com o perfil integral padrão da interface.
- Nenhum padrão de usuário ou preset foi alterado.

## Próxima validação

1. Usar o mesmo backup imutável, preset 2 de cabelo posterior, projeto/timeline, vídeo, áudio, bitrate, preset, resolução, captura, lanes e cache Motion vazio.
2. Comparar 6 (alocação observada) com 8 threads em exportações integrais independentes. Cada amostra deve iniciar processo Electron, perfil e `app-data` novos, com uma única exportação; não usar `--repeat` para representar cold runs.
3. Fazer piloto curto; se houver sinal, ampliar para pelo menos três amostras por opção e alternar a ordem entre condições.
4. Verificar MP4/ffprobe, número de quadros, streams de áudio, fallback, memória e qualidade decodificada. Remover somente MP4 e perfis gerados nas pastas marcadas do laboratório; conservar relatórios JSON leves.
5. Promover apenas se o ganho de parede superar a variação e os gates de qualidade/função passarem. Se não, manter a alocação atual e avançar para o gargalo dominante seguinte.

## Verificações de instrumentação

- `npx vitest run --config vitest.editor-v6.config.ts tests/editor-v6/exportRunner.test.ts`: 5/5 passou, incluindo isolamento do override e cálculo normal 12 CPUs/2 lanes → 6 threads.
- `npm run typecheck`: passou.
- `npm run build`: passou.
- `node --check scripts/editor-v6/benchmark-project-export.cjs`: passou.
- O A/B frio completo ainda não foi iniciado nesta etapa. Não há afirmação de aceleração da exportação real.
