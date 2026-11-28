# Plano 1.8 — ensaio NUT com gravação agrupada

**Data:** 25/11/2026 · **Decisão:** rejeitado; protótipo removido · **HEAD medido:** `06d2dd99a759bc959588f982231287aa1989b3ba`

## Hipótese

Agrupar os três blocos síncronos de cada quadro NUT com `cork`/`_writev` poderia reduzir espera por callbacks de escrita sem mudar bytes, composição ou codificação. A hipótese foi implementada temporariamente no escritor NUT e ligada por variável de ambiente apenas para o candidato. Os testes focados e o typecheck passaram durante o ensaio. Como a medição não atingiu o gate de promoção de 2%, o protótipo foi removido e nenhum código do produto ficou alterado.

## Protocolo e integridade

- Usada a cópia verificada `out/editor-v6-stress/backups/authorized-import-package-2026-11-22T05-43-57-943Z-13804`, manifesto com `verified=true`, projeto `408a77d1-d964-4c04-a66b-f4e9fcfeee46` e 21.944 quadros. A cópia-fonte não foi alterada.
- Seis exports frios alternados, 40 s/1.200 quadros, 1920×1080, 30 fps, libopenh264 Turbo, 2 workers, boca ativa, preset de cabelo 2 e uma faixa de áudio. Controle e candidato usaram a mesma revisão e ambiente; apenas `GACHA_EDITOR_V6_NUT_CORK_FRAME_WRITES` variou.
- Ordem: A/B, B/A, A/B. Cada execução passou validação: MP4 de 40 s, 1.200 quadros H.264, AAC estéreo 48 kHz, uma entrada de vídeo/uma faixa de áudio e zero erros de limpeza. MP4s temporários foram descartados pelo harness; os relatórios JSON foram preservados em `out/`.
- Uma execução preliminar com configuração incompatível de 4 workers/2 partes foi rejeitada antes do render e não entrou nos resultados.

## Resultados

| Par | Controle (ms) | Candidato (ms) | Ganho do candidato |
|---|---:|---:|---:|
| 1 — A/B | 39.667,741 | 39.443,313 | +0,566% |
| 2 — B/A | 37.737,296 | 39.933,563 | −5,819% |
| 3 — A/B | 38.726,683 | 38.347,335 | +0,980% |

Mediana do controle: **38.726,683 ms**. Mediana do candidato: **39.443,313 ms**, portanto o candidato foi **716,631 ms (1,851%) mais lento** pela comparação das medianas. Nem o gate da mediana (≥2%) nem o requisito de todos os pares favoráveis foi atendido. A variação entre pares também impede alegar ganho confiável. Não foi autorizado nem executado o lote integral de 200 s para este candidato.

## Evidência bruta

SHA-256 dos seis `stress-export-validation.json` preservados em `out/editor-v6-stress/runs/`:

- Controle 1 `plan18-nut-cork-control-40s-r2w`: `9476b10c993f185362297c47ade01149b6c1aae1db81101346bb1ab0a0beb765`
- Candidato 1 `plan18-nut-cork-candidate-40s-r2w`: `a0245165e3d82ded2da01e3076ca9eb07fd14828065f44f713e773cfa19bd76a`
- Candidato 2 `plan18-nut-cork-candidate-p2-40s-r2w`: `4c2b60348a274e568ef40e0e06a252e64514674ace708fb0fa670f627fdd38f1`
- Controle 2 `plan18-nut-cork-control-p2-40s-r2w`: `cf6fdd3eb4f240f5d43c50bd130764dc653551644be144c8351adbbeb1e45f8c`
- Controle 3 `plan18-nut-cork-control-p3-40s-r2w`: `299c23ccec00527e7a8e6ca59a08cddc330a99a21da91e0d6bcc4b50f22ca0ad`
- Candidato 3 `plan18-nut-cork-candidate-p3-40s-r2w`: `3ff0ddb8570cd89f70ca2d3b0197cdb9a4abca50616079fb3692dbaccd4011fa`

## Verificação após rollback

- `npx vitest run --config vitest.editor-v6.config.ts tests/editor-v6/nutRawVideoWriter.test.ts`: **6/6 passaram**.
- `npm run test:editor-v6`: **944 passaram, 1 ignorado** (192 arquivos; 23 testes do perfil sintético também passaram).
- `npm run typecheck`: passou.
- `npm run audit:architecture`: passou (899 arquivos TS/TSX; zero erro de sintaxe/import ou fronteira).
- `npx electron-vite build`: passou (main, preload e renderer).
- `node scripts/editor-v6/check-golden-export.cjs`: passou; 45 quadros comparados por camada, zero diferença nas camadas scene/background/foreground. A fixture dourada não inclui cards nem Intro.
- `git diff --check`: executado antes do commit.

**Conclusão:** manter o escritor NUT existente. Reabrir esta hipótese somente com evidência causal nova; a medição atual não justifica custo e risco de manutenção.
