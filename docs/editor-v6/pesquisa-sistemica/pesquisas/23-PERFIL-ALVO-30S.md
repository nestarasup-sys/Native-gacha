# Pesquisa 23 — perfil de exportação e alvo de 30 segundos

**Data:** 10/11/2026. **Ambiente:** branch `refactor/editor-v6-cold-lab`, Windows, Electron recém-iniciado por benchmark; cópias verificadas do projeto e dados; saída e `app-data` descartáveis. **Meta solicitada:** baixar de cerca de 89 s para 30 s no projeto completo `Teste de Importação — Personagens do Pacote`, mantendo imagem, animação, áudio, vídeos e validação do MP4.

## Conclusão executiva

Os pilotos não entregaram a meta nem justificam promover uma alteração de captura ou de concorrência. O teste frio de 600 quadros é somente triagem, não representa uma exportação completa de 2.394 quadros. `paint-event` eliminou a chamada `capturePage`, mas seu único piloto foi 1,02 s mais lento. Quatro grupos de preparo de cabelo reduziram uma amostra pré-job em 0,65 s e elevaram o pico de memória privada do processo GPU em aproximadamente 77 MiB. O padrão do aplicativo continua em duas lanes e `capturePage`.

O perfil de uma exportação fria anterior do projeto completo marcou 58 s em render, 18 s em motion e cerca de 8 s em preparo de cabelo, dentro de 79,49 s de exportação Main. Portanto, para chegar a 30 s, o trabalho precisa atacar o transporte e a produção de quadros em conjunto; microajustes de preparo não bastam. A soma de timings concorrentes por worker não é tempo de parede.

## Código e cadeia do quadro

- `electron/domains/editorV6/exportRunner.ts`: para cada quadro, aguarda `worker.frame()`, depois grava o bitmap BGRA no stdin de FFmpeg e aguarda callback de escrita. Os trechos de exportação são executados até o limite de parallelism escolhido.
- `electron/domains/editorV6/exportWorkers.ts`: chama `executeJavaScript(renderEditorV6ExportFrame)`, captura a janela por `capturePage` ou assinatura `paint`, valida o token de quadro e copia pixels para um buffer BGRA reutilizado. Vídeo em camadas exige duas capturas por quadro.
- `src/renderer/src/features/editorV6/editorV6HairMotionPreparation.ts`: resolve fontes e presets, monta dois renderizadores por pose (com cabelo e sem cabelo), prepara retratos e superfícies. As caches de estilos/texturas/material são locais à preparação e descartadas; sem reutilização entre exportações.
- `scripts/editor-v6/benchmark-project-export.cjs` cria um perfil novo em cada execução, verifica fontes contra backup autorizado, valida saída e remove MP4/`isolated-app-data`; os relatórios JSON são leves.

## Medições frias

Cada linha representa uma única execução independente, processo/sessão novos. Os pilotos de exportação compararam os primeiros 600 quadros do mesmo projeto; não usar as diferenças como resultado estatístico.

| Caminho | Clique→MP4 validado | Motion | Render | Finalização | IPC desenho | Captura | FFmpeg stdin | Resultado |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `capturePage`, 4 lanes | 22,83 s | 4,66 s | 11,73 s | 1,40 s | 3,12 s | 2,30 s | 4,53 s | MP4/áudio passaram |
| `paint-event`, 4 lanes | 23,85 s | 4,65 s | 12,51 s | 1,45 s | 3,22 s | 1,70 s | 4,67 s | MP4/áudio passaram |
| pré-busca de 1 quadro, `capturePage`, 4 lanes | 24,21 s | 4,62 s | 12,98 s | 1,44 s | — | 2,20 s | 5,95 s | MP4/áudio passaram; implementação revertida |

`paint-event` removeu 1,66 s de `capturePage` e reduziu 0,59 s o tempo agregado de captura, mas a rodada total aumentou 1,02 s. Manter `capturePage` padrão; o caminho paint permanece experimental e sem prova de equivalência RGBA em todas as camadas.

Também foi testada uma fila limitada a um quadro: copiar o bitmap para um buffer próprio, iniciar a escrita ao FFmpeg e renderizar o quadro seguinte durante a espera de escrita anterior. O piloto frio subiu de 22,83 s para 24,21 s; renderização foi 12,98 s e a memória Main atingiu ~896 MiB (amostra anterior ~701 MiB). A fila foi removida do código de produção. O custo adicional de cópia/memória e contenção de CPU não foi pago por sobreposição útil; outro desenho de transferência precisa evitar a cópia e provar ganho antes de retestar.

O preparo pré-job de cabelo no projeto completo foi perfilado sem codificar vídeo. Duas execuções novas deram 8,54 s e 4 grupos deram 7,88 s. O relatório de 4 grupos marcou ~9,81 s somados em montagem de renderizadores, ~8,05 s somados em render facial e maior pico de memória privada GPU (~934 MiB vs ~857 MiB). São acumuladores concorrentes, não parede. Ambas prepararam 140 rigs/superfícies e 0 transições de movimento nessa etapa; isto não é validação da animação no MP4 nem sustenta alteração do padrão.

O cenário anterior de 600 quadros, 2 lanes, também é ruidoso: quatro execuções arquivadas variaram 22,83–25,66 s; 4 lanes foi o menor valor isolado, enquanto 6/8 lanes foram mais lentas. Há uma exportação integral arquivada com 4 lanes sem ganho frente a duas. Não elevar o parallelism global baseado no piloto curto.

## Decisões e próximo experimento

1. **Manter** SVG, `capturePage`, duas lanes em uso normal, FFmpeg/libx264 ultrafast e caches somente dentro do job.
2. **Não promover** `paint-event` nem concorrência 4 para grupos de pose. O seletor de concorrência do cabelo fica restrito ao harness isolado e a 1–4 grupos.
3. Antes de uma mudança estrutural, coletar trace de parede/carga por worker numa exportação completa fria e golden RGBA comparável. Separar custos de `executeJavaScript`, pintura do SVG, readback BGRA, espera de backpressure do FFmpeg e filtros dos quatro vídeos reais.
4. Explorar transporte GPU/nativo sem cópia apenas se um protótipo puder entregar o mesmo BGRA/alpha com memória limitada, cancelamento e fallback. Avaliar VideoFrame/WebCodecs junto com mux de áudio/vídeo, não por benchmark sintético de encoder.
5. Só fazer novo benchmark integral quando uma alteração reduzir de forma visível um estágio dominante no piloto, mantendo o mesmo preset, 2.394 quadros, áudio, vídeos, qualidade e processo frio.

## Artefatos

- `out/editor-v6-stress/runs/target30-pilot-20s-workers4/stress-export-validation.json`
- `out/editor-v6-stress/runs/target30-pilot-20s-paint-event-w4/stress-export-validation.json`
- `out/editor-v6-stress/runs/target30-pipeline-prefetch-20s-w4/stress-export-validation.json`
- `out/editor-v6-stress/runs/hair-prep-workers2-cold-v5/stress-export-validation.json`
- `out/editor-v6-stress/runs/hair-prep-workers4-cold/stress-export-validation.json`

Os caminhos são relativos à raiz do LAB. Os MP4 e perfis temporários foram removidos pelo harness; apenas os relatórios JSON pequenos foram mantidos.
