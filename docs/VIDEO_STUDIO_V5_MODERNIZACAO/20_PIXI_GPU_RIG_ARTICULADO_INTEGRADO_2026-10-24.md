# Native Gacha / Video Studio — GPU Articulated Rig integrado
**Data:** 24/10/2026
**Branch:** `Main-desenvolvimento` — commit de código `5b6495f9c6ff7a321bb313583a9bb416089df8d5`.
**CI de código:** https://github.com/nestarasup-sys/Native-gacha/actions/runs/40066281810 — Windows e Ubuntu **success**.

## Entrega concluída no código: roupas e cabelo não são remontados por frame no caminho GPU

A limitação anterior (`prepareSavedCharacterRenderer` repetido para cada pose intermediária) foi atacada de forma direta, sem mudar o formato do projeto. A preview experimental pode usar o runtime `PixiGachaArticulatedSession`, que:

- Monta **uma vez por par de poses / revisão** as texturas de partes do corpo, roupa e cabelo, com paletas/tintas produzidas pelas mesmas rotinas do compositor Gacha (sem aproximar cores em novo shader).
- Cria sprites persistentes na GPU para ossos, roupas conectadas a ossos e cabelo preso à cabeça. Atualiza as matrizes afins das peças — translação, rotação, escala não uniforme, ajustes de roupa e hierarquia — **a cada frame**, usando `mixPoseArtwork` do Video Studio.
- Mapeia roupas por `mapWardrobeComponentToPose`, `wardrobePosePadding` e `wardrobeAdjustmentMatrix`, preservando os ajustes autorais feitos no Fabricador DEV; acessórios acima do cabelo vão na camada final correta.
- Transforma a camada facial dinâmica do compositor original pela matriz da cabeça da pose, sem reprocessar o corpo e o figurino. Isso cobre o **caminho visual** para rosto/olhos/pupilas/boca, mas máscaras complexas ainda dependem de confirmação de pixels no computador real.
- Usa dois contêineres persistentes ao redor da camada facial: cabelo traseiro + corpo + roupa / **rosto vivo** / cabelo dianteiro + acessórios superiores.
- Mantém uma fila individual por personagem e captura o resultado antes do próximo frame mudar o Canvas facial.
- Não reconstrói o corpo completo em `prepareSavedCharacterRenderer` por pose **quando o caminho GPU é aceito**. Um oráculo gera quadros Canvas completos somente nos três primeiros samples e a cada 120 frames, a fim de comprovar a aparência; divergência trava a GPU daquela sessão e mantém o compositor original.

## Arquivos de implementação

- `src/renderer/src/features/videoStudio/pixiGachaArticulatedAssets.ts` — carregamento de fontes e cálculo da geometria do esqueleto/roupa/cabelo, com matrizes dos ajustes de guarda-roupa.
- `src/renderer/src/features/videoStudio/pixiGachaArticulatedSurface.ts` — WebGL2/Pixi v8 com sprites/tex persistentes, matrizes e upload da face dinâmica.
- `src/renderer/src/features/videoStudio/pixiGachaArticulatedSession.ts` — sessão completa, avaliação de pose, face e checkpoints do oráculo Canvas.
- `src/renderer/src/features/videoStudio/transitionRenderer.ts` — atalho experimental para pose animada **antes** da preparação cara do corpo por frame; fallback automático se falhar; nenhuma mudança na saída dos documentos.
- `scripts/video-studio/pixi-gacha-full-character-benchmark.entry.ts` — benchmark ampliado: compara as três camadas, duas poses, modos faciais e agora a **nova sessão articulada real**, revelando a primeira rejeição de paridade.
- `tests/video-studio-pixi-articulated-full-rig.test.cjs` — verifica fonte de textura constante entre poses, roupa ligada ao osso, cabelo ligado à cabeça, acessórios em ordem correta, matriz facial invertível, peças ocultas e bundle Chromium.

## Execução normal

**Nada muda na interface por padrão.** O Video Studio usa Canvas estável e a exportação continua no pipeline habitual com FFmpeg. O Pixi não precisa de animações importadas do Animador DEV ou do Animador Preset Rosto DEV: as poses e estados faciais vêm somente dos blocos do Video Studio.

## Como validar no Windows (usuário ou Codex)

1. Atualize a branch com `ATUALIZAR_DESENVOLVIMENTO.bat` e abra com `ABRIR_DESENVOLVIMENTO.bat`, resolvendo eventuais alterações locais do npm.
2. No terminal do projeto, execute `npm run bench:video:pixi-full-gacha`. O benchmark usa **PNG e personagem sintéticos**, não lê nem altera a biblioteca pessoal. Executar com GPU WebGL2 real. Se não houver GPU disponível, o benchmark relata `skipped` e não inventa números.
3. Verifique no JSON `articulated.framesAccepted`, `targetFrames:14`, `eligibleForProduction`, `firstRejectedFrame`, `rejection`, `elapsedMs`, além das amostras comparativas do Canvas vs Pixi. Não concluir que há 60 FPS apenas pelo benchmark de 14 frames.
4. Para visualizar diretamente na preview de desenvolvimento, no **DevTools do renderer do Video Studio**, execute `window.__NATIVE_GACHA_GPU_PREVIEW_EXPERIMENTAL__ = true`. Reinicie a sessão de transição ou reabra o Video Studio para aplicar. A flag não é salva no projeto; atribua `false` para desligar.
5. Teste um personagem com corpo/proporção alterados, roupas presas ao braço e pernas, luvas, saia/capa, cabelo dianteiro/traseiro, óculos sobre cabelo, presets faciais PT, blink, boca, pupilas independentes, sombra/blush e diferentes tons de pele. Mude a pose e a expressão em blocos consecutivos, faça seeks para frente/trás e pré-visualize com personagens múltiplos.
6. **Critério para ativar GPU como padrão:** todos os testes visuais de personagens reais, incluindo máscaras, alpha e ordem de composição, devem passar, e o perfil de fluidez no Windows deve comprovar ganho líquido de desempenho/memória sem instabilidade. Caso contrário, o Canvas continua como fallback.

## Verificação já realizada

CI https://github.com/nestarasup-sys/Native-gacha/actions/runs/40066281810:
- Windows: 133/133 testes do Video Studio Next, 108/108 de exportação sintética, 285/285 gerais; TypeScript/build.
- Ubuntu: TypeScript, compilação Electron/React e gates de arquitetura aprovados.
- O teste de contrato compila também os módulos novos do motor articulado para browser, e confirma matrizes e mudanças de ossos/roupas/cabelo.

## Limitações honestas

**Código de core entregue, paridade GPU física não verificada neste ambiente.** A CI não mede FPS em GPU real nem executou `bench:video:pixi-full-gacha` num Windows com os drivers do usuário. A promoção automática do Pixi para o caminho padrão e o uso dele na exportação estão intencionalmente desabilitados até validar pixel-oracle real. `PixiGachaPoseGeometrySession` já existe para cálculo fora da UI, porém o novo caminho articulado da preview ainda calcula `mixPoseArtwork` na thread principal antes de subir as transformações para o Pixi.

**Não declarar migração integral ou ganho percentual sem testes de dispositivo.** A partir desta versão já existe uma implementação funcional opt-in para avaliar, não apenas um plano teórico.
