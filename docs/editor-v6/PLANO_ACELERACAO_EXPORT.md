# Editor V6 — plano de aceleração máxima do export

Data: 30/10/2026. Base inicial de análise: branch `Dev-V2`, commit `b79aaaf`.
Estado: em andamento. Otimizações, medições e verificações ficam registradas abaixo; a comparação real está concluída para a configuração atual, e a otimização do gargalo de preparação ainda está pendente.

## Objetivo

Reduzir o tempo entre clicar em Exportar e receber o MP4 validado, incluindo preparação, renderização, codificação, áudio e publicação. Buscar o maior ganho comprovado no computador disponível, preservando resolução, 30 FPS, movimentos, expressões, roupas, transparências, ordem das camadas e sincronização de áudio.

A prévia continua com o comportamento atual: a presença das animações na exportação não exige habilitá-las na prévia.

Não prometer um multiplicador antes das medições. A duração total e a estabilidade determinam se uma otimização entra em produção.

## Ponto de partida confirmado no código

| Área | Recursos existentes | Oportunidade a investigar |
| --- | --- | --- |
| Preparação de poses | `prepareMotions.ts` agrupa transições por chave e reaproveita resultados do projeto | Evitar buscas completas repetidas e medir o custo de anexar cada resultado ao documento |
| Serviço de movimento | `motionIpc.ts` possui cache em memória/disco, janelas reutilizadas e concorrência configurável | Medir acertos reais, invalidação, tamanho e contenção antes de aumentar concorrência |
| Renderização | `exportWorker.tsx` mantém imagens preparadas e chaves visuais | Reduzir resolução de cena, trabalho React e preparação repetida por quadro |
| Captura | Export possui reaproveitamento de bitmap e tempos por fase | Identificar quando captura, IPC, cópia de memória ou espera do Chromium dominam |
| Paralelismo | Turbo usa até dois trechos; fallback usa um renderizador | Distribuir trabalho pelo custo e testar limites de CPU, GPU e memória |
| Codificação | Seleção automática NVENC/QSV/AMF com OpenH264 de recuperação | Medir o caminho completo; encoder rápido pode continuar esperando quadros |
| Finalização | Concatenação com cópia de vídeo, mixagem única, validação e publicação protegida | Medir composição de vídeos, áudio, emendas e tempo de finalização separadamente |

Referências: [exportação](EXPORTACAO.md), [preparação de transições](PREPARACAO_TRANSICOES.md), [arquitetura](ARQUITETURA_E_INTEGRACAO.md) e [testes offscreen](TESTES_DE_ESTRESSE_OFFSCREEN.md). Estes documentos continuam sendo a referência dos contratos existentes.

## 1. Estabelecer uma medição confiável — prioridade máxima

- Separar tempo total em leitura/validação, preparação de poses, preparação facial, abertura de workers, renderização/codificação, mixagem/junção, validação e publicação.
- Aproveitar `motionPreparation` e `frameTiming` dos relatórios existentes. Acrescentar métricas compatíveis quando necessário, sem somar tempos concorrentes como se fossem tempo total.
- Registrar acertos e falhas dos caches no serviço, bytes carregados, pico de memória e quantidade de workers/processos. `requested` na preparação não equivale a rasterização: pode recuperar cache do serviço.
- Capturar no relatório o RSS inicial e o pico amostrado do processo principal, identificando explicitamente que esse dado não inclui renderizadores, GPU ou FFmpeg. Correlacionar com medições externas antes de inferir o pico total do app.
- Registrar o tempo agregado de preparação dos atlases do loop da boca em `mouthAnimation.preparationMilliseconds`, separado do tempo de renderização; a soma cobre trechos processados em paralelo e não deve ser tratada como tempo de parede.
- Dividir o orçamento dos atlases do loop da boca pela concorrência real de trechos do export. O limite passa a controlar o total simultâneo em Turbo, e continua respeitando o teto de pixels por atlas.
- Identificar o caminho que limita o término do export. Ordenar as próximas mudanças pelo tempo recuperável nesse caminho.
- Registrar máquina, versão do app, encoder, resolução, intervalo, opções, estado dos caches e duração da mídia para cada comparação.

**Entrega:** tabela de referência e três maiores custos, com evidência. Nenhum ganho é declarado usando apenas a velocidade do encoder ou uma fixture pequena.

### Primeira linha de base disponível

O relatório local `f75c3a26-0e6f-433d-9b05-dfc8de17fdb9.report.json` registra 5.700 quadros (190 s), exportados em 361,3 s: fator 1,90× a duração. A tentativa usou AMF, Turbo em duas partes concorrentes e criou 20 partes de 300 quadros. Renderizou 1.649 quadros e reutilizou 4.051 bitmaps. A preparação registrou 89 transições distintas em 55,9 s, sem reaproveitamento; o loop opcional de boca produziu 201 atlases e somou 143.620.670 bytes ao longo dos 20 trechos. O limite de 64 MiB em `prepareMouthLoops.ts` é aplicado a cada trecho, não ao total do relatório; portanto, esse valor agregado não demonstra violação do limite. Como duas partes rodam ao mesmo tempo, o pico simultâneo pode chegar à soma dos orçamentos por trecho; o relatório atual não mede esse pico. Esta é uma referência histórica anterior à preparação de movimentos em lote, não uma comparação posterior nem prova de ganho. O relatório fica em `app-data` local e não deve ser adicionado ao Git.

### Comparação sintética de um e dois workers

Em 30/10/2026, `node scripts/editor-v6/test-stress-offscreen.cjs --export-stress --compare-workers` exportou seis vezes o mesmo documento sintético de estresse, carregado uma vez no Electron offscreen e executado na ordem 1, 2, 2, 1, 1, 2 workers. Cada rodada exportou 7.200 quadros (240 s), 320×180, sem mídia ou áudio, com as 284 transições já persistidas; todas as rodadas decodificaram 60 quadros de amostra e confirmaram as 120 transições visíveis. O encoder foi o caminho CPU (`libopenh264`).

| Workers | Rodadas | Mediana do export | Mediana da renderização | Fator export/duração | Pico máximo de RSS do processo principal |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 3 | 42,991 s | 42,306 s | 0,179× | 249.565.184 bytes |
| 2 | 3 | 24,830 s | 24,082 s | 0,103× | 243.818.496 bytes |

Nesta fixture, dois workers reduziram a mediana do tempo total em 42,2% (1,73× mais rápido). A finalização ficou perto de 0,62–0,68 s, então a diferença está na renderização, não na junção. Em uma rodada de Turbo de 20 quadros por segundo/24,8 s, o relatório somou 30,1 s em `ipcDrawMs`, 25,5 s em `rafWaitMs` e 16,1 s em `captureMs` entre partes concorrentes; esses tempos se sobrepõem e não são tempos de parede. O perfil aponta o caminho de desenho/captura por quadro como próximo alvo de investigação. O pico RSS é somente do processo principal e não inclui renderizadores, GPU nem FFmpeg. Esta comparação sintética escolhe dois workers para o perfil testado, mas não substitui o teste no projeto real, não representa outros tamanhos/resoluções e não prova ganho de uma mudança de código. Relatórios e MP4s estão na pasta ignorada `out/editor-v6-stress/runs/2026-10-30T10-51-55-879Z-23232/`; não devem ser adicionados ao Git.

A primeira otimização implementada indexa assets e movimentos uma vez, agrupa chaves em tempo linear e aplica os resultados em uma passagem por blocos, evitando percursos repetidos da timeline e cópias sucessivas de grupos. A preparação dos atlases de boca agora respeita o limite individual e o orçamento dividido entre trechos Turbo simultâneos; excesso impossível é detectado antes de rasterizar. O relatório registra o RSS do processo principal e o tempo acumulado de preparação dos atlases, separados de memória total e tempo de parede. Também separa em `phaseMilliseconds` a criação da pasta temporária, leitura de personagens, preparação de movimentos, testes de encoder, tentativas de renderização, finalização/validação e publicação. A tentativa mantém seu próprio tempo de parede; finalização mede concatenação, áudio e validações, sem confundir trabalho paralelo com tempo total. O tempo total e o pico de RSS agora incluem a publicação do MP4; o relatório só muda para `completed` depois que o arquivo é publicado. O amostrador de RSS inicia imediatamente antes do bloco `try/finally` que o encerra, para que falhas durante a configuração síncrona não deixem um timer órfão. O serviço de movimentos compartilha uma rasterização ainda em andamento para pedidos simultâneos com a mesma chave; cada consumidor pode cancelar sem interromper os demais, e o trabalho é abortado quando ninguém mais aguarda. Testes Electron cobrem deduplicação, isolamento de cancelamento e persistência das métricas de fases no relatório final. `npm run test:editor-v6` passou (170 testes aprovados, um ignorado), `npm run test:editor-v6:motion-service` passou, `npm run test:editor-v6:export` passou com build e cenários de Turbo/fallback/cancelamento, e `npm run audit:architecture` passou sem violações. A medição posterior no projeto completo continua pendente; até lá não se atribui redução de tempo às mudanças.

### Comparação no projeto real de estresse

Em 30/10/2026, o benchmark isolado exportou seis vezes a cópia verificada do projeto `72fbea64-4b18-4d31-9a0c-317f0f519a06`, revisão `2026-10-30T10:09:29.520Z`, na ordem 1, 2, 2, 1, 1, 2 workers. A máquina é um AMD Ryzen 5 4600G (6 núcleos/12 threads), 15,4 GiB de RAM; Electron usou encoder automático, selecionando AMF. As seis rodadas preservaram 5.700 quadros (190 s), 1920×1080, 30 FPS, 28 clipes de áudio, uma entrada de vídeo e saída de áudio. Foram solicitadas 89/89 transições em cada rodada; `reused=0` significa que nenhuma transição já estava embutida no documento do projeto, não informa acertos ou falhas do cache em memória/disco do serviço. A preparação das transições levou aproximadamente 54 s por rodada. A boca gerou de 198 a 201 estados por export, sem estados ignorados ou obsoletos; os 317–319 s de `mouthAnimation.preparationMilliseconds` são tempo agregado entre trechos paralelos, não tempo de parede.

| Workers | Rodadas | Mediana total | Mediana de renderização | Pico máximo de RSS observado no processo principal |
| --- | ---: | ---: | ---: | ---: |
| 1 | 3 | 394,543 s | 313,092 s | 2,679 GiB |
| 2 | 3 | 356,972 s | 275,144 s | 3,286 GiB |

Dois workers reduziram a mediana total em 9,5% (37,571 s; 1,11×) e a renderização em 12,1%, mas elevaram o maior RSS observado em 22,7%. O RSS cresceu ao longo do benchmark sequencial (1,235 GiB na primeira rodada até 3,286 GiB na sexta); isso é um sinal para investigar retenção/ciclo de vida de memória e não permite declarar dois workers como padrão seguro. A diferença entre boca com 198 e 201 estados decorre da divisão dos trechos concorrentes. A primeira comparação real está concluída, porém não existe relatório pré-mudança da mesma revisão e com as mesmas opções; portanto, esses números comparam apenas 1 vs. 2 workers e não demonstram ganho das otimizações anteriores. Projeto e mídias originais foram comparados com a cópia de backup: os 297 arquivos do projeto tiveram hashes idênticos. Relatórios e vídeos ficam na pasta ignorada `out/editor-v6-stress/runs/actual-project-2026-10-30T11-22-38-700Z-25376/`, fora do Git.

**Custos dominantes medidos:** renderização (275–313 s por export), preparação acumulada de boca (aprox. 318 s somados entre trechos) e preparação de movimentos (aprox. 54 s). Os probes iniciais tiveram 89 faltas e rasterizações por export, sem hits nem erros de validação/leitura. Os fingerprints da chave, do plano e do personagem ficaram idênticos entre exports consecutivos; portanto, as entradas permanecem estáveis. A evidência do diretório mostrou o limite de 384 arquivos e depois 440 arquivos/511,6 MiB, com transições sendo expulsas pelos atlas da boca. O cache agora tem limite de 512 entradas/768 MiB e descarte LRU. No primeiro probe após o ajuste, o export gravou 465 entradas (555 MB reportados; diretório final com 529,4 MiB). O segundo encontrou 485 itens em disco, sem faltas nem rasterizações; 89 eram as transições e o restante cobriu preparações da boca. A fase de transições caiu de 55,314 s para 0,884 s. O total caiu de 392,456 s para 187,555 s (52,2% menos; 2,09× mais rápido) e a renderização de 309,997 s para 159,516 s (48,5% menos). O maior RSS do processo principal foi 1,511 GiB nessa repetição; o relatório não inclui renderizadores, GPU ou FFmpeg.

Um probe adicional validou três exports consecutivos do mesmo projeto e opções, todos com um worker. No primeiro, as 89 transições foram rasterizadas; nos exports 2 e 3, as 89 foram lidas do cache, sem faltas, rejeições, erros de leitura ou rasterizações. O contador total confirmou 485 acertos em disco por export aquecido, incluindo os atlas de boca. As chaves, fingerprints do plano e fingerprints dos personagens amostrados foram idênticos nas três rodadas. O primeiro export levou 388,168 s; a mediana dos dois aquecidos foi 187,121 s (51,8% menor). A mediana de renderização caiu de 305,712 s para 159,142 s (47,9% menor). O RSS máximo do processo principal variou de 1,481 a 1,816 GiB entre rodadas; isso não mede renderizadores, GPU nem FFmpeg, então ainda não é uma medição de memória total. Todas as rodadas validaram 5.700 quadros, 1920×1080, 30 FPS, 28 clipes de áudio, uma entrada de vídeo e áudio de saída. Relatório: `out/editor-v6-stress/runs/actual-project-2026-10-30T13-40-42-057Z-11324/stress-export-validation.json`. Esses resultados demonstram ganho reproduzível em cache aquecido, não no primeiro export frio. A comparação anterior de workers continua indicando ganho menor com 2 workers e RSS maior; não altera o padrão. Próximo gargalo: reduzir o custo de renderização/boca e medir a memória total dos processos do export.

Em 30/10/2026, repeti o benchmark real com três rodadas de 1 worker seguidas por três de 2 workers, para evitar alternância de configurações durante o aquecimento. A validação passou em todas: 5.700 quadros, 1920×1080, 30 FPS, áudio e vídeo presentes. As primeiras rodadas de cada grupo foram frias (1 worker: 465 misses; 2 workers: 384 misses); as duas seguintes de cada grupo foram aquecidas, com 485 e 491 hits e zero rasterizações. Nas rodadas aquecidas, 1 worker teve mediana de 191,975 s total e 162,833 s de renderização; 2 workers, 164,441 s e 133,621 s (14,3% menos tempo total e 17,9% menos renderização). O maior RSS medido no processo principal foi 2,012 GiB com 1 worker e 3,349 GiB com 2 workers (+66,5%); os números não incluem renderizadores, GPU nem FFmpeg.

Não adotei 2 workers como padrão. `prepareMouthLoops.ts` divide o limite de pixels por `concurrentParts`: nos exports aquecidos, os atlas usaram 414.422.928 pixels com 1 worker e 218.431.984 com 2 (aproximadamente metade), embora todos os estados tenham sido preparados. Os vídeos também diferiram em 5.677/5.700 hashes; a comparação AMF mostrou SSIM 0,977 e PSNR médio 20,08 dB, mas repetições da mesma configuração também tiveram hashes diferentes (159/5.700 com 1 worker e 665/5.700 com 2) e SSIM de 0,979 entre as duas saídas aquecidas com 2 workers. Portanto, a codificação AMF introduz variação suficiente para impedir atribuir toda a diferença visual à concorrência; a redução objetiva da resolução dos atlas e o RSS muito maior já bastam para rejeitar a configuração como padrão seguro até uma medição controlada adicional. A mudança no harness só agrupou as rodadas; não alterou o comportamento do export. Relatórios, vídeos e comparações estão na pasta ignorada `out/editor-v6-stress/runs/grouped-workers-2026-10-30T18-00-00/`.

Em 30/10/2026, repeti as seis rodadas na mesma cópia verificada do projeto, com 1 worker três vezes e depois 2 workers três vezes, e amostrei a árvore inteira de processos a cada 10 s. As seis saídas passaram pelo validador: 5.700 quadros, 1920×1080, 30 FPS, 190 s, áudio e emendas decodificadas. A mediana total foi 209,433 s com 1 worker e 156,042 s com 2 (25,5% menor); nas duas rodadas aquecidas de cada grupo, 208,5 s e 154,95 s (25,6% menor). A renderização mediana caiu de 181,072 s para 128,127 s. O pico de RSS do processo principal foi 1,80 GiB e 2,26 GiB, respectivamente. Somando todos os processos descendentes, o maior working set observado foi 3,08 GiB e 4,25 GiB; a soma da memória privada foi 3,12 GiB e 5,03 GiB. Working set pode contar páginas compartilhadas mais de uma vez; a memória privada é uma estimativa do comprometimento agregado e não inclui memória de GPU. A memória livre do Windows variou de cerca de 1 a 3 GiB durante a medição, sem falha do export, mas o pico com 2 workers ainda representa um custo relevante. O resultado reforça a troca entre velocidade e memória e não remove a ressalva visual dos atlas/AMF da comparação anterior; 2 workers seguem sem ser adotados como padrão. Relatório: `out/editor-v6-stress/runs/external-memory-workers-2026-10-30T16-05-00-UTC/stress-export-validation.json`; amostras: `out/editor-v6-stress/telemetry/external-memory-workers-2026-10-30T16-05-00-UTC/process-memory.csv` (ambos ignorados pelo Git).

### Tentativa descartada: usar o evento `paint` como bitmap final

O relatório de quadro identificou chamadas de captura como um custo candidato. Testei entregar diretamente o `NativeImage` recebido no evento `paint`, mantendo a invalidação e a espera pelo compositor, para remover o `capturePage()` seguinte. O export terminou e passou as verificações de formato, mas a comparação visual rejeitou a mudança: os 5.700 hashes de quadro diferiram do baseline; o quadro 0 virou apenas o fundo vazio. O baseline anterior teve SSIM 1,0 entre suas duas rodadas, enquanto o novo vídeo contra baseline teve SSIM 0,691 e PSNR médio 8,58 dB. Portanto, o evento pode anteceder a imagem final mesmo quando seus tipos descrevem um quadro completo. A mudança foi revertida. O tempo aquecido parecido não conta como ganho, pois a saída visual estava incorreta. Manter `capturePage()` até existir um sinal confiável de que a imagem final correspondente ao desenho terminou de compor.

Testei também trocar as duas esperas consecutivas de `requestAnimationFrame` do renderer por uma só, mantendo `waitForOffscreenPaint()` e `capturePage()`. A mediana aquecida caiu de 187,121 s para 178,050 s, mas a comparação do vídeo invalidou o ganho: 5.230 de 5.700 hashes diferiram. O quadro 0 ficou vazio, o fundo apareceu preto em amostras posteriores e o estado de blink no quadro 10 mudou em relação ao baseline. As três exportações passaram as validações de estrutura, o que demonstra que contagem de quadros e `ffprobe` não detectam essa regressão visual. A mudança foi revertida; as duas esperas permanecem necessárias para estabilizar a pintura.

Na etapa do encoder, comparei três reencodes AMF com os argumentos atuais contra três com `-quality speed`, alternando a ordem e mantendo bitrate de 12 Mbps, perfil e GOP. As medianas foram iguais (17,265 s); `speed` aumentou o arquivo de 239.440.058 para 253.665.240 bytes (+5,9%). Como o teste isolou o encoder reencodando o MP4 de referência e não demonstrou ganho, não apliquei a opção nem fiz export completo com ela.

Como evidência complementar, `npm run bench:editor-v6:motion-preparation` comparou uma implementação legada e indexada em uma fixture sintética de 120 personagens e 2.400 planos, por cinco rodadas: medianas de 139,82 ms e 8,59 ms (16,27×), com os mesmos 2.400 planos concluídos. Esse benchmark cobre o índice de preparação antecipada no renderer, não o `prepareExportMotions` do exportador nem o projeto real; portanto, serve para validar a técnica de indexação e não para estimar o ganho de export.

### Tentativa descartada: ampliar o cache de movimento em memória

O serviço mantinha no máximo oito resultados e aproximadamente 24 MB em memória. Como um export aquecido registrava 485 hits no cache de movimento e apenas quatro hits em memória, testei um LRU com teto de 256 entradas e até 1% da RAM, limitado entre 24 e 128 MiB. No projeto real, os exports aquecidos ainda tiveram só 12 hits em memória e 473 leituras do disco, que somaram 561,6 MB. A mediana aquecida foi 198,070 s, contra 191,975 s na comparação agrupada anterior; não houve ganho reproduzível e o volume lido do disco quase não mudou. Reverti a alteração para evitar manter uma reserva maior de RAM sem benefício demonstrado. Relatórios: `out/editor-v6-stress/runs/memory-cache-128m-2026-10-30T19-00-00/stress-export-validation.json` e `out/editor-v6-stress/runs/grouped-workers-2026-10-30T18-00-00/stress-export-validation.json`.

Os tempos por quadro do export aquecido de referência apontam o próximo custo: 88,9 s acumulados em `frameRoundTripMs`, 57,4 s em `ffmpegWriteMs`, 48,1 s em `ipcDrawMs`, 39,4 s em `captureMs` e 24,7 s em `rafWaitMs`, frente a 165,1 s de tempo de parede da fase de renderização. Essas métricas por quadro se sobrepõem e não devem ser somadas. O cache maior não alterou esse caminho; a próxima investigação deve reduzir chamadas/esperas por quadro ou o custo de captura, preservando o ciclo de pintura já validado.

### Tentativa descartada: agrupar quadros visuais consecutivos

Implementei temporariamente um retorno `repeatFrames` limitado a 300 quadros, calculado pela mesma chave visual que já controla a reutilização de capturas. O processo principal repetia o bitmap para manter todos os quadros no FFmpeg, mas deixava de chamar o renderer para quadros consecutivos idênticos. No projeto real, os pedidos ao renderer caíram de 5.700 para 1.711 por export (−70%), com 1.711 capturas e 3.989 quadros reutilizados, e a validação estrutural confirmou 5.700 quadros, 30 FPS, 190 s e áudio. A comparação do vídeo antes/depois teve SSIM 0,999990 e PSNR médio 66,83 dB.

O ganho de tempo não se confirmou: a mediana aquecida foi 194,099 s, contra 191,975 s antes (+1,1%); renderização foi 164,454 s contra 162,833 s. `frameRoundTripMs` caiu de 88,9 s para 83,0 s e `ipcDrawMs` de 48,1 s para 42,1 s, mas `ffmpegWriteMs` subiu de 57,4 s para 61,9 s. A redução de IPC foi absorvida por custos de captura/escrita e variação entre exports. Reverti a mudança por não reduzir o tempo total medido. Evidência em `out/editor-v6-stress/runs/identical-frame-batch-2026-10-30T20-00-00/stress-export-validation.json` e `out/editor-v6-stress/runs/grouped-workers-2026-10-30T18-00-00/stress-export-validation.json`; os relatórios detalhados e vídeos estão nas mesmas pastas ignoradas.

### Tentativa descartada: agrupar escritas ao FFmpeg

Como `ffmpegWriteMs` somou 65–67 s nas rodadas aquecidas, testei `cork()`/`uncork()` com lotes limitados a 64 MiB, aguardando os callbacks antes de liberar cada lote. No mesmo projeto, os dois exports aquecidos levaram em mediana 220,073 s no total e 194,064 s na renderização, contra 208,515 s e 180,140 s na referência (+5,5% e +7,7%). A comparação SSIM do segundo export aquecido com a referência foi 0,994629; todas as saídas passaram a validação estrutural de 5.700 quadros, 30 FPS, 190 s, áudio e 18 emendas, mas os arquivos candidatos ficaram menores (153.105.361 bytes contra 159.170.123). A análise do caminho também encontrou um risco de integridade: `exportWorkers.ts` reutiliza o mesmo `layeredBitmap` e o sobrescreve a cada quadro, enquanto o lote mantém as referências aos buffers sem aguardar sua leitura. A contagem e duração corretas não garantem os pixels corretos nessa fila. Descartei a alteração; `exportRunner.ts` voltou ao envio serial com contrapressão por quadro. Relatórios, MP4s e comparação estão em `out/editor-v6-stress/runs/frame-write-batch-2026-10-30T16-40-00-UTC/` (pasta ignorada).

### Validações independentes em paralelo, com limite

A finalização de uma rodada aquecida levou 27,5 s. Repeti as operações de validação no MP4 isolado: o FFprobe com `-count_frames` levou 20,2 s e as 18 verificações de emenda, 3,0 s sequenciais. Mantive ambas as verificações e passei a executá-las em paralelo, limitando as emendas a duas verificações simultâneas. `Promise.allSettled` aguarda os dois fluxos e cada lote inteiro antes de propagar qualquer falha; cancelamento continua ligado ao mesmo `AbortSignal`.

No benchmark integral, as três rodadas passaram: 5.700 quadros, 1920×1080, 30 FPS, 190 s, áudio válido e 18 emendas verificadas. A mediana aquecida da finalização caiu de 27,594 s para 25,875 s (1,719 s; 6,2%). A mediana do export completo não caiu nesta comparação (199,569 s contra 191,975 s), pois a renderização variou e continua dominando; não atribuo ganho global a esta etapa isolada. O vídeo antes/depois teve SSIM 1,000000 e PSNR médio 83,63 dB. Relatórios em `out/editor-v6-stress/runs/parallel-final-validation-2026-10-30T21-00-00/stress-export-validation.json` e `out/editor-v6-stress/runs/grouped-workers-2026-10-30T18-00-00/stress-export-validation.json`.

### Tentativa descartada: transmitir camadas sem montar o bitmap duplo

Para eliminar as cópias das camadas capturadas para um buffer BGRA de altura dupla, enviei os buffers imutáveis de fundo e primeiro plano como duas escritas consecutivas, agrupadas apenas dentro do quadro. Cada par aguardava os callbacks antes de renderizar o próximo quadro, evitando sobrescrita enquanto o FFmpeg ainda lia os dados. As três rodadas passaram pela validação estrutural (5.700 quadros, 1920×1080, 30 FPS, 190 s, áudio e 18 emendas). Contra a referência estável `grouped-workers`, a mediana aquecida piorou: 199,525 s total e 173,106 s renderizando, versus 193,915 s e 165,145 s (+2,9% e +4,8%). No trecho 2, `ffmpegWriteMs` somou 70,075 s contra 55,150 s. A comparação visual do trecho correspondente teve SSIM 0,999994; 38 hashes de quadro diferiram, diferença compatível com a variação de codificação e sem queda relevante de similaridade. Como o caminho ficou mais lento, removi a implementação e mantive a montagem/cópia atual. Relatório e vídeos em `out/editor-v6-stress/runs/split-layer-buffers-2026-10-30T22-00-00/` (ignorados pelo Git).

### Tentativa descartada: sobrepor no máximo dois quadros ao FFmpeg

Com os buffers imutáveis por camada, experimentei manter no máximo dois quadros pendentes por trecho, aguardando os callbacks antes de abrir espaço na fila e antes de finalizar o MP4. Isso sobrepôs a captura seguinte à escrita anterior sem permitir mutação dos buffers pendentes. As três saídas passaram pelas validações estruturais e o trecho comparado com o baseline teve SSIM 1,000000. Porém, a mediana das três rodadas foi 200,863 s total e 173,616 s renderizando, contra 193,915 s e 165,145 s na referência (+3,6% e +5,1%). O pico de RSS principal chegou a 1,95 GiB. Reverti a fila e a transmissão por camadas; continuam valendo a contrapressão serial e o buffer duplo reutilizado. Relatórios e vídeos em `out/editor-v6-stress/runs/bounded-frame-pipeline-2026-10-30T23-00-00/` (ignorados pelo Git).

### Proteção contra cancelamento durante registro de listeners

Fechei uma corrida rara em que o sinal podia ser cancelado depois da verificação inicial, mas antes de o listener `abort` ser registrado. `waitForExport` e `waitForOffscreenPaint` agora verificam o sinal outra vez imediatamente após registrar o listener; `spawnExportProcess` também encerra o processo se o cancelamento ocorrer nessa janela. Isso evita aguardar o timeout com a operação já cancelada e reduz o risco de deixar FFmpeg ativo. Typecheck, auditoria de arquitetura e build passaram; a correção foi revisada no fluxo de cancelamento do export e dos workers.

### Preservação da causa quando a limpeza falha

O `finally` do export podia substituir o erro original se a gravação final do relatório ou a remoção dos temporários falhasse. Também podia propagar uma falha de limpeza após o MP4 ter sido publicado, deixando a interface indicar falha apesar do arquivo válido existir. Agora, falhas anteriores à publicação preservam a causa original e agregam erros de relatório/limpeza; depois da publicação, limpeza incompleta vira aviso e o relatório tenta registrar esse aviso. `ENOENT` ao remover o candidato é tratado como já removido. Typecheck, auditoria de arquitetura e build passaram.

### Validação da duração ao importar trilha de áudio

A trilha de exportação usava somente `format.duration` do FFprobe e deixava o schema rejeitar o resultado caso viesse ausente, pouco claro para o usuário. Agora usa a duração da faixa de áudio como fallback, rejeita duração ausente/inválida e arquivos vazios antes de copiar, e aplica o limite de duração do Editor V6. O teste IPC verificou o fallback de duração e que entrada inválida não inicia cópia. Essa mudança melhora a confiabilidade do fluxo de mídia; não representa uma otimização de tempo de export.

### Limite efetivo ao ler entradas do cache de movimento

O cache de disco verificava o tamanho com `stat` antes de `readFile`; se uma entrada mudasse entre as operações, a leitura ainda podia alocar além do limite de 32 MiB. Agora a leitura em fluxo interrompe assim que excede esse teto, mesmo com arquivo alterado durante a leitura. Entradas excessivas ou danificadas viram falta de cache e são recalculadas, sem alterar documentos nem enfraquecer a validação do checksum e do atlas. A verificação focada também cobre rejeição de uma entrada acima do limite. Depois da mudança, `npm run test:editor-v6:export` passou: 81 quadros, 78 reutilizados, emenda de áudio, fallback Turbo, cancelamento preservando o destino, movimento na emenda, saída Full HD e preloads sandbox.

### Chave de cache para layout de vídeo

Na revisão das chaves visuais, confirmei que elementos e recortes de atlas usados pelo `SceneSurface` entram na chave, mas o layout de `mediaVideo` não. Isso podia reutilizar uma captura antiga se o mesmo vídeo e o mesmo quadro de origem aparecessem com posição, tamanho ou rotação diferentes. A chave compartilhada agora inclui o layout. A regressão focada passou (16 testes no arquivo de movimento); `npm run test:editor-v6:export` também passou com 81 quadros, recuperação Turbo, cancelamento preservando o destino, emenda de áudio, movimento na emenda e saída Full HD. Typecheck, auditoria de arquitetura e build passaram.

### Validação da duração antes de planejar o export

`planEditorV6Export` já rejeitava intervalos e resoluções inválidos, mas podia aceitar uma duração `NaN`, infinita, fracionária ou fora do intervalo seguro de inteiros: a comparação `endFrame > durationFrames` não rejeita `NaN`. Agora a duração precisa ser um inteiro seguro positivo antes de planejar qualquer parte, evitando encaminhar dados inválidos ao restante do pipeline. O teste focado cobriu seis durações inválidas; 5 testes do arquivo passaram, além de typecheck, auditoria de arquitetura e build.

## 2. Remover trabalho repetido da preparação — prioridade alta

- Construir índices de assets, personagens, blocos e transições uma vez por preparação; evitar percorrer toda a timeline dentro de cada grupo.
- Investigar aplicação dos resultados em lote para reduzir cópias repetidas do documento, preservando IDs, anexos e semântica das funções compartilhadas.
- Preparar somente estados realmente usados e visíveis no intervalo exportado, respeitando estados herdados de blocos anteriores ao início do intervalo.
- Compartilhar uma tarefa em andamento quando a mesma chave for pedida novamente. Cancelar um consumidor não pode interromper trabalho ainda necessário por outro.
- Medir preparação de boca por trecho/lote e reaproveitar estados equivalentes quando a chave incluir todas as dependências visuais.

**Aceite:** pedidos e trabalho efetivo acompanham combinações únicas válidas; a saída permanece equivalente em intervalos completos e parciais.

## 3. Tornar os caches confiáveis e úteis — prioridade alta

- Auditar as chaves existentes antes de criar outro cache. Considerar revisão/conteúdo da fonte, personagem, rig, roupa, pose, expressão, parâmetros e versão do algoritmo conforme cada resultado realmente depende deles.
- Editar a folha original ou uma pose deve invalidar os resultados dependentes. Não aceitar uma imagem antiga só porque seu ID continua igual.
- Manter cache descartável, com limite em bytes, descarte por uso e recuperação diante de entrada incompleta/corrompida.
- Preservar separação entre catálogo-fonte, personagem e documento do Editor V6. Cache não vira cópia permanente do catálogo nem reescreve projetos.
- Reavaliar preparação antecipada ociosa já existente: priorizar estados úteis, suspender durante interação e evitar disputar recursos com export ativo.

**Aceite:** export aquecido evita preparação desnecessária; editar uma dependência atualiza a imagem correta; falha de cache causa reconstrução segura.

## 4. Reduzir o custo de cada quadro — prioridade alta

- Usar os tempos de resolução de cena, preparação de assets, commit React, espera de desenho, captura e IPC para escolher o primeiro alvo.
- Investigar índices temporais para localizar blocos ativos sem varrer a timeline inteira a cada quadro, preservando sobreposições e limites de blocos.
- Reutilizar composição estática, geometria e imagens quando suas dependências não mudarem. Separar camadas estáticas e animadas apenas se a medição justificar o custo adicional.
- Auditar as chaves visuais: incluir atlas, recorte, boca, piscar, pose, transformação e ordem de camadas. Uma chave incompleta pode congelar animações.
- Reaproveitar captura estática mantendo todos os quadros devidos no stream de 30 FPS. Vídeo e áudio continuam avançando mesmo quando um bitmap de personagem se repete.
- Reduzir alocações e cópias BGRA no caminho worker → main → FFmpeg quando as medições apontarem esse custo. Preservar tamanho, stride, alpha e ciclo de vida dos buffers.
- Só trocar esperas de desenho por outro mecanismo após demonstrar captura correta de SVG, fontes, imagens e transparências em Chromium.

**Aceite:** diminuir o custo da fase dominante sem quadros antigos, cortes de camada ou divergência visual.

## 5. Usar melhor CPU, GPU e memória — prioridade após reduzir desperdício

- Comparar um e dois workers com o mesmo projeto. Testar quantidades maiores apenas como experimento limitado por recursos, sem aumentar o padrão automaticamente.
- Investigar fila dinâmica de partes: partes desiguais em custo não devem deixar um worker ocioso enquanto outro termina sozinho.
- Equilibrar tamanho dos trechos, custo de abertura e reutilização de workers. Mais partes também aumentam preparação, emendas e validações.
- Respeitar pressão de memória e limites de sessões do encoder. Limitar tanto tarefas quanto bytes em trânsito; manter contrapressão na escrita do FFmpeg.
- Comparar encoder por hardware e CPU no tempo total e na qualidade. Alterações de parâmetros precisam preservar compatibilidade entre partes.
- Manter recuperação previsível e cancelamento completo. Reaproveitar partes após falha só pode ser proposto com validação de integridade e compatibilidade demonstrada.

**Aceite:** escolher a configuração com menor tempo total estável; não selecionar a que apenas usa mais CPU/GPU.

## 6. Experimentos estruturais — somente se os custos restantes justificarem

| Experimento | Quando investigar | Condição para adotar |
| --- | --- | --- |
| Compositor dedicado Canvas/WebGL | DOM/React ou captura dominam após as otimizações anteriores | Paridade de roupas, máscaras, texto, efeitos e camadas; manter contratos compartilhados |
| Transferência de frames em lotes | IPC domina e há memória disponível | Fila limitada, cancelamento imediato e nenhuma perda de quadros |
| Caminho de captura/codificação com menos cópias | Cópias BGRA dominam e a plataforma permite | Compatibilidade comprovada com Electron e fallback funcional |
| Cache de trechos renderizados | Reexports parciais são frequentes e predominantes | Dependências completas, encoder compatível, limites de disco e publicação segura |

Cada experimento precisa de comparação isolada e possibilidade de remoção. Evitar substituir o renderizador inteiro sem evidência de que ele limita o export.

## Matriz de validação e desempenho

Usar como referência principal obrigatória o **único projeto atualmente existente no Editor V6**, que o usuário já montou como teste de estresse. Medir o export completo desse projeto antes e depois das otimizações, preservando sua timeline, personagens, vídeos, falas, pensamentos, poses, expressões e presets. Registrar o ID e a revisão do documento no início da execução para comparar exatamente o mesmo conteúdo, mesmo que outros projetos sejam criados depois.

Preservar o projeto original e suas mídias. Criar uma cópia de segurança verificável antes da execução e usar cópia isolada para cenários que alterem fontes, dados ou provoquem falhas. Salvar MP4s e relatórios de cada rodada em destinos distintos. Fixtures sintéticas ficam como complemento para isolar regressões e cenários ausentes; a aprovação de desempenho exige a comparação no projeto de estresse existente.

| Cenário | O que conferir |
| --- | --- |
| Cena estática longa | Reutilização de bitmap sem reduzir duração ou contagem de quadros |
| Muitas poses e roupas | Preparação por combinação, vínculos e alinhamento corretos |
| Fala, pensamento, expressões e presets PT | Variações visuais, boca, piscar e transições sem congelamentos |
| Timeline desordenada de 3–4 minutos | Sobreposições, memória, distribuição de carga e tempo total |
| Vídeos e áudios sobrepostos | Recortes, ganho, silêncio, composição e sincronização |
| Export parcial e cortes durante movimento | Estado anterior ao início e continuidade nas emendas |
| Fonte editada após cache aquecido | Invalidação correta; nenhuma imagem antiga |
| Cancelamento, falha de worker/encoder | Processos liberados, destino anterior preservado e recuperação |

Para cada candidato: comparar referência e mudança no mesmo ambiente, alternando a ordem, com pelo menos três rodadas por condição relevante. Separar cache frio, aquecido e reabertura do app; nunca limpar dados pessoais para simular cache frio.

Registrar mediana, dispersão, memória, quadros renderizados/reutilizados e falhas. Usar ganho `tempo de referência / tempo novo` e fator `tempo de export / duração do vídeo`; fator menor indica export mais rápido. Não misturar resoluções, opções ou qualidade entre variantes.

Validar contagem de quadros, 30 FPS, resolução, duração, áudio e emendas com os mecanismos existentes. Conferir amostras visuais nos pontos difíceis; hash do MP4 comprimido não demonstra equivalência visual. Testes sonoros automatizados ficam silenciosos; reprodução no PC somente quando solicitada, com volume baixo.

## Sequência de entregas

1. **Diagnóstico:** concluído para o projeto `72fbea64-4b18-4d31-9a0c-317f0f519a06`, com backup verificado e comparação de workers; estabelecer a captura de um relatório baseline da mesma revisão/opções para avaliar mudanças de código.
2. **Preparação:** índices, aplicação em lote e eliminação de pedidos repetidos conforme evidência.
3. **Cache:** invalidação auditada, limites e preparação antecipada útil.
4. **Quadros:** reduzir resolução de cena, commits, captura ou cópias conforme o maior custo restante.
5. **Agendamento e encoder:** testar distribuição de partes e limites de concorrência.
6. **Experimentos estruturais:** executar somente os que atacarem gargalos comprovados.

Cada entrega deve conter diff pequeno, verificação focada, comparação antes/depois, documentação dos contratos alterados e commit local. Executar typecheck, auditoria de arquitetura, testes relevantes do Editor V6 e build quando a implementação atingir esses caminhos. Não rodar export pesado para validar uma alteração apenas documental.

## Conclusão de cada etapa

- [ ] Ganho no tempo total reproduzido ou hipótese descartada com registro.
- [x] Comparação de workers realizada no projeto de estresse existente, com o mesmo conteúdo e opções; [ ] comparação antes/depois das otimizações com relatório baseline equivalente.
- [ ] Qualidade, movimentos, presets e áudio preservados.
- [ ] Pico de memória e consumo de disco conhecidos e limitados.
- [ ] Cache atualizado corretamente após edição de fontes.
- [ ] Cancelamento, fallback e destino existente protegidos.
- [ ] Dados originais preservados e commit local revisado.

O plano termina quando os custos dominantes foram tratados ou possuem limite técnico medido, e novas tentativas não apresentam ganho repetível sem comprometer qualidade ou estabilidade. “Aceleração máxima” é uma busca orientada por essas medições, não uma promessa de velocidade ilimitada.
