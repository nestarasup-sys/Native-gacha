# Video Studio — rodada P0 de preview/cancelamento (23/10/2026)

Branch de trabalho: `codex/video-studio-preview-foundation-20261023`.

## Mudanças verificáveis

- `previewTransitionSession.ts`: fila serial de preparação do preview agora isolada de React e testável; cenas e seeks obsoletos invalidam amostras enfileiradas via `AbortController` e geração. Nunca aceitar resultado de revisão antiga no cache. Limites legados de 128 MiB/240 PNGs preservados.
- O preview pausado só materializa o **frame intermediário solicitado**, sem renderizar os 14 frames de uma transição futura em cada seek.
- O Play continua exigindo os 14 frames intermediários da próxima fronteira; não sacrifica a semântica de animação em troca de velocidade. Requisição já iniciada para o mesmo frame não é cancelada por um efeito de React tardio.
- O `Image.decode()` temporário após obter cada PNG foi removido: decodificava o PNG apenas para descartar a imagem antes que o próprio DOM realizasse seu decode. A rota PNG continua por compatibilidade com `VideoStudioDomElement`. A via Canvas direta já existe no export; **a preview ainda NÃO migrou para renderizar Canvas direto**.
- `TransitionRenderer` verifica `AbortSignal` entre etapas assíncronas longas. Não preempta desenho JS síncrono/Chromium interno em execução. O isolamento e recuperação pelo `EngineSupervisor` continuam pendentes.
- `VideoStudioEditor` invalida a fila quando o usuário cancela preparação ou faz seek.
- Testes determinísticos cobrem seek pausado, fronteira de 15 frames, cancelamento durante await, stale-result, Play versus efeito React, dispose/cache e ausência de decode redundante.

## Validação e próximos gates

1. Rodar `npm run test:video:next`, `npm run typecheck`, `npm run build` e os testes existentes de exportação em Windows/CI.
2. Executar fixture **sintética isolada** de 180 s com 4 personagens, 213 keys e mídias próprias, antes/depois no mesmo hardware e SHA fixado. Medir `preparingMs`, p95 seek, cache, RSS/commit, VRAM e falhas de GPU/renderer. A baseline de 23/10 registrou 618,005 s de preparação num ciclo frio; nenhuma melhoria numérica deve ser declarada sem novo ensaio.
3. Próxima fatia: preview ler `SceneEvaluator`/FramePlan compartilhado com export, exibir frames Canvas em uma StageView separada (sem `dataURL` como transporte de frames), com paridade de expressão normal/PT, olhos independentes, roupa/oclusão, 15 frames, vídeo/áudio.
4. Fazer um MP4 sintético curto 5–10 s com `npm run test:export:e2e-electron` e `npm run test:export:preview-oracle` antes de qualquer benchmark pesado. Preservar `StudioDocument v1`, projeto do usuário e recursos originais.
5. Cancelamento **cooperativo** não substitui finalização imediata de raster síncrono. Para garantia de parar uma tarefa dentro de deadline, migrar a renderização pesada ao supervisor em processo separado, com PID e política de encerramento.

## Limites

O código desta rodada é uma fatia de reconstrução; não declara N4/N5/N6/N7 concluídos, nem export real certificado. Nenhum dado local de usuário foi consultado, migrado ou excluído.
