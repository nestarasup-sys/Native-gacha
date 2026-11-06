# EXP-002 — Captura Electron: capturePage vs paint

**Status:** primeira etapa executada no LAB em 06/11/2026; `paint-event` promovido como padrão do LAB após A/B frio 3+3. Ampliar gates de paridade visual antes de considerar trabalho concluído.
**Dependência:** baseline fria EXP-001 mostrou captura relevante.

## Hipótese

`electron/domains/editorV6/exportWorkers.ts` usa `BrowserWindow` com `offscreen:true`, define frame de modo determinístico, insere token de pintura e pode capturar via `capturePage` ou por subscription `beginFrameSubscription(false)`. O segundo caminho mantém apenas a imagem mais recente em memória, verifica o mesmo token de 24 bits e rejeita/invalida imagem obsoleta antes de entregar BGRA.

## Cenários A/B

1. Baseline de referência `capturePage` sem mudar demais configuração.
2. PoC `paint` com **dirty rectangles** recompostos num bitmap do tamanho completo, **frameId/token exato**, momento de captura correto e sem reaproveitar frame antigo.
3. Medir worker startup, draw/React, capture, bitmap, memória, `ffmpegWriteMs` e MP4 final.
4. A/B 150 frames e depois 300, cabelo OFF/ON, vídeo sobreposto e área de alpha.
5. Stress de cancelamento, crash, resize/DPI, sincronização entre lanes, recursos liberados e limites de buffer.

## Requisitos para adoção

Pixels iguais no domínio RGBA, MP4 correto, 30fps/1080p, sem stale frame nem seam, áudio preservado, ganho no **total** e memória limitada. GPU shared texture exige **estudo próprio** de addon nativo e `release()`; não é parte automática do teste `paint`.

**Referências:** [Electron Offscreen](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering), [webContents](https://www.electronjs.org/docs/latest/api/web-contents).

## Resultado A/B inicial no laboratório

- Mesmo snapshot autorizado, processo Electron novo, sessão temporária nova, cache de movimentos vazio a cada corrida, preset 1, 2394 frames, 1080p30, Turbo/AMF e áudio do projeto. Não foram copiados perfis de sessão nem caches derivados de exportações anteriores.
- Três exportações completas `capturePage`: 120,72 / 116,32 / 114,62 s; mediana 116,32 s. Três `paint-event`: 108,91 / 119,58 / 110,47 s; mediana 110,47 s, ~5,0% abaixo da mediana baseline. Uma corrida candidata foi mais lenta que a mediana baseline: dispersão relevante.
- Soma de `captureMs` entre partes concorrentes mediana: 105,81s → 95,53s (~9,7%). `capturePageMs` mediana caiu de 77,29s a zero por definição do caminho candidato. Esses acumulados entre partes **não são tempo de parede**.
- Em smoke de 150 frames com hashes RGBA esparsos nos frames 0, 29, 30 e 149, os dois caminhos coincidiram nas quatro amostras. O export curto paint também validou 1920×1080, 30fps, áudio e transições. Isso não é golden exaustivo de todos os pixels/frames.
- Decisão: habilitar `paint-event` como padrão da exportação normal **nesta cópia LAB**. Ganho total é modesto e variável; manter fallback de `capturePage` e investigar preparação/composição de cabelo antes de alegar ganho robusto ou levar a outras distribuições.
- Cada corrida terminou com validação do MP4 e removeu somente `isolated-app-data` e saídas não JSON/TXT da sua pasta única `out/editor-v6-stress/runs`; ficaram relatórios leves. Guarda: mínimo 3 GiB livres antes de iniciar, máximo 2 GiB por execução.
