# Ciclo 3 — periodicidade das transições e compositor

Data dos experimentos: 26/10/2026. Branch de trabalho: `Main-desenvolvimento`.

## Resumo executivo

Os picos acompanham a animação entre poses. Ao mudar a cadência dos blocos de personagens de 250 para 200 e 300 quadros, os picos mudaram junto. Com personagens estáticos ou troca instantânea de pose, as pausas longas desapareceram nos ensaios controlados. Uma trace íntegra mostra a sequência: a primeira amostra animada altera os quatro recortes SVG; depois Chromium decodifica as quatro imagens atlas em raster workers, enquanto a thread do renderer aguarda o commit do compositor.

Isto sustenta que a carga combinada de React/SVG e o primeiro uso do atlas desencadeiam a interrupção. A trace não demonstra que a GPU física seja o gargalo. O protótipo de pré-decodificação começou tarde, aumentou o pior intervalo de 66,6 para 133,3 ms e foi removido. Não foi aplicada otimização de produto sem evidência de benefício.

## A. Estado do repositório

- HEAD no início: `6da3e0c docs(editor-v6): record causal diagnosis and memo benchmark`.
- Branch: `Main-desenvolvimento`; no início estava igual a `origin/Main-desenvolvimento`.
- Alteração local anterior a esta missão: `ABRIR_DESENVOLVIMENTO.bat` (diferença de finais de linha). Foi preservada e não deve entrar em commit.
- O relatório usa medições locais; traces e relatórios detalhados permanecem em `out/editor-v6-stress/` ignorado pelo Git.
- Commits desta missão e HEAD final serão registrados após validação.

## B. Resultado da hipótese dos 250 quadros

O cenário pesado tem 18.000 quadros e 72 blocos por personagem: 250 quadros por bloco. A transição de 250 ms começa 7,5 quadros antes da troca. O plano usa amostras de quadro inteiro; nos dados observados, a janela inicia em `242,5`, a primeira amostra aplicada é no quadro 243 e a última é no quadro 249.

Na rodada de 20 s, os grandes commits React ocorreram nos quadros 244 e 494; gaps de RAF ocorreram logo após as alterações visuais. A trace íntegra de 10 s confirma quatro transições iniciando juntas no quadro 243 e terminando no 249, junto do pico aos 8,124 s. A próxima transição começaria por volta do segundo 16,46, fora da janela dessa trace curta.

## C. Experimentos de distribuição e conteúdo

Rodadas limpas de 20 s, mesma máquina, Electron oculto fora dos monitores, sem trace pesada. São rodadas exploratórias únicas por variante; portanto, não estimam variabilidade estatística.

| Variante | Intervalo de blocos | Transições | p95 RAF | Máximo | RAF >33 ms / >50 ms | Gaps lógicos/DOM | Pico associado |
|---|---:|---:|---:|---:|---:|---:|---|
| Original | 250 quadros | 284 | 13,6 ms | 66,6 ms | 4 / 4 | 2 / 2 | quadros 244, 494 |
| 200 | 200 quadros | 356 | 13,6 ms | 66,5 ms | 5 / 4 | 2 / 2 | quadros 194, 393, 594; janelas começam ~192,5, 392,5, 592,5 |
| 300 | 300 quadros | 236 | 13,6 ms | 66,8 ms | 4 / 4 | 4 / 4 | quadros 292–295 e 592–595; janelas ~292,5 e 592,5 |

Mover a cadência move os picos: a relação temporal é forte, mas o número de outliers varia por execução. Pequenas diferenças de inicialização e relógio explicam a distância de alguns quadros; o harness associa evento ao frame observado, em vez de converter diretamente tempo de parede.

| Controle | Máximo em 20 s | >33 / >50 ms | Resultado |
|---|---:|---:|---|
| Quatro personagens estáticos | 26,7 ms | 0 / 0 | Nenhum gap longo |
| Trocas de pose instantâneas | 14,1 ms | 0 / 0 | Oito mudanças de origem de imagem sem gap longo |
| Uma personagem animando | 14,2 ms nesta rodada | 0 / 0 | Outra rodada de 30 s teve um gap isolado de 66,6 ms; efeito individual é variável |
| Quatro transições isoladas, sem fala/pensamento e fundo estável | 79,9 ms | 4 / 4 | A animação simultânea basta para reproduzir o problema |
| Quatro transições escalonadas em 12 quadros | 40 ms | 1 / 0 | Reduz a maior pausa nesta rodada, mas uma rodada anterior de 30 s não teve gap >33 ms; evidência ainda variável |

## D. O que acontece na transição

1. Antes de Play, as animações são assadas em atlas. Cada atlas de teste tem 8.006.184 pixels, aproximadamente 32,0 MB RGBA decodificados. O trabalho de preparar rigs e atlas (cerca de 0,57–0,63 s por direção nos quatro personagens reais) ocorre no setup de fixture, não por quadro durante reprodução.
2. Ao entrar no primeiro quadro animado, a cena resolvida troca `assetId` para o atlas de movimento e recebe `motionSprite` com recorte e geometria. As quatro imagens SVG passam a usar seus novos `href` e `viewBox`; nos quadros seguintes, `viewBox` e geometria continuam mudando.
3. A resolução compartilhada em `editorV6Timeline.ts` amostra o sprite para cada frame. `SceneSurface` não remonta quatro nós inteiros: altera os atributos da imagem/SVG. Há uma substituição de origem por personagem na entrada da transição e alterações do recorte nos frames seguintes.
4. Na trace íntegra, o pico JavaScript de ~60,3 ms contém commits React da `SceneSurface` (~36,1 ms), cena (~36,6 ms) e página (~37,7 ms). Layout ficou ~0,34 ms e paint ~1,06 ms nessa janela. Portanto, layout/paint DOM não explicam o pico JS.
5. Logo após, a trace vê quatro tarefas `GpuImageDecodeCache::DecodeImage` em raster workers (~58–77 ms; tarefas em paralelo), seguidas de `ImageUploadTaskImpl`/`GpuImageDecodeCache::UploadImage` abaixo de 1 ms. A thread principal aguarda `LayerTreeHost::WaitForCommitCompletion` por ~62 ms, sobreposta à decodificação e ao gap RAF de ~79,8 ms.

Essa sequência é evidência temporal alinhada, não prova isolada de causalidade para cada tarefa Chromium. `WaitForCommitCompletion` é uma espera de pipeline e não identifica por si só a operação causadora. Não há evidência de que a GPU física esteja lenta.

## E. Instrumentação, trace e alinhamento

O harness registra `performance.now()`, `timeOrigin`, pares de `performance.mark` visíveis na trace CDP, marcas de início/fim da reprodução, RAF, quadro lógico/DOM, commits React, tarefas longas, mudanças de imagem/recorte, mutações do SVG, transições e mídia. Os pontos continuam em arquivos locais ignorados.

- Calibração performance/trace na captura íntegra de 10 s: erro máximo de alinhamento entre marcas 0,0877 ms; erro da duração calibrada 0,013 ms. CDP `ts` é monotônico em microssegundos; `performance.now()` é convertido pelo offset medido. `timeOrigin` fica como referência, sem misturar relógios de parede com o monotônico.
- Trace 10 s: `dataLossOccurred:false`, 162.956 eventos brutos, 136.189 normalizados. Permitiu a atribuição descrita acima.
- Trace 30 s com marcas e observador de mutação: `dataLossOccurred:true`; é tratada como potencialmente incompleta e não usada para afirmar ausência de eventos.
- Leitura/análise local da trace de 55.182.497 bytes e 162.956 eventos: ~741 ms de parse; RSS foi de 34,8 MB antes da leitura para 145,8 MB após leitura, 239,4 MB após `JSON.parse` e 434,0 MB após normalização/análise. O parser atual não é incremental em memória. É administrável para a trace curta atual, mas cerca de 400 MB de pico justifica streaming se o ciclo de mídia produzir traces muito maiores. Não foi adicionada dependência ou parser complexo neste ciclo.
- `Tracing.tracingComplete` relatou `false` na trace curta e `true` na trace longa. O estado é tratado como tri-state: ausente é “não informado”, distinto de `false` ou `true`.

## F. Harness e integridade

Foi corrigida a união de intervalos sobrepostos do analisador. Agora calcula `min(start)` e `max(end)` com endpoints originais preservados, combinando fontes sem somar duração inclusiva. Testes cobrem ordem A/B, eventos idênticos, sobreposição parcial, contenção, tipos mistos e intervalos disjuntos.

O harness aceita variantes de fixture via `--experiment`: `frames200`, `frames300`, `static`, `instant`, `isolated-one`, `isolated-four`, `staggered`. Elas alteram somente os dados de teste. O log de cada amostra de transição foi deduplicado por personagem/transição/frame e os planos são indexados por quadro para não varrer todas as janelas a cada RAF.

## G. Pré-decodificação experimental e decisão

Um protótipo temporário tentou chamar `Image.decode()` para atlas até 90 quadros à frente com limite estimado de 128 MiB. Na rodada de 20 s, o primeiro preload só começou aos 10,55 s, depois da transição que precisava antecipar; a decodificação dos quatro atlas levou cerca de 86–188 ms individualmente. O pior RAF foi 133,3 ms contra 66,6 ms na rodada original, com três gaps DOM/lógicos. O heap reportado não é medida de memória de textura/GPU. O código do protótipo foi removido e não deve ser ativado como solução.

Experimento futuro só deve ser considerado após corrigir o agendamento para preparar assets antes do Play ou durante idle, medir pressão de memória real e verificar que o renderer reutiliza efetivamente o recurso decodificado. `HTMLImageElement.decode()` confirma decodificação, mas não prova upload persistente para GPU.

## H. Benchmark completo após mudanças do harness

Quatro cenários offscreen de 30 s executados sequencialmente, sem tracing pesada. Os quatro personagens reais STRESS foram preservados. Os números são do Electron/Chromium de desenvolvimento nesta máquina.

| Cenário | p95 / p99 RAF | Máximo | Gaps RAF >33 / >50 ms | Gaps lógicos/DOM | Commits Surface | Maior commit | FPS DOM |
|---|---:|---:|---:|---:|---:|---:|---:|
| Leve | 13,6 / 13,7 ms | 66,5 ms | 2 / 2 | 1 | 901 | 36,0 ms | 29,93 |
| Médio | 13,6 / 13,7 ms | 66,7 ms | 4 / 3 | 2 | 903 | 35,9 ms | 29,95 |
| Pesado | 13,6 / 13,7 ms | 66,6 ms | 4 / 3 | 2 | 900 | 40,9 ms | 29,90 |
| Multimídia | 13,6 / 13,8 ms | 133 ms | 5 / 4 | 4 | 895 | 54,2 ms | 29,73 |

O cenário multimídia tem H.264/AAC MP4, VP9/Opus WebM, WAV e OGG/Opus. Estado máximo de prontidão de mídia foi 4; drift absoluto máximo observado ficou entre 70,4 e 96,3 ms conforme mídia. Não houve códigos de erro. Isso é uma fixture de reprodução curta, não validação de mixagem/exportação das quatro fontes em conteúdo de produção. A causa dos gaps extras multimídia ainda não foi isolada.

Não existe baseline completo de 30 s antes/depois da correção do harness em condições idênticas. A comparação principal de produto é entre controles da fixture de 20 s, não um A/B de commits.

## I. Testes executados

- `npm run typecheck` — passou antes da remoção do protótipo; repetir no fechamento após a remoção.
- `npm run audit:architecture` — passou: 217 arquivos inspecionados, 0 imports ausentes, 0 violações de fronteira.
- `npm run test:editor-v6` — 49 passaram, 1 teste ignorado.
- `npm run test:editor-v6:surface` — passou; diferença de pixel entre sequência esperada e capturada = 0; painel de export passou.
- `npm run test:editor-v6:motion` — passou; 7 amostras de movimento, 9 rigs preparados.
- `npm run test:editor-v6:export` — passou; 81 quadros, 2 workers, costura de áudio contínua, cancelamento preservou destino. O teste registra a mensagem esperada de renderer de export não autorizado em uma tentativa negativa.
- `npm run test:editor-v6:stress-offscreen` — passou nos quatro cenários de 30 s; sem falhas IPC.
- `npm run test:editor-v6 -- tests/editor-v6/traceAnalyzer.test.ts tests/editor-v6/editorV6StressProjects.test.ts` — 7 passaram, 1 ignorado.
- Captura e análise CDP 10 s — passou e integrou relógios com erro <0,1 ms; captura de 30 s sinalizou perda e foi excluída da conclusão causal.

## J. Apresentação física e janela visível

`requestAnimationFrame`, `data-frame` e observação DOM medem callback e estado DOM, não a apresentação física de cada cena. CDP mostra atividade do compositor e raster; nenhum contador utilizado prova que cada frame foi visto pelo monitor. APIs de frame de `<video>` não medem a composição completa SVG/React.

Os testes ficaram fora da área visível e em perfil temporário. Não foi feita rodada em janela visível: o runner atual controla uma janela Electron de teste e alternar para uma janela interativa poderia tomar foco e interferir no ambiente de trabalho. Resolução, refresh físico e latência de apresentação não foram medidos. Portanto, os resultados não equivalem a validação de monitor.

## K. Persistência e preparação do ciclo seguinte

No estresse de 30 s, os piores tempos IPC observados foram: listar projetos 127,93 ms; carregar 127,1 ms; salvar 328,9 ms (médias agregadas do relatório). Não houve falha IPC. Este ciclo não alterou persistência.

O fixture guarda imagens como `data:image/png;base64` dentro dos assets de documento. Isso duplica texto Base64 quando documentos/relatórios são copiados e aumenta alocação durante parse. A persistência V6 atual deve ser tratada como snapshot de documento JSON e arquivos de mídia são servidos pela camada de arquivos; o caminho de migração é identificar imagens por hash, armazenar binários em CAS compartilhado e manter o JSON com referências. Antes de migrar: mapear schema SQLite e referências CAS compartilhadas, criar fixture legado, medir tamanho/latência, definir transação/rollback e testar falha no meio da gravação. Proxies e thumbnails devem ser derivados determinísticos com chave por hash + parâmetros e removíveis sem afetar originais.

## L. Recomendação para o Ciclo 4

Começar pela persistência e pipeline de mídia em modo somente leitura e medição: localizar schema SQLite/CAS e o fluxo real de salvar/carregar, medir duplicação Base64 e tamanhos reais, depois desenhar uma migração compatível com rollback. Em paralelo, manter o achado de transições como referência; não introduzir preload durante playback até que possa ser agendado antes de Play e demonstrar redução repetível dos gaps sem crescimento de memória.

Próximo experimento de performance com maior valor: repetir ao menos três rodadas por variante para `static`, `instant`, `isolated-four` e baseline, em ordem alternada, sem instrumentation trace; capturar uma trace curta por variante apenas depois, para validar se a relação dos atlases se repete.
