# Pesquisa 26 — Composição de vídeo em uma passagem

**Data:** 10/11/2026 · **Estado:** análise de código; protótipo e medição pendentes.

## Evidência no caminho atual

`runEditorV6Export` ativa `layeredVideo` quando há pelo menos um overlay no intervalo. O worker desenha o fundo e o primeiro plano em chamadas separadas, mas as chaves de camada podem reutilizar uma imagem capturada anteriormente; portanto, não há duas capturas físicas em todo quadro. Quando uma camada muda, o worker captura seu buffer BGRA de 1920×1080. O FFmpeg separa o buffer empilhado, compõe até quatro overlays de vídeo na camada base e então sobrepõe os elementos de primeiro plano. No SVG, `SceneVideoLayer` está entre o background e os elementos; portanto, essa ordem visual precisa permanecer.

No export completo de referência, renderização ocupou 48,43s dos 76,34s de clique→MP4. Os relatórios existentes não separam o desenho de cada camada. Foi adicionada instrumentação opcional `backgroundDrawMs`/`foregroundDrawMs`, sem mudar pixels nem ordem de operações. No smoke frio de 150 quadros (um vídeo, áudio presente), passou 150/150 e validou MP4; registrou 8 amostras de cada draw, 1 captura de fundo (36,48ms agregados) e 8 capturas de frente (515,99ms). Os draws somaram 71,62ms no fundo e 216,40ms na frente. Isso prova reuso do fundo nesse trecho, mas uma única janela não permite extrapolar os tempos ou frequências ao projeto completo. `ffmpegWriteMs` continua incluindo espera de pipe e não isola CPU de composição.

## Oportunidade estrutural

Investigar se uma composição final no renderer reduz o custo total, mas primeiro medir as capturas realmente evitadas. O FFmpeg poderia continuar responsável por encoder, áudio/mux e fallback. Como o fundo pode ser reutilizado entre quadros, a passagem única talvez reduza draws mesmo quando não reduz capturas; o ganho não pode ser presumido. Outra variante é manter o FFmpeg como compositor e otimizar a captura frontal sem alterar o contrato de camada.

Esse é um candidato de arquitetura, ainda não uma otimização demonstrada. Desenhar o vídeo num `<video>` do Chromium exigiria seek determinístico em cada quadro, aguardar decode e validar rotação, transparência, timestamps, formatos e todos os codecs importados. Receber os frames do FFmpeg no renderer pode adicionar IPC/cópias ou sincronização; não assumir que uma passagem seja automaticamente mais rápida.

## Próximo ciclo falsificável

1. A instrumentação agregada de draw/capture foi implementada; coletar as novas métricas numa janela que cruze os quatro intervalos de vídeo e trechos estáticos. Limitar dados a contadores/tempos por parte; não registrar frames nem assets.
2. Só iniciar um protótipo se as medições demonstrarem custo evitável. O candidato deverá produzir, no mesmo estado de frame, a imagem atual e a nova; comparar RGBA antes do encoder para quadros com cada vídeo, transições, cabelo, texto, alpha e bordas de clipe.
3. Só depois do golden passar, executar primeiro smoke de 30–150 quadros com áudio e FFprobe. Rodar export completo frio apenas se o smoke reduzir parede/captura de modo claro e não alterar pixels.
4. Preservar FFmpeg/x264 como caminho de produção e rollback até a exportação integral validar 2.394 quadros, todos os vídeos e áudios, mux, cancelamento e fallback. Não persistir MP4, textura, frames, atlas ou cache entre exportações.

## Relação com testes existentes

- Pesquisa 25 rejeitou apenas a captura em passagem completa nas lacunas de vídeo; a saída em duas camadas segue para os trechos com overlay ativo.
- Pesquisa 24 não encontrou vantagem no Shared Texture/WebCodecs sintético para throughput integral.
- O A/B frio de workers desta rodada rejeitou 4 lanes como padrão: 24,53s (2 workers) contra 25,08s (4) em 600 quadros UI.
- A referência integral permanece 76,34s em 2.394 quadros; meta 30s aberta.
