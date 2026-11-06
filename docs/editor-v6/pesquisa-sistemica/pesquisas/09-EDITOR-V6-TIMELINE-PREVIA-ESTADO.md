# Pesquisa 09 — React/DOM e relógio do Editor V6: timeline, prévia, memoização e estado

**Estado:** PESQUISADA EM CÓDIGO E DOCUMENTAÇÃO PRIMÁRIA · RUNTIME/TESTES NÃO EXECUTADOS.
**Data:** 06/11/2026. **Base estática:** Dev-V2 (commit `5166de7`, antes dos documentos deste Grupo A). Revalidar HEAD e working tree local antes de implementar.

## Questão e critério de saída

Quais atualizações de estado e de DOM acontecem em playback, scrub, drag, face patch e exportação? Quais já estão otimizadas e quais causam commits, long tasks e cenas recompostas?

## Evidências verificadas no código do aplicativo

1. **[CÓDIGO]** `src/renderer/src/ui/App.tsx:33` aplica `<Profiler>` por rota; `src/renderer/src/ui/performanceDiagnostics.ts` coleta `actualDuration`, long tasks e cenas. Ou seja, instrumentação existe e deve ser reutilizada.

2. **[CÓDIGO]** `EditorV6Page.tsx:64–986` compõe a página, com seleção, edição, personagem, painéis e exportação; `:926` e `:955` colocam Profiler na cena e na timeline. O tamanho da página sozinho NÃO demonstra render de toda UI a cada frame.

3. **[CÓDIGO]** `useEditorV6Playback.ts:7–51` calcula frame de playback com `requestAnimationFrame`, publica em relógio externo e só sincroniza estado mais amplo sob condições definidas. É uma otimização existente de UI.

4. **[CÓDIGO]** `EditorV6PlaybackScene.tsx:17–39` assina frame externo, usa `useMemo` para `resolveEditorV6SceneAtFrame`, compõe patches faciais async e renderiza `SceneSurface` sob Profiler.

5. **[CÓDIGO]** `EditorV6Timeline.tsx:33–83` separa `TimelineRows` memoizados e janela de elementos visíveis; `:110–112` computa range conforme scroll/zoom e `:306` desenha cursor por overlay.

6. **[CÓDIGO]** `SceneSurface.tsx:99–125` possui comparação específica de props (`sceneLayerPropsEqual`) e `memo(SceneLayer)`, e não uma atualização cega de todas as imagens.

7. **[CÓDIGO]** `editorV6Store.ts:29–78` implementa Zustand com middleware Immer, histórico undo/redo e estado ativo. `editorV6ExportCommands.ts:10–26` cria snapshot usando `current` e `structuredClone` para não atravessar awaits com Immer draft.

8. **[CÓDIGO]** `editorV6TimelineScene.ts:25` resolve cena em frame absoluto; `editorV6Export.ts:82–93` constrói visual keys para reuso em export. Os estados de UI e cena têm contratos parcialmente distintos.

9. **[CÓDIGO]** `SceneSurface.tsx:75–84` monta HTML media em `foreignObject`; playhead lógico não garante sozinho que o `<video>` decodificou exatamente o timestamp apropriado, exigindo testes de seek/paridade.

## Pesquisa nas fontes oficiais

1. **[FONTE OFICIAL] [React Profiler](https://react.dev/reference/react/Profiler)** — O callback fornece `actualDuration`, `baseDuration`, `startTime`, `commitTime`; medem React, não raster/compositor Chromium.

2. **[FONTE OFICIAL] [React memo](https://react.dev/reference/react/memo)** — Uma otimização, não garantia de ausência de render; props novas/references diferentes invalidam memo e contexto interno pode atualizar.

3. **[FONTE OFICIAL] [RenderingNG](https://developer.chrome.com/docs/chromium/renderingng-architecture)** — Atualização de DOM pode desencadear estilo/layout/paint; animações de compositor podem pular fases dependendo da invalidação.

4. **[FONTE OFICIAL] [DevTools Performance](https://developer.chrome.com/docs/devtools/performance/reference)** — Frame timeline, Main, GPU/Raster e long tasks revelam gargalo após commit React.

5. **[FONTE OFICIAL] [Immer Performance](https://immerjs.github.io/immer/performance/)** — Structural sharing e no-op podem preservar identidade, mas atualização profunda e clonagem têm custos mensuráveis.

**Limite de proveniência:** informações de documentação oficial foram confrontadas conceitualmente com as APIs usadas no código, mas o EXE e as versões efetivas instaladas não foram executados. Não existe medição própria neste estudo.

## Análise causal e possibilidades de mudança

### 1. Não reescrever relógio que já está isolado

[CÓDIGO] O V6 usa um relógio externo por RAF; seria prematuro 'otimizar playback' centralizando tudo num único Zustand set por frame. A prioridade é medir quedas de frames sob cenas complexas e verificar se causadas pela UI ou preparação de assets.

### 2. Diferenciar atualização de cena e atualização de camada

[HIPÓTESE] `resolveEditorV6SceneAtFrame` pode recalcular estado lógico barato enquanto cabelo/face em PNG custa caro. Medir os dois tempos separadamente. Se `sceneLayerPropsEqual` receber novas refs por mudanças semânticas relevantes, há re-render necessário; se não, estabilizar apenas props específicas.

### 3. Patches faciais assíncronos

[CÓDIGO] `EditorV6PlaybackScene` condiciona a superfície a composições de face; investigar invalidação quando o usuário faz seek rápido e quando a promessa anterior termina fora de ordem. Não afirmar bug sem fixture reproduzida.

### 4. Timeline e elementos visíveis

[CÓDIGO] Windowing de tracks e `TimelineRows` memoizados já existem. Experimento deve priorizar carregamento e drag de projeto longo em vez de substituir a timeline por virtualização genérica redundante.

### 5. Fontes e sincronização de vídeo

[HIPÓTESE] Prévia Chromium e export FFmpeg podem divergir em PTS/seek/color management; criar comparação por frame exato com mídia do fixture.

## Experimentos propostos (ainda não rodados)

1. **UI-01:** Fixture sintética: timeline curta e longa, scrub 0→150→300, gravação de `snapshotUiPerformance()` e trace Main/React/RAF.

2. **UI-02:** Drag de bloco sobre outros tracks, scroll e zoom, medindo commits e long tasks sem perder estado/undo.

3. **UI-03:** Boca e face em personagem único; comparar sceneResolve, composição de patch e raster em cada quadro.

4. **UI-04:** HTML `<video>` com seek e início/corte de clipe, comparação do frame lógico no preview e MP4 final.

5. **UI-05:** Check de React.memo props identity nos elementos estáticos vs animados com debugger/Profiler; propor alterações somente nos componentes provadamente quentes.

## Gates de segurança, qualidade e integração

- Não alterar arquivo salvo, IDs, snapping, duração em frames, undo/redo ou lógica de transição.
- Não inferir que React Compiler está instalado por existir em docs modernas; configuração observada usa plugin React padrão.
- Não converter clock lógico em wall clock de `requestAnimationFrame` do worker de export.
- Aceite inclui UX (latência, input), frame parity com export, React+Raster medidos e memória estável.
- Experimentos de mídia externos usam cópias autorizadas, jamais perfil pessoal.

## Veredito da pesquisa

**Otimização inicial recomendada:** auditar as camadas já existentes com Profiler/DevTools antes de mexer na arquitetura. A prévia já possui isolamento de clock, memoização e virtualização. Os potenciais problemas restantes são invalidação cruzada de face/asset e custo da superfície SVG/Canvas, não ausência dessas técnicas.

**[A CONFIRMAR]** Custos reais de playback longo, seek em vídeo de biblioteca, React tree update sob stress e efeitos de flags de diagnóstico; sem dados não há ganho quantitativo.

**Rastreabilidade:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md), [Plano executável](../PLANO_EXECUTAVEL.md), [Matriz](../MATRIZ_DE_OPORTUNIDADES.md), [Fontes oficiais](../evidencias/FONTES-OFICIAIS.md).

## Atualização experimental — compilador compartilhado do motor V6

O export worker usa `src/shared/editorV6ScenePlan.ts` para avaliar a cena a partir de um snapshot validado e isolado. O índice é esparso: eventos de blocos, troca de pose, amostras de atlas, fala, vídeo/fundo e blink determinístico marcam intervalos; não é uma prévia rasterizada nem um cache persistente. Um segmento reutiliza a mesma lista de elementos resolvida, enquanto o quadro atual muda. A preparação de cabelo continua sendo feita por quadro no renderer.

**Verificação:** paridade em todos os 300 quadros da fixture com o resolver canônico, incluindo balão anexado, face/blink e vídeo; `frameIndex` desliga reuso acima de 50.000 fronteiras e mantém a resolução direta válida. Isso testa determinismo, não resposta visual ou fluidez real da UI. A prévia React não foi migrada para o plano nesta etapa: o compilador atual transfere a posse do snapshot e congelá-lo seria incorreto durante edição; a alternativa exigiria snapshot compartilhado imutável com custo de compilação medido no drag/scrub.

**Medição real do motor:** um processo/sessão frios exportaram 2.394 quadros com cabelo Preset 2, áudio e vídeo em 88,51s clique→MP4 validado. A cena foi encaminhada ao compositor atual; não foi retido um MP4 anterior/depois para comparação de pixels. O resultado confirma integração e formato, sem declarar aceleração.
