# EXP-002 — Captura Electron: capturePage vs paint

**Status:** PROTOCOLO PREPARADO — NÃO EXECUTADO.  
**Dependência:** EXP-001 demonstrar que captura é parcela relevante.

## Hipótese

`electron/domains/editorV6/exportWorkers.ts` usa `BrowserWindow` com `offscreen:true`, define frame de modo determinístico, insere token de pintura e chama `webContents.capturePage` para extrair bitmap BGRA. **[HIPÓTESE]** O evento `paint` ou um backend framebuffer pode reduzir readback/cópias.

## Cenários A/B

1. Baseline de referência `capturePage` sem mudar demais configuração.
2. PoC `paint` com **dirty rectangles** recompostos num bitmap do tamanho completo, **frameId/token exato**, momento de captura correto e sem reaproveitar frame antigo.
3. Medir worker startup, draw/React, capture, bitmap, memória, `ffmpegWriteMs` e MP4 final.
4. A/B 150 frames e depois 300, cabelo OFF/ON, vídeo sobreposto e área de alpha.
5. Stress de cancelamento, crash, resize/DPI, sincronização entre lanes, recursos liberados e limites de buffer.

## Requisitos para adoção

Pixels iguais no domínio RGBA, MP4 correto, 30fps/1080p, sem stale frame nem seam, áudio preservado, ganho no **total** e memória limitada. GPU shared texture exige **estudo próprio** de addon nativo e `release()`; não é parte automática do teste `paint`.

**Referências:** [Electron Offscreen](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering), [webContents](https://www.electronjs.org/docs/latest/api/web-contents).
