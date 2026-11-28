# Execução 1.4 — diário de marcos

Especificação operacional: [Plano da Rodada 1.4](RODADA-1.4-PLANO.md), cópia rastreável do prompt encontrado. O prompt original foi arquivado localmente em `pasta do lixo/Prompts encerrados/PROMPT-AGENTE-RODADA-1.4.md` na Rodada 1.6.

## Identificação e ambiente

- [Executado] Raiz `C:\TRABALHO 2\OUTROS\GACHA EM C++`; branch `Dev-V2`; HEAD inicial `62a08fea6e0311a398587a88cf15f0891fdb8ac0`. Status inicial: somente `?? docs/editor-v6/atual/PROMPT-AGENTE-RODADA-1.4.md`.
- [Executado] Windows 11 Pro, build `26300`; AMD Ryzen 5 4600G, 6 núcleos/12 threads; AMD Radeon RX 7600, driver `32.0.32029.2010`; RAM visível `16.139.456 KiB`; disco C: NTFS, `476.950.880.256 B`, livre `59.197.665.280 B`.
- [Executado] Node `v24.22.3`; npm `12.2.2`; Electron `45.3.1`.
- [Executado] FFmpeg empacotado em `resources/video-tools/ffmpeg.exe`, versão `n8.1.3-27-g8dca1586f4-20261031`; binário no PATH em `%USERPROFILE%\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe`, versão `8.1.2-full_build-www.gyan.dev`. O empacotado foi identificado em `electron/main.ts:1505-1519` e é o usado no ambiente de desenvolvimento.
- [Executado] `git count-objects -vH`: 56 objetos soltos, `102.34 KiB`; pacote Git `25.11 MiB`; lixo Git `0 bytes`. `docs/editor-v6/atual/dados/` soma `34.819.923 bytes`.
- [Executado] Dez maiores blobs: `video-studio-diagnostico-interrompido.zip` 6.247.794 B; `round13-b-write-2.json` 4.315.322 B; `round13-b-write-4.json` 4.191.596 B; `round13-b-write-5.json` 4.188.364 B; `round13-b-write-3.json` 4.175.335 B; `round13-c1-3.json` 3.842.269 B; `round13-c1-1.json` 3.824.378 B; `round13-c1-2.json` 3.815.672 B; `round13-b-write-1.json` 3.563.064 B; `Native-gacha-GitHub-pronto-2026-10-22.zip` 1.864.340 B. A recomendação para reduzir peso antes do primeiro push será anexada ao relatório. Nenhum blob foi removido e o histórico não foi reescrito.

## M0 — baseline e memória durável (22/11/2026)

- [Executado] Criados `RODADA-1.4-PLANO.md`, este diário e `EXPERIMENTOS.md`. `README.md` liga os três documentos.
- [Executado] `npm run typecheck`: exit 0.
- [Executado] `npm run audit:architecture`: exit 0; 893 arquivos TS/TSX, 0 erros, 0 imports ausentes, 0 violações.
- [Executado] `npm run test:editor-v6`: exit 0; 187 arquivos passaram, 1 ignorado; 906 testes passaram, 1 ignorado; stress-profile 23/23.
- [Executado] `npm run test:refactor`: exit 0; 50/50 comandos, sem falha.
- [Lido] O prompt operacional identifica os gates D3 da 1.3 e fases independentes E/G/H. Não repetir as medições descartadas que o índice de experimentos identifica.
- [Executado] Checklist A3 inicial, sem export concorrente: esquema AMD Ryzen High Performance; suspensão depois de `0 s` em AC/DC; hibernação depois de `0 s` em AC/DC. Ambos desativados. Espaço C: `59.197.665.280 B` livres. Partição C: no disco SATA SSD MCR-RPRS-480, saúde Healthy.
- [Executado] Defender: `AntivirusEnabled=True`, `RealTimeProtectionEnabled=True`. [Não feito] Lista de exclusões para `out/` e temporários: `Get-MpPreference` informou que exige administrador. Não alterei Defender nem plano de energia.
- [Executado] Top 10 processos amostrados por 5 s antes da bateria: msedgewebview2 0,66 CPU-s; chrome 0,61 CPU-s; msedgewebview2 0,52 CPU-s; codex 0,03 CPU-s; outros seis da lista 0,00 CPU-s. Amostra de frequência `_Total`: 3.701 MHz e 105% da frequência nominal, uma leitura prévia, sem carga de export.
- [Não feito] Temperatura por núcleo: N/D; a consulta WMI térmica não retornou sensores. Checklist de processos/energia/Defender/espaço deve ser repetido antes de cada bateria. Espaço será rechecado antes de qualquer dump.
- [Executado] M0 concluído em `b732e059`; documentação de abertura em `628048f6`. Nenhum código de produto alterado nesta rodada até este marco.

## M1 — fases B e P

- [Executado] Status M1: B1–B4 e P1–P2 foram medidos; P3 permanece inconclusivo. Limitações instrumentais estão registradas como N/D abaixo.
- [Executado] Três pares `off/on`, ordem `A/B/A/B/A/B`, com pausa de `60 s` entre inícios; A = `GACHA_EDITOR_V6_PHASE2_DIAGNOSTICS` desligado, B = ligado. Mesmo projeto/preset, binário empacotado `libopenh264`, perfil UI padrão, cache de movimento frio, revisão `ad85912a8089f2cf41ba9264558f3129432610b0`, árvore rastreada limpa, saída descartável. Cada relatório marcou `passed=true`, `6.000` quadros, `10` partes, áudio presente e `0` erros de limpeza.
- [Executado] Cópia verificada antes e depois: projeto `408a77d1-d964-4c04-a66b-f4e9fcfeee46`, `3.687` arquivos, `966.335.489 B`; manifesto SHA-256 `F5933C4C9E34DA058C67FD12ABD20510147DA998C89EFC7D84DD438912B40B6A`; preset 2 SHA-256 `27B9E1647F1590324C81FFE628E8B0B6C82F88075C722DAFCB91D6DE72E125D8`. A pasta `motion-cache` tinha `0` entradas; todos os seis exports foram frios.
- [Executado] Pré-bateria: AMD Ryzen High Performance; suspensão e hibernação em `0 s` AC/DC; Defender ligado; exclusões N/D porque `Get-MpPreference` exige administrador. Amostra WMI durante os seis jobs: `202` leituras de frequência, todas `3.701 MHz`; temperatura N/D, `0` amostras. Antes da série, top CPU em `5 s`: `node 3,48 CPU-s`, `ChatGPT 1,69 CPU-s`, `pwsh 0,08 CPU-s`; nenhum outro benchmark V6 estava em execução. O disco C: era NTFS/SSD SATA; o monitor exigiu ao menos `3 GiB` livres antes de cada job. Espaço livre capturado no início dos jobs: `58.796.634.112`, `58.791.419.904`, `58.786.050.048`, `58.781.429.760`, `58.769.625.088` e `58.774.765.568 B` (mínimo `58.769.625.088 B`).
- [Executado] Dois pilotos foram excluídos da estatística: `f1-off` foi compilado antes do commit e gravou `sourceRevision=4d9f56cf…`, `workingTreeDirty=true`; `q1-on` executou o código de `b273f0f3`, mas o resumo do benchmark ainda não copiava `finalizationDiagnostics`. Ambos passaram como export, mas não contam na série. O repasse do diagnóstico foi corrigido em `ad85912a`, seguido de build e da série limpa acima.

### B0/B1 — relógio e parede

- [Lido] Em `electron/main.ts:2176-2177`, `mainExportWallMs` começa quando o job inicia; `clickToValidatedWallMs = uiCommandToStartedMs + exportWallMs`. Portanto o segundo valor é clique → status completo/arquivo publicado, incluindo a preparação anterior ao início do job. O nome `clickToValidated` não significa que o harness acrescenta uma validação depois do export.
- [Lido] `exportFinalization.ts:131-157` faz mux, sonda de pacotes, decodificação das emendas e invariantes; `exportRunner.ts:232-244` publica após validar e aguarda limpeza no `finally`. `benchmark-project-export.cjs:600-...` depois confere o resumo e limpa artefatos; não executa outro `ffprobe` ou decodificador. Tempo de uma validação externa do harness: N/D/não aplicável, pois não existe essa etapa separada.
- [Lido] O `163.760 s` de 1.1 é explicitamente “clique→MP4 validado”; os números A5 da 1.3 também são “Clique→MP4 validado”. A mediana atual sem instrumentação é `168.7972359 s`; a diferença histórica continua sem causa confirmada e não vem de uma validação extra do harness.

| Execução | Diagnóstico | Clique → arquivo (ms) | Job (ms) | Espera pré-job (ms) | CPU total (CPU-s) | Parede monitor (s) |
|---|---:|---:|---:|---:|---:|---:|
| [Executado] r1-off | desligado | 168.797,2359 | 153.118,1359 | 15.679,1 | 937,892 | 184,489 |
| [Executado] r1-on | ligado | 170.681,14870000037 | 155.173,7487 | 15.507,400000000373 | 927,204 | 191,746 |
| [Executado] r2-off | desligado | 168.953,73119999925 | 153.676,5312 | 15.277,199999999255 | 928,703 | 183,982 |
| [Executado] r2-on | ligado | 169.980,13950000075 | 154.773,8395 | 15.206,300000000745 | 921,562 | 187,797 |
| [Executado] r3-off | desligado | 168.667,292 | 153.353,792 | 15.313,5 | 914,218 | 182,899 |
| [Executado] r3-on | ligado | 170.804,20529999927 | 155.538,00530000002 | 15.266,199999999255 | 922,906 | 186,815 |

- [Executado] Mediana clique → arquivo: off `168.797,2359 ms`; on `170.681,14870000037 ms`; diferença `+1,1160803611244052%`. Mediana do job: off `153.353,792 ms`; on `155.173,7487 ms`; diferença `+1,1867699365399442%`. CPU-s mediano: off `928,703`; on `922,906`; diferença `−0,6242038628065272%`. Overhead de parede do diagnóstico observado abaixo de `2%`; a amostra ainda é de `3` pares.
- [Executado] Fases medianas on: espera pré-job `15.266,199999999255 ms` (dentro dela, cabelo `13.840,900000000373 ms`); preparo de movimento `31.577,95 ms`; encoder probe `108,43 ms`; render `119.471,86 ms`; finalização `3.550,66 ms`; setup `2,41 ms`; carga de personagens `1,68 ms`; publicação `0,74 ms`. O tempo não alocado pelas fases listadas tem mediana `239,7087 ms`. A mediana por componente não soma exatamente à mediana do job porque cada campo é resumido separadamente.
- [Executado] Dez partes, medianas das três execuções diagnósticas. Offset é relativo ao início do export; `first/last` são primeira escrita e fim da última escrita. A identificação do worker não existe no resumo, então permanece N/D.

| Parte | Quadros | Primeira escrita (ms) | Última escrita (ms) | Duração medida da parte (ms) | Worker |
|---:|---:|---:|---:|---:|---|
| 0 | 0–600 | 39.150,6 | 67.380,4 | 31.312,4 | N/D |
| 1 | 600–1.200 | 36.014 | 66.348,5 | 32.829,6 | N/D |
| 2 | 1.200–1.800 | 43.463,5 | 76.292 | 37.955,2 | N/D |
| 3 | 1.800–2.400 | 44.234,1 | 76.732 | 37.664,9 | N/D |
| 4 | 2.400–3.000 | 74.830,6 | 100.192,5 | 30.657,9 | N/D |
| 5 | 3.000–3.600 | 86.054,7 | 122.416,7 | 40.649,3 | N/D |
| 6 | 3.600–4.200 | 88.341,9 | 125.076,5 | 41.826,2 | N/D |
| 7 | 4.200–4.800 | 89.712,1 | 126.212,3 | 41.757,4 | N/D |
| 8 | 4.800–5.400 | 121.495,8 | 142.667,7 | 28.161,9 | N/D |
| 9 | 5.400–6.000 | 130.282,5 | 151.311,8 | 23.228,6 | N/D |

- [Não feito] Duração isolada da limpeza do job: o relatório bruto contém `cleanupErrors`, mas o resumo do harness não copia `report.cleanup.milliseconds`; a parede do job inclui a limpeza. Erros de limpeza observados: `0` em cada repetição.

### B2/B3/B4 — CPU, memória e orçamento

- [Executado] CPU por papel abaixo é a mediana com diagnóstico ligado, baseada no processo externo; o total inclui inicialização e fechamento do harness. Renderer externo agrupa renderers de export e de benchmark. Os picos nesta tabela são do maior processo individual de cada papel, não soma de processos.

| Papel | CPU-s mediano | Fração do total mediano (`922,906 CPU-s`) | Maior RSS de um processo (B) |
|---|---:|---:|---:|
| FFmpeg | 524,641 | 56,8466% | 411.140.096 |
| Renderers | 153,188 | 16,5984% | 2.298.515.456 |
| Electron main | 135,906 | 14,7259% | 4.252.516.352 |
| GPU process | 85,656 | 9,2811% | 1.273.466.880 |
| Outros filhos | 14,344 | 1,5542% | 89.169.920 |
| Harness Node | 8,359 | 0,9057% | 83.693.568 |
| Utility | 0,781 | 0,0846% | 69.042.176 |

- [Executado] CPU por fase, estimada pela diferença entre amostras de `app.getAppMetrics()` em intervalos medianos de `1.005,9 ms`. A CPU de cada papel é soma de trabalho; `CPU-s ÷ parede` dá threads lógicas ocupadas em média.

| Fase | Parede mediana (s) | CPU mediana (CPU-s) | Threads médias | CPU-s por papel (mediana) |
|---|---:|---:|---:|---|
| Preparo de movimento | 31,578 | 54,578 | 1,728 | renderer 35,047; GPU 13,786; main 5,534; utility 0,104 |
| Render | 119,472 | 830,080 | 6,946 | FFmpeg 531,656; main 120,244; renderer export 83,974; GPU 69,146; renderer harness 24,799; utility 0,489 |
| Finalização | 3,551 | 0,298 | 0,084 | main 0,243; GPU 0,046; renderer harness 0,006; demais 0 |

- [Executado] RSS máximo amostrado por fase/papel, soma dos processos do mesmo papel numa amostra de aproximadamente `1 s`; os máximos de papéis diferentes podem ocorrer em instantes diferentes.

| Fase | Papel → pico RSS (B) |
|---|---|
| Preparo | main `1.481.555.968`; GPU `507.707.392`; renderer harness `2.772.676.608`; utility `60.198.912` |
| Render | main `4.310.765.568`; GPU `1.280.221.184`; renderer harness `1.083.940.864`; FFmpeg `998.281.216`; renderer export `7.113.674.752`; utility `69.042.176` |
| Finalização | main `1.691.377.664`; GPU `577.212.416`; renderer harness `646.602.752`; FFmpeg `7.364.608`; utility `68.677.632` |

- [Executado] B3: `E=(61,65128 s + 56,831574 s) / 119,47186 s = 0,991721849814676`. Tetos C3/C2 são de experimentos isolados anteriores; o resultado é próximo de `1`, consistente com pouca sobreposição útil, sem provar a causa de cada espera.
- [Executado] B4: o preparo antes/dentro do job soma cerca de `46.844,15 ms` (medianas separadas); render mediano `119.471,86 ms`; finalização `3.550,66 ms`. Orçamento ilustrativo para `90 s`: preparo `25 s` (redução `21.844,15 ms`), render `60 s` (redução `59.471,86 ms`), finalização até `5 s`. O preparo atual excede `30 s`; a meta depende de reduzi-lo e do render.

### P1/P2/P3 — anatomia e dependências

- [Executado] Cabelo: parede mediana `13.840,900000000373 ms` (mín. `13.795 ms`, máx. `14.230,400000000373 ms`). Contadores agregados que se sobrepõem: `prepareCharacterRenderers 5.590,900000002235 ms`; `renderHairlessFaceTarget 6.508,100000014529 ms`; `measureFaceModeCrop 6.775,0999999996275 ms`; `serializeFaceSurface 2.694,600000023842 ms`; `prepareHairLayers 521,3000000007451 ms`.
- [Executado] Movimento: parede mediana `31.576,6597 ms`; trabalho de rig `18.477,900000002235 ms`; geometria de endpoints `12.773,200000012293 ms`; detecção de crop `16.557,30000001937 ms`; IPC round-trip agregado `51.738,70500000002 ms`. São somas por transição e podem se sobrepor. Boca: `36` atlas; preparação `71.925,1964 ms`, bake `81.196,80000000633 ms`, espera de fila `43.226,82599999998 ms`, também agregados e sobrepostos.
- [Executado] Startup somado pelas `10` partes: `35.102,38 ms`, incluindo prontidão pós-navegação `32.745,66 ms`; criação de janela `112,09 ms`, navegação `2.230,88 ms`, snapshots `29,22 ms`. Preparação de assets somada nas partes `20.913,7 ms`. Esses valores não são parede e já ficam dentro da fase de render.
- [Não feito] Decode/normalização de cada asset e fontes não têm cronômetros próprios; `assetPreparation` mistura etapas, portanto a divisão individual é N/D.
- [Executado] P2: projeto, manifesto e preset idênticos em todas as execuções; a identidade do pacote de entrada é `100%` no nível do manifesto/arquivo. [Não feito] Fração de operações/subetapas com entradas idênticas é N/D: o código não emite assinatura para cada subetapa. O cache entre exports continuou desligado; não implementei cache.
- [Lido] P3: `exportRunner.ts:142` aguarda toda `prepareEditorV6ExportReadiness` antes de chamar encoder/render (`:210`); `exportReadiness.ts:97` verifica todas as transições antes de retornar projeto/personagens. A criação/agendamento das partes ocorre em `exportAttemptRenderer.ts:37-...`, depois dessa barreira. As partes recebem o snapshot preparado e não podem começar antes. O teto aritmético bruto de sobreposição é `46.844,15 ms` (todo preparo), mas o ganho seguro/realizável é N/D sem separar dependências por parte; não abri trabalho de código sob Gate P.
- [Suposição] Preparar janelas/renderer antes do bake pode sobrepor parte do startup, mas ainda não há prova de que isso economize `10 s` depois de considerar os dados de personagem/movimento necessários. Gate P fica inconclusivo e sem otimização proposta nesta rodada.

- [Executado] Artefatos completos, mantidos em `out/editor-v6-stress/` (fora do Git), com SHA-256 no índice: `round14-monitor/round14-finalization-summary.json`; relatórios e monitores `runs/round14-r{1,2,3}-{off,on}/stress-export-validation.json` e `round14-monitor/r{1,2,3}-{off,on}.process-monitor.json`.
- [Executado] SHA-256 dos dados brutos; todos permanecem em `out/` e não foram adicionados ao Git:
  - `round14-monitor/round14-finalization-summary.json` — `0DAFF8021CD10FE9E379E6C5CCBA57F480DE68E53782BE381A6668A0100F36E5`.
  - `runs/round14-r1-off/stress-export-validation.json` — `551F840E5F10AFCAFA6950A171DC55D7A594FF423D763FA285FB945E9D7B082F`.
  - `round14-monitor/r1-off.process-monitor.json` — `AD12D247E8A585D03B32850CBBFA44DA67A8BFE211A9F91F6FE04F4EFEFF64A4`.
  - `runs/round14-r1-on/stress-export-validation.json` — `6ABFF3359025566D1312A535BFCAEE7A2D5EB9150A146B8D6F8A1C05FFF28C39`.
  - `round14-monitor/r1-on.process-monitor.json` — `EB6969C9C931D4B68935398B0CE1FC2BA548AF268901B2492F59052AC6B5F22F`.
  - `runs/round14-r2-off/stress-export-validation.json` — `69F91A7E3708309C66D646AA4D93368AA2A449F04B6E739DAAB999750CF00FE5`.
  - `round14-monitor/r2-off.process-monitor.json` — `CC9A89216331646876809BDC762F28FE4DBE4A561533E022DDDA0276C68E455C`.
  - `runs/round14-r2-on/stress-export-validation.json` — `6DB6D4DC5D58C71B9801A5F2AF85695B5B10E9FA63614630652E03CBF962B030`.
  - `round14-monitor/r2-on.process-monitor.json` — `295E2310132F4C1740601EC4E266FD629D8FB0174FDEB33F00647CFC9D98E25E`.
  - `runs/round14-r3-off/stress-export-validation.json` — `82F3686F003FBA4FF6B7125A108C0A1E14804AB242DB48AF6CE85ED9BD24B128`.
  - `round14-monitor/r3-off.process-monitor.json` — `83A7E013220F915D4C2E55D1BA0EAFC338C4E67CFD3B9DEA93A6135DA4958662`.
  - `runs/round14-r3-on/stress-export-validation.json` — `DF733479C8BFCA17B879454AD48AE1878F81C44AC486C0B9D1FCC24CEAF473F7`.
  - `round14-monitor/r3-on.process-monitor.json` — `CAFE5ECF4C33E53441472D172FEC2E5F9983A8BFEDFC4EDB55F6FDE1057AD5F7`.
- [Executado] Instrumentação opt-in foi testada desligada/ligada; os testes focalizados passaram `8/8`, e `npm run typecheck`, `npm run audit:architecture`, `npm run test:editor-v6` (`906` passaram, `1` ignorado), `npm run test:refactor` (`50/50`, repetido após `ad85912a`) e `npm run build` passaram. Commits: `b273f0f3` (marcadores de finalização) e `ad85912a` (repasse ao resumo). A verificação de caminho desligado confirmou que o coletor de tempo não é chamado por padrão.
- [Executado] O teste focalizado exigiu o carregador TS do projeto: `node --experimental-strip-types --import ./scripts/testing/register-typescript-extensions.mjs --test tests/editor-v6-export-finalization.test.mjs` passou `8/8`. Tentativa sem carregador falhou com `ERR_MODULE_NOT_FOUND`; a configuração Vitest V6 não inclui esse teste avulso; `npm exec -- node --test` tentou buscar `node@27.0.0-alpha.0.1.1` para o cache npm. Essas tentativas não alteraram arquivos rastreados.
- [Não feito] M1 tem N/D explícitos para duração isolada da limpeza, ID de worker, temperatura e assinatura por subetapa. Esses limites não bloqueiam M2-C; a causa dominante está medida por CPU-s e parede.

## M2 — Fase C1–C4 (23/11/2026)

- [Executado] C1 usou uma cópia verificada do projeto e capturas isoladas. O vídeo começa no quadro `764`; o arquivo antigo `[600,750)` não continha vídeo e foi substituído. Amostra ativa `[764,914)`: `150` quadros, `1920×2160`, `2.488.320.000 B`, SHA-256 `2DB2D7DE2BBED9AA2315F0D9456EC4887A1CEC15E2C6BD701BB8695B96A3881F`. Sem vídeo `[0,150)`: `150` quadros, `1920×1080`, `1.244.160.000 B`, SHA-256 `CC8D6308E7CFFD834B61A22698DC719792FC488D3554C233E1B25DAD8C56BC1E`.
- [Executado] A captura ativa comparando overlay ligado/desligado teve SSIM `0,945673` e PSNR `17,205863 dB`; os pixels diferem, logo a amostra antiga não sustentava aquela comparação. O índice completo dos artefatos está em `out/editor-v6-stress/round14-c-artifact-index.json`, SHA-256 `E7BAE6F7ED78C16093741FD230289DFBBEF1755CCD44E95EB47C9425749389CB`.

### C2 — teto do consumidor

- [Executado] `54/54` grupos válidos: `9` comparações × `6` execuções A/B/A/B/A/B; `4` processos FFmpeg × `150` quadros/grupo; intervalo mínimo entre inícios `61,317 s`. MP4s foram sondados para `150` quadros, `30/1`, `1920×1080`; saídas sem encoder foram validadas pelo contador de quadros do FFmpeg. Médias abaixo são medianas de `3` grupos, em `ms` e `CPU-s`.

| Comparação [Executado] | Controle → candidato: parede (ms) | Controle → candidato: CPU-s | Diferença de parede / CPU |
|---|---:|---:|---:|
| Sem vídeo, v0 produção → v1 filtros em null | 2.502,2763 → 1.317,1113 | 17,548 → 9,251 | −47,3635% / −47,2817% |
| Com vídeo, v0 produção → v1 filtros em null | 6.628,3355 → 5.855,4573 | 61,626 → 47,390 | −11,6602% / −23,1006% |
| Com vídeo, v0 produção → v2 encode de YUV preparado | 6.812,1895 → 2.489,1454 | 60,828 → 15,735 | −63,4604% / −74,1320% |

- [Executado] v2 é encode isolado de YUV já preparado, não uma medição ponta a ponta. Com vídeo, v3 alterando threads 1/2/4 reduziu a parede mediana em `6,1807%`, `8,3003%` e `7,9727%`; CPU-s mudou `−30,3428%`, `−6,4645%` e `−4,0021%`. v4 bilinear mudou parede `+0,1304%`; lanczos mudou `−1,7447%` e elevou CPU `1,3304%`; SSIM `1,000000`, PSNR infinito. Não há ganho útil demonstrado por interpolação.
- [Executado] No teste separado com AMF, `h264_amf` foi `2,8240%` mais rápido que `libopenh264`, mas os três pares tiveram sinais mistos; o arquivo ficou `1,615×` maior, SSIM `0,985803`, PSNR `42,794838 dB`. Encoder não promovido; o export real continuou usando `libopenh264`.
- [Executado] Resumo C2: `out/editor-v6-stress/round14-c-lab/round14-c2-summary.json`, SHA-256 `61018C4BAF2D8D6CB3BD0C78AEAE5CB50800060CBCE6DF022CC8D482EB849D84`. Temporários YUV/MP4 do laboratório foram removidos; as duas capturas BGRA e relatórios permanecem em `out/` para reprodução.

### C3 — teto do produtor por estágio

- [Executado] Comparação com quatro FFmpeg concorrentes, `150` quadros por worker e sequência A/B/A/B/A/B; `24/24` medições válidas com vídeo e `12/12` sem vídeo. Uma tentativa inicial com vídeo foi excluída: `-v error` suprimiu `frames/bench`, exigido pelo runner; FFmpeg encerrou com código `0`. Runner corrigido para `info`, sem falha do produto. Medianas de `3` medições válidas:

| Estágio [Executado] | Com vídeo: controle → candidato (ms; CPU-s) | Diferença de parede / CPU |
|---|---:|---:|
| Desligar só blend de overlay | 5.813,6579 → 5.627,9912; 47,532 → 46,531 | −3,1936% / −2,1059% |
| Remover decode/scale de vídeo, manter composição | 6.063,0184 → 3.759,1174; 46,548 → 26,718 | −37,9992% / −42,6012% |
| Trocar conversão BT.709/YUV por RGBA para null | 5.955,3214 → 6.151,7948; 47,046 → 49,703 | +3,2991% / +5,6477% |
| Filtros/composição completos → leitura raw | 5.711,1119 → 1.839,5665; 47,703 → 6,797 | −67,7897% / −85,7514% |

- [Executado] Sem vídeo, remover a conversão BT.709/YUV mudou parede `1.464,4114 → 1.471,5046 ms` (`+0,4844%`) e CPU `8,860 → 8,219 CPU-s` (`−7,2348%`); comparação de formato diferente, inconclusiva. Filtros completos → leitura raw: parede `1.438,4187 → 912,2045 ms` (`−36,5828%`), CPU `9,140 → 3,608 CPU-s` (`−60,5252%`). Overlay e decode de vídeo: não aplicáveis sem vídeo.
- [Suposição] O estágio de decode/scale de vídeo merece prioridade de investigação: a diferença observada foi `19,830 CPU-s/600 quadros`, maior que o incremento de encode v0→v1 com vídeo (`14,236 CPU-s/600 quadros`). São ensaios isolados com comandos diferentes; isso indica prioridade de medição, não ganho previsto no export completo. Nenhuma lógica do produto foi alterada.
- [Executado] Resumos: `round14-c3-stage-summary.json`, SHA-256 `E122EF1AF33B10545F4B96918E40BC928B9B327C978B45C0E5072D71AE72454C`; `round14-c3-no-video-stage-summary.json`, SHA-256 `0BD4246AA712DD297C8387F5A2E152BA84C7D431207332BFEE62BB07939FA084` (ambos em `out/editor-v6-stress/round14-c-lab/`).

### C4 — concorrência em export real

- [Executado] Usada a mesma cópia isolada, perfil UI, preset `2`, `libopenh264`, preparo de movimento `2`; todos os MP4s passaram validação: duração, FPS, quadros, áudio, emendas e `0` erros de limpeza. Sequência de `100 s`: workers `2,3,4` repetidos três vezes (9 exports), cada braço A/B/A/B/A/B e intervalo mínimo `102,75 s`. Sequência de `200 s`: workers `3,4` alternados três vezes (6 exports), intervalo mínimo `201,831 s`.

| Duração/workers [Executado] | Parede mediana; mín.–máx. (ms) | Variação entre 3 | CPU-s: 3 medições; mediana |
|---|---:|---:|---:|
| 100 s / 2 | 81.547,3032; 81.129,4855–85.584,3462 | 5,4629% | 408,328 / 395,140 / 396,515; 396,515 |
| 100 s / 3 | 78.070,4817; 77.650,0981–79.744,4280 | 2,6826% | 420,392 / 422,764 / 425,218; 422,764 |
| 100 s / 4 | 80.631,2692; 77.463,2455–80.634,0016 | 3,9324% | 423,219 / 427,828 / 418,609; 423,219 |
| 200 s / 3 | 171.205,1312; 168.770,1370–171.821,4138 | 1,7822% | 921,109 / 921,001 / 931,000; 921,109 |
| 200 s / 4 | 168.223,5476; 167.973,4126–169.676,0988 | 1,0122% | 964,314 / 960,827 / 952,655; 960,827 |

- [Executado] No corte de `200 s`, quatro workers venceram os três pares; três workers foram `1,7724%` mais lentos relativamente à mediana de quatro, com `4,1337%` menos CPU-s. A medida clique→MP4 validado também favoreceu quatro em `1,5963%`. A amostra de `100 s` favoreceu três na mediana, então ela não foi tratada como conclusão.
- [Suposição] Recomendação: manter o padrão atual de `4` workers. A evidência longa e pareada favoreceu quatro, mas a diferença mediana é pequena; não há mudança de produto nesta fase.
- [Executado] Os `15` exports produziram `3.000` quadros/`100 s` ou `6.000` quadros/`200 s`, `30/1`, `1920×1080`, H.264+AAC; `5` e `9` emendas, respectivamente. A segmentação foi `6` partes no corte curto e `10` no longo; a divisão do corte curto em `6` (não `5`) decorre da divisão em duas metades e lotes de boca de `600` quadros, aplicada igualmente aos braços. O runner reportou `processExitCode=null` em todos; por isso o código externo é N/D. Evidência de sucesso: relatório `passed=true`, ffprobe, log de conclusão e cópia temporária limpa. Não é falha do app.
- [Executado] Séries brutas: `round14-monitor/c4-100s-series.jsonl`, SHA-256 `C01E5A45C2BA820684BB249DAF465C99F14EE21CCC060421298575B032215887`; `round14-monitor/c4-200s-series.jsonl`, SHA-256 `741428EA0AA695A8DB5695AED24AAA343DA9E9A1875FDAD6D2412FD959E7DA39`. Diretórios de saída não contêm MP4 ou cópia `isolated-app-data`; `0` erros de limpeza.
- [Executado] Estado final M2: C1–C4 concluídas; padrão de export e número padrão de workers não foram alterados. O commit `e653bd7d` ajustou a janela do capturador bruto opt-in para selecionar o início da amostra e manteve `150` quadros por captura; `6442dd61` permitiu `--render-workers=3` no harness. Ambos são commits locais.
- [Executado] Verificações finais: `npm run typecheck` passou; `npm run audit:architecture` passou (894 arquivos TS/TSX, 0 erros, 0 imports ausentes, 0 violações); `npm run test:editor-v6` passou (187 arquivos passaram, 1 ignorado; 908 testes passaram, 1 ignorado); `npm run test:refactor` completou `50/50` comandos, sem falha; `npm run build` passou, incluindo o alvo nativo e `electron-vite build`; `git diff --check` passou.

## Próximos marcos

- [Executado] M3 / D0 e F1 — piso CFR medido e teste dourado criado; ver resultados abaixo.
- [Não feito] F2/F3 — perfis sem vídeo, export de 10 min e avaliação de candidatos nos três perfis.
- [Executado] D1 — replay CFR/NUT em captura real de 40 s; pixels idênticos e gate de transporte aprovado.
- [Executado] D2 — A/B real de 40 s concluído e rejeitado: ganho mediano `3,28121574%` (abaixo do gate pré-registrado de `5%`), pico amostrado de RSS do FFmpeg maior em todos os pares e divergência visual de NUT2 acima do piso CFR. A integração foi removida no commit `812e0c2b`; o teste de 200 s foi bloqueado pelo gate.
- [Não feito] E — microbenchmark WebCodecs independente de D.
- [Não feito] G — inventário e checker de IPC.
- [Não feito] H — opcional conforme tempo e gates.
- [Não feito] Z — retrospectiva e relatório índice/partes. Sem push.

## Registro de decisões e paradas

- [Lido] Os gates do plano bloqueiam apenas fases dependentes. A falha anterior de D3 não impede E, G nem H.
- [Não feito] Não há ainda decisão de autorização pendente do dono. Nenhuma configuração do Windows/Defender será alterada por esta rodada.

## M3 — D0 e F1 (23/11/2026)

- [Executado] D0 comparou 3 capturas da mesma parte `[600,1200)` (600 quadros a 30 FPS, 1920×2160 BGRA). Capturas 1×3 foram idênticas; 1×2 e 2×3 diferiram em 1/600 quadro, o quadro local `294` / timeline `894`, com 18 pixels alterados e delta máximo `[1,1,1,1]` por canal BGRA. A caixa foi `x=260–493`, `y=1782–2096` no bitmap empilhado.
- [Executado] Os três jobs completaram com `passed=true`; duração de parede: run1 `123,7467499 s`, run2 `261,3031226 s`, run3 `298,3207953 s`. A variação foi alta; esses tempos não são uma comparação de desempenho. Uma tentativa anterior com 4 workers foi rejeitada pelo harness porque o corte continha só 2 partes; repetir com 2 workers corrigiu o comando, sem falha do app. Logs do caso inválido: `out/editor-v6-stress/round14-monitor/d0-run1.stdout.txt` e `d0-run1.stderr.txt`.
- [Executado] A diferença ficou somente na metade inferior (foreground): 18 pixels; a metade superior (background/vídeo) teve 0 pixels diferentes. Os 18 pixels alterados foram registrados no diário de execução da tarefa; comparação visual das duas imagens-crop não identificou diferença perceptível. [Suposição] O padrão é compatível com arredondamento de rasterização/composição, mas a causa interna exata não foi provada.
- [Executado] SHA-256 bruto: run1 `37e48ec1eb69639efaead8278bc9d7b3a5fbdc6c0ccf89e32df228d85d4ae2bf`; run2 `647a42a925bb3aaf15947667f21d553d11c7f4b19d1c0602f5b128eb74ea331c`; run3 igual ao run1. Cada dump tem `9.953.280.000 B`. Comparações JSON em `out/editor-v6-stress/round14-monitor/d0-run1-vs-run2.json`, `d0-run1-vs-run3.json` e `d0-run2-vs-run3.json`.
- [Executado] O teste dourado F1 foi pré-registrado antes de gerar sua referência. O limite foi derivado do maior ruído observado no D0: até 1 quadro diferente em 90 no foreground, até 18 pixels nesse quadro, delta máximo de 1 por canal; a camada background deve permanecer exata (0 pixels), pois permaneceu exata nos dois pares D0 com diferença. A caixa delimitadora será registrada por quadro.
- [Suposição] Projetar o teto observado em 600 quadros para uma fixture de 90 quadros por `ceil(90/600)` permite até 1 quadro divergente; manter o máximo observado de 18 pixels e delta 1 evita afrouxar a intensidade medida.
- [Executado] A fixture F1 é sintética, 90 quadros/3 s a 30 FPS e 320×180: frames 0–44 sem vídeo, 45–89 com vídeo; fala nos frames 22–61; transição de personagem no frame 30; cabelo animado; Turbo em duas partes com emenda no frame 45.
- [Executado] Espaço livre antes de preparar as saídas da fixture: `25.055.567.872 B` em C:. A geração e o teste usarão somente arquivos temporários descartáveis e arquivos em `out/`; nenhuma leitura ou alteração de projetos reais será feita.
- [Executado] Quatro tentativas iniciais expuseram defeitos no harness/fixure: o bake sintético omitia `faceAsset`; a métrica de cabelo exigiu a flag diagnóstica opt-in; a captura sem vídeo chega como cena única, enquanto a parte com vídeo chega separada; e a primeira cópia candidata omitiu a cena única. Esses casos não demonstraram falha do app. A candidata incompleta ficou em `out/editor-v6-golden-export/reference-candidate-incomplete`; a gravação final recusou sobrescrever e completou.
- [Executado] `npm run test:editor-v6:golden-export` passou em `7,221565 s` incluindo build. O export completou sem fallback: `90` quadros, `320×180`, `30/1`, `1` entrada de vídeo, partes `[0,45)` e `[45,90)`, `3` atlas de boca, `1/1` transições preparadas e `83` quadros de rasterização do cabelo. O MP4 decodificou `90` quadros (`15.552.000 B` RGB24); a amostra em `(10,10)` mudou entre os frames `44` e `45`.
- [Executado] A comparação avaliou `135` bitmaps BGRA (45 cenas sem vídeo, 45 fundos e 45 foregrounds com vídeo): `0` quadros diferentes, `0` pixels diferentes, delta máximo `0`, sem caixa delimitadora. O MP4 foi sondado para resolução/FPS/contagem e verificado na emenda; não há golden por pixel para a saída H.264 decodificada.
- [Lido] A flag `GACHA_EDITOR_V6_PHASE2_DIAGNOSTICS=1` é ligada somente ao redor do export sintético no processo Electron isolado, para registrar `hairRasterFrames`; fora deste teste, a coleta continua opt-in e desligada por padrão.
- [Executado] Referência comprimida: `984.152 B` no total, abaixo do teto de `5.000.000 B`. Manifesto `tests/editor-v6/fixtures/golden-export-v1/golden.json`, SHA-256 `837742bc0300a79f015eb51d02d411813d0ed33c75a4b16175446b5bdf9da4dc`; `scene.bgra.gz` `35dc4fd430e6c77d8f97aa5756a45863377b60cfded351655473de8b3dac331e`; `background.bgra.gz` `f0b19a399dadf3094e457937101837323d008550bda097d626def854c8df04bf`; `foreground.bgra.gz` `eac89f9aa027c1f8e7dc1aea12d6c59e1a7dbb2824ecc87e0d91dbee899fdf33`. Referência gerada de `f99d9b05692f9336c0da180e66dd09124de36da9`.

## D1 — replay de quadros por corrida (23/11/2026)

- [Executado] A cópia autorizada do projeto foi verificada antes da captura: ID `408a77d1-d964-4c04-a66b-f4e9fcfeee46`, `3.687` arquivos, `966.335.489 B`. O export diagnóstico capturou partes contíguas `[0,600)` sem vídeo e `[600,1200)` com vídeo, cada uma a 30 FPS; BGRA `1920×1080` e `1920×2160`, respectivamente. Captura completa: `1.200` quadros/`40 s`, 2 workers, saída H.264+AAC. Essa execução tinha instrumentação e dumps ativos; seu tempo de parede (`385.982,8627 ms`) não é benchmark de comparação.
- [Executado] Bytes da captura: parte sem vídeo `4.976.640.000 B`, `600` quadros × `8.294.400 B`; parte com vídeo `9.953.280.000 B`, `600` × `16.588.800 B`. O mapa RLE foi recalculado lendo o BGRA bruto, e os comprimentos coincidiram com `frameSequenceDiagnostics.runLengths`: sem vídeo `169` corridas/quadros únicos e `431` repetidos; com vídeo `151` e `449`. Total `320` únicos, `880` repetidos; `11.023.257.600 B` evitáveis (`73,8333333333%` dos `14.929.920.000 B`).
- [Executado] SHA-256 dos BGRA: sem vídeo `4d026f73654d7a8ed1085cd6d0f2f68e6cf4f1842425dd65dfd67427dc7a8381`; com vídeo `866b4edda378dc3592377439b5878223e82d440b8ffe3577f739f5bcdf66cd22`. Vídeo de entrada `1.043.264 B`, SHA-256 `0d1834b2482c5ec94285f47b861a582c2b0021caaee127e9c716ac165d37b9d9`.
- [Executado] Replay alternado CFR/NUT/CFR/NUT (`A/B/A/B`): quatro saídas MP4 de `40 s`, `1.200` quadros, `1920×1080`, `30/1`. Cada parte tem `600` quadros/`20 s`. Todo MP4 final tem `12.171.900 B` e SHA-256 `3de78fd311da1be6483d0996266c26f428e9402ef2c82a6f170034a3037ce726`; hashes das partes também coincidem entre braços: sem vídeo `3.417.504 B` (`c66ea490e18287452fcb6dc5a53d1a4ee36b8e8e1f9a9fcf3c9e50a99665f303`), com vídeo `8.754.600 B` (`9bb215b9038610a0890a3f6e776fc624b22479889e5578ad91b1aff09e029db7`).
- [Executado] Comparação decodificada RGB24 dos `1.200` quadros: CFR1↔CFR2, NUT1↔CFR1, NUT2↔CFR2 e NUT1↔NUT2 tiveram `0` quadros diferentes, `0` pixels diferentes e delta máximo `0`. Frames de borda `0`, `599`, `600`, `1199` também coincidiram. O arquivo final repetido nos quatro braços confirma igualdade do resultado desta amostra.
- [Executado] CFR1 foi preservado/reutilizado de uma execução anterior do harness, portanto seu intervalo de parede é N/D; CFR2 foi `43,589 s`, NUT1 `15,002 s`, NUT2 `14,889 s`. Esses tempos não sustentam comparação A/B: A1 não tem relógio, e os braços incluem escrita/leitura/concatenação de arquivos em ambiente com carga não controlada. Nenhuma alegação de ganho é feita. D1 mede equivalência do transporte, não a aceleração fim a fim.
- [Executado] A entrada NUT foi raw BGRA com `time_base=1/30`, PTS no início de cada corrida e quadro terminal para fechar a duração; `fps=30` expandiu as corridas antes da composição. Foi um replay fora do produto, sem alteração de `exportFramePipeline.ts`, sem áudio e sem validar sincronismo A/V; esses itens ficam N/D. Decisão D1: **passou o gate de pixels/estrutura para iniciar D2**, não promove NUT ao caminho padrão.
- [Executado] A preparação do replay exigiu corrigir quatro defeitos do harness (ID de projeto não aceito; import TS incompatível com Node strip-only, contornado com bundle esbuild; diretório não criado; stdout do ffprobe não coletado). Um replay parcial anterior foi preservado e reutilizado, sem sobrescrita destrutiva. Nenhum desses erros foi falha do export do produto.
- [Executado] Brutos em `out/editor-v6-stress/dumps/round14-d1-capture/` e `out/editor-v6-stress/runs/round14-d1-replay-02/`. Resumo de captura SHA-256 `7e72ffaad47178d6056b050983f8b45e2e761fad5b12e51d6133bbbf03c232ab`; mapa de replay `8c15614397f6fe6da6497b882c0b77f63f6e85efa8b2086e5bcbcb0cb6228ff1`; qualidade `c4aa382f9f0548d5ba8ad4f2334a8ed724114fa7ae83575723c3303f3e87f482`; resultado completo `54d73c9214766a0f17f7657a73c4b7f19451148ab4a9ff0afde5bd6aa8ed83b2`. Replay isolado SHA-256 `7d395cbd24095efb8224c25a121a167762fe0d29c1999e16a115642a6a68f85e`; bundle do writer `109abd88638c230a45ab309ad3efcf91647a2c527e74b15adcf67db15ac2112b`.

## D2 — integração NUT opt-in, piloto de 40 s (23/11/2026)

- [Executado] A/B alternado `CFR1, NUT1, CFR2, NUT2, CFR3, NUT3`, intervalo de `60.000 ms`, corte `[0,1200)`, `1.200` quadros/`40 s`, `1920×1080`, `30 FPS`, H.264+AAC, `2` workers. Os seis jobs usaram a cópia verificada `408a77d1-d964-4c04-a66b-f4e9fcfeee46`, preset `2`, e fonte `c06d7227`; todos os MP4s passaram validação.
- [Executado] Parede (ms), cada braço com três repetições: CFR `40.390,5231 / 40.588,7562 / 39.947,2764`; NUT `39.710,9417 / 38.849,1143 / 39.065,2229`. Medianas: CFR `40.390,5231 ms`, NUT `39.065,2229 ms`; ganho mediano `3,28121574%`. Mínimos: CFR `39.947,2764 ms`, NUT `38.849,1143 ms`; ganho mínimo-a-mínimo `2,74902872%`. Gate definido antes: mediana **e** mínimo ≥ `5%`; não passou.
- [Executado] CPU-s por braço na ordem das execuções: CFR `124,967689 / 131,378412 / 123,209163`; NUT `125,869292 / 116,992357 / 117,582763`. Medianas `124,967689` e `117,582763 CPU-s` (NUT `−5,909468%`). Threads lógicas médias por execução: CFR `3,094 / 3,237 / 3,084`; NUT `3,170 / 3,011 / 3,010`. CPU medida pelo delta de `cumulativeCPUUsage` de Electron e sampler de processos Windows, com amostras de `500 ms`.
- [Executado] Em todos os NUT, o contador confirmou transporte NUT: `320` quadros únicos de `1.200`, `880` quadros repetidos e `322` pacotes (inclui dois terminais). Payload BGRA lógico `14.929.920.000 B`; NUT escreveu `3.931.554.556 B`; evitou `10.998.365.444 B` (`73,66660668%`).
- [Executado] Mediana de RSS somado amostrado não é medida de RAM física única, pois processos podem compartilhar páginas. Máximo somado por job: CFR `6.370.041.856 / 6.466.887.680 / 6.413.684.736 B`; NUT `6.862.868.480 / 6.760.480.768 / 7.102.349.312 B`. O pico do processo FFmpeg também foi maior em cada par: CFR `195.444.736 / 218.955.776 / 240.013.312 B`; NUT `587.595.776 / 427.728.896 / 448.917.504 B`.
- [Executado] Os seis MP4s: `40,000 s`, `1.200` quadros, `30/1`, AAC estéreo `48 kHz`; drift final `0 ms`. PCM decodificado `7.680.000 B`, mesmo SHA-256 `4d44261930603c91ff433a0a545bd7efb641cd521e30fb03de2c0d62056e1ab5` em todos.
- [Executado] Piso de captura da própria série: CFR1=CFR3; CFR2 difere de cada um apenas no sample/timeline `599`, `188` pixels, delta máximo `3` por canal. NUT1 e NUT3 ficaram próximos desse piso. NUT2 divergiu dos controles em seis amostras de BGRA (timeline `0,29,30,149,259,300`), `1.764` pixels por amostra, delta máximo `72`, caixa `x=91–245, y=238–275`, localizada nos olhos do personagem. No MP4, a amostra de frame `300` diferiu em `589.595` pixels, delta máximo `71`. Causa ainda não identificada; isso excede o ruído CFR desta série.
- [Executado] Decisão D2: **removido**. Nem o ganho de parede nem a memória passam os critérios; há também uma divergência visual real acima do piso do controle. O piloto de `200 s` e D3 ficam bloqueados. A integração e a flag foram removidas em `812e0c2b`; o writer NUT isolado de D1 permanece. A rota padrão CFR não foi alterada.
- [Executado] Série bruta `out/editor-v6-stress/runs/round14-d2-40s-series-05/series-result.json`, SHA-256 `D5049915CD9F0D9890CE60445E1879557E62AE01C5439CADD513938B3B0CCA67`; qualidade `quality-comparison.json`, SHA-256 `9A09087943157C7D1F7F1545C4D47A00577D341C06B7887781AFC220C3890E6C`; pares `quality-comparison-pairs.json`, SHA-256 `674EB9379CFC76FEC4DB3361BF8C0136D78A1ED23EEF54727985B1C527826504`. MP4s e brutos seguem em `out/` e não entram no Git.
