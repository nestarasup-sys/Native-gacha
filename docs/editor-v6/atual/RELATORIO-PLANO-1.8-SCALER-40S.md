# Plano 1.8 — triagem do scaler de vídeos

**Data:** 25/11/2026 · **HEAD-base:** `92ab9323acded40cb5ad992fdb62e281c3aba47e` · **Decisão:** candidato removido; nenhum ganho de export demonstrado.

## Hipótese e método

O relatório 1.4 apontou decode/scale de clipes como hipótese de custo. A implementação usa o scaler padrão do FFmpeg (`scale=…`) para ajustar cada vídeo ao layout do palco. Foi testada temporariamente a flag `flags=fast_bilinear`, limitada ao harness e à cópia verificada do projeto, sem alterar o padrão do produto. O novo argumento `--capture-ffmpeg-args` registra os filtros efetivos em cada parte, permitindo conferir a alteração realmente medida.

Foram feitos dois pares de triagem de 40 s, todos com 1.200 quadros, 1920×1080/30, quatro workers CPU, lote de boca 300, preset de cabelo 2, mesmo projeto/cópia e saída MP4 retida. A janela `[0,1200)` contém 436 quadros com um clipe de vídeo. A janela `[15600,16800)` contém 1.154 quadros cobertos por vídeo. O A/B não é série de promoção: é tela inicial em janelas com densidade diferente de vídeo.

## Resultados

| Janela | Padrão (ms) | fast_bilinear (ms) | Variação da parede | Renderização: padrão → candidato |
|---|---:|---:|---:|---:|
| Início, vídeo parcial | 38.057,107 | 37.472,604 | −1,54% | 19.073,010 → 19.390,140 ms (+1,66%) |
| Vídeo em 1.154/1.200 quadros | 46.724,512 | 46.790,574 | +0,14% (mais lento) | 25.128,270 → 25.172,870 ms (+0,18%) |

Ambos os exports passaram a validação de duração, quadros, áudio e limpeza. No primeiro par, SSIM All foi **0,999562**, PSNR médio **55,257658 dB** e PCM decodificado idêntico (`SHA-256 4d44261930603c91ff433a0a545bd7efb641cd521e30fb03de2c0d62056e1ab5`). Apesar da diferença visual pequena, o ganho de parede não alcançou 2% e o trecho com vídeo quase contínuo não mostrou aceleração. A variação positiva no primeiro corte veio junto de preparação de movimento mais curta; a própria fase de render ficou 1,66% mais lenta.

**Conclusão:** descartar `fast_bilinear`. O protótipo e o teste específico foram removidos, o filtro de produção permaneceu inalterado. Não há justificativa para os três pares ou corte integral de 200 s deste candidato.

## Artefatos e verificações

Os quatro `stress-export-validation.json` e MP4s estão em `out/editor-v6-stress/runs/plan18-videoscale-{default,fastbilinear}-{screen,heavy-window}-40s-20261125/`.

- `default-screen`: `f7f341881265304231dec973183b30cb72163b0fa61ce181a73243e03c572485`
- `fastbilinear-screen`: `92044386c0cddb7a2d5f232e6a94a20454910bf7d930987d9bb0d6b2ea1827bd`
- `default-heavy-window`: `b195c1a47e368e1506652149d9aec5fd50e9bcc9579e9f4762e478b92723b5d5`
- `fastbilinear-heavy-window`: `7ce7dcaa8526376a4e10ce43631513794346bb5682448f072817e7dfb0b962b5`

Após retirar o candidato: testes focados de composição/worker **19/19**, typecheck, `node --check scripts/editor-v6/benchmark-project-export.cjs` e `npx electron-vite build` passaram. Nenhum arquivo da cópia foi modificado.

