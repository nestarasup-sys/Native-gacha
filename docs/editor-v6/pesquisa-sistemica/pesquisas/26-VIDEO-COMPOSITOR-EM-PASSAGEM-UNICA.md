# Pesquisa 26 — Composição de vídeo em uma passagem

**Data:** 10/11/2026 · **Estado:** análise de código; protótipo e medição pendentes.

## Evidência no caminho atual

`runEditorV6Export` ativa `layeredVideo` quando há pelo menos um overlay no intervalo. O worker passa por `renderEditorV6ExportFrame` uma vez para o fundo e uma vez para o primeiro plano, captura cada superfície e empilha os dois buffers BGRA de 1920×1080. O FFmpeg separa o buffer empilhado, compõe até quatro overlays de vídeo na camada base e então sobrepõe os elementos de primeiro plano. No SVG, `SceneVideoLayer` está entre o background e os elementos; portanto, essa ordem visual precisa permanecer.

No export completo de referência, renderização ocupou 48,43s dos 76,34s de clique→MP4. Em uma janela fria UI de 600 quadros com dois clipes, as amostras de `capturePageMs` foram aproximadamente 2,0s agregadas entre workers; isso é uma soma concorrente, não parede. Os relatórios mostram `ffmpegWriteMs` com espera de pipe, que também não isola CPU de composição. Assim, o alto custo é o caminho de render/captura como um todo, sem evidência de que apenas o filtro FFmpeg ou o segundo screenshot explique os 48s.

## Oportunidade estrutural

Investigar um plano de cena que componha fundo, vídeo e elementos no mesmo renderer, capturando uma saída final única por quadro. O FFmpeg poderia continuar responsável por encoder, áudio/mux e fallback, mas não precisaria receber duas imagens de tela para reconstruir a ordem de camadas. Outra variante é manter o FFmpeg como compositor e reduzir o custo das duas capturas sem alterar o contrato de camada.

Esse é um candidato de arquitetura, ainda não uma otimização demonstrada. Desenhar o vídeo num `<video>` do Chromium exigiria seek determinístico em cada quadro, aguardar decode e validar rotação, transparência, timestamps, formatos e todos os codecs importados. Receber os frames do FFmpeg no renderer pode adicionar IPC/cópias ou sincronização; não assumir que uma passagem seja automaticamente mais rápida.

## Próximo ciclo falsificável

1. Adicionar instrumentação agregada separando tempo de `draw(background)`, `capture(background)`, `draw(foreground)`, `capture(foreground)` e espera/composição FFmpeg. Limitar dados a contadores/tempos por parte; não registrar frames nem assets.
2. Fazer um protótipo isolado que produza, no mesmo estado de frame, a imagem final atual e o candidato; comparar RGBA antes do encoder para quadros com cada um dos quatro vídeos, transições, cabelo, texto, alpha e bordas de clipe.
3. Só depois do golden passar, executar primeiro smoke de 30–150 quadros com áudio e FFprobe. Rodar export completo frio apenas se o smoke reduzir parede/captura de modo claro e não alterar pixels.
4. Preservar FFmpeg/x264 como caminho de produção e rollback até a exportação integral validar 2.394 quadros, todos os vídeos e áudios, mux, cancelamento e fallback. Não persistir MP4, textura, frames, atlas ou cache entre exportações.

## Relação com testes existentes

- Pesquisa 25 rejeitou apenas a captura em passagem completa nas lacunas de vídeo; a saída em duas camadas segue para os trechos com overlay ativo.
- Pesquisa 24 não encontrou vantagem no Shared Texture/WebCodecs sintético para throughput integral.
- O A/B frio de workers desta rodada rejeitou 4 lanes como padrão: 24,53s (2 workers) contra 25,08s (4) em 600 quadros UI.
- A referência integral permanece 76,34s em 2.394 quadros; meta 30s aberta.
