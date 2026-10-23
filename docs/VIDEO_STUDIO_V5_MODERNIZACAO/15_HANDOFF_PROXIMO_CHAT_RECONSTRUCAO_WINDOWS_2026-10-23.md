# CONTEXTO PARA PRÓXIMO CHAT — Native Gacha G-V5 / reconstrução do Video Studio
**Atualizado:** 23/10/2026. **Alvo:** exclusivamente Windows. **Status:** reconstrução parcial executável, sem paridade total. 
**Repositório:** `nestarasup-sys/Native-gacha`. **Branch de desenvolvimento autorizada:** `feature/model-source-editor`. **PR:** [#5](https://github.com/nestarasup-sys/Native-gacha/pull/5), draft, destino `refactor/shared-character-core`. **Não alterar nem mesclar main.** 
**Marco de remoção do antigo:** commit `033a0dc56eef8c7ebd6a7d4eb99521c805f863cb`. **Antes de editar, sempre buscar HEAD mais recente da branch**, verificar se mudou e fazer commit/update_ref com expected_sha para não atropelar Codex/outro agente.

## 1. O que o usuário decidiu (obrigatório)

Usuário rejeitou continuar estendendo `VideoStudioEditor.tsx`; determinou **reconstrução integral nova**, preservando projetos e todos os comportamentos:
1. Reproduzir sem pré-render serial de todos os frames/transições como condição para Play.
2. Motor Gacha próprio orientado a GPU, texturas persistentes, camadas reais (body/hair/clothes/eyes independent PT pupils/mouth/pose/masks), sem gerar PNG completo por expressão.
3. Motor multimídia independente da UI React, supervisionado, com relógio AV, PTS, cancelamento e recuperação de processo.
A UI pode continuar Electron+React, porém o editor/renderer antigo deve ser aposentado, não reutilizado como componente de produto. **Preservar StudioDocument v1, personagens, roupas, poses, olhares, expressões, textos/balões, vídeo/áudio, timing e export. Não sobrescrever app-data pessoal.**

## 2. Evidência do problema em Windows (documentos reais)

O usuário anexou `RELATORIO.md` e `video-studio-diagnostico-interrompido.zip`; há cópias no GitHub e análise em [13 — diagnóstico](./13_DECISAO_APOS_STRESS_REAL_WINDOWS_2026-10-23.md).

Projeto real: quatro personagens `STRESS_Aurora`, `STRESS_Nix`, `STRESS_Brisa`, `STRESS_Dorian`, 180 s, 60 fps, **10.800 frames de timeline**, 213 character keys, 48 falas/pensamentos, dois vídeos. Preview frio levou **802,473 s**, dos quais **618,005 s em 52 períodos de preparação** (~77%). Pico agregado de Private Bytes Electron ~**3.029 MiB**, sem VRAM/GC medidas. **Exportação MP4 NÃO foi executada**. Warm cycle ficou inconclusivo. O principal gargalo foi `useCharacterTransitions.ts` com fila serial de PNG + decode e Play bloqueado por `preparePlayback` no editor antigo. Não afirmar que FFmpeg export levou 13 minutos ou que OOM/leak está provado. A execução real corrigiu um `AbortError` de troca de proxy.

## 3. Código novo e rotas ATUAIS

- `src/renderer/src/ui/App.tsx` aponta **diretamente** `/video-studio` à `src/renderer/src/features/videoStudioRebuild/VideoStudioRebuildPage.tsx`.
- `src/shared/videoStudioRebuild/frameEngine.ts`: avaliação absoluta `VideoSceneIR`, sem copiar strings base64 no preview. `frameScheduler.ts`: apenas quadro solicitado, prefetch limitado, AbortSignal, geração de cancelamento.
- `src/renderer/src/features/videoStudioRebuild/previewTransport.ts`: loop/relógio/raster/seek fora de React, UI recebe snapshots ~10 Hz. Sem pré-render serial. `gachaGpuStage.ts`: compositor WebGL2 real, texturas persistentes, LRU e perda/restauro de contexto.
- **Atenção:** preview GPU agora desenha sobretudo os PNGs já salvos como texturas; **não há compilador completo catálogo Gacha → sprites dinâmicos/PT**. Velocidade visual aparente não prova fidelidade.
- `mediaEngine.ts`: controla HTMLVideoElement, proxies, limite de decoders e relógio fora do componente React, **mas decoders ainda estão no processo Chromium renderer**.
- `electron/videoStudioRebuild/mediaUtility.ts`, `mediaSupervisor.ts`, `mediaContracts.ts`: utilityProcess supervisionado, clock 60 fps, áudio como master se disponível, seek/pause/cancel, timeout e reinício, IPC `video-engine:media:control`. **Isola clock e controle, NÃO ainda os decoders/mixer/FFmpeg**.
- `src/shared/videoStudioRebuild/rebuildEditor.ts`: divisão imutável de bloco. A nova UI abre biblioteca, cria projeto, Play/seek/transport, split, alterna transições e **salva cópias**. Edição Gacha normal/PT, undo/redo, áudio independente e exportação no novo motor ainda não foram reconstruídos.
- `electron.vite.config.ts`: bundle Electron deve manter `out/main/main.js` e `out/main/media-engine-worker.js`. Um bug anterior que trocava `main.js` por `index.js` já foi corrigido.

## 4. EXCLUSÃO DO LEGADO — já iniciada

No commit `033a0dc` foram **excluídos fisicamente**:
- `src/renderer/src/features/videoStudio/VideoStudioEditor.tsx` (monólito ~180 kB)
- `src/renderer/src/features/videoStudio/VideoStudioPage.tsx` (wrapper morto)

`scripts/architecture/performance-audit.cjs` passou a orçar `VideoStudioRebuildPage.tsx` em vez do componente removido. Novo teste `tests/video-studio-rebuild-no-legacy-editor.test.cjs` protege a ausência/rota e o CSS compartilhado. NÃO recriar o componente/rota antigos.

**NÃO excluir sem mapear dependências:** `src/renderer/src/features/videoStudio/VideoStudioEditor.css` continua importado por `VideoPreviewOraclePage.tsx` (oráculo de paridade da exportação). `VideoExportSurfacePage.tsx`, `videoCharacterFrameRenderer.ts`, `transitionRenderer.ts`, `videoCanvasCompositor.ts`, `VideoTimeline.tsx`, `characterGeometry.ts` e serviços históricos podem ser usados por exportação, testes e fixtures. Verificar grafo de imports/referências, portar contratos para módulos novos e fazer exclusões **por dependência comprovadamente morta**, com teste Windows após cada corte. Não apague dados persistidos ou assets.

## 5. Verificação Windows

CI: [Core architecture validation](https://github.com/nestarasup-sys/Native-gacha/actions/workflows/ci-core.yml), [Quality](https://github.com/nestarasup-sys/Native-gacha/actions/workflows/quality.yml), [Fabricator screenshots Windows](https://github.com/nestarasup-sys/Native-gacha/actions/workflows/fabricator-real-ui-windows.yml). A última verificação ANTES da exclusão do monólito, em `40c89c358d40c6fae29c1cd9167a94649d74bf2c`, estava verde nos três workflows. O commit de exclusão abriu nova CI, **ainda exigia conclusão ao escrever este documento**; consultar o resultado atualizado, nunca supor sucesso.

Comandos:
- `npm run typecheck`
- `npm run build`
- `npm run test:video:next`
- `npm run test:video:rebuild`
- `node --test tests/architecture-audit.test.cjs`
- `npm run test:video:rebuild:worker:bundle`
- **Com Electron instalado em Windows:** `npm run test:video:rebuild:worker:windows` e `npm run test:video:rebuild:ui:windows` (perfil sintético isolado, watchdog de 45s).
A CI Windows executa testes e build, e o workflow de screenshot real testa subprocesso e interface. Não priorizar Linux: produto alvo Windows.

## 6. Próximas implementações em ordem

**P0 — Fechar o corte de remoção:** confirmar CI de `033a0dc`; corrigir eventuais imports/testes que dependiam de `VideoStudioEditor.tsx` sem ressuscitá-lo. Verificar se CSS do oracle pode ser reduzido/extraído para estilo específico antes de excluí-lo.
**P1 — Verdadeiro compilador Gacha GPU:** de modelos/poses/roupas/presets para camadas: corpo, cabelo traseiro/frontal, vestes e z-order, olhos esquerdo/direito, pupilas PT independentes, boca/blink, máscaras, efeitos. A atualização de um olho NÃO deve recodificar/upload de um corpo inteiro. Sem migração destrutiva de projetos. Goldens reais de Chromium no Windows e parity PT antes de ativar como padrão.
**P2 — EditorCore real e UI funcional completa:** biblioteca/persistência com save/undo/redo, edição de atores, blocos/timeline multimídia, parâmetros por quadro, balões, presets normais/PT, áudio. Não retornar ao monólito antigo.
**P3 — Subprocessos de mídia supervisionados:** decoders reais (não apenas relógio), filas limitadas, áudio autoritativo/PTS racional, seek e cancelamento que eliminam trabalho não cooperativo, mixer e recuperação de crash. Separar media decoder da UI React.
**P4 — Preview/export comuns:** FramePlan/SceneEvaluator e compositor iguais para os dois modos; exportação 1080p60 com FFmpeg/PTS/áudio, validação FFprobe e comparação quadro a quadro. MLT/GES/Skia como spikes separados somente depois de benchmarks justificarem.
**P5 — Stress progressivo medido:** 5s → 15s → 30s com quatro personagens e visuais mutáveis, cold/warm, FPS efetivo apresentado, CPU/RAM/private bytes/VRAM por PID, timeout/cancelamento; **180s / 10.800 frames só após gates curtos**. Posteriormente 12/24/48 atores.

## 7. Restrições e instrução ao próximo assistente

**Não começar perguntando o que fazer:** recuperar branch, verificar HEAD/CI, ler este documento + [14](./14_RECONSTRUCAO_NOVA_ENGINE_INDEPENDENTE_WINDOWS.md) + [13](./13_DECISAO_APOS_STRESS_REAL_WINDOWS_2026-10-23.md), inspecionar módulos e trabalhar no próximo gate pendente com alterações reais, testes e commits **somente** em `feature/model-source-editor`. Não fazer merge nem mudar `main`, não sobrescrever projetos reais. Não medir desempenho a partir de mock ou afirmar reconstrução completa; explicitar o que a CI cobre e o que necessita Windows real. Preservar formato `StudioDocument v1` e fidelidade Gacha (normal/PT/pupilas independentes, roupa, cabelo, pose, balões, vídeo, áudio).
