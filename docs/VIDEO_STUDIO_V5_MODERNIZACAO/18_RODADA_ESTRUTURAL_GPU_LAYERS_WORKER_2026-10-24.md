# Video Studio — rodada estrutural GPU de personagem, camadas e Worker (24/10/2026)

**Branch:** `Main-desenvolvimento`
**Validação:** https://github.com/nestarasup-sys/Native-gacha/actions/runs/40063580142 — Windows/Ubuntu verdes.
**Preservação:** nenhuma migração de `StudioDocument`, biblioteca do usuário ou formato exportado; nenhuma alteração em layout de timeline, painéis ou controles.

## 1. Objetivo e estado da implantação

O Animador DEV e o Animador Preset Rosto DEV são referência para interpolação, **não fontes obrigatórias de animações salvas**. Uma transição continua a ser formada a partir dos estados autorais nos próprios blocos do Video Studio.

Nesta rodada, um protótipo inicial de partes e texturas cresceu para uma composição Gacha **de três camadas reais** e interpolação de geometria em Worker. O preview padrão ainda usa Canvas 2D; a rota GPU fica experimental até paridade visual em caracteres reais do Windows.

O motor gráfico não substitui React/Electron, não muda a aparência da UI, não inventa blends opacos e não descaracteriza a ordem dos elementos.

## 2. Camadas reais extraídas do compositor canônico

`src/renderer/src/characters/characterRenderer.ts`

- Novo contrato `PreparedGachaLayerFrame` com `behindFace`, `face`, `inFrontOfFace`, dimensões originais e escala final.
- `prepareSavedCharacterRenderer` agora também expõe `renderLayersToCanvas(...)`. As camadas estáticas vêm das mesmas funções já usadas para desenhar corpo, skin tone, roupa e cabelo.
- A rotina interna `paintPreparedFace(...)` é **compartilhada** por `renderToCanvas` (legado) e `renderLayersToCanvas` (experimental). Ela mantém exatamente os caminhos existentes de calibragem e máscara facial, pupilas independentes, olhos, boca, blink, efeitos e adornos.
- O Canvas `face` é mutável: deve ser consumido/transferido antes de renderizar a próxima expressão. As camadas anteriores e posteriores são estáveis ao longo da pose preparada.
- `renderToCanvas` e o PNG legado mantêm seu comportamento; o exportador padrão não passa pelo GPU.

## 3. Compositor de três camadas PixiJS

`src/renderer/src/features/videoStudio/pixiGachaLayerStack.ts`
`src/renderer/src/features/videoStudio/pixiGachaLayerSurface.ts`

- Um sprite para cada camada: corpo/roupa de trás → rosto dinâmico → cabelo/roupa da frente.
- O compositor recebe os Canvas reais produzidos pelo próprio Gacha; **não redesenha as geometrias faciais em uma segunda implementação**.
- Reutiliza sprites e texturas do corpo/roupa/cabelo. O método `texture.source.update()` atualiza somente o Canvas mutável da face no cenário comum de troca de expressão, evitando upload de roupa/cabelo a cada frame.
- Quando uma fonte autoral de pose/roupa muda, a textura associada ao sprite é substituída; a identidade do sprite é mantida.
- Escala de personagem, troca/ausência de cabelo frontal, validação de dimensões e descarte idempotente cobertos em testes.
- `PixiGachaLayerSurface` cria WebGL2 sem loop próprio: quem decide o frame é a timeline.
- Perda de contexto, falha de GPU e incompatibilidade de dimensão propagam erro para o wrapper `drawGachaLayeredFrame`, que retorna o compositor Canvas exato como fallback. A rota padrão do editor **não** é ativada silenciosamente.

**Limite:** a preparação de novas poses com roupas/cabelo ainda envolve CPU/Canvas quando a geometria desses elementos muda. O ganho arquitetural desta fase é separar, reutilizar e compor camadas, não eliminar toda a reconstrução do equipamento.

## 4. Interpolação de geometria fora da thread da interface

`src/renderer/src/features/videoStudio/pixiGachaPoseGeometry.ts`
`src/renderer/src/features/videoStudio/pixiGachaPoseGeometry.worker.ts`
`src/renderer/src/features/videoStudio/pixiGachaPoseGeometrySession.ts`

- `stripGachaPoseTextures` extrai modelos só com identificadores, transformações, ordem e âncoras das articulações. **Nenhum PNG/chromaBaseDataUrl do usuário atravessa o Worker.**
- O Worker usa **`mixPoseArtwork` original** para interpolar juntas e posições, devolvendo apenas dados geométricos; `restoreGachaPoseTextures` devolve o PNG original de cada parte pelo lado Pixi e respeita a escolha discreta de imagem do interpolador canônico.
- A sessão é reutilizada para os próximos quadros; não reinicializa os endpoints a cada RAF. Aborts e seeks removem pedidos pendentes e descartam respostas sem callback correspondente; `dispose` encerra o Worker.
- `PixiGachaPoseSurface.renderInterpolatedPoseInWorker` liga essa sessão ao motor GPU experimental. Não entra na preview Canvas por padrão.

**Limite:** o Worker desloca somente o cálculo da geometria; leitura de assets, tinta e GPU continuam no lado que renderiza. Custos e latência de mensagens precisam ser medidos no Windows.

## 5. Benchmark de corpo + camadas reais da pipeline

`npm run bench:video:pixi-rig`

O benchmark compila a entrada TypeScript em um bundle clássico Electron, sem importação ESM `file://` incompatível com Chromium, e executa dois cenários sintéticos:

1. 180 quadros de pose articulada com partes persistentes e comparação Canvas/WebGL de cinco instantes.
2. 180 quadros de três camadas Gacha (corpo/roupa, face incluindo olhos/pupilas/boca/blush, cabelo frontal), coleta de `changedRatio`, erros de pixels, tempo Canvas/Pixi e métricas de atualização de texturas.

A utilidade `pixiGachaParity.ts` compara erro máximo por pixel e percentil p99; RGB de pixels simultaneamente invisíveis não conta como diferença. Testes também verificam empacotamento do benchmark com esbuild.

O benchmark **não foi executado na GPU do usuário**. Sem esses resultados e um teste com personagens Gacha reais completos, não afirmar ganho percentual, FPS nem equivalência visual final.

## 6. Verificações realizadas

CI após o último commit de código: https://github.com/nestarasup-sys/Native-gacha/actions/runs/40063580142

- Windows: Video Studio `114/114`, exportação sintética `108/108`, testes gerais `285/285`, arquitetura e geometria, typecheck e build.
- Ubuntu: arquitetura, refactor, geometria, typecheck e build aprovados.
- Os novos testes verificam ordens de composição, estabilidade de sprites/texturas, atualização seletiva de face, ocultação de cabelo, dimensão/escala, fallback de GPU, reanexação das texturas reais após o Worker, abort de seek, descarte e empacotamento Pixi do benchmark.
- Os runners de CI não certificam WebGL2 acelerado com personagens reais.

## 7. Sequência necessária antes de trocar o default

1. Rodar oráculo visual com personagens reais usando pele customizada, roupa, cabelo traseiro/frontal, máscaras/pupilas PT, face com efeitos, rotações de partes, poses diferentes, mudança simultânea de pose/preset.
2. Adaptar a transformação persistente de acessórios de roupas e de cabelo para dispensar remontagem completa do compositor Canvas nos frames entre poses.
3. Avaliar GPU em Windows com renderização fria e cache quente: p50/p95 frame time, RAM/VRAM, FPS, seeks e perdas de contexto.
4. Integrar um modo GPU experimental na preview real com seleção e fallback por personagem; só promover a padrão após passar os oráculos visuais e benchmark de regressão.

**Nenhum teste manual do usuário é obrigatório nesta etapa; o funcionamento normal do Video Studio segue protegido.**
