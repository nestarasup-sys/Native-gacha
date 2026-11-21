---
id: V6-ENGINE-STATE
tipo: checkpoint-vivo
status: ativo
branch: Dev-v3
atualizado: 2026-11-21
---

# Estado atual — único checkpoint de continuidade

## Resumo factual

- Branch de trabalho: **`Dev-v3`**, criada a partir da `Dev-V2`.
- Escopo acordado: **Editor V6 exclusivamente**; V7 não é parte desta iniciativa.
- Produto desejado: prévia leve com piscadas; animação completa **somente no export**.
- Meta de engenharia: engine offline independente da UI, com liberdade de substituir a renderização/animações atuais.
- Histórico reproduzível na Dev-V2: **163,760 s para export padrão de 200 s**; objetivo exploratório **<=90 s**.
- **Fundação do Plano 1.0 implementada:** política de prévia com piscadas, adaptador V6 -> IR versionado e materialização de assets na fronteira do compositor. O laboratório offline ainda não é a exportação padrão.
- Trabalhos anteriores já commitados na `Dev-v3`: isolamentos de cache por projeto, regra temporal de vídeo, testes e CI focado. Eles não constituem a nova engine.
- Laboratório F1, referência SVG independente e perfil sintético passaram CI Windows. Uma base temporal F2 também foi testada; **nenhum gate F0–F8 foi fechado** e ainda não existe benchmark comparável à exportação padrão.
- **DEC-019/020 (21/11/2026):** autorizado alto uso de CPU/GPU/RAM para construção, perfis, stress e testes **sintéticos**; a bateria de export real e comparações de velocidade 5/40/200 s/6.000 frames fica adiada até engine completa/integrada. Smoke MP4 sintético curto continua permitido apenas como teste funcional.
- **DEC-021:** próximo lote de Codex é amplo, executado somente em `Dev-v3`, após sincronizar com `origin/Dev-v3` sem descartar alterações locais. Comitar e publicar apenas o código verificado; resposta do Codex e GitHub serão revisados antes do lote seguinte.

## Quadro de gates

| Fase/gate | Status | Evidência exigida para concluir |
| --- | --- | --- |
| F0 / G0 | EM_ANDAMENTO | fixture V6 passou Chromium real em 3 pontos opacos; faltam PNGs completos e baseline MP4 |
| F1 / G1 | EM_ANDAMENTO | perfil 1080p, referência SVG e smoke Chromium real passaram; falta recursos completos/empacotamento |
| F2 / G2 | EM_ANDAMENTO | IR v1 e timebase racional 24/30 aprovados; falta normalização/avaliação integral |
| F3 / G3 | PENDENTE | poses/expressões corretas em PNGs comparáveis |
| F4 / G4 | PENDENTE | boca/cabelo completos + A/B H0–H4 |
| F5 / G5 | PENDENTE | vídeo/áudio/MP4 fim a fim com validação |
| F6 / G6 | PENDENTE | benchmark justo e memória controlada |
| F7 / G7 | PENDENTE | integração do export V6 e rollback |
| F8 / G8 | PENDENTE | remoção segura de legado e gates finais |

## Experimento inicial F1 — evidência limitada de 20/11/2026

- Código: `scripts/editor-v6/engine-v3/offlineCompositor.cjs` — consome o contrato existente `EditorV6NativeFramePlan` e desenha **RGBA** via Sharp, sem React/Electron/capturePage.
- Smoke: `scripts/editor-v6/engine-v3/smokeExport.cjs` — gera personagem/arte sintéticos, 150 quadros com mudanças e piscadas em 640×360/30, envia raw RGBA ao FFmpeg `libx264`, verifica MP4 com `ffprobe`.
- Testes locais Linux/Node 22, Sharp instalado: `node --test tests/editor-v6/engineV3OfflineCompositor.test.cjs` → **15/15 passando**. São testes pequenos de pixel/contrato, não golden de cena real.
- Smoke local: `node scripts/editor-v6/engine-v3/smokeExport.cjs --frames=150 --width=640 --height=360` → MP4 H.264 com **150 frames** confirmados no ffprobe; **2.783 ms** de parede nesta máquina, apenas referência do protótipo sintético (não velocidade projetada para 1080p/export real).
- Saída do laboratório fica em pasta temporária independente. Não lê nem grava projetos do usuário.
- Comparação: o C++ experimental anterior registrou **183,7 ms** medianos por round-trip Full HD contra **34,6 ms** no Chromium em fixture simples e falhou em projeto curto; não considerar esse C++ backend pronto. Ver `docs/lixo/editor-v6/RENDERIZADOR_NATIVO_CPP.md`.
- **Lacunas:** sem cabelo, boca real, texto, vídeo sobreposto ou áudio no protótipo; sem validação de Windows empacotado; sem golden/benchmark reproduzido; não promoveu `Sharp` como backend final.
- Prova Full HD local adicional: `--frames=30 --width=1920 --height=1080` → 30 frames H.264 validados por `ffprobe`, cerca de **2.649 ms** de parede nesta máquina Linux, ainda em fixture sintética e sem comparação justa.
- CI Windows em commit `76e6cde`: **aprovada** ([execução 44835472773](https://github.com/nestarasup-sys/Native-gacha/actions/runs/44835472773)); passou `typecheck`, auditoria de arquitetura, 15 testes de compositor e os testes focados do Editor V6. Não incluiu smoke com FFmpeg nem comparação visual real.

## Fundação 1.0 — entrega verificada

- `src/shared/editorV6PreviewScene.ts`: reprodução leve sem interpolação de pose nem boca falada; apenas piscada automática.
- `src/engine-v6/v6FrameAdapter.ts`: IR `contractVersion: 1` e `requiredAssetIds`, com plano de frames puro e independente de mídia/DOM.
- `tests/editor-v6/engineV6FrameAdapter.test.ts`: 7 testes de geometria, assets, fail-fast, reprodução e geração RGBA de cena V6 sintética.
- Regressão `tests/editor-v6/editorV6ExportParity.test.ts` atualizada: o export mantém atlas de movimento; prévia não o renderiza.
- [CI Windows validada em b957b42](https://github.com/nestarasup-sys/Native-gacha/actions/runs/44836460029): typecheck, auditoria, 15 testes offline CJS e 42 testes Vitest focados passaram.
- **Escopo do aceite:** arquitetura e primeira fatia de frame; exportação de produção segue antiga. Sem golden/benchmark de cenas complexas.

## Plano 1.1 — execução parcial verificada em 20/11/2026

- `tests/editor-v6/engineV6SvgReference.test.ts`: quatro casos de comparação via SVG/librsvg para cenas V6 sintéticas.
- `tests/editor-v6/engineV6ChromiumReference.test.ts`: Edge/Chromium headless no Windows compara agora todos os canais RGBA da fixture V6; o resultado desta rodada está abaixo. Ainda não é golden de personagens completos/texto.
- `scripts/editor-v6/engine-v3/profileOffline.cjs` + `engineV3Profile.test.cjs`: medição reproduzível de raster/atlas, hashes, input bounds e RSS observado.
- `src/engine-v6/engineTimebase.ts` + `engineV6Timebase.test.ts`: tempo racional 24/30 fps com partições e seek independente de ordem; contrato conforme `editorV6OutputFrame` legado.
- [CI Windows **44838705380** aprovada](https://github.com/nestarasup-sys/Native-gacha/actions/runs/44838705380): typecheck, auditoria, 18 testes Node e 52 Vitest; inclui captura real Edge/Chromium de fixture V6.
- Perfil sintético 4 frames 1080p/atlas 512: 656,444 ms de parede, P50 143,178 ms/frame, RSS observado 111.910.912 B. **Não comparar** com 163,760 s de MP4 real.
- Mapa de pipeline, matriz FIX e gates incompletos em [Plano 1.1](PLANO-1.1.md#execução-11--evidências-e-limites-20112026).
- Projetos antigos não são golden visual da engine nova; casos de compatibilidade usarão leitura e snapshot, não edição destrutiva.

## Lote NEXT-005..010 — checkpoint de 21/11/2026

| Frente | Estado efetivo nesta rodada |
| --- | --- |
| A — comparação Chromium × offline | **Parcial:** comparação integral RGBA, hashes de HTML/PNG/RGBA/mapa, mapa de diferenças, bounding box e métricas de alpha/borda/interior. Fixture cobre fundo/z-order e asset alpha com crop, flip e rotação. Texto, balões e máscaras faciais ainda não entram. |
| B — compositor | **Parcial:** compositor Sharp anterior permanece; não foi trocado o backend. Harness de MP4 agora limpa sua pasta temporária também em falhas. |
| C — frames determinísticos | **Parcial:** testes extras de seek por ordem arbitrária; o timebase racional 24/30 e seus testes já existiam. Nenhuma integração à exportação. |
| D — poses/personagens | **Não iniciado:** fixture ainda não representa a montagem completa de personagem nem transição de pose/expressão. |
| E — boca | **Não iniciado:** frame adapter segue recusando patch facial sem suporte validado. |
| F — cabelo | **Não iniciado:** sem A/B H0–H4 nem simulação offline. |
| G — vídeo/áudio | **Não iniciado:** smoke H.264 é somente vídeo sintético sem áudio ou timeline. |
| H — confiabilidade | **Parcial:** limpeza garantida no harness de smoke; cancelamento/worker/cache e falhas de recursos continuam abertos. |
| I — perfis | **Medição executada:** perfil sintético 1080p/30 frames, atlas 1024, Sharp 0.35.5/libvips 8.18.7, Node 24.22.3, Windows. Preparo 125.432 ms; raster 8135.979 ms; parede 8274.097 ms; P50 227.727 ms/frame, P95 486.337 ms; RSS observado entre frames 118.534.144 B (não é pico do processo). Entrada 4.202.841 B. Não comparar a export real histórica. |

### Evidência visual e verificações

- Edge/Chromium real, 640×360, fixture sintética com fundo, dois elementos opacos e um asset 2×2 com alpha/crop/flip/rotação: **8.344 pixels divergentes (3,6215%)**, 24.200 canais, MAE 0,42765, erro máximo 202, alpha com zero diferenças; 7.369 pixels divergentes classificados na borda e 975 no interior; bbox `(0,126) 136×108`. A discordância RGB está concentrada na imagem transformada; a hipótese é diferença de rasterização/interpolação SVG Chromium vs Sharp, ainda não isolada nem corrigida. Não elevar tolerância nem declarar paridade.
- Hashes reproduzíveis do caso: HTML `8df426ddb2de669dcf47288b0e4cf53cb5bffcb8696941534a439738e70cf8fe`; PNG Chromium `c79a752747e6190f65cc5b0f8493c92231e38c711764c250d2c96008fbbde`; RGBA offline `618ae604044af4482ed6687a2c3fb2d364bc180ebcc7d7de6d7b6a78033b5033`; mapa PNG `54f18185e6d148680430f945106230bd0b828f6d466d1b82a8f1015aabd2b2f5`. Artefatos são temporários e removidos.
- `npm run test:editor-v6:engine-v3`: 21/21 Node aprovados. `npx vitest run --config vitest.editor-v6.config.ts`: 910 aprovados, 1 skip. `npm run typecheck` e `npm run audit:architecture` aprovados. Smoke sintético H.264 640×360/30fps, 30 frames validado por ffprobe; temporários removidos, 707 ms de parede (não benchmark). Perfil 1080p descrito acima.
- Limite desta rodada: sem bateria de exportação real; CI Windows deste commit ainda precisa rodar após push.

## Próximo lote concreto [NEXT-005 a NEXT-010]

**Construir e provar várias fatias da engine offline no mesmo ciclo de Codex**, mantendo o export padrão intacto e sem benchmarking real de export (DEC-020). A prioridade depende da evidência de cada etapa; não declarar um gate concluído sem todos os requisitos.

1. **NEXT-005, F0/F1:** PNG/JSON/hash de quadros completos Chromium x Sharp; métricas RGBA, mapas/bounding boxes de diferença e fixtures de alpha, crop, flip, rotação, máscara, texto/z-order.
2. **NEXT-006, F1/F2:** robustecer o compositor offline e o contrato de IR determinístico; preparar/evaluar por frame, seek aleatório, timebase 24/30, recursos e invalidação, com testes por borda.
3. **NEXT-007, F3:** personagens estáticos, trocas de pose/expressão, geometria/mascaras e assets de fonte versionados, medindo paridade de frames de laboratório.
4. **NEXT-008, F4:** boca (talk/talk-blink/patch) e cabelo (H0-H4) em laboratório, com A/B de recursos, perfil e sequência determinística; não ligar ao export padrão.
5. **NEXT-009, F5:** camadas de vídeo e áudio com clocks/PTS, filtros e smoke sintético curto de MP4 quando possível; sem projetos pessoais, sem medir velocidade real ponta a ponta.
6. **NEXT-010, qualidade:** regressões, falha/cancelamento/limpeza em temporários isolados, stress sintético intensivo permitido e CI Windows com resultados reais; atualizar o estado somente com evidências.

**Adiado intencionalmente:** BENCH de exportação real (5/40/200 s, projeto de 6.000 frames), conclusão de G6 e mudança de padrão/limpeza do legado. Se as tarefas forem grandes, entregar um conjunto coerente e testado, listar o restante sem afirmar conclusão.

## Bloqueios/hipóteses em aberto

- [RISCO] Nenhum backend gráfico novo foi escolhido ou validado.
- [RISCO] Cabelo pode dominar preparo, simulação, composição ou memória; distinguir com medição.
- [RISCO] Vídeos sobrepostos diferem potencialmente entre prévia e export; definir contrato autoral.
- [CONCLUÍDO 1.0] Playback do Editor V6 agora usa resolução estática e apenas piscadas automáticas; testes de regressão em CI Windows aprovados.
- [RISCO] A autorização histórica para usar corte real refere-se ao escopo e cuidados do relatório antigo; usar cópia verificada, nunca original como alvo destrutivo.

## Atualização deste arquivo

Alterar só: status de gate, **próxima ação**, bloqueio e referências a testes/commits.
Manter este arquivo pequeno. Resultado detalhado fica em relatório ou teste versionado, não em diário de chat.
Ao validar um gate, informar data, commit, comando, saída relevante e localização do artefato.
