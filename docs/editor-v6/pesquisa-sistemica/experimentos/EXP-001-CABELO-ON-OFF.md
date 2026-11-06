# EXP-001 — Perfil causal cabelo ON vs OFF

**Status:** PROTOCOLO PREPARADO — NÃO EXECUTADO.  
**Origem:** [Pesquisa 01](../pesquisas/01-ARQUITETURA-GERAL-E-INTEGRACOES.md) e [Pesquisa 10](../pesquisas/10-ANIMACAO-CABELO-FACE-BOCA.md).

## Pergunta

O usuário observou **50s com cabelo animado vs 9s com cabelo estático no mesmo vídeo de 10s**. Onde foram gastos os aproximadamente 41s extras? O botão OFF muda somente a animação ou outras rotas de preparação/renderização? A diferença persiste no mesmo binário, contexto e cache?

## Prerrequisitos e proteção de dados

- Projeto `editor v6 06` somente em **cópia autorizada, isolada e verificada por hash**, com referências de Fabricador, Customizador, biblioteca e preset presentes. Não ler/modificar o perfil original.
- Registrar branch, SHA, `git status`, Windows 11, CPU, GPU, driver, versão Electron/Chromium/Node/FFmpeg.
- Validar relatório de 300 frames a 1920×1080/30 FPS, encoder fixo, Turbo constante, audio/video e mesma timeline.
- **Não usar** diretamente `scripts/editor-v6/benchmark-project-export.cjs` em projeto não autorizado: o script restringe o título de sua fixture. Um futuro harness genérico precisa manter isolação e verificação, não relaxar proteções.

## Protocolo A/B

1. Verificar cópia hash/id/revisões/patches de fonte; documentar diferença dos flags ON/OFF em `EditorV6ExportPanel.tsx`.
2. Fixar configurações de `startFrame=0` e `endFrame=300`, presets, tempo, resolução, encoder, fontes, qualidade, mouth loop e media overlays.
3. Executar **A(ON), B(OFF), B(OFF), A(ON), A(ON), B(OFF)** com cache igualmente controlado (ou três pares frios independentes), sem editar entrada.
4. Capturar clique→MP4 validado; incluir **preparação de cabelo ANTES de startExport** e fases internas de Main.
5. Registrar em relatório sanitizado: `hairPreparation.totalMilliseconds`, preparação de personagens/superfície, `motionPreparation`, número de bakes/cache hits, `hairCompositionMs`, `hairRasterFrames`, `hairRasterPixels`, `reactCommitMs`, `capturePageMs`, `captureBitmapMs`, `ffmpegWriteMs`, probes, encoding, concat, audio, validation; verificar existência real de cada campo antes de escrever parser.
6. Comparar total por condição (mediana, dispersão, frio/quente), sem somar wall-clock de workers paralelos.
7. Validar MP4 e quadro/áudio com `ffprobe`/amostras RGBA e registrar limitações.

## Resultado esperado para decidir

- Se custo concentrado em preparação dupla de fontes/face: testar `EXP-CHAR-001` e/ou ROI preparado.
- Se custo por frame em `composeHairFrame` e Canvas/SVG: testar [EXP-003](EXP-003-ROI-CABELO.md).
- Se custo concentrado em captura: testar [EXP-002](EXP-002-CAPTURA-OFFSCREEN.md).
- Se não houver diferença reproduzível: rejeitar causalidade provisória e investigar cache/build/inputs.

**Aceite:** evidência que explique grande parte da diferença observada, sem perder nenhuma funcionalidade ou exigir mudança no projeto pessoal.
