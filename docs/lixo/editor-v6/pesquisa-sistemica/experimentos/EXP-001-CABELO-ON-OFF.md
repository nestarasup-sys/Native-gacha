# EXP-001 — Perfil causal cabelo ON vs OFF

**Status:** baseline fria inicial concluída no LAB; 3 hair ON + 2 controles sem cabelo completos. Rodada ON 3+3 para A/B com captura em [EXP-002](EXP-002-CAPTURA-OFFSCREEN.md).
**Origem:** [Pesquisa 01](../pesquisas/01-ARQUITETURA-GERAL-E-INTEGRACOES.md) e [Pesquisa 10](../pesquisas/10-ANIMACAO-CABELO-FACE-BOCA.md).

## Pergunta

**[RELATO ATUAL]** O usuário informou 91s. No LAB, 3 exports frios ON mediram 120,72 / 116,32 / 114,62s (mediana 116,32s); 2 controles completos sem cabelo mediram 68,04 / 68,01s (mediana 68,03s). O relato de 91s não foi reproduzido; preset original desconhecido. O antigo 50s/9s foi outro projeto e não é comparável.

## Prerrequisitos e proteção de dados

- Projeto `Teste de Importação — Personagens do Pacote` somente em **cópia autorizada, isolada e verificada por hash**, com referências de Fabricador, Customizador, biblioteca e preset presentes. Não ler/modificar o perfil original.
- Registrar branch, SHA, `git status`, Windows 11, CPU, GPU, driver, versão Electron/Chromium/Node/FFmpeg.
- Confirmar **duração real e número de frames do projeto atual**. Manter a resolução, fps, Turbo, encoder, áudio/vídeo e timeline idênticos na comparação. Os 300 frames pertencem à fixture histórica, não à baseline atual.
- **O script `benchmark-project-export.cjs` já restringe exatamente o projeto atual.** Revisar seu backup e os argumentos `--motion-cache`/`--session-data`: eles podem restaurar cache de outra execução. Manter cópia verificada e guardas, mas garantir sessão e export **inteiramente frios** no LAB. Ver [runbook](../LABORATORIO_CODEX_EXPORTACAO_FRIA.md).

## Protocolo A/B

1. Verificar cópia hash/id/revisões/patches de fonte; documentar diferença dos flags ON/OFF em `EditorV6ExportPanel.tsx`.
2. Fixar **a duração real do projeto atual**, opções, presets, resolução, encoder, fontes, mouth loop e overlays; não herdar `endFrame=300` sem conferir.
3. Para cada ON/OFF, criar novo processo/sessão e limpar apenas artefatos derivados na área temporária do LAB. Fazer primeiro um par frio diagnóstico e reservar **3+ pares frios** para validação final. Nunca executar variantes com cache de export anterior.
4. Capturar clique→MP4 validado; incluir **preparação de cabelo ANTES de startExport** e fases internas de Main.
5. Registrar em relatório sanitizado: `hairPreparation.totalMilliseconds`, preparação de personagens/superfície, `motionPreparation`, número de bakes/cache hits, `hairCompositionMs`, `hairRasterFrames`, `hairRasterPixels`, `reactCommitMs`, `capturePageMs`, `captureBitmapMs`, `ffmpegWriteMs`, probes, encoding, concat, audio, validation; verificar existência real de cada campo antes de escrever parser.
6. Comparar somente **exportações frias**; diferenciar tempos de parede de durações acumuladas por workers em paralelo. Limitar volume de MP4/frames temporários, excluindo os temporários do LAB após verificar os resultados.
7. Validar MP4 e quadro/áudio com `ffprobe`/amostras RGBA e registrar limitações.

## Resultado esperado para decidir

- Se custo concentrado em preparação dupla de fontes/face: testar `EXP-CHAR-001` e/ou ROI preparado.
- Se custo por frame em `composeHairFrame` e Canvas/SVG: testar [EXP-003](EXP-003-ROI-CABELO.md).
- Se custo concentrado em captura: testar [EXP-002](EXP-002-CAPTURA-OFFSCREEN.md).
- Se não houver diferença reproduzível: rejeitar causalidade provisória e investigar cache/build/inputs.

**Aceite:** caracterizar a baseline atual de 91s ON e medir novo controle OFF no mesmo projeto sem cache quente; melhorar tempo clique→MP4 com paridade, dados originais preservados e sem armazenamento pesado de exportação.

## Rodada atual — baseline equivalente ao botão UI

Em 06/11/2026, a baseline UI completa foi repetida em 3 exportações frias por encoder, cada qual com processo/sessão novos e cache vazio. Perfil: preset 2 da UI, posterior-only e reação a pose, 1080p30 Turbo, 2 lanes, projeto inteiro 2.394 frames, áudio e caminho de comando + IPC UI. Destino/dialog foi substituído por pasta descartável fixa; tempo humano de diálogo = 0 e não entra no número.

- Ryzen 5 4600G + Radeon RX 7600 (driver 32.0.32015.7029), Electron 45.1.0, FFmpeg 8.1.2.
- `auto` escolheu `h264_amf`: 83,18 / 90,12 / 84,83s, mediana **84,83s**.
- `cpu` escolheu `libx264` (`veryfast`): 85,20 / 82,44 / 81,47s, mediana **82,44s**. Ganho mediano observado de 2,8%, pequeno frente à dispersão; três amostras por backend e execução não intercalada limitam a inferência.
- Ambas validaram contagem de 2.394 quadros, 1920×1080, 30fps e áudio. Em um trecho de 150 quadros comparado após decodificação: SSIM 0,996750, PSNR 50,710dB; fluxo AAC decodificado foi byte-a-byte igual. Isto é uma amostra curta e não substitui inspeção perceptual de todas as cenas.
- O CPU anterior falhava porque o runner tentava somente `libopenh264` e o FFmpeg presente não lista esse encoder; `libx264` estava disponível e agora é primeira escolha CPU e fallback. Não é possível comparar com a configuração desconhecida do relato de 91s.
- O controle sem cabelo ainda não foi repetido em três execuções com o mesmo perfil UI; não afirmar quanto do tempo total é causado pelo cabelo.

Próximo: profiling de preparação pré-export de motion (mediana por corrida ~17s) e renderer/captura (~52–59s por export), separando duração por lane da parede.

## Rodada causal e melhoria de crop — 06/11/2026

### Correção de equivalência e perfil de encoder — 06/11/2026

- Controle OFF agora abre renderer harness isolado e inicia a exportação por `runEditorV6ExportCommand`, IPC de start/status e validação do MP4. Cada amostra usa Electron, sessão e perfil novos, cache-fonte vazio, preset/encoder/dimensões/frames/workers/áudio iguais; a variável funcional é o pacote/preparo do cabelo.
- ON `veryfast` anterior: 83,63 / 84,27 / 85,12s, mediana 84,27s. OFF `veryfast`: 70,55 / 73,53 / 75,90s, mediana 73,53s. A diferença (~10,74s) inclui preparação e composição do cabelo.
- x264 manteve 12Mbps, mudou somente o preset. OFF `ultrafast`: 71,13 / 68,68 / 68,83s (mediana 68,83s; −6,4%). ON: 79,63 / 81,43 / 80,11s (mediana 80,11s; −4,9%). Uma referência ON adicional `veryfast` marcou 83,01s.
- Comparação após decodificar todos os 2.394 quadros: OFF SSIM 0,997868 / PSNR 52,827dB; ON SSIM 0,997842 / 52,763dB. As três saídas `ultrafast` foram iguais entre si contra a referência integral `veryfast`.
- PCM estéreo dos quatro MPs ON e dos quatro OFF teve SHA-256 igual (`E72AE067768F910136491DAF7291ECA47685BB897352215F6667B7A2D29C98CA`); H.264 1080p30, áudio, quatro clipes e zero escrita no cache passaram validação. Sem perda visual material observada; bytes MP4 distintos são esperados.
- **Decisão:** preset padrão libx264 no LAB passa a `ultrafast` a 12Mbps. Overrides do estudo ficam restritos a benchmark isolado/allowlist; `auto`, AMF e fallback permanecem disponíveis.

### Lanes de Motion e render — teste sem promoção

- O diagnóstico de uma exportação ON mostrou 39 transições, 37 planos únicos, 2 repetições, 53 rigs preparados/24 reusados, zero reconstruções e 16,43s em Motion. As sequências estão divididas por personagem em lanes estáveis.
- Três lanes Motion no projeto inteiro: 80,68s; pico de bake simultâneo continuou em 2 (há apenas dois personagens com trabalhos independentes neste projeto), Motion 18,22s e RSS Main 862MiB. Não acelera frente à mediana ultrafast de duas lanes (80,11s); **não promover**. O override fica apenas para futura medição em cenas com ≥3 personagens independentes.
- Quatro render workers no projeto inteiro: 80,18s/2.394 quadros, 50,92s de fase render e RSS Main 1.060MiB. Mediana ultrafast de duas lanes foi 80,11s e render 51,20s; diferença menor que dispersão, sem redução confiável de parede e com mais RAM. **Não promover; padrão segue duas lanes.**
- Ambos os testes completos preservaram áudio/contagem/1080p30 e zero gravação de cache. Configuração de concorrência permanece somente no harness offscreen e não altera o produto.

### Controle sem cabelo

Três corridas frias `--no-hair-control`, perfil CPU, projeto inteiro: **74,76 / 74,29 / 76,88s**, mediana **74,76s**. Cada saída validou 2.394 quadros, 1920×1080, 30fps e áudio (4 clips). O controle parte do runner direto, enquanto hair ON mede preparação pré-job e comando UI; portanto a diferença de 7,37s contra ON 82,13s é aproximada e inclui diferença de harness. Não atribuir integralmente ao cabelo.

### Remoção de cache persistente de motion

O serviço Electron gravava atlases JSON até limite de 768MiB. Nas corridas anteriores foram observadas escritas agregadas de ~70MB, embora o cache estivesse frio. Agora o contrato interno envia `cacheScope` UUID em todos os bakes de transição e boca por export, não consulta nem grava cache de disco, isola reuso em memória de outros jobs e elimina essas entradas ao encerrar o job completo. `paint-event` continua experimental; não foi modificado nesta etapa.

### Scan alfa de crop

`measureFaceModeCrop` acumulava 4,38s de parede agregada por amostra (mediana de 3 exportações, durações de workers somadas não são parede). `canvasFaceAlphaBounds` lê os mesmos bytes RGBA empacotados em `Uint32Array` e extrai o alpha conforme endianness; conserva o limiar `>8`, limites inclusivos, canvas vazio/opaco e caminho fallback. Teste específico: 4/4.

- Medição antes: crop 4,38s mediana; export sem mudança do scan 86,54s mediana (3×).
- Medição depois: crop 3,72s mediana (3×; ~15% menor); export 80,94 / 87,85 / 82,13s, mediana 82,13s.
- A baseline CPU inicial (82,44s) está dentro de ~0,4% da mediana depois. Devido à dispersão e grupos não intercalados, afirmar apenas melhoria da etapa do scan; o ganho total não é robusto ainda.
- Pico RSS Main 846,7–971,2MiB; todas as saídas finais 2.394 frames com áudio e zero bytes de motion cache persistente.

**Decisão:** manter a remoção de disco por requisito de cache frio e a otimização de scan por redução reproduzida sem alterar o critério de crop. Próxima prioridade: diminuir renderização (~54s) com comparação de H.264 disponível no hardware; depois investigar crop/face prep por input/cache local.
