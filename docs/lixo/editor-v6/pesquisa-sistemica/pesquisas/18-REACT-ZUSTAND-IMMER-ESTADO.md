# Pesquisa 18 — React 19, React DOM, React Router, Zustand e Immer: estado, clock, commits e snapshots

**Status:** PESQUISADA EM CÓDIGO + FONTES OFICIAIS; EXPERIMENTOS RUNTIME PENDENTES.  
**Revisão estática:** `Dev-V2@5166de7`; **data:** 06/11/2026. Revalidar versões e HEAD antes de implementar. Este documento não declara benchmark realizado.

## Questão técnica e escopo

**Como reduzir invalidations de UI sem danificar a timeline, histórico e snapshots de personagem? O que já foi otimizado e onde selectors, memoização ou snapshots imutáveis poderiam ser melhores?**

## Mapa de integrações efetivamente observadas no Native Gacha

1. **[CÓDIGO]** `package.json` declara React/React DOM `^19.2.0`, React Router `^8.4.0`, Zustand `^5.0.16` e Immer `^11.2.9` em runtime.

2. **[CÓDIGO]** `src/renderer/src/ui/mountApp.tsx:1–21` monta `StrictMode`, `HashRouter`, App e ErrorBoundary; `src/renderer/src/ui/App.tsx` tem rotas lazy e Profiler por rota.

3. **[CÓDIGO]** `src/renderer/src/features/editorV6/editorV6Store.ts:29–78` usa `create<EditorV6HistoryStore>()(immer(...))`, acompanha projetos, projeto ativo, histórico undo/redo, project summaries e mutations declarativas.

4. **[CÓDIGO]** `src/renderer/src/features/editorV6/useEditorV6Playback.ts:7–51` tem loop de RAF e publica frame; o relógio não depende exclusivamente de renders da página principal.

5. **[CÓDIGO]** `src/renderer/src/features/editorV6/EditorV6PlaybackScene.tsx:17–39` assina frame, calcula cena por `useMemo`, compõe face e entrega `SceneSurface` sob `Profiler`; em seek ou mudança de asset pode invalidar.

6. **[CÓDIGO]** `src/renderer/src/features/editorV6/EditorV6Timeline.tsx:33–85` memoiza linhas e filtra blocos pela janela visível; cursor do playback é camada separada.

7. **[CÓDIGO]** `src/renderer/src/features/editorV6/SceneSurface.tsx:99–125` compara props específicas de `SceneLayer`, incluindo `motionSprite`, `mouthPatch`, asset e rasterFrame; UI já possui isolamento.

8. **[CÓDIGO]** `src/renderer/src/features/editorV6/editorV6ExportCommands.ts:10–26` chama `current(isDraft(...))` e `structuredClone` para criar snapshot detached antes de awaits. Um Immer draft não deve atravessar tarefas assíncronas.

9. **[CÓDIGO]** `src/renderer/src/ui/performanceDiagnostics.ts:135–165` registra commits e long tasks apenas em modo diagnóstico opt-in; `EditorV6Page.tsx:926,955` possui profilers de cena/timeline.

10. **[CÓDIGO]** `src/renderer/src/features/editorV6/useEditorV6DocumentPersistence.ts` mantém flush de writes; não associar diretamente setState com persistência no Main sem contrato.

## Documentação oficial consultada e limites da API

1. **[FONTE OFICIAL] [React memo](https://react.dev/reference/react/memo)** — Memo é otimização e não garantia; props/estado/contexto e igualdade referencial definem re-render.

2. **[FONTE OFICIAL] [React Profiler](https://react.dev/reference/react/Profiler)** — `actualDuration`/`baseDuration` permitem auditar ganho em React, não cobrem raster GPU.

3. **[FONTE OFICIAL] [React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)** — Snapshot estável/imutável, subscribe estável e igualdade `Object.is` são condições para evitar renders desnecessários.

4. **[FONTE OFICIAL] [Zustand useShallow](https://zustand.docs.pmnd.rs/learn/guides/prevent-rerenders-with-use-shallow.html)** — Selectors com resultados estruturados podem ser comparados superficialmente; não usar automaticamente quando campos profundos mudam.

5. **[FONTE OFICIAL] [Zustand Immer middleware](https://zustand.docs.pmnd.rs/reference/integrations/immer-middleware.html)** — Middleware permite updates imutáveis com sintaxe de mutação local.

6. **[FONTE OFICIAL] [Immer current](https://immerjs.github.io/immer/current/)** — `current` extrai estado do draft e pode ser caro; usar somente quando necessário e sem vazar proxies.

7. **[FONTE OFICIAL] [Immer performance](https://immerjs.github.io/immer/performance/)** — No-ops e structural sharing preservam identidade; custo de `produce` depende do tamanho/mudança do estado.

**Limitação:** fontes consultadas cobrem a API pública atual, não o build Electron/Node instalado nem as milhões de linhas do motor upstream. Disponibilidade, licenças e formatos precisam de prova na versão empacotada.

## Hipóteses e conclusões fundamentadas

### 1. O aplicativo já ataca re-render excessivo

[CÓDIGO] Profiler, useMemo, memo, store dedicado e relógio externo já existem. Reescrever a timeline para 'aplicar React.memo' é redundante até provar um componente ainda quente.

### 2. O export isola projeto de mudanças concorrentes

[CÓDIGO] `structuredClone` no comando de exportação evita estado de Immer alterar durante awaits; custo O(tamanho do documento) é possível, mas remover snapshot pode quebrar determinismo.

### 3. Selectores com referências estáveis como próximo experimento

[HIPÓTESE] Algumas seleções podem produzir arrays/objetos novos sem alteração real. Monitorar selector output/ref e React commit; aplicar `useShallow` onde a semântica permitir, não globalmente.

### 4. Métricas JS não são os pixels finais

[FONTE] Redução de `actualDuration` pode não acelerar `capturePage` ou Canvas. Benchmark de UI deve incluir browser Performance/paint e frame logical.

### 5. Browser de export e UI têm React separados

[CÓDIGO] `exportWorker.tsx` usa root independente e `flushSync` por quadro. Otimizar o estado da UI principal pode não alterar esse worker, que precisa ter trace próprio.

## Protocolo experimental que falta executar

1. **UI-R-01:** Perf de rota/customizador/studio/V6 com `Profiler`, gameplay e scroll sem flags de stress no build final.

2. **UI-R-02:** Mapear selectors e valores com `useShallow` candidatos e fazer A/B numa fixture de timeline longa, preservando undo/redo.

3. **UI-R-03:** Medir custo de snapshot/export vs tamanho do documento (100/500/1000 elementos), com referências e assets válidos.

4. **UI-R-04:** Separar React commits de raster/Canvas/paint e observar mudanças de mouth/face em repouso de cabelo.

5. **UI-R-05:** Validação de cancelamento/erro async, atualização de fonte e dispose, sem stale data e frame incorreto.

## Riscos, compatibilidade e gates obrigatórios

- Preservar undo/redo, schemas, IDs, persistência e visualização exata de bloco em seek.
- React Compiler pode existir na documentação mas não está habilitado automaticamente por plugin React.
- Não transformar todo progresso de playback em Zustand `set` por frame sem medir efeitos.
- Não forçar referências estáveis que escondam alterações reais de face/pose/arquivo.
- Bench de UI deve diferenciar renderização de React do tempo de arquivo MP4.

## Próxima decisão

**Recomendação:** medir primeiro a UI atual; fazer alterações pontuais em selector/props/face composition comprovadamente quentes, sem mexer no relógio externo. Fonte do gargalo de 50→9s continua pendente de perfil no export worker.

**Verificações runtime deste documento:** **NÃO EXECUTADAS**. Ver [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md), [Plano executável](../PLANO_EXECUTAVEL.md) e [Progresso](../PROGRESSO_E_RESULTADOS.md).
