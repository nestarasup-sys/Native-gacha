# Pesquisa 1.1 — export de 18/11/2026

## Medição de referência

Relatório local `b679959f-5d81-4dfe-9f1d-d2d8a9c60458.report.json` do build limpo `45e009f0`. Para localizá-lo pela raiz, use `rg --files --no-ignore app-data -g 'b679959f*.report.json'`. O relatório contém caminhos locais. Use números agregados no Git.

| Item | Resultado |
| --- | ---: |
| Vídeo / configuração | 6.000 quadros, 200 s, 1080p, 30 FPS |
| Encoder / paralelismo | libopenh264, Turbo com 2 workers |
| Tempo do processo principal | 200,84 s |
| Preparação global de transições | 48,58 s |
| Renderização da tentativa | 147,23 s, 40,75 FPS efetivos |
| Finalização | 4,83 s |
| Trechos concluídos | 20 |
| Quadros desenhados / reaproveitados | 1.710 / 4.290 |
| Quadros de uma / duas camadas | 1.200 / 4.800 |
| Bytes brutos escritos | 89.579.520.000 |
| Capturas descartadas | 413 de 2.123 (19,5%) |

Os tempos seguintes são somas dos workers e se sobrepõem. Captura 116,95 s, incluindo 87,39 s em `capturePage` e 19,90 s em conversão. Escrita FFmpeg 94,60 s, dos quais 19,78 s ficaram descobertos pela renderização antecipada no mesmo worker. Abertura dos renderizadores 37,54 s, com 15,09 s em navegação e 22,12 s aguardando prontidão depois dela. Montar os snapshots somou 36,82 ms. Boca por trecho 25,13 s. Composição facial 43,6 ms. Preparação de imagens por quadro 8,34 s.

O relatório do processo principal não inclui necessariamente toda a preparação anterior ao IPC. Para comparar a espera percebida, registre também o tempo do clique ao MP4 validado. A renderização avançou a 40,75 FPS para um vídeo de 30 FPS. Nesse caso, a preparação global e a finalização aproximaram o total da duração do vídeo.

## Repetição pareada — 8 ms e alpha crop

O segundo corte foi executado na mesma cópia verificada, faixa `[0, 6000)`, 1920×1080/30, Turbo com dois workers, `libopenh264`, boca, cabelo, áudio e 6 vídeos. O relatório está em `out/editor-v6-stress/runs/actual-project-2026-11-18T08-41-31-158Z-10320/stress-export-validation.json`; o controle anterior com a mesma captura de 8 ms está em `.../actual-project-2026-11-18T08-29-44-675Z-2744/stress-export-validation.json`.

| Métrica | Controle | Repetição |
| --- | ---: | ---: |
| Clique → validado | 209,87 s | 206,06 s |
| Preparação global | 46,49 s | 45,76 s |
| Renderização | 144,33 s | 141,25 s |
| Capturas descartadas | 429 / 2.139 | 423 / 2.133 |
| Crop detection somado | 39,83 s | 39,61 s |
| Quadros renderizados / reutilizados | 1.710 / 4.290 | 1.710 / 4.290 |

A queda total de 1,8% não estabelece causalidade. O scan 32-bit dá cerca de 4,9× contra a implementação anterior no microbenchmark sintético, com os mesmos limites, mas a captura completa do Canvas domina `cropDetectionMs`; no corte real a fase mudou apenas 0,22 s. A mudança não é responsável pelo export lento.

O relatório mostra `capturePageMs` 88,98 s, conversão BGRA 18,89 s, `ffmpegWriteMs` 91,13 s, `ffmpegWriteUncoveredMs` 21,34 s e inicialização de workers 32,11 s, todos somados por trechos em paralelo. Esses números se sobrepõem e não podem ser somados como tempo de parede. FFmpeg chegou a ~575% CPU, renderer ~152%, GPU ~110%; a máquina estava sob contenção de processamento. O gargalo é a trilha de captura/transferência/encode do render, com custos de inicialização por trecho e pressão de CPU. AMF deu tempo equivalente em corte curto, e 4 workers deram apenas ~5,5% de vantagem sobre 2; não justificam trocar o padrão.

Limitação: o preset 2 de cabelo reproduzido é o preset de laboratório, fingerprint `2a0f0859cffe0f64477b98f71aa06eaec21bad1f6d5c32e41067ce761c2abba9`; o estado exato da UI não pôde ser extraído do perfil. O par mede throughput, não identidade visual do preset. Para mudar desenho ou escala, ainda é necessário comparar quadros decodificados com um preset exato.

## Hipóteses prioritárias

1. **Captura descartada.** O token protege a ordem e a qualidade. Medir em uma fixture com muitos quadros únicos se dá para sincronizar a primeira captura com o compositor sem aumentar a espera dos casos que já passam na primeira tentativa. A taxa de rejeição sozinha não prova ganho.
2. **Preparação global de transições.** Ela é uma fase serial em relação à tentativa e custou quase 49 s neste corte. Ver `exportReadiness.ts`, `prepareMotions.ts` e `motionIpc.ts` em `electron/domains/editorV6/`. Comparar espera de fila, bake, IPC e trabalho repetido antes de alterar concorrência ou amostragem.
3. **Prontidão dos workers.** Os custos de navegação e prontidão superaram a montagem do snapshot. Investigar a inicialização em `exportWorker.tsx`, incluindo carregamento de cabelo. Se o relatório não separar os custos, medir fases internas em uma fixture curta antes de propor reuso de janelas. Qualquer reuso fica restrito ao job.
4. **Pipe e boca.** A espera descoberta sugere verificar o pipe por trecho, principalmente com vídeo. O custo facial foi residual aqui. Reserve mudanças na boca para casos em que tempo por trecho, atlas e sobreposição indiquem efeito sobre o tempo total.

O relatório de 21.914 quadros de hoje tem outro intervalo e não serve sozinho como controle A/B deste corte. A de 6.000 quadros do dia 15 usou AMF, enquanto a atual usou CPU. Isolar encoder, intervalo, opções, conteúdo e carga da máquina antes de atribuir diferenças a commits.

## Rodada de partes e renderização C++

- 600 quadros/parte: 201,45 s clique→validado; 138,58 s de render; 45,01 s de preparação de movimento; 20,61 s de boca somada; 10 partes; 94,56 GB BGRA. Passou validação de fluxo, duração, 6.000 quadros, áudio, 9 emendas e limpeza.
- 1.200 quadros/parte: 209,20 s; 145,22 s de render; 46,10 s de movimento; 22,96 s de boca; 6 partes; 99,53 GB BGRA. Passou as mesmas verificações, mas foi 7,75 s mais lento com cronômetro idêntico. Menos inicializações não compensou o volume por trecho.
- A referência padrão de 300 quadros é relatório antigo sem cronômetro de clique. O total calculado 211,88 s (main+preparação) não se compara com click→validado. O comparador agora marca bases distintas, não calcula delta e mostra revisão/dirty.
- Renderer C++ em amostra de 40 s falhou por assets acima de 512 MiB antes de produzir vídeo. O relatório parcial não permite dizer se seria mais rápido depois do limite; primeiro é preciso reduzir/medir os assets transportados sem eliminar imagens válidas.
- Repetir a amostra C++ com partes de 300 em vez de 600 não evitou o teto: 512 MiB foram excedidos novamente. O limite não depende apenas da duração do worker; investigar retenção/cache global do processo antes de experimentar novo tamanho de parte.
- O analisador agora aceita o agregado do benchmark e produz uma linha clara de custos sobrepostos. No corte 1.200 somou 188,34 s de roundtrip, 95,83 s em `capturePage`, 21,56 s na conversão BGRA, 99,22 s de escrita FFmpeg e 19,86 s descobertos. FFmpeg atingiu 454% CPU; main 3,87 GiB; `export-renderer` 1,61 GiB. Esses tempos de worker não são aditivos e confirmam trabalho simultâneo limitado por CPU e cópia de quadros.
- Perfil exato ainda não verificável contra o relatório antigo: o fingerprint do cabelo não estava nele. Os dois novos candidatos usaram o mesmo preset de laboratório 2, fingerprint `2a0f0859...`; revisão/dirty aparecem no relatório de 1.200, mas faltam no relatório de 600.
- Um corte pareado de 40 s com bake concurrency 2/3 não indicou ganho: 44,318/45,151 s. O terceiro bake aumentou preparação e render por frações pequenas; manter 2 até uma amostra maior contradizer o resultado.
- Melhor oportunidade continua sendo reduzir custo de frame/captura e bytes transferidos sem mudar pixels. Medir roundtrip, captura, escrita FFmpeg, BGRA total e RSS/GPU. A meta 90 s exige aceleração de aproximadamente 2,23× sobre o melhor corte medido.

## Experimentos adicionais — 18/11

### Rodada do lote 600 e custo do render

- O corte completo de 200 s com lote 600/4 workers terminou em 187,864 s, contra 194,502 s com lote 300/4 workers (−3,4%). Ambos validaram 6.000 quadros, AAC, emendas e limpeza. Um MP4 curto de 600 comparado a dois controles 300 deu SSIM 0,996211 nos dois pares; a amostra curta de 600 tinha dois workers por conter só duas partes.
- Com a evidência combinada, 600 passou a ser o padrão. 1.200 segue rejeitado por desempenho. Nenhum material de exportação é reutilizado entre jobs.
- A fase de render ainda consome 125,563 s, acima do alvo total de 90 s. No relatório completo, as somas de worker foram 119,86 s em `capturePage`, 20,89 s em conversão BGRA e 200,99 s em escrita FFmpeg; são medidas sobrepostas, não parede. Resolução da cena (272 ms somados), face (8 ms) e commit React (175 ms) não justificam otimização neste momento.
- Um teste `ffconcat` sintético reproduziu exatamente 3/2/4 quadros repetidos apenas com `option framerate 30`; sem taxa explícita quantizou 4/1/4. Rejeitado para produção porque não reduz a quantidade de quadros CFR que o H.264 precisa emitir e depende de timestamp/arquivos temporários sem benefício observado.

- O scan de chaves visuais para emitir vários quadros repetidos em uma chamada reduziu trabalho IPC em partes, mas no corte completo ficou 194,773 s contra 194,502 s no controle de lote 300. Rejeitado e removido do código: simplificar chamadas sem reduzir captura nem escrita não acelerou a exportação.
- `paint-event` inicialmente expirou sem localizar o token. Corrigi a leitura de padding e a amostra de 40 s passou, mas levou 46,078 s contra 42,632 s no controle de captura padrão. A correção experimental também foi removida; manter `capturePage` como captura padrão.
- Próxima hipótese deve evitar a leitura integral por `capturePage` ou reduzir de forma verificável o custo de codificação/cópia de quadros. Começar por fixture e paridade pixel a pixel. Captura `paint-event`, encoder Media Foundation, mais workers, retry de 8 ms e concat não deram ganho robusto.

- `h264_mf` codifica uma fonte já renderizada 1,9× mais rápido que OpenH264 em 40 s e preserva SSIM/PSNR no trecho. Ao recolocar o encoder no export integral curto, a parede ficou praticamente idêntica: 44,282 s contra 44,318 s. A codificação acelera isoladamente, mas está escondida pelo custo de renderizar/capturar; não é alavanca do tempo total.
- O experimento `paint-event` foi inválido operacionalmente: houve timeout por falta do token exato em 63,79 s. O teste R36 também documenta que callbacks podem ser coalescidos. Não usar esse modo para produção até existir transporte de quadro com token e paridade demonstrada.
- Com 1.200 quadros, duas partes de 600 não permitem quatro processos concorrentes. O harness reportava quatro como solicitado sem comprovar paralelismo efetivo; agora o plano rejeita `workers > parts`. Dois pares curtos em lote 300 deram medianas 46,951 s (2) e 43,857 s (4), −6,6%. Em lote 200, 2/6 deram 48,927/44,262 s, −9,5%.
- O par completo em lote 300 isolou workers: 2 = 210,963 s, 4 = 194,502 s, 6 = 192,850 s. Delta 2→4: −16,461 s (−7,8%); 2→6: −18,113 s (−8,6%). Resolução, FPS, encoder, preset, áudio, duração e 19 emendas idênticos; todas as validações e limpeza passaram.
- Renderização: 145,97/130,30/128,22 s. Preparação global: 45,93/45,11/45,70 s. Os seis workers ganharam apenas 1,65 s sobre quatro, com pico GPU ~1,49 contra ~1,20 GiB. Decisão: Turbo CPU = quatro; encoder GPU = dois. O texto visual não anuncia fator “2×”.
- A soma de bake de boca por worker cresceu de 25,02 para 84,44 e 155,84 s; não é parede e se sobrepõe ao render. Os mesmos 43 atlas foram preparados, sem estado ignorado ou obsoleto. Isso sugere fila/contenda do bake facial com o renderer, não geração duplicada. Instrumentar espera de fila e tempo de bake efetivo antes de otimizar/cachear.
- As execuções de laboratório não retiveram MP4 nem compararam hashes de imagem; FFprobe confirmou 6.000 quadros H.264/1080p/30, AAC de 200 s e emendas. A paridade visual byte a byte entre workers ainda não está medida. A meta 90 s continua aberta: o melhor total é 192,850 s.

## Resultado novo — captura serial das camadas

O modo stacked capturava uma superfície de 1920×2160 nos trechos com vídeo. O serial captura cada camada em 1920×1080. No A/B curto, serial caiu de 42,639 para 39,659 s (−6,99%); ambos produziram 1.200 quadros H.264, AAC de 40 s e passaram emenda/limpeza. SSIM decodificado foi 0,999603. A fixture existente comparou 240 camadas: 225 exatas, 15 com diferença máxima de 1 LSB, sem diferença alpha ou amostras fora da tolerância.

No A/B completo pareado, stacked levou 179,261 s e serial 162,689 s (−9,25%), ambos com 4 workers, 3 threads, 6.000 quadros, AAC por 200 s e 9 emendas. A renderização caiu de 124,655 para 108,670 s. O comparador registra `single+stacked` versus `single+serial`. Depois da medição, serial foi promovido como padrão nos trechos com vídeo; um export padrão curto sem variável de laboratório confirmou `single+serial`, 1.200 quadros, áudio e zero erros de limpeza.

A meta de 90 s continua aberta. O próximo trabalho deve reduzir a captura/readback ou a composição por quadro. Descartar duplicatas dentro do FFmpeg não ajudou, pois todos os 94,56 GB de BGRA ainda passam pelo pipe antes do filtro.

## Resultado novo — export UI padrão e custo após preparação

O corte padrão sem simplificação levou 163,760 s em `[0,6000)`, com CPU OpenH264, quatro workers, boca/piscadas/transições, Preset 2 e áudio. Validou vídeo 1080p/30, 6.000 quadros, AAC por 200 s, nove emendas e limpeza. A fase de renderização foi 109,489 s; preparação global, 36,806 s. Serial já estava ativo; este resultado confirma o export real padrão, não constitui A/B contra stacked.

As somas de timing por worker se sobrepõem: roundtrip 227,34 s; escrita FFmpeg 176,17 s; IPC de desenho 118,87 s; captura `capturePage` 82,07 s. Houve 1.654 quadros renderizados, 4.346 reutilizados e 297 readbacks obsoletos. O relatório aponta trabalho no caminho de captura, IPC e backpressure do pipe/encoder. A composição facial direta soma menos de 0,1 s. A preparação da boca criou 36 atlas e somou 49,49 s em workers, com 37,23 s de fila sobreposta; cache de movimento teve apenas um hit. A melhor hipótese seguinte é reduzir roundtrips e custo de cópia/backpressure sem mudar pixels ou contagem de quadros.

O A/B pareado confirma que a estratégia de surface importa mais que a contagem de retries: stacked→serial reduziu `capturePage` de 114,65 para 82,05 s somados por worker, conversão/cópia (`captureBitmap`) de 20,67 para 14,60 s, `ffmpegWrite` de 193,78 para 172,20 s e IPC de desenho de 132,66 para 118,51 s. Os readbacks obsoletos subiram de 193 para 283. O ganho veio de capturar camadas em superfícies de 1080p, mesmo com mais retries; não repetir testes de retry como próximo foco.

## Preparação de boca durante o render

No corte padrão de 200 s, 10 trechos prepararam 36 atlas de boca: 49,49 s somados em preparação, 56,00 s em bake e 37,23 s em espera de fila (medidas somadas por worker, sobrepostas). A primeira hipótese foi antecipar os mesmos bakes de todos os trechos antes de abrir os renderizadores. No A/B de 40 s, isso passou de 40,920 para 41,617 s (+1,7%); a renderização subiu de 21,001 para 22,461 s. Os dois exports preservaram seis atlas, 1.200 quadros, áudio e limpeza; SSIM do candidato contra o início do export integral: 0,999956. Rejeitado: o bake e a renderização já se sobrepõem de forma útil.

O próximo teste deve eliminar trabalho repetido no preparo por estado, crop ou codificação de atlas com evidência de identidade visual. Reduzir somente chamadas de IPC, mover o mesmo bake para outra fase ou desligar animações não é candidato. A estratégia de buffers de camadas independentes também foi medida e rejeitada (+7,2% no corte de 40 s); o padrão combinado continua intacto. Os relatórios das duas comparações estão nas pastas `mouth-*40s-2026-11-18` e `serial-buffer-*40s-2026-11-18`.

O agregado indicava dois workers incorretamente; run e tentativa confirmaram quatro, a política de CPU Turbo. Corrigi o JSON com nota transparente e o agregador agora usa a contagem observada. A meta de 90 s segue sem atingir.

## Evidência nova — perfil padrão (18/11)

- `paint-event` preservou os pixels no A/B quadro a quadro, mas perdeu 2,077 s no corte integral frente ao padrão; manter `capturePage`.
- 4 workers foram melhores que 2 em 80 s (−5,278 s). No mesmo corte de 120 s, 6 workers foram 1,365 s mais lentos que 4 e elevaram a fila de boca de 23,956 para 49,278 s; manter quatro.
- Concorrência 3 de boca reduziu a fila no corte de 120 s e ganhou 1,900 s, mas no integral empatou/perdeu 0,110 s. Lote de boca 300 também ficou 0,296 s mais lento em 120 s. Não trocar os padrões.
- Os contadores do cache de geometria agora atravessam o schema IPC: integral registrou 117 hits/95 misses. Ainda é necessário um A/B de parede para converter a taxa de reutilização em ganho demonstrado.
- Nova prioridade: perfilar a captura do frame/roundtrip IPC/pipe a partir dos relatórios serializados; os testes de paralelismo e estratégia de captura não justificam alterar os padrões atuais.
- Teste posterior: lookahead de dois quadros teve ganho de 0,3% no corte de 120 s, insuficiente para promover mais buffers. A gravação continua sequencial; não manter o candidato nem repetir em 200 s.
- Threads do encoder 2 vs. 3 deram diferença pequena em um único corte de 120 s; faltam medições pareadas e não há justificativa para mudar a configuração automática.

## Lote de boca 1.200 no perfil padrão — 18/11

Foi autorizado repetir o mesmo corte `[0,6000)` para otimizar o tempo. Mantive simplificação desligada (`includeSpeechMouth=true`), boca, piscadas, transições, cabelo Preset 2, seis clipes de áudio, CPU OpenH264, quatro workers, 1080p/30 e todos os demais parâmetros do perfil padrão. Somente o lote da boca mudou de 600 para 1.200 quadros; não houve C++.

| Métrica | Padrão 600 | Teste 1.200 |
| --- | ---: | ---: |
| Clique → MP4 validado | 163,760 s | 165,006 s |
| Renderização | 109,489 s | 110,280 s |
| Preparação global | 36,806 s | 37,505 s |
| Partes | 10 | 6 |
| Atlas de boca | 36 | 33 |
| Bake de boca, soma dos workers | 55,999 s | 104,882 s |

Ambos passaram validação de 6.000 quadros H.264 1080p/30, AAC e 200 s, com nove emendas no padrão e cinco no candidato (seis partes), sem erro de limpeza. SSIM entre as saídas decodificadas foi 0,996784. A comparação preservou qualidade próxima, mas o candidato foi 1,247 s (0,76%) mais lento. O bake somado não é tempo de parede; mesmo com 3 atlas a menos, cresceu 87%, indicando que a redução de partes não simplifica o trabalho de boca. Rejeitar o lote 1.200 e conservar 600.

Relatório: `out/editor-v6-stress/runs/standard-mouth-batch1200-full200-2026-11-18/stress-export-validation.json`. O MP4 comparador e marcador permanecem na pasta de laboratório porque a ferramenta do ambiente bloqueou sua remoção. A exportação padrão não lê nem reaproveita essa pasta. Nenhuma mudança de código ou de perfil foi promovida; a meta de 90 s ainda não foi atingida.

## Reuso de quadro antes da chamada IPC — 18/11

Em 40 s do mesmo perfil padrão com todas as animações, um pré-plano identificou 880 quadros repetidos e pulou suas chamadas ao worker. Os hashes amostrados permaneceram idênticos, mas o tempo total foi 40,705 s contra 40,631 s no controle (+0,18%); a renderização economizou 0,179 s e o planejamento adicionou 0,187 s. Rejeitado: o IPC evitado não representa parcela suficiente do tempo de parede. O foco deve permanecer na captura/cópia do bitmap e no transporte/escrita para FFmpeg, preservando `capturePage` e o pipeline padrão até haver candidato com ganho medido. Não houve compilação ou teste C++.

## Handoff de captura — 18/11

Um yield de event loop em 40 s terminou em 40,248 s contra 40,631 s no controle, mas teve 4 capturas antigas a menos e fase de preparação 0,960 s menor; a renderização foi 0,298 s maior. A amostra não atribui o delta ao yield. Um gate de `requestAnimationFrame` reduziu leituras antigas no corte integral de 297 para 254 e `capturePage` agregado de 82,07 para 80,13 s. Mesmo com a leitura mais barata, o clique→validado foi 164,139 s contra 163,760 s. Preservar o handoff atual: a captura já é token-verificada e aguardar a próxima pintura desloca custo sem reduzir o tempo de parede. O próximo candidato precisa reduzir o custo real do frame ou transferir/codificar pixels com menos CPU, sem suprimir animações nem diminuir a saída.

## Rodada curta — export padrão completo, sem C++ (18/11)

- Controle de 40 s: 40,631 s; 1.200 quadros, CPU OpenH264, boca, piscadas, transições, Preset 2 e áudio ativos. O caminho de entrada PNG lossless salvou só 320 imagens e descreveu 880 repetições, mas levou 60,422 s. Codificar/escrever PNG custou 27,542 s e gerou 2,015 GB; finalização FFmpeg, 17,628 s. O relatório passou, mas o custo de PNG superou a economia do pipe. Removido integralmente; não repetir nem promover.
- O caminho existente `paint-event` no mesmo corte levou 40,020 s. A renderização ficou virtualmente igual (20,723 vs. 20,750 s); preparação variou 0,837 s para baixo. A soma `paintWait` foi 11,829 s contra 12,016 s de `capturePage`, mas bitmap e escrita FFmpeg subiram. O delta total de 0,611 s não prova aceleração: A/B anterior de 200 s piorou com `paint-event` e já havia comparação pixel a pixel.
- Decisão: nenhum candidato altera o export padrão. Trocar a API de captura não resolveu o tempo total; `ipcDraw`/roundtrip, leitura/cópia e backpressure seguem como medidas correlacionadas. Próxima rodada deve instrumentar e reduzir trabalho sustentado dentro do desenho/renderer, sem eliminar animações, trocar a qualidade ou mudar para C++.
- Relatórios isolados: `out/editor-v6-stress/runs/standard-variable-frame-40s-2026-11-18/` e `out/editor-v6-stress/runs/standard-paint-event-40s-2026-11-18/`. Nenhum MP4 de teste foi retido.

## Transporte do resultado do renderer

No relatório padrão de 80 s, a função renderer somou 10,62 s entre workers, quase todo o trabalho interno conhecido (10,46 s); `ipcDraw` somou 54,81 s. Subtrair renderer de `ipcDraw` deixa cerca de 44,19 s de resíduo associado ao caminho `executeJavaScript`, também somado e sobreposto. É uma pista de pesquisa, não prova de gargalo de parede.

Uma tentativa curta substituiu a chamada JS por solicitação/resposta IPC. No perfil padrão completo de 40 s, o controle passou em 41,273 s e o candidato em 42,229 s (+2,3%). Os hashes amostrados dos quadros 0, 29 e 259 coincidiram; ambos validaram 1.200 quadros e a emenda. Sem ganho: rota por evento removida, sem export integral com ela.

A próxima hipótese deve reduzir custo de captura/conversão ou backpressure de FFmpeg sem acrescentar roundtrip por quadro. Medir tempo de parede e validar as animações no perfil normal. A instrumentação do renderer permanece para distinguir execução interna de comunicação sem alterar o transporte de produção.
