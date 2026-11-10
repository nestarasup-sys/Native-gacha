# Pesquisa 26 — Composição de vídeo em uma passagem

**Data:** 10/11/2026 · **Estado:** análise de código; protótipo e medição pendentes.

## Evidência no caminho atual

`runEditorV6Export` ativa `layeredVideo` quando há pelo menos um overlay no intervalo. O worker desenha o fundo e o primeiro plano em chamadas separadas, mas as chaves de camada podem reutilizar uma imagem capturada anteriormente; portanto, não há duas capturas físicas em todo quadro. Quando uma camada muda, o worker captura seu buffer BGRA de 1920×1080. O FFmpeg separa o buffer empilhado, compõe até quatro overlays de vídeo na camada base e então sobrepõe os elementos de primeiro plano. No SVG, `SceneVideoLayer` está entre o background e os elementos; portanto, essa ordem visual precisa permanecer.

No export completo de referência, renderização ocupou 48,43s dos 76,34s de clique→MP4. Os relatórios existentes não separam o desenho de cada camada. Foi adicionada instrumentação opcional `backgroundDrawMs`/`foregroundDrawMs`, sem mudar pixels nem ordem de operações. No smoke frio de 150 quadros (um vídeo, áudio presente), passou 150/150 e validou MP4; registrou 8 amostras de cada draw, 1 captura de fundo (36,48ms agregados) e 8 capturas de frente (515,99ms). Os draws somaram 71,62ms no fundo e 216,40ms na frente. Isso prova reuso do fundo nesse trecho, mas uma única janela não permite extrapolar os tempos ou frequências ao projeto completo. `ffmpegWriteMs` continua incluindo espera de pipe e não isola CPU de composição.

O export integral frio com a instrumentação passou 2.394/2.394 quadros e validou MP4, 4 entradas de vídeo e áudio em **80,43s** (Main 71,76s; Motion 17,14s; rendering 51,60s). Referência anterior: 76,34s; são amostras únicas e não equivalentes no tempo do host, portanto não atribuir diferença à instrumentação. O relatório contou 456 draws/capturas de foreground e só 8 captures de background. Tempos agregados foreground: draw 6,68s e capture 23,68s; background: draw 1,87s e capture 0,31s. No conjunto, capture 23,99s, dos quais `capturePage` 16,54s e conversão/cópia 4,41s. São tempos concorrentes agregados por workers, não parede. Isso reduz a hipótese de captura duplicada: o fundo quase sempre reutiliza pixels, enquanto a frente é a candidata que merece validação.

## Oportunidade estrutural

Investigar se uma composição final no renderer reduz o custo total, mas primeiro medir as capturas realmente evitadas. O FFmpeg poderia continuar responsável por encoder, áudio/mux e fallback. Como o fundo pode ser reutilizado entre quadros, a passagem única talvez reduza draws mesmo quando não reduz capturas; o ganho não pode ser presumido. Outra variante é manter o FFmpeg como compositor e otimizar a captura frontal sem alterar o contrato de camada.

Esse é um candidato de arquitetura, ainda não uma otimização demonstrada. Desenhar o vídeo num `<video>` do Chromium exigiria seek determinístico em cada quadro, aguardar decode e validar rotação, transparência, timestamps, formatos e todos os codecs importados. Receber os frames do FFmpeg no renderer pode adicionar IPC/cópias ou sincronização; não assumir que uma passagem seja automaticamente mais rápida.

## Próximo ciclo falsificável

1. Diagnóstico simultâneo implementado no harness e desligado por padrão: captura `paint-event`, faz `capturePage` do mesmo estado antes do próximo draw e compara os bytes BGRA/crop/token; somente hashes e diferença por amostra são persistidos.
2. **Paridade pontual passou:** 11/11 imagens exatas, inclusive frames de transição em 1.002, 1.236, 1.320, 1.356 e 1.461. Falta cobrir todas as classes visuais da timeline; não afirmar equivalência integral.
3. A/B frio de 600 quadros no trecho 900–1.500 validou vídeo e áudio em ambas: capturePage 25,26s, paint-event 25,64s. O total de capture frontal caiu 6,00→5,23s, sem ganho ponta a ponta. **Decisão:** manter `capturePage` por padrão; não executar full paint-event nem investir em compositor com base nesta evidência.
4. Próximo esforço para alvo 30s: atacar separadamente Motion (~17,1s), preparo de cabelo (~8,3s) e o restante da renderização (~51,6s). Usar um piloto curto para uma mudança mensurável e reservar o próximo full frio para um candidato que vença com margem, não para repetir paint-event.
4. Preservar FFmpeg/x264 como caminho de produção e rollback até a exportação integral validar 2.394 quadros, todos os vídeos e áudios, mux, cancelamento e fallback. Não persistir MP4, textura, frames, atlas ou cache entre exportações.

## Relação com testes existentes

- Pesquisa 25 rejeitou apenas a captura em passagem completa nas lacunas de vídeo; a saída em duas camadas segue para os trechos com overlay ativo.
- Pesquisa 24 não encontrou vantagem no Shared Texture/WebCodecs sintético para throughput integral.
- O A/B frio de workers desta rodada rejeitou 4 lanes como padrão: 24,53s (2 workers) contra 25,08s (4) em 600 quadros UI.
- A referência integral permanece 76,34s em 2.394 quadros; meta 30s aberta.
