# Editor V6 — Rodada 01: baseline local

Data: 30/10/2026  
Base: commit `98bea62` na branch local temporária `codex/editor-v6-performance-mouth`.  
Ambiente: Windows, Electron/Chromium offscreen, fixtures sintéticas; nenhum perfil, personagem ou asset pessoal foi aberto.

## Timeline

`npm run test:editor-v6` passou: 185 testes aprovados, 1 skip. `npm run bench:editor-v6:visible-motion` comparou os mesmos planos e encontrou:

| Cenário | Blocos | Varredura completa (mediana) | Trecho visível (mediana) | Pares consultados |
| --- | ---: | ---: | ---: | ---: |
| Planos de movimento | 30.000 | 80,313 ms / 29.999 pares | 0,133 ms | 34 |

O teste offscreen executou 30 s por cenário, com 4 personagens sintéticos. A janela Chromium estava sem throttling. p95 é o intervalo entre callbacks RAF e não comprova apresentação física pelo monitor.

| Cenário | Blocos | Nós de bloco no viewport | p95 RAF | Maior intervalo | Atualizações DOM/s | Lacunas lógicas/DOM |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Leve | 80 | 10 | 13,6 ms | 13,9 ms | 29,97 | 0 / 0 |
| Médio | 284 | 31 | 13,6 ms | 26,9 ms | 30,02 | 0 / 0 |
| Pesado | 752 | 31 | 13,6 ms | 13,8 ms | 29,94 | 0 / 0 |
| Multimídia | 288 | não registrado | 13,6 ms | 13,9 ms | 29,96 | 0 / 0 |

O caso de interação integrado ao cenário médio levou 29 ms no seek, 79 ms para duplicar um bloco e 832 ms em pausa/retomada (com espera deliberada de playback); total 861 ms. Não mede isoladamente zoom, rolagem contínua, resize ou arraste. A cena de stress existente não excede 752 blocos, então o resultado não representa dezenas de milhares de nós.

## Exportação e boca

O baseline confirmou no código que o painel inicializa `mouthLoop: false`, exibe um checkbox que pode desligá-lo e `exportRunner` só prepara a boca quando essa opção é verdadeira. Isso não satisfaz o requisito de animação obrigatória.

O teste real Electron/FFmpeg `npm run test:editor-v6:export` passou na regressão existente: 81 quadros no Turbo, continuidade do áudio e transição de pose verificadas, mas a execução global reportou `fallback: true`. O teste inclui uma cena sintética de 301 quadros com a opção de boca ligada (mock de bake pequeno):

| Métrica | Baseline |
| --- | ---: |
| Duração | 2.513 s |
| Throughput efetivo | 119,8 fps |
| RSS de pico do processo main | 141,1 MiB |
| Quadros | 301 / 301 |
| Preparação de 16 atlases | 1,54 ms, atlas mock total 12.288 pixels |
| p95 de round-trip do frame (parte de 300 quadros) | 37,8 ms |
| Captura registrada | 930,65 ms |
| FFmpeg write registrado | 62,43 ms |

O fixture acima testa emendas/fase e entrega de atlas, mas não é um benchmark de rasterização facial real: o bake é mockado e os sprites têm 16×16. A medição de 100×100 em `npm run test:editor-v6:motion-service` registrou 13,74 ms para hit de cache e comparação fria/quente; também é muito menor que personagens reais.

`npm run test:editor-v6:face-export-silent` passou com 40 quadros sintéticos e estados idle/talk/blink/talk-blink, mas deliberadamente não usa o loop. `npm run test:editor-v6:export-overlay` passou com 60 quadros em duas partes Turbo, sem testar rosto.

## Limites do baseline

- O relatório de export existente mede RSS do processo main. Ele não separa a memória dos renderizadores Chromium nem do FFmpeg.
- A rodada não tem uma fixture de personagem facial de alta resolução exportada em 720p e 1080p para comparar nitidez antes/depois. A hipótese de redução está demonstrada pelo `ratio < 1` possível no atlas de personagem inteiro em `bakeMotion.ts`, mas a queda visual no MP4 ainda precisa de evidência com fixture real adequada.
- O script de stress grava p95 de RAF, profiler React e contagem de blocos visíveis, mas não grava contagem total de nós DOM nem os tempos separados de scroll/zoom/drag.
- Nenhum número de GPU, memória de renderer/FFmpeg, latência física de input ou qualidade H.264 deve ser inferido desses dados.
