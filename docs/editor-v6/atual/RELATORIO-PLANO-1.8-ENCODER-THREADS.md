# Plano 1.8 — teste de threads do encoder

**Data:** 26/11/2026 · **Decisão:** manter 2 threads por trecho · **Código:** `774027c169b8f8345f215b20c0c70dea7dfb4279`

## Hipótese e método

Foi testado se reduzir de 2 para 1 thread de encoder por trecho liberaria CPU suficiente para acelerar captura/renderização, mantendo 4 workers. Os ensaios usaram a cópia verificada em `out/editor-v6-stress/backups/authorized-import-package-2026-11-22T05-43-57-943Z-13804`, cache de movimento vazio e saídas isoladas. Cada execução criou perfil Electron frio próprio.

O protocolo foi pareado e alternado A/B, B/A, A/B. A = 2 threads; B = 1 thread. Cada corte exportou `[0,1200)` — 1.200 quadros/40 s — a 1920×1080/30, CPU, quatro workers, lote de boca 300, movimento concorrente 2, cabelo Preset 2 e captura `capturePage`. A revisão/árvore de código foi idêntica e limpa nos seis relatórios.

## Resultados

| Par | Controle: 2 threads | Candidato: 1 thread | Diferença de parede (candidato) |
|---|---:|---:|---:|
| A1/B1 | 38,063 s | 38,969 s | +2,380% (mais lento) |
| A2R/B2 | 40,518 s | 42,145 s | +4,015% (mais lento) |
| A3/B3 | 40,110 s | 37,484 s | −6,547% (mais rápido) |

A mediana das três diferenças pareadas foi **+2,380%**; dois de três pares foram mais lentos com 1 thread. O intervalo amplo (−6,547% a +4,015%) mostra variação entre execuções, mas o candidato falha o critério do Plano 1.8: mediana e menor ganho pareados de pelo menos 2%, com todos os pares favoráveis. **Hipótese rejeitada; padrão de produção inalterado.** Não foi feito corte integral de 200 s.

Os seis exports passaram a validação individual do harness: contagem/duração de quadros, H.264, áudio, emendas e limpeza. `compare-run-reports.cjs` confirmou comparabilidade do perfil e validação aprovada em cada par. Como o gate de desempenho falhou e não houve promoção, SSIM/PCM cruzados não foram executados; os MP4s foram retidos para eventual inspeção posterior.

O corte A2 foi interrompido durante uma pausa solicitada e não entrou na análise. Foi repetido a frio como A2R; nenhum tempo ou artefato parcial de A2 foi usado como resultado válido.

## Evidências

Diretório das execuções, logs, seis relatórios e seis MP4s retidos: `out/editor-v6-stress/runs/plan18-encoder-threads-ab-20261126b/`.

SHA-256 dos relatórios validados:

| Execução | SHA-256 `stress-export-validation.json` |
|---|---|
| A1 | `459f2ebdaab4c30f782037db1c8ce5c3713f8db1aa29a12aab420027aa96a389` |
| B1 | `1077af1abc663d6bbcee10077ae8063c449974d3ccd98402ae91276639d7cc35` |
| B2 | `243b27d11f828e975c6ed2b9bacb0b690d955453d40b1e2fb0e5424e697d6080` |
| A2R | `11fe97ff565fe5fe45a9db8e8025e43a41a7f6d3e152bb98f54255de88102a4e` |
| A3 | `94ab559e62ec2a4820b3381ffbc59f00cdacad48a9c436ca52f261c8e2885f4b` |
| B3 | `cb4e8f634431b534e0f10703f15436983a27536746b4b3bcd9ed9b637810a6fa` |
