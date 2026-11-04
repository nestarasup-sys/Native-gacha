# Editor V6 — Quadro vivo de hipóteses e experimentos rápidos (Windows 11)

> **Rodada 17 / 04-11-2026**. Documento principal: [Pesquisa sistêmica](PESQUISA_SISTEMICA_MOTORES_E_EXPORT_2026-11-04.md). Atualizar **um registro por experimento**, inclusive os rejeitados. Não significa que os testes tenham sido executados.

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

## Rodada 18 — caminho executável

O kit de testes Windows 11 e plano de desenho puro está em [Rodada 18](RODADA_18_HANDOFF_CODEX_WINDOWS.md). **Próxima hipótese: X05**, construir uma IR de sprites com cobertura explícita, uma única feature adicional por experimento e 30 frames distintos. **Ainda não é um renderer nativo de produção e nenhum ganho de MP4 foi medido.**

## Top 12 experimentos candidatos

| ID | Hipótese falsificável | Primeiros arquivos | Primeira métrica | Estado |
| --- | --- | --- | --- | --- |
| **X00** | 18 s de cabelo são dominados por construção de rig/face, não PNG | `editorV6HairMotionPreparation.ts`, `motion/bakeMotion.ts` | ms detalhados/11 bakes | BLOQUEADO: Preset 2 ausente na cópia verificada |
| **X01** | Manifesto de personagem compilado na origem diminui a primeira exportação | `preparedCharacterMaterials.ts`, `characterSourceResolver.ts`, `customizerCharacterSaveCommand.ts` | número de montagens e RGBA 1 pose | PENDENTE |
| **X02** | O mesmo rig permite produzir original e hairless sem dois renderers | `editorV6CharacterRenderer.ts`, `editorV6HairMotionPreparation.ts` | 2 rigs→1 + igualdade RGBA | REJEITADO como atalho na API atual; requer separar materiais/camadas |
| **X03** | Render das 7 poses por partes elimina geração do atlas corporal | `motion/bakeMotion.ts` + interpolação compartilhada | 7/7 pixels ou diferença minuciosa | PENDENTE |
| **X04** | PNG/base64/IPC consome parte relevante e pode ser binário | `src/shared/editorV6HairMotion.ts` + prep/worker | ms serialize+decode, bytes, peak RSS | PENDENTE |
| **X05** | Plano puro de 30 frames permite backend sem React | `shared/editorV6TimelineScene.ts`, `SceneSurface.tsx` | comandos equivalentes/visual igual | PENDENTE |
| **X06** | Composição direta Canvas2D é mais rápida que React/SVG/capture | `exportWorker.tsx` + spike separado | 30 frames, p95, RGBA | PENDENTE |
| **X07** | sharp/Skia compõem 30 frames distintos com menos custo | `scripts/editor-v6/spike-native-compositor.cjs` | tempo, pixels e memória (frames variados) | REJEITADO: Canvas mais rápido, mas 0/30 quadros com RGBA exato |
| **X08** | PixiJS GPU desenha cabelo sem 7 bakes PNG | `exportHairMeshRenderer.ts` + fixture isolada | 7 samples com alpha correto | PENDENTE |
| **X09** | OffscreenCanvas/WebCodecs remove captura CPU→GPU sem perdas | `exportWorkers.ts` + spike fora de produção | frame roundtrip, codec, MP4 e timestamps | PENDENTE |
| **X10** | AMF espera frames, não precisa primeiro de encoder novo | `exportRunner.ts`, diagnóstico FFmpeg | % tempo esperando vs encode | PENDENTE |
| **X11** | Vídeo e áudio exigem caminho multimídia separado | fixture com mídia em backup isolado | 30 frames + mixagem de áudio | PENDENTE |

## Execução da Rodada 17 — resultados rápidos (Windows 11 x64)

### X00 — BLOQUEADO: perfil real de preparação de cabelo

- **Hipótese:** o custo do primeiro export pode estar concentrado na preparação dos rigs, faces e bakes; medir a preparação separada evita pagar por três MP4s completos antes de localizar o gargalo.
- **Arquivos:** `electron/main.ts`, `scripts/editor-v6/benchmark-project-export.cjs`.
- **Mudança de diagnóstico:** adicionados `--hair-preparation-only` e `--renderer-port`; o primeiro roda uma única preparação real e encerra antes de renderizar/encodar MP4. A porta permite preservar a origem usada pela sessão local. A validação rejeita qualquer arquivo MP4 nesse modo.
- **Fixture e integridade:** cópia isolada atual de projeto, biblioteca, personagens, Fabricador e armazenamento localStorage: 2.584 arquivos / 181.452.067 bytes; hashes conferidos, zero divergências. A origem permaneceu intacta. O launcher usa `127.0.0.1:5189`; a medição foi tentada nessa mesma origem e com o diretório raiz da sessão copiado.
- **Resultado observado:** a cópia não contém o Preset 2 (`O Preset 2 de cabelo não está salvo no perfil isolado.`). O processo encerrou antes da preparação e de qualquer bake.
- **Tempo, fases, RGBA, memória e MP4:** não medidos; sem preparação executada, sem quadros ou MP4. Não há alegação de ganho nem comparação com 34,33 s. A duração do projeto copiado é 309 quadros; não foi alterada para simular o alvo de 300.
- **Decisão:** bloqueado por configuração ausente na cópia segura. Não preencher o preset artificialmente nem consultar/alterar o perfil ativo como fixture.
- **Próxima alternativa:** obter uma cópia isolada verificável que já inclua a configuração persistida do Preset 2; então executar somente a preparação e medir suas fases antes de autorizar um benchmark MP4.

### X02 — REJEITADO como otimização de atalho

- **Hipótese:** uma instância do renderer pode entregar tanto o personagem original quanto a variante sem cabelo, evitando duplicar preparação.
- **Arquivos examinados:** `editorV6HairMotionPreparation.ts`, `editorV6CharacterRenderer.ts`, `prepareGachaStaticLayers` e os chamadores relacionados.
- **Custo que seria eliminado:** criação/preparação de um segundo renderer por grupo personagem/pose.
- **Evidência estrutural:** a preparação compõe o penteado em `baseImage`, a franja em `frontHairImage` e as camadas estáticas de rig. A API pública do renderer varia rosto, mas não alterna essas camadas de cabelo. Portanto, um renderer único não consegue produzir as duas variantes com o contrato atual.
- **Tempo e RGBA:** não medidos; o Preset 2 ausente impede a fixture real e uma simples remoção de camada não provaria equivalência de roupa, face, alpha ou cabelo. Não avançou para os sete samples.
- **Decisão:** rejeitar a substituição direta de dois renderers por um. A hipótese estrutural futura é publicar materiais/camadas imutáveis separados (corpo/roupa, face/expressões e cabelo traseiro/frontal/franja) e só então comparar os sete samples, contabilizando eventual custo de compilação no salvamento do Customizador.

### X07 — REJEITADO: composição Canvas2D vs. `sharp`

- **Hipótese:** um backend independente do React pode compor quadros com menor custo.
- **Arquivos:** `scripts/editor-v6/spike-native-compositor.cjs`, `scripts/editor-v6/spike-native-compositor-canvas.cjs`, `tests/editor-v6/nativeCompositorSpike.test.cjs`.
- **Fixture:** 30 quadros sintéticos distintos com alpha, 640×360; Electron `BrowserWindow({ show: false, webPreferences: { offscreen: true } })` e processo Node para `sharp`. Perfil de `userData` isolado. É uma comparação do operador de composição sintético, sem projeto, rig, poses, cabelo físico, timeline, FFmpeg ou áudio.
- **Tempo:** Canvas2D somou 28,8 ms (p50 1,0 ms; p95 1,3 ms). `sharp` somou 74,24 ms nos operadores (p50 2,386 ms; p95 3,381 ms); parede total da execução e comparação: 165,58 ms. Neste microcaso, Canvas2D levou 0,39× o tempo de composição de `sharp` (~2,56× mais rápido).
- **RGBA:** 0/30 quadros idênticos; 8.495 pixels diferentes no agregado, diferença máxima por canal 2 e média absoluta por canal 0,000467. O modo estrito falha, como deve ocorrer para qualquer divergência; tolerância não foi relaxada.
- **Memória:** pico RSS do processo `sharp` 202.575.872 bytes (~193,1 MiB); heap JS do processo Canvas2D 56,8 MB. Amostras de working set dos processos Electron: Browser 138.313.728 bytes, GPU 97.898.496, Utility 48.320.512 e Tab 211.148.800. São amostras deste spike sintético, não memória de exportação real.
- **Decisão:** não integrar Canvas2D nem substituir o backend de exportação. A vantagem temporal isolada não compensa a divergência de pixels nem demonstra paridade de personagem.
- **Próxima alternativa:** decompor e comparar o operador alpha (ordem, arredondamento e premultiplicação), ou testar uma draw-list apenas depois de obter fixtures reais de sete poses e provar RGBA exato. A composição deve permanecer fora de produção até passar esse gate.

### Execução 100% offscreen

- O modo de stress da janela principal agora configura `offscreen: true` com `show: false`; o caminho anterior chamava `showInactive()` após posicionar a janela fora da tela, então não satisfazia a regra de execução invisível.
- `npm run test:application:window`: 9/9 aprovados.
- PowerShell `$env:GACHA_EDITOR_V6_STRESS_RUN_MS='1000'; npm run test:editor-v6:stress-offscreen -- --scenario=light`: aprovado com quatro personagens sintéticos; RAF p95 16,7 ms, cerca de 28,65 atualizações DOM/s e zero lacunas lógicas/DOM. Não mede exportação.
- Fontes oficiais usadas para validar o modelo de execução e a origem dos dados: [Electron offscreen rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering), [Electron `app` e `sessionData`](https://www.electronjs.org/docs/latest/api/app), [HTML Standard: Web Storage](https://html.spec.whatwg.org/dev/webstorage.html) e [Sharp composite](https://sharp.pixelplumbing.com/api-composite/).

### Regressões e verificação da Rodada 17

- `npm run typecheck`: aprovado.
- `npm run audit:architecture`: aprovado (676 arquivos TS/TSX analisados; sem imports ausentes nem violações de fronteira).
- `npm run test:editor-v6`: aprovado (20 testes Node de perfil; Vitest 50 arquivos, 262 aprovados e 1 ignorado).
- `node --test tests/editor-v6/nativeCompositorSpike.test.cjs`: 4/4 aprovados.
- `npm run build`: aprovado.
- `npm run test:application:window`: 9/9 aprovados; stress offscreen leve aprovado conforme acima.
- Sem benchmark completo de 300 quadros ou MP4: nenhum candidato passou RGBA/fixture real; a configuração de Preset 2 não existe na cópia verificada. Áudio também não foi validado porque não houve exportação.

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
