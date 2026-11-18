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

## Hipóteses prioritárias

1. **Captura descartada.** O token protege a ordem e a qualidade. Medir em uma fixture com muitos quadros únicos se dá para sincronizar a primeira captura com o compositor sem aumentar a espera dos casos que já passam na primeira tentativa. A taxa de rejeição sozinha não prova ganho.
2. **Preparação global de transições.** Ela é uma fase serial em relação à tentativa e custou quase 49 s neste corte. Ver `exportReadiness.ts`, `prepareMotions.ts` e `motionIpc.ts` em `electron/domains/editorV6/`. Comparar espera de fila, bake, IPC e trabalho repetido antes de alterar concorrência ou amostragem.
3. **Prontidão dos workers.** Os custos de navegação e prontidão superaram a montagem do snapshot. Investigar a inicialização em `exportWorker.tsx`, incluindo carregamento de cabelo. Se o relatório não separar os custos, medir fases internas em uma fixture curta antes de propor reuso de janelas. Qualquer reuso fica restrito ao job.
4. **Pipe e boca.** A espera descoberta sugere verificar o pipe por trecho, principalmente com vídeo. O custo facial foi residual aqui. Reserve mudanças na boca para casos em que tempo por trecho, atlas e sobreposição indiquem efeito sobre o tempo total.

O relatório de 21.914 quadros de hoje tem outro intervalo e não serve sozinho como controle A/B deste corte. A de 6.000 quadros do dia 15 usou AMF, enquanto a atual usou CPU. Isolar encoder, intervalo, opções, conteúdo e carga da máquina antes de atribuir diferenças a commits.
