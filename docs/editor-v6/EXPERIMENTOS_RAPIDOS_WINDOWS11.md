# Editor V6 — Quadro vivo de hipóteses e experimentos rápidos (Windows 11)

> **Rodada 16 / 04-11-2026**. Documento principal: [Pesquisa sistêmica](PESQUISA_SISTEMICA_MOTORES_E_EXPORT_2026-11-04.md). Atualizar **um registro por experimento**, inclusive os rejeitados. Não significa que os testes tenham sido executados.

## Regras de execução

- **Somente Windows 11 x64 do usuário** para benchmarks, com GPU AMD/`h264_amf`; CI hospedada Windows Server x64 para regressões. Não executar Linux.
- Preservar projeto pessoal, backups, profile, arquivos locais, launcher `ABRIR_DESENVOLVIMENTO_2.bat` se existente. Usar cópias isoladas verificadas. Nunca forçar push, `git reset --hard`, `git clean -fd`.
- **Sem cache de reexportação** (R10 removida). Trabalho de compilação realizado no salvamento do personagem não é cache de MP4 e deve ter seu tempo contabilizado.
- Não reduzir 1920×1080, 30 FPS, qualidade, áudio, número de poses/amostras, cabelo físico, antialias, boca e máscaras para mostrar ganho.
- Não tratar FPS de `sharp` em quadro idêntico como FPS real; sempre 30 frames **diferentes** na prova curta.
- Decidir rápido: abortar no primeiro problema visual inexplicado, regressão relevante de RAM/VRAM ou falta de relação com gargalo.

## Funil de decisão

| Gate | Procedimento | Aceite |
| --- | --- | --- |
| **G0 — custo** | 1 bake + até 30 frames com instrumentação separada por fase | Existe um custo de parede relevante atacável |
| **G1 — microprova** | Uma fixture de personagem, 7 samples e alpha/expressões | Mesmos valores/RGBA ou diferença rigorosamente caracterizada |
| **G2 — 30 frames** | Frames distintos, comparação por pixel, p50/p95, memória | Trabalho completo mais rápido, sem erro visual |
| **G3 — integração curta** | Feature flag/novo módulo isolado, fallback, testes direcionados | Build, typecheck e testes sem regressão |
| **G4 — 300 frames reais** | 3 exportações e A/B equivalente no Win11 AMD, MP4 e 300 hashes | Mediana melhor e qualidade intacta |

## Top 12 experimentos candidatos

| ID | Hipótese falsificável | Primeiros arquivos | Primeira métrica | Estado |
| --- | --- | --- | --- | --- |
| **X00** | 18 s de cabelo são dominados por construção de rig/face, não PNG | `editorV6HairMotionPreparation.ts`, `motion/bakeMotion.ts` | ms detalhados/11 bakes | PENDENTE |
| **X01** | Manifesto de personagem compilado na origem diminui a primeira exportação | `preparedCharacterMaterials.ts`, `characterSourceResolver.ts`, `customizerCharacterSaveCommand.ts` | número de montagens e RGBA 1 pose | PENDENTE |
| **X02** | O mesmo rig permite produzir original e hairless sem dois renderers | `editorV6CharacterRenderer.ts`, `editorV6HairMotionPreparation.ts` | 2 rigs→1 + igualdade RGBA | PENDENTE |
| **X03** | Render das 7 poses por partes elimina geração do atlas corporal | `motion/bakeMotion.ts` + interpolação compartilhada | 7/7 pixels ou diferença minuciosa | PENDENTE |
| **X04** | PNG/base64/IPC consome parte relevante e pode ser binário | `src/shared/editorV6HairMotion.ts` + prep/worker | ms serialize+decode, bytes, peak RSS | PENDENTE |
| **X05** | Plano puro de 30 frames permite backend sem React | `shared/editorV6TimelineScene.ts`, `SceneSurface.tsx` | comandos equivalentes/visual igual | PENDENTE |
| **X06** | Composição direta Canvas2D é mais rápida que React/SVG/capture | `exportWorker.tsx` + spike separado | 30 frames, p95, RGBA | PENDENTE |
| **X07** | sharp/Skia compõem 30 frames distintos com menos custo | `scripts/editor-v6/spike-native-compositor.cjs` | tempo, pixels e memória (frames variados) | PENDENTE |
| **X08** | PixiJS GPU desenha cabelo sem 7 bakes PNG | `exportHairMeshRenderer.ts` + fixture isolada | 7 samples com alpha correto | PENDENTE |
| **X09** | OffscreenCanvas/WebCodecs remove captura CPU→GPU sem perdas | `exportWorkers.ts` + spike fora de produção | frame roundtrip, codec, MP4 e timestamps | PENDENTE |
| **X10** | AMF espera frames, não precisa primeiro de encoder novo | `exportRunner.ts`, diagnóstico FFmpeg | % tempo esperando vs encode | PENDENTE |
| **X11** | Vídeo e áudio exigem caminho multimídia separado | fixture com mídia em backup isolado | 30 frames + mixagem de áudio | PENDENTE |

## Registro a copiar para cada tentativa

### X00 — PENDENTE / APROVADO / REJEITADO / REQUER EVIDÊNCIA

- **Commit base e plataforma:** …
- **Hipótese (1 frase):** se alterarmos [X], esperamos reduzir [fase Y].
- **Fixture:** fonte sintética / cópia verificada (nunca nomes/caminhos pessoais em repo).
- **Dimensão/frames/codec/cabelo/áudio/cache:** …
- **Antes (wall e fases):** …
- **Depois (wall e fases):** …
- **30 frames distintos / paridade:** … de 30 RGBA iguais; dif max; não mudar tolerâncias.
- **300 frames / MP4 (somente após G2):** … hashes, áudio/FFprobe, mediana de 3.
- **Memory (Main/renderer/GPU/FFmpeg):** …
- **Resultado:** aprovado/revertido/rejeitado e por quê.
- **Arquivos alterados e commit local:** …
- **Próxima hipótese rival:** …

## Primeira tarefa indicada ao Codex

1. `git status`; preservar alterações locais e sincronizar `Dev-V2` por fast-forward; ler `AGENTS.md`.
2. Ler [Pesquisa sistêmica](PESQUISA_SISTEMICA_MOTORES_E_EXPORT_2026-11-04.md), [R13](RODADA_13_V4_BAKE_BRUTO_ENDPOINTS.md), [R14](RODADA_14_V4_RENDER_FACE_UNICA.md), [R15](RODADA_15_V4_VARREDURA_ALPHA_NATIVA.md) e baseline [R05](RODADA_05_V4_ACELERACAO_EDITOR_V6_06.md).
3. **X00 primeiro:** instrumentação curta para distinguir material/rig/face/PNG/captura/FFmpeg; exportar só fixture pequena em vez de três MP4s completos.
4. Testar **X01 ou X02** com 1 personagem e provar paridade; caso errado, documentar e reverter imediatamente.
5. Só um candidato G2 aprovado avança à medição 300 frames. Commits **locais pequenos**, sem push até autorização.
