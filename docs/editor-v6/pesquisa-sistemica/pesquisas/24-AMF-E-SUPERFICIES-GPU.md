# Pesquisa 24 — H.264 AMF e superfície GPU compartilhada

**Data:** 10/11/2026
**Escopo:** triagem fria no host Windows do laboratório, projeto `Teste de Importação — Personagens do Pacote`, e viabilidade da API de superfície compartilhada do Electron.

## Pergunta

A Radeon RX 7600 e o H.264 AMF conseguem reduzir o tempo de exportação comparado ao x264 em CPU? O Electron consegue entregar o frame da janela offscreen ao encoder sem uma cópia de pixels pela CPU?

## Equipamento e método

- Host: AMD Ryzen 5 4600G, 12 processadores lógicos; AMD Radeon RX 7600, driver 32.0.32015.7029.
- FFmpeg do laboratório lista `h264_amf`, `h264_d3d12va`, `h264_mf`, `h264_nvenc`, `h264_qsv` e `libx264`. A presença na lista não garante que cada encoder seja utilizável.
- Projeto e ativos vieram do backup verificado do LAB. Cada exportação abriu processo e perfil Electron novos, cache de movimento vazio e saída própria; 600 quadros 1080p30, preset UI 2 posterior-only, 2 workers, SVG/capturePage, 2 clipes de vídeo e 2 clipes de áudio.

## AMF versus x264

| Condição | Clique → MP4 validado | Main | Preparação Motion | Renderização | Probe do encoder | Validação |
|---|---:|---:|---:|---:|---:|---|
| x264 8 threads, referência fria | 22,91 s | 18,14 s | 4,65 s | 11,96 s | 0,057 s | 600/600 + áudio |
| `auto`, selecionou `h264_amf`, amostra 1 | 27,33 s | 22,05 s | 5,56 s | 14,19 s | 0,746 s | 600/600 + áudio |
| `auto`, selecionou `h264_amf`, amostra 2 | 26,12 s | 21,05 s | 5,13 s | 13,84 s | 0,510 s | 600/600 + áudio |

As duas amostras AMF ficaram 14–19% mais lentas que a referência x264. Também houve maior custo em Motion e render, portanto a diferença não pode ser atribuída somente ao encoder. Não houve teste de qualidade decodificada pareado para AMF; por esse motivo não é elegível à promoção mesmo se uma execução futura vencer. A busca `auto` tentou outros encoders antes do AMF, aumentando o probe em 0,45–0,69s. A escolha atual continua sendo x264; AMF permanece disponível para investigação explícita, mas não será selecionado automaticamente por causa da existência da GPU.

O primeiro piloto produziu um relatório com `passed: true`, 600 quadros e áudio, mas o script encerrou com falha porque exigia o campo `x264Preset` também para `h264_amf`. O harness foi corrigido para validar esse metadado somente quando `--encoder=cpu`; o segundo piloto terminou normalmente, validando o mesmo projeto e limpando MP4/perfil temporários. A correção não muda parâmetros de exportação.

## Electron Shared Texture + WebCodecs runtime smoke

Electron 45.1.0 inclui `webPreferences.offscreen.useSharedTexture`; em `paint`, a textura compartilhada pode ser recebida junto da imagem. A textura tem `release()` e há limite de recursos simultâneos. `sharedTexture.importSharedTexture` importa handle no Main; o `VideoFrame` precisa ser criado no Renderer deste host (a tentativa de `getVideoFrame()` no Main falhou com `The VideoFrame cannot be created at current process`). A API é experimental.

O script `scripts/editor-v6/spike-shared-texture-runtime.cjs` criou janela isolada, recebeu texturas sintéticas pelo evento `paint`, transferiu-as ao Renderer e configurou H.264 `VideoEncoder` com `hardwareAcceleration: prefer-hardware`. No smoke mínimo, 5/5 quadros foram aceitos e recursos liberados; sem `toBitmap`/`copyTo`, mas sem trace que comprove ausência de cópias internas ou encoder físico.

Durante a depuração manual do harness ficaram quatro pastas de perfil do Electron em `C:\Temp\editor-v6-shared-debug*`, total de 28.757.315 bytes (~27,4 MiB), sem mídia/MP4. A remoção foi bloqueada pela política do executor; os diretórios estão fora do repositório e não foram limpos por outro método.

A superfície foi 643×363 para Canvas 640×360, e 1922×1081 para Canvas 1920×1080. A amostra foi recortada por `VideoFrame` para a área do Canvas e aceita pelo encoder. Ainda não há comparação pixel a pixel com `capturePage`.

## Cadência offscreen a 30/60 Hz

O protótipo foi repetido com processos/perfis novos, Canvas sintético 1920×1080, 150 quadros, WebCodecs H.264 a 2Mbps e apenas `paintFrameRate` alternado:

| `setFrameRate` | Wall do protótipo | Taxa observada | Encode |
|---:|---:|---:|---|
| 30 | 6,74s e 7,08s | 22,26 e 21,18 quadros/s | 150/150 por run |
| 60 | 4,45s | 33,69 quadros/s | 150/150 |

O modo 60 ficou ~1,55× mais rápido que a mediana das duas amostras explícitas a 30, mas isso não é uma melhoria nova no exportador: `electron/domains/editorV6/exportWorkers.ts` já chama `webContents.setFrameRate(60)` em cada worker normal. O alvo do projeto exige pelo menos 79,8 quadros/s no total e o smoke de um worker a 60 entregou 33,69. A cadência do Chromium não explica sozinha o gap e subir o limite não pode ser promovido.

O harness contou 150 eventos `paint` sem textura antes de encontrar o evento com textura para cada quadro solicitado. A saída codificada somou ~26–31KB no cenário artificial; não foi gravada como MP4. Os JSON estão nas pastas `out/editor-v6-stress/runs/electron-shared-texture-runtime-2026-11-10-{1920x1080-150f-30fps,1920x1080-150f-60fps}/`. Esse wall inclui startup da primeira renderização e handshakes de cada frame, e não é comparável diretamente ao export real.

**Conclusão:** Shared Texture → VideoFrame → WebCodecs é acessível neste Electron, porém não demonstrou aceleração frente ao caminho existente e não atende ao throughput necessário. Ainda não substitui o exportador: nenhum golden de pixels, projeto real, vídeo/áudio, FFmpeg mux, abort, fallback ou comparação de qualidade foi executado. `prefer-hardware` não comprova uso de AMD hardware.

- [Electron `sharedTexture`](https://www.electronjs.org/docs/latest/api/shared-texture)
- [Electron `OffscreenSharedTexture`](https://www.electronjs.org/docs/latest/api/structures/offscreen-shared-texture)
- [Electron `SharedTextureImported`](https://www.electronjs.org/docs/latest/api/structures/shared-texture-imported)
- [Electron `webContents` paint/offscreen](https://www.electronjs.org/docs/latest/api/web-contents)

Uma textura não pode ser passada diretamente entre processos; precisa de importação/transferência e gestão de ciclo de vida. FFmpeg atual consome BGRA via stdin e compõe vídeos/áudio antes do mux; apenas receber a textura não elimina essas etapas. Próximo estudo, se houver continuação dessa rota, precisa capturar pixels do projeto real, testar composição dos vídeos no renderer e validar H.264→mux por stream copy. Abortar se exigir readback, degradar paridade ou limitar fallback.

## Decisão

- **Não promover AMF nem `auto`**: ambas as amostras do projeto perderam para x264 e o AMF ainda carece de comparação de qualidade.
- **Manter x264 8 threads e fallback atual.** Não mudar o encoder padrão com base apenas no hardware presente.
- **Não integrar Shared Texture à produção**: H.264 sintético passou, mas não houve ganho de throughput, a API é experimental e paridade visual, hardware, mux de overlays/áudio e fallback não estão demonstrados.
- Os pilotos mantiveram somente JSON e arquivos de texto leves. Nenhum MP4, frame, atlas ou cache pesado foi mantido.
