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
