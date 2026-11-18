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
