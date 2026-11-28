# Plano 1.8 — perfil de renderizadores em 40 s

**Data:** 25/11/2026 · **HEAD:** `f23a013d395b462a12c0eabb8353a83fff8c6e21` · **Decisão:** manter a política atual de quatro renderizadores CPU.

## Hipótese e protocolo

O perfil anterior indicou custo de render dominante. Foi comparado o paralelismo Turbo CPU de 2 workers (A) com 4 workers (B), mantendo todas as demais opções, inclusive lote de boca de 300 quadros. Foi usada a cópia verificada em `out/editor-v6-stress/backups/authorized-import-package-2026-11-22T05-43-57-943Z-13804` (manifesto `verified=true`), saída isolada em `out/editor-v6-stress/runs/` e ordem alternada A/B, B/A, A/B. Cada export cobriu 1.200 quadros, 1920×1080, 30 FPS, CPU/libopenh264, preset de cabelo 2 e áudio. O MP4 foi retido para comparação. Nenhuma fonte foi modificada.

Uma tentativa inicial com quatro workers e lote de 600 foi rejeitada pelo guard: o corte de 40 s só continha dois trechos. Ela não entrou nos resultados. A medição formal reduziu igualmente o lote para 300, criando quatro trechos em cada braço.

## Parede, renderização e memória

| Par | 2 workers (ms) | 4 workers (ms) | Ganho de parede |
|---|---:|---:|---:|
| A1/B1 | 41.888,981 | 37.947,029 | 9,41% |
| A2/B2 | 41.008,440 | 37.583,624 | 8,35% |
| A3/B3 | 40.390,401 | 37.536,196 | 7,07% |

Medianas: A **41.008,440 ms**, B **37.583,624 ms**; o candidato quatro workers foi **8,35% mais rápido**, mínimo pareado **7,07%**. Todos os pares favoreceram B. A mediana da fase de renderização caiu de **22.806,920 ms** para **19.457,040 ms** (−14,69%); a preparação de movimento ficou praticamente igual (8,716 s vs. 8,811 s).

Os seis relatórios validaram H.264 1920×1080, 30 FPS, 1.200 quadros, 40 s, AAC estéreo 48 kHz, três emendas e limpeza sem erros. Pico mediano de RSS do processo GPU: **0,848 GiB** (A) e **1,154 GiB** (B); no processo principal: **2,942 GiB** (A) e **2,540 GiB** (B), com variação alta entre execuções. Não houve falha de memória.

## Qualidade

- SSIM All A/B por par: **0,999984**, **0,999984**, **0,999988**; PSNR médio: **73,94 dB**, **73,93 dB**, **75,27 dB**.
- Repetibilidade A/A: SSIM **0,999984** e **1,000000**; B/B: **0,999984** e **0,999996**. Diferenças A/B ficaram no mesmo piso observado entre execuções da própria configuração.
- PCM decodificado idêntico nos seis exports, SHA-256 `4d44261930603c91ff433a0a545bd7efb641cd521e30fb03de2c0d62056e1ab5`.

## Decisão e limites

O ganho excede o gate de 2%, mas quatro renderizadores CPU **já são a política padrão** no código de produção (`exportFallbackStrategy.ts`). Portanto, este ensaio confirma a escolha existente; não há alteração de produto a promover. Não extrapolar o resultado para declarar a meta integral de 90 s: são cortes de 40 s com lote 300, não o export de referência de 200 s/lote 600.

O perfil Phase 2 encontrou custo de parede dominante em render/captura: 19,97 s/40 s no recorte anterior; as somas dos workers são sobrepostas e não devem ser somadas à parede. Um próximo candidato deve atacar a etapa sustentada com equivalência provada, sem repetir a captura `paint-event` descartada ou o ajuste de retry já medido sem ganho.

## Artefatos e verificações

- Perfil Phase 2: `out/editor-v6-stress/runs/plan18-phase2-profile-40s-20261125/stress-export-validation.json` (1.200 quadros, captura detalhada, HEAD limpo).
- A1/A2/A3: `plan18-workers2-batch300-formal-A1/A2/A3-20261125/`; B1/B2/B3: `plan18-workers4-batch300-formal-B1/B2/B3-20261125/`.
- Comparações normalizadas dos relatórios e SSIM/PSNR/PCM: `out/editor-v6-stress/runs/plan18-workers-40s-quality/`.
- SHA-256 dos seis relatórios: A1 `2a5ae614236014d1eee96b9df9f99c9c6363643fdcbe9aa4277601f6f180e552`; B1 `4c9627d0bec47367899571a7ede5a815092432785cae1aebe66b8f6b128494f8`; B2 `6b241ecc26344f260687df2d4ef5ef8704ef106c30996f9b01a4f78056f3c29f`; A2 `1c69f37568d373933e958981fd1cf5b838847ccffbe6c0cda4fe1158fc184e63`; A3 `9f0d244b1cd0d61cb0df323de6c136c4b450d4db164b10bbd66241e837842c5b`; B3 `6ed6df7e54414c4da33c32ddb87139a8fa7f69d892f089db2e620b236456c3f7`.
- Os arquivos completos e hashes podem ser regenerados com `Get-FileHash`; comparadores usados: `compare-run-reports.cjs` e FFmpeg `resources/video-tools/ffmpeg.exe`.

