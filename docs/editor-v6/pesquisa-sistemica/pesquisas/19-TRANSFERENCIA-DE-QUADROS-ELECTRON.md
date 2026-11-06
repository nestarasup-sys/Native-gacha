# EXP-ENGINE-002 — readback e transferência de quadros Electron

**Data:** 06/11/2026 · **Estado:** medido em laboratório sintético; nenhuma rota nova foi promovida.

## Pergunta

É mais rápido obter pixels de uma superfície Canvas com `getImageData()` e enviá-los ao processo principal do que usar `webContents.capturePage()` + `NativeImage.toBitmap()` + validação do token + crop BGRA, que é a rota atual do Editor V6?

## Método

- Harness: `scripts/editor-v6/benchmark-frame-transfer.cjs`, invocado por `npm run bench:editor-v6:frame-transfer`.
- Electron 45.1.0 / Chromium 156.0.8078.49 no Windows. Cada repetição completa inicia um processo Electron novo e um `userData` próprio em uma pasta temporária exclusiva. O harness valida e remove somente essa pasta em `finally`.
- Canvas sintético opaco, 1920×1080, gradiente sRGB. Cada quadro altera o token de 24 bits tanto nos pixels do Canvas quanto num marcador de paint fora da área exportada; duas RAFs confirmam a pintura antes da leitura.
- Cada processo descarta uma leitura de aquecimento e mede sete quadros, executando os três caminhos na mesma imagem:
  1. `executeJavaScript` retorna um `Uint8ClampedArray` RGBA; o processo principal converte para BGRA.
  2. `MessagePort` entrega a mesma `Uint8ClampedArray` por structured clone; o processo principal converte para BGRA.
  3. `capturePage` captura 1944×1080; `NativeImage.toBitmap({scaleFactor: 1})` valida o token, recorta os 1920 pixels da cena e copia BGRA.
- Foram comparados os buffers BGRA byte a byte e por SHA-256. A captura rejeita dimensão, formato, alpha ou token inesperado.

## Resultados

| Processo frio | Direto: readback + transferência + conversão | MessagePort: transferência + conversão | `capturePage` + NativeImage + crop |
|---:|---:|---:|---:|
| 1 | 19,05 ms (15,88 + 3,17) | 19,61 ms | 19,06 ms |
| 2 | 18,31 ms (15,14 + 3,17) | 20,02 ms | 17,25 ms |
| 3 | 18,05 ms (14,69 + 3,36) | 20,65 ms | 18,60 ms |
| **Mediana das três medianas** | **18,31 ms** | **20,02 ms** | **18,60 ms** |

As 21 comparações direct/capture tiveram hash idêntico e zero canais diferentes; as 24 verificações de marcador (sete quadros + aquecimento em cada processo) passaram. A rota direta ficou 0,29 ms (1,6%) abaixo da captura, enquanto a captura venceu uma das três repetições. Esse delta é menor que a dispersão entre execuções. MessagePort clone foi mais lento.

Uma tentativa de enviar `ArrayBuffer` na lista transferível de MessagePort resultou em objeto vazio no processo principal e timeout neste harness/Electron. Isso é evidência sobre esta implementação, não prova de uma limitação universal da API.

## Decisão

**Não trocar a captura da exportação.** O readback direto continua tendo custo de leitura da superfície, envio de 8,29 MB e conversão RGBA→BGRA, e não ganhou tempo robusto. Não há evidência de redução na exportação fria completa. A produção segue em SVG + `capturePage` + validação do token + BGRA + FFmpeg; o benchmark fica como referência reproduzível.

O Canvas2D não é promovido por este resultado: aqui a superfície sintética serve apenas para isolar o transporte. O teste não substitui golden de personagem, cabelo, alpha, vídeo, áudio, FFmpeg, fallback ou exportação completa.

## Próxima medida

O A/B frio recente do projeto teve FFmpeg com pico de CPU de 502%, processo principal de 98% e renderer de benchmark de 93%; são picos amostrados, não médias. Testar primeiro uma configuração de threads x264 em smoke e depois em exportes frios equivalentes, mantendo encoder, preset, bitrate, projeto, animação, resolução, número de workers, áudio e qualidade. Se o ganho de parede não superar a variação e passar a decodificação visual/áudio, manter a configuração atual. Depois medir o custo interno dos 37 bakes de movimento sem enfraquecer o reuso por personagem.

## Fontes primárias

- [Electron offscreen rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering) descreve a captura de janelas fora da tela e o modo de transferência de frames.
- [Electron MessagePorts](https://www.electronjs.org/docs/latest/tutorial/message-ports) documenta a passagem de canais entre renderer e processo principal.
- [Electron `webContents.postMessage`](https://www.electronjs.org/docs/latest/api/web-contents#contentspostmessagechannel-message-transfer) descreve a transferência de `MessagePort` ao renderer.
- [Electron `MessagePortMain`](https://www.electronjs.org/docs/latest/api/message-port-main) documenta recebimento por eventos Node no processo principal.

As APIs suportam comunicação entre os processos, mas não garantem que um caminho específico de pixels seja mais rápido nem que evite cópias. A decisão acima vem da medição local com o build usado pelo LAB.
