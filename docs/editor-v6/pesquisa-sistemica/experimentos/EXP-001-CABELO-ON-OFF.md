# EXP-001 — Perfil causal cabelo ON vs OFF

**Status:** PROTOCOLO PREPARADO — NÃO EXECUTADO.  
**Origem:** [Pesquisa 01](../pesquisas/01-ARQUITETURA-GERAL-E-INTEGRACOES.md) e [Pesquisa 10](../pesquisas/10-ANIMACAO-CABELO-FACE-BOCA.md).

## Pergunta

**[RELATO ATUAL]** Projeto **Teste de Importação — Personagens do Pacote** exportou com cabelo ON em **1min31s (91s)**. OFF atual ainda não medido; duração/frame count devem ser apurados. O antigo 50s/9s foi outro projeto e não é comparável. Onde se gastam os 91s e quanto muda OFF no mesmo snapshot frio?

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
