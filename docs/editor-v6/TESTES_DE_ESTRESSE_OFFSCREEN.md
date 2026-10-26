# Estresse e diagnóstico do Editor V6

**Execução:** 26/10/2026 · `npm run test:editor-v6:stress-offscreen` · Electron em desenvolvimento, Chromium via CDP.

## Escopo e segurança dos dados

O teste roda o app Electron e a interface real do Editor V6, em janela fora da área de trabalho, contra quatro personagens reais `STRESS_*`. Cada cenário dura 30 segundos a 30 FPS. O runner cria um perfil temporário isolado, copiando apenas as pastas locais do Customizador e Fabricador necessárias aos personagens. Não toca nos projetos normais do perfil. Os arquivos de mídia H.264/AAC MP4, VP9/Opus WebM, PCM WAV e Opus OGG são fixtures sintéticas de 40 segundos geradas com FFmpeg local; não são adicionadas ao Git.

O JSON bruto e o trace completo ficam em `out/editor-v6-stress/` (pasta ignorada pelo Git e pode conter IDs locais). A versão agregada e sem nomes/IDs de personagens está em [benchmarks/ESTRESSE_2026-10-26.json](benchmarks/ESTRESSE_2026-10-26.json).

## Resultado do benchmark de 30 segundos

| Cenário | Blocos | p50 RAF | p95 RAF | p99 RAF | Maior intervalo | RAF callbacks/s | Quadros lógicos/s | Atualizações DOM/s | Lacunas DOM | Pico heap JS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Leve | 80 | 13,3 ms | 13,5 ms | 13,8 ms | 66,7 ms | 74,6 | 29,94 | 29,88 | 2 | 137,8 MB |
| Médio | 284 | 13,3 ms | 13,5 ms | 13,8 ms | 79,9 ms | 74,3 | 29,95 | 29,92 | 3 | 121,2 MB |
| Pesado | 752 | 13,3 ms | 13,4 ms | 13,6 ms | 93,4 ms | 74,2 | 29,94 | 29,81 | 3 | 134,3 MB |
| Multimídia | 288 | 13,3 ms | 13,5 ms | 13,5 ms | 93,3 ms | 74,1 | 29,93 | 29,83 | 3 | 86,9 MB |

O RAF roda perto de 74 Hz neste monitor; isso não é o FPS lógico do projeto. A timeline manteve aproximadamente 30 quadros lógicos e 30 atualizações DOM por segundo. O benchmark não mediu os quadros apresentados fisicamente pelo compositor/monitor. Como o Play escolhe o quadro correspondente ao tempo decorrido, atrasos podem pular quadros intermediários para preservar o tempo. As lacunas DOM coincidiram com as lacunas do relógio lógico; não são evidência de que o coletor perdeu uma mutação. Ainda não há medição da apresentação física.

## Onde estão os custos observados

- A composição determinística da cena levou em média 0,026–0,108 ms; pior amostra 0,3–0,6 ms, com até sete elementos. Isso afasta o resolvedor de cena como causa principal dos picos observados nesta rodada.
- O Profiler da superfície teve p95 de 0,5–0,8 ms, mas commits individuais chegaram a 43,5–51,5 ms. A timeline ficou com p95 2,3–3,9 ms e pior commit 8,4–17 ms.
- Chromium reportou 2, 4, 5 e 5 long tasks por cenário, totalizando 153, 256, 331 e 369 ms na rota do editor. Elas coincidem com commits longos, mas isso sozinho não prova causalidade. É necessário correlacionar cada `startTime` com a trace do Chromium para achar a tarefa específica.
- Heap JS amostrado ficou entre 86,9 e 137,8 MB. Amostragem de ~800 ms pode perder picos curtos; não inclui memória nativa/GPU.
- Os vídeos e áudios passaram por `play` em Chromium para MP4, WebM, WAV e OGG; não houve erros de decodificação. Desvio absoluto máximo observado entre relógio e mídia: ~64,7 ms (menos de dois quadros a 30 FPS). Este é um teste de reprodução sintética nesse Chromium, não garantia de compatibilidade de todos os arquivos/códecs.
- GC não foi observável via `PerformanceObserver` neste Chromium (`gcSupported: false`). Memória de processo, GPU e compositor também não foram medidos.
- IPC: listagem 16 chamadas, média 60,6 ms/pior 97,06 ms; load 4, média 117,77/pior 135,65 ms; save 7, média 314,42/pior 475,99 ms. São operações de setup/persistência, não chamadas por quadro. Salvamento continua uma fronteira de desempenho importante para projetos com assets grandes.
- O trace CDP separado contém 57.436 eventos em cinco segundos. Foi capturado depois do cenário leve, portanto não contaminou as métricas tabuladas. O arquivo local é `out/editor-v6-stress/light-playback-trace.json`.

## Interação e quadros observados

O cenário médio completou seek (73 ms), edição/duplicação de bloco (218 ms) e pause/resume (1.011 ms); 5 blocos de fala tornaram-se 6. As quatro personagens tiveram transições durante o Play. Para cada quadro perdido, distinguimos: relógio lógico (frame pedido pelo playback), atualização React/DOM (`data-frame`), RAF que observa DOM e apresentação física. Os três primeiros são capturados; o último exige instrumentação de compositor/hardware e permanece desconhecido. Isso corrige a ambiguidade histórica dos quadros 108, 146 e 121: não se deve tratar uma amostra ausente do observador antigo como prova de falha de apresentação.

## Comparação e interpretação

O registro histórico imediatamente anterior, em execuções curtas, tinha p95 RAF de 13,6–13,7 ms, picos de 66–80 ms e 115–126 ms de long tasks. A nova rodada com 30 segundos elevou picos até 93,4 ms e long tasks até 369 ms. O setup de instrumentação e a duração mudaram, portanto não é comparação controlada nem evidência de regressão ou melhoria. A memoização da camada evita renders React quando os campos visuais não mudam e tem testes de regressão; ainda não demonstrou redução confiável dos piores picos.

Política atual de recuperação: o relógio usa tempo monotônico e deriva o frame do tempo decorrido, descartando quadros intermediários atrasados, sem acumular lentidão. É adequada para manter sincronismo temporal, mas pode reduzir a suavidade em picos. Repetir quadros preservaria cadência de apresentação ao custo de atrasar timeline e áudio. A escolha deve ser reavaliada com medição de apresentação física.

## Execução e validações

O runner usa electron-vite diretamente num perfil/porta isolados para não disparar a migração `predev` do perfil normal. `GACHA_VIDEO_STRESS_OFFSCREEN=1` exige caminho de dados explícito e absoluto. Cenários exercitados: leve, médio, pesado, multimídia e interação (integrada ao médio). Validação complementar: `npm run typecheck`, `npm run test:editor-v6`, `npm run test:editor-v6:surface`, `npm run test:editor-v6:export`, `npm run test:editor-v6:motion` e `npm run audit:architecture`.

Não foi executado build/lançamento do instalável portátil. Logo, este teste não valida o executável empacotado, GPU em hardware diferente, exportação no cenário de 30 segundos, nem apresentação física sem perdas.

## Próximas medições de maior valor

1. Correlacionar timestamps das long tasks e commits acima de 16,7 ms com o trace CDP e localizar funções/tarefas concretas.
2. Repetir pelo menos três rodadas idênticas, distinguindo warm-up, tracing e carga do sistema, para quantificar variação.
3. Obter métrica de quadros apresentados pelo compositor; não inferir isso de RAF nem MutationObserver.
4. Comparar a memoização com uma rodada A/B controlada usando o mesmo build, fixture, warm-up e máquina.
5. Medir salvar/abrir com projetos grandes e então desenhar persistência incremental de assets com fixtures legadas e recuperação após interrupção.
