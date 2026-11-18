# Editor V6 — Rodada 07 · Diagnóstico do tempo real de exportação

**Data:** 03/11/2026 (Brasília). **Branch de referência:** `Dev-V2`. **HEAD observado:** `8dc5f864af4d7c528d0ee71a01d679844543881a`.

## Verificações desta retomada

- O workflow `Editor V6 - parity and export contracts`, run [41759931429](https://github.com/nestarasup-sys/Native-gacha/actions/runs/41759931429), terminou com sucesso nos quatro jobs: Ubuntu, Windows, arquitetura/TypeScript e paridade de pixels MP4 real no Windows.
- O benchmark real com cabelo já reúne três rodadas de 300 quadros com `hairPreparationWallMs`, `mainExportWallMs` e `clickToValidatedWallMs`, além de `phaseMilliseconds` e `partTiming` por parte, em `electron/main.ts`.
- Em `exportRunner.ts`, `frameRoundTripMs` engloba o resultado do worker; `ipcDrawMs` e `captureMs` são medições internas; `hairCompositionMs` está dentro do desenho; `ffmpegWriteMs` mede a espera pelo callback da escrita (incluindo backpressure), não toda a codificação. Parte dos tempos de dois workers ocorre em paralelo.
- `runEditorV6ExportCommand` chama `prepareHair` **antes** de `startExport`; só o relatório do processo Main não mede o intervalo completo.

**Nenhum benchmark do projeto pessoal `Editor V6 06` foi executado nesta retomada.** Os backups de mídias, dados dos personagens, sessão Chromium e preset não estão disponíveis no GitHub. O alvo de 10–15 s não está comprovado.

## Entrega técnica: análise numérica sem alterar o exportador

Novo `scripts/editor-v6/analyze-hair-benchmark.cjs`:

- Lê **somente** o JSON `stress-export-validation.json` já produzido pelo benchmark isolado com `--hair-preset-slot=2`; não abre projetos, vídeos, assets, perfil Electron ou localStorage.
- Confere que são três rodadas válidas, 300 quadros, mesmo preset/fingerprint, FPS e dimensões; exige áudio coerente e alerta para troca de encoder/opções e falta de amostras.
- Exibe tempo ponta a ponta e FPS efetivo (300 / segundos), mediana das três execuções e mediana das aquecidas; preserva a distinção entre frio e quente.
- Ordena preparo do cabelo e fases de Main por mediana **sem somar métricas aninhadas**.
- Para os timers de cada worker, mostra separadamente **maior total de uma parte** e **soma das partes**. Nenhum desses valores é apresentado como tempo de parede recuperável; o segundo pode incluir concorrência.
- Omite IDs, fingerprints, nomes de arquivos, diretórios, conteúdo visual, mídia e dados pessoais da saída textual.

### Como executar quando o benchmark isolado real já existir

A partir da raiz do repositório, na branch `Dev-V2`:

```powershell
node scripts/editor-v6/analyze-hair-benchmark.cjs "out/editor-v6-stress/runs/<execucao-isolada>/stress-export-validation.json"
```

Os `<>` são placeholders. A fonte deve ter sido produzida pelo fluxo de backup verificado documentado em [Rodada 05](RODADA_05_V4_RETOMADA_BENCHMARK.md). Não apontar o benchmark para o `app-data` pessoal em uso nem enviar o relatório bruto ao GitHub.

Para executar os cinco testes sintéticos, sem mídias reais ou binários FFmpeg:

```powershell
node --test tests/editor-v6/analyzeHairBenchmark.test.cjs
```

### Critério para a próxima otimização

1. Medir no mesmo computador, mesmas opções, três MP4s validados com Preset 2, 300 quadros e áudio preservado, incluindo tempo de preparo; repetir a partir de cópias confiáveis e caches isolados.
2. Usar a maior fase por **tempo de parede** para selecionar o experimento. Se `rendering` dominar, confrontar os valores por parte de `frameRoundTripMs`, `ipcDrawMs`, `captureMs`, `hairCompositionMs`, `reactCommitMs`, `rafWaitMs` e `ffmpegWriteMs`. Os totals de worker são sinais, não parcelas independentes do tempo total.
3. Implementar uma hipótese reversível por vez, comparar A/B no mesmo cenário, verificar pixels e MP4 (primeiro/último quadro, cabelo, boca, flip, poses, emendas e áudio), memória e cancelamento. Não diminuir FPS, resolução, textura ou movimento.

## Limitações de verificação

Esta rodada acrescenta apenas analisador e testes, sem modificar o exportador nem dados de projeto. Os seis testes `node --test` passaram no ambiente disponível. **Não** foram executados localmente `npm run build`, `npm run typecheck`, `npm run test:editor-v6` nem o benchmark real, pois o checkout completo e os dados pessoais do projeto não estavam disponíveis. A CI da atualização deve ser conferida após a publicação. A meta de tempo continua pendente de medição real.
