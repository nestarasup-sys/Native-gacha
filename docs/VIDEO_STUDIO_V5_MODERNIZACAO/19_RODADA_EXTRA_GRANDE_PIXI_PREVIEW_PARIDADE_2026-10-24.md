# Native Gacha — rodada extra grande PixiJS, full character pixel oracle e preview opt-in
**Data:** 24/10/2026
**Branch:** `Main-desenvolvimento` (sem branch nova, sem PR)
**Objetivo:** conectar o compositor PixiJS ao caminho real de preview, preservar a aparência do Gacha e proteger o usuário de diferenças visuais, vazamento de frames e regressões de memória.

## Resumo executivo

Esta rodada não se limitou a protótipos: a superfície de composição PixiJS de três camadas agora tem **um caminho de chamada real desde `TransitionRenderer.renderPreview`**, porém propositalmente desligado por padrão.

O motor canônico Canvas continua atendendo o Video Studio enquanto forem desconhecidas as diferenças de anti-aliasing, transparências, máscaras de olhos/pupilas, roupas, cabelo e acessórios nos drivers reais. O novo caminho só pode ser ativado manualmente em uma sessão de desenvolvimento.

### O que foi implementado

1. **Eliminação de alocação extra no Canvas de produção.** `prepareSavedCharacterRenderer` não cria a camada facial temporária quando o Video Studio usa o compositor antigo. Ela é alocada somente na primeira chamada de `renderLayersToCanvas`, reduzindo RAM no caminho que os usuários já utilizam.

2. **Gate automático de paridade visual.** `pixiGachaVisualGate.ts` recebe a saída RGBA real da GPU e compõe a referência usando as camadas autorais reais. Rejeita diferenças além de tolerância conservadora e **nunca aceita silenciosamente um personagem visualmente diferente**. Faz leitura de pixels inicialmente, de forma esparsa depois e sempre que a fonte de corpo, roupa ou cabelo muda; no caminho comum, não faz leitura de volta da GPU por frame.

3. **Fallback fail-closed.** `PixiGachaLayerSurface` consulta o gate antes de devolver o Canvas Pixi. Divergência visual, dimensão inválida, contexto GPU perdido, erro de WebGL e limite de leitura são recusados. `TransitionRenderer` mantém o compositor canônico Canvas disponível para qualquer personagem rejeitado.

4. **Integração real com a preview, protegida por opt-in.** Em desenvolvimento é possível atribuir a `window.__NATIVE_GACHA_GPU_PREVIEW_EXPERIMENTAL__ = true` no console DevTools da janela do Video Studio. Isso não altera os projetos e não grava preferências. **Não é recomendado a usuários finais** nem é uma flag de produção. Com ela desativada — o padrão — Pixi não cria superfície nenhuma, e a preview e exportação continuam pelo Canvas original.

5. **Proteção contra frames contaminados.** Um renderer preparado mantém um Canvas facial mutável. A nova fila `gpuDrawQueues`, por personagem, serializa rasterizações quando há múltiplos quadros em preparação. Cada resultado GPU é copiado para um Canvas próprio antes que a próxima expressão modifique a textura. `clearPrepared` e `dispose` invalidam filas pendentes por geração, evitando imagens de projetos antigos depois de seek/reload.

6. **Oráculo real com modelo Fabricador e customização.** O comando `npm run bench:video:pixi-full-gacha` prepara uma fixture descartável fora do projeto do usuário. Ela usa a mesma biblioteca `character-media-oracle-fixture.cjs` dos testes existentes e injeta PNGs reais de casaco, óculos `renderAboveHair`, cabelo traseiro e frontal. O script renderiza duas poses e os modos `idle`, `talk`, `blink` pelo `prepareSavedCharacterRenderer` **canônico**, compara `renderToCanvas` contra a composição Pixi de `renderLayersToCanvas` e relata erro por canal, alpha e decisão do gate por amostra.

7. **Testes novos no Windows e Ubuntu.** Incluem admissão de pixels RGBA com tolerância, mudanças de fonte estática, amostragem periódica, recusa permanente de frame divergente, validação da compilação do oráculo real com todo o `characterRenderer`, checagens da fixture descartável, serialização concorrente de três expressões e invalidação de frame pendente.

8. **Worker latest-seek-wins.** `PixiGachaPoseSurface.renderInterpolatedPoseInWorker` agora invalida pedidos pendentes do mesmo personagem quando outro frame chega. Mesmo se uma resposta antiga escapar do cancelamento e chegar depois, um serial de frame impede desenhar a pose anterior sobre a mais recente.

## Como usar (somente quando for necessário validar a fase experimental)

**Uso normal:** nenhuma ação. Execute `ATUALIZAR_DESENVOLVIMENTO.bat` e `ABRIR_DESENVOLVIMENTO.bat` como antes. Interface, controle e aparência permanecem idênticos.

**Oráculo GPU no Windows, quando for medir:** com dependências instaladas, execute `npm run bench:video:pixi-full-gacha`. O script requer WebGL2 de hardware. Se não houver GPU elegível, reporta `skipped` sem inventar resultado de FPS. A métrica `eligibleForProduction` depende de todas as amostras passarem pelo gate visual; o comando em si não altera o renderizador padrão.

**Opt-in de preview em desenvolvimento:** o gate só entra no Preview Studio após `window.__NATIVE_GACHA_GPU_PREVIEW_EXPERIMENTAL__ = true` na mesma janela renderer. É possível desligar atribuindo `false`, e reiniciar a janela zera a experiência. É protegido com fallback Canvas, mas continua não recomendado como rotina até o oráculo ser validado.

## Métricas observáveis do oráculo

- Erro médio do pior canal RGBA por pixel e percentil p99; proporção de pixels que ultrapassam tolerância.
- Poses 1 e 2; olhos abertos, boca em movimento e blink com olhos fechados reais da fixture.
- Sobreposição de cabelo/roupas/óculos no mesmo Gacha renderizador.
- Decisões independentes do gate para cada combinação pose + modo facial.
- Número de sprites criados, reaproveitamento e atualizações da fonte de rosto.
- Tempo de preparação do renderer canônico e de composição GPU de cada amostra; esses tempos **não** equivalem a FPS sustentado da timeline.

## Não concluído

- Não há validação de 60 FPS com centenas de frames, 10 personagens, vídeo importado e faces PT reais do usuário.
- Compositor Pixi ainda reutiliza o corpo/roupas/cabelo já rasterizados pelo Canvas; nas mudanças de pose esses materiais ainda precisam ser preparados. A substituição de TODO o custo de reconstrução por texturas de cada osso é uma fase posterior.
- Preview Pixi é opt-in; exportação, fluxo normal e documentos permanecem Canvas/FFmpeg.
- Oráculo com GPU real **não foi executado automaticamente** numa máquina do usuário nem em runner que não possui WebGL2 confiável. Seria incorreto declarar melhoria de FPS sem esse teste.
- O Worker move interpolação geométrica, não toda a rasterização e nem o processamento de vídeo para outra thread.

## Verificação automatizada

Executar `npm run test:video:next`, `npm run test:export:synthetic`, `npm run typecheck`, `npm run build` — especialmente no Windows. A CI foi rodada no commit de código que antecede este documento.

**Regra do projeto:** não criar animações fora do Video Studio. Os estados autorais continuam nos blocos e todas as transições são geradas entre eles automaticamente, aproveitando a matemática consolidada do Animador DEV e do Animador Preset Rosto DEV.
