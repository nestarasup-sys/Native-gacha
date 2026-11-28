# Inventário de referências dos scripts npm

Conferência estática dos nomes em `package.json` contra arquivos versionados (código, testes, workflows e documentação), excluindo `package.json`, o lockfile e `docs/lixo/`. Correspondência literal indica referência; ausência literal é candidata a script manual, não prova de desuso. Nenhum script foi removido ou reagrupado porque a equivalência dos comandos precisa ser demonstrada antes.

- Scripts examinados: 141.
- Scripts sem referência literal fora do manifesto:
  - `test:editor-v6:native-renderer` — npm run build:editor-v6:native && node --experimental-strip-types scripts/editor-v6/check-native-renderer.mjs
  - `prepreview` — node scripts/prepare-app-data.cjs
  - `test:fabricator:body-joint-bridge` — node --experimental-strip-types --import ./scripts/testing/register-typescript-extensions.mjs --test tests/body-joint-bridge.test.mjs
  - `test:fabricator:expression-layer-transform-edits` — node --experimental-strip-types --test tests/expression-layer-transform-edits.test.mjs
  - `test:editor-v6:doctor` — node scripts/editor-v6/rapid-gates-windows.cjs --gate=doctor
  - `test:editor-v6:quick-offscreen` — node scripts/editor-v6/rapid-gates-windows.cjs --gate=offscreen
  - `test:editor-v6:integration` — node scripts/editor-v6/rapid-gates-windows.cjs --gate=integration
  - `editor-v6:stress-projects` — node scripts/editor-v6/test-stress-offscreen.cjs
  - `test:editor-v6:stress-trace` — node scripts/editor-v6/test-stress-offscreen.cjs --trace
  - `test:editor-v6:stress-ab-memo` — powershell -NoProfile -ExecutionPolicy Bypass -File scripts/editor-v6/run-memo-ab.ps1
  - `editor-v6:analyze-memo-ab` — node scripts/editor-v6/analyze-memo-ab.cjs
  - `editor-v6:analyze-trace` — node scripts/editor-v6/analyze-trace.cjs
  - `diagnose:editor-v6:motion-preparation` — node scripts/editor-v6/analyze-motion-preparation.cjs
  - `test:editor-v6:combined-hair-mouth-memory` — npm run build && node scripts/editor-v6/check-hair-motion-export.cjs --long-combined-profile
  - `package:win:portable` — npm run build && electron-builder --win portable --x64
  - `test:fabricator:face-storage` — node --experimental-strip-types --test tests/fabricator-face-storage.test.mjs
  - `test:fabricator:hair-storage` — node --experimental-strip-types --test tests/fabricator-hair-storage.test.mjs
  - `test:fabricator:hair-catalog` — node --experimental-strip-types --test tests/hair-workspace-catalog.test.mjs
  - `test:concurrency-limiter` — node --experimental-strip-types --test tests/concurrency-limiter.test.mjs
  - `bench:editor-v6:compare-runs` — node scripts/editor-v6/compare-run-reports.cjs
  - `test:editor-v6:compare-runs` — node --test tests/editor-v6/compareRunReports.test.cjs
  - `lab:editor-v6:plan-b` — node scripts/editor-v6/run-plan-b-export-lab.cjs
  - `summary:editor-v6:plan-b-lab` — node scripts/editor-v6/summarize-planb-export-lab.cjs
  - `diagnose:editor-v6:export` — node scripts/editor-v6/analyze-export-performance.cjs
  - `spike:editor-v6:native-composite` — node scripts/editor-v6/spike-native-compositor.cjs
  - `test:fabricator-catalog` — node --experimental-strip-types --test tests/fabricator-model-catalog.test.mjs
  - `test:asset-flow` — node scripts/audit-wardrobe-flow.mjs
  - `test:fabricator:contracts` — node --experimental-strip-types --test tests/fabricator-model-writer.test.mjs tests/fabricator-model-views.test.mjs tests/fabricator-model-appearance-…
  - `test:fabricator:assets` — node --experimental-strip-types --test tests/fabricator-versioned-assets.test.mjs
  - `test:fabricator:chaos` — node --experimental-strip-types --test tests/model-source-fault-injection.test.mjs
  - `test:fabricator:crash` — node --experimental-strip-types --test tests/model-source-process-crash.test.mjs
  - `test:fabricator:fixture` — node --experimental-strip-types --test tests/fabricator-complete-visual-fixture.test.mjs
  - `test:fabricator:full-golden` — node --experimental-strip-types --test tests/fabricator-complete-character-golden.test.mjs
  - `format:changed` — node scripts/format-changed.cjs

## Revisão de invocação dinâmica (22/11/2026)

- [Executado] A busca desta rodada encontrou uma chamada de script não refletida na lista acima: `scripts/editor-v6/run-memo-ab.ps1:41` executa `npm run editor-v6:analyze-memo-ab`. Dos 34 nomes acima, 33 continuam sem invocação literal externa identificada nas áreas examinadas; `editor-v6:analyze-memo-ab` é chamado por esse orquestrador.
- [Lido] `prepreview` é um hook de lifecycle do npm e acompanha o script `preview` no manifesto; não é órfão: o npm executa o hook ao rodar `npm run preview`.
- [Lido] `test:editor-v6:stress-ab-memo` é um entrypoint manual cujo comando chama `run-memo-ab.ps1`. O `.ps1` por sua vez chama o harness `test:editor-v6:stress-offscreen` para os braços e `editor-v6:analyze-memo-ab` para análise. A busca não encontrou invocação externa literal do entrypoint.
- [Lido] Os três scripts `test:editor-v6:doctor`, `test:editor-v6:quick-offscreen` e `test:editor-v6:integration` selecionam modos distintos de `rapid-gates-windows.cjs`; `editor-v6:stress-projects` e `test:editor-v6:stress-trace` compartilham o harness com modos diferentes. São aliases de entrada, não comandos idênticos.
- [Lido] Os demais nomes da lista são comandos focados de teste, benchmark, diagnóstico, laboratório, spike, empacotamento ou formatação. Não encontrei um par com comando e argumentos idênticos que possa ser removido com segurança.
- [Lido] Os 31 entrypoints sem invocação externa literal identificada são:
  - Gates/testes: `test:editor-v6:native-renderer`, `test:fabricator:body-joint-bridge`, `test:fabricator:expression-layer-transform-edits`, `test:editor-v6:doctor`, `test:editor-v6:quick-offscreen`, `test:editor-v6:integration`, `editor-v6:stress-projects`, `test:editor-v6:stress-trace`, `test:fabricator:face-storage`, `test:fabricator:hair-storage`, `test:fabricator:hair-catalog`, `test:concurrency-limiter`, `test:editor-v6:compare-runs`, `test:fabricator-catalog`, `test:asset-flow`, `test:fabricator:contracts`, `test:fabricator:assets`, `test:fabricator:chaos`, `test:fabricator:crash`, `test:fabricator:fixture`, `test:fabricator:full-golden`.
  - Benchmarks/análise/labs: `editor-v6:analyze-trace`, `diagnose:editor-v6:motion-preparation`, `test:editor-v6:combined-hair-mouth-memory`, `bench:editor-v6:compare-runs`, `lab:editor-v6:plan-b`, `summary:editor-v6:plan-b-lab`, `diagnose:editor-v6:export`, `spike:editor-v6:native-composite`.
  - Empacotamento/formatação: `package:win:portable`, `format:changed`.
- [Suposição] Manter os entrypoints de diagnóstico manual é mais seguro do que apagar comandos com baixa frequência: a ausência de chamada literal não demonstra desuso e scripts de laboratório podem ser usados fora de CI.
- [Não feito] Não agrupei nem removi scripts; qualquer consolidação futura deve preservar os nomes usados por operadores e verificar chamadas dinâmicas completas, inclusive arquivos externos ao repositório.
