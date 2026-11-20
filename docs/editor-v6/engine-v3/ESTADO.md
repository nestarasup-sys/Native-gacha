---
id: V6-ENGINE-STATE
tipo: checkpoint-vivo
status: ativo
branch: Dev-v3
atualizado: 2026-11-20
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
- `tests/editor-v6/engineV6ChromiumReference.test.ts`: Edge/Chromium headless no Windows comparou com a engine **3 amostras opacas** da mesma cena V6. Sem golden integral de pixel ou alpha/cabelo/texto.
- `scripts/editor-v6/engine-v3/profileOffline.cjs` + `engineV3Profile.test.cjs`: medição reproduzível de raster/atlas, hashes, input bounds e RSS observado.
- `src/engine-v6/engineTimebase.ts` + `engineV6Timebase.test.ts`: tempo racional 24/30 fps com partições e seek independente de ordem; contrato conforme `editorV6OutputFrame` legado.
- [CI Windows **44838705380** aprovada](https://github.com/nestarasup-sys/Native-gacha/actions/runs/44838705380): typecheck, auditoria, 18 testes Node e 52 Vitest; inclui captura real Edge/Chromium de fixture V6.
- Perfil sintético 4 frames 1080p/atlas 512: 656,444 ms de parede, P50 143,178 ms/frame, RSS observado 111.910.912 B. **Não comparar** com 163,760 s de MP4 real.
- Mapa de pipeline, matriz FIX e gates incompletos em [Plano 1.1](PLANO-1.1.md#execução-11--evidências-e-limites-20112026).
- Projetos antigos não são golden visual da engine nova; casos de compatibilidade usarão leitura e snapshot, não edição destrutiva.

## Próxima tarefa concreta [NEXT-005]

**Expandir o smoke Chromium já aprovado para PNGs completos e recursos reais do V6, mantendo a engine em laboratório.**

1. Capturar PNG/JSON/sha256 de quadros completos via Chromium e Sharp, com mapa de diferenças por região, não só 3 pixels opacos.
2. Testar alpha, crop, flip, rotação, máscaras e texto; comparar geometria e bordas em sequência, sem afrouxar limiares para esconder diferenças.
3. Implementar casos de texto/boca/cabelo, vídeo e áudio **sem depender de projetos antigos**; perfilar tempo total incluindo preparação.
4. Medir Windows empacotado e MP4 equivalente; só então fechar G0/G1 e decidir tecnologia. F2–F8 permanecem em andamento ou pendentes.

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
