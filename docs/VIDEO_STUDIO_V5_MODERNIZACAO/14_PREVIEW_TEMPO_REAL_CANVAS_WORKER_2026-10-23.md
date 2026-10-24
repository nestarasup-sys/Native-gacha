# Video Studio — Preview responsiva e recorte em Worker (rodada de outubro de 2026)

**Branch oficial:** `Main-desenvolvimento`. **Arquivo de projeto:** `StudioDocument v1` (sem migração nem sobrescrita). **Objetivo:** a criação de blocos de pose, expressão e preset não deve bloquear a timeline aguardando 14 amostras de uma transição.

## 1 — Play imediato

O botão de Play em `VideoStudioEditor.tsx` inicia o relógio RAF (de `projectClock`) sem executar `await preparePlayback()`. Foi removido o efeito que congelava a reprodução por falta de imagem. O tempo audiovisual passa a ser guiado pelo frame absoluto, não pela fila de rasters.

## 2 — Solicitação de frame desacoplada

`useCharacterTransitions` chama `PreviewTransitionSession.requestFrame()` sem aguardar o resultado. A fila retém **no máximo uma solicitação pendente por personagem**, substituindo frames antigos quando o playhead se move rápido; nunca faz prewarm de todas as amostras a cada boundary. Um personagem com render atrasado mantém temporariamente sua última imagem concluída **somente dentro da mesma transição**, sem usar uma imagem de outro preset/pose.

A fila continua serial na thread da preview para evitar compartilhamento simultâneo de Canvas mutável; a métrica de frames solicitados/renderizados/desperdiçados pode ser avaliada pelo harness de estresse.

## 3 — Canvas direto sem intermediário PNG

`TransitionRenderer.renderPreview` devolve `VideoGachaCanvasState.canvasImage` (Canvas ou `ImageBitmap`); o DOM usa `VideoStudioCanvasRaster`, com `drawImage`, mantendo os mesmos estilos/transformações CSS. A exportação conserva a rota própria. Só ativos incompatíveis com Canvas usam o fallback PNG do compositor antigo.

**Atenção:** a captura original de personagem, alguns efeitos automáticos de boca/piscar fora das transições e a edição de rosto ainda possuem rotas PNG legadas. Isso não é uma eliminação de PNG de todo o Video Studio, mas do caminho intermediário de transições reproduzidas.

## 4 — Cache por personagem/revisão

A chave incorpora elemento, boundary, referências das poses/estados inicial/final, versão do personagem e frame. Uma edição de A substitui somente A na demanda; B continua com sua própria imagem em cache. O limite conservador existente (128 MiB/240 entradas) é mantido, agora contábil por bytes RGBA de Canvas; `ImageBitmap` de cache é fechado em descarte/dispose.

## 5 — Isolamento parcial de CPU por Web Worker

`videoGachaPreviewCrop.worker.ts` recebe `ImageBitmap` transferível, extrai o recorte pelo mesmo threshold RGBA (alpha > 8), e devolve `ImageBitmap` sem PNG. `previewCanvasWorkerClient.ts` aplica deadline, descarte de respostas obsoletas, abort, fallback sem Worker e terminador em erro. A exportação permanece usando o crop síncrono determinístico original.

**Limite importante:** o custo de **preparar poses e renderizar a personagem Gacha inteira** continua majoritariamente no renderer da preview, pois o compositor atual depende de `document` e `HTMLCanvasElement`. A transferência integral dessa renderização para um processo de Electron, com protocolos/ativos versionados, cancelamento por PID, VRAM e paridade visual, ainda requer uma próxima etapa. Não declarar 'UI nunca bloqueia' sem essa migração e stress Windows real.

## Gates de validação

1. CI Windows/Ubuntu: `npm run test:video:next`, `npm run test:export:synthetic`, `npm run typecheck`, `npm run build`. Os testes novos verificam coalescimento, fallback dentro da mesma transição, invalidação isolada do personagem e crop exato em Worker.
2. Teste prático no Windows: inserir 100+ keys com mudanças de preset/pose enquanto faz seeks A→B→A e inicia/pausa rapidamente. Verificar que o relógio continua, que uma versão antiga nunca aparece após troca de preset e que a opção de desativar transições continua idêntica.
3. Reexecutar a fixture sintética de **180 s**, 4 personagens, 213 keys, 48 balloons, vídeos e gaps; medir os campos `transitionMetrics`, FPS real de timeline, frame-latency p50/p95/p99, RSS, private commit, GPU/VRAM, media A/V e falhas.
4. Testar export MP4 E2E curto e comparar pixels com oráculo no Windows. A antecipação da timeline é uma política de **preview**, não de export; o export precisa manter os 60 fps completos e exatos.
5. Completar o item 5 com **renderer Gacha integral fora do processo de UI**, supervisionado, seguido de paridade de recorte/olhos PT/cabelo/oclusão/roupa/boca/piscar e crash recovery.

Não usar bibliotecas pessoais ou vídeos privados como fixtures de CI.
