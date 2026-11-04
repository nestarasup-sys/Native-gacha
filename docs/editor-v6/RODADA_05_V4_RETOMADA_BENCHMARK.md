# Editor V6 — Rodada 05 · Retomada do benchmark real

**Data:** 03/11/2026 (horário de Brasília; publicação UTC em 04/11). **Branch:** `Dev-V2`.  
**Base após tentativa anterior do Codex:** `4d461bf5a791202f06599494c5995bb80360b05b`.  
**Escopo:** corrigir medição do projeto real com cabelo e áudio, sem alterar frames, bitrate, codec, presets ou conteúdo pessoal.

## Diagnóstico da retomada

A tentativa anterior publicou `856b695` (`perf(editor-v6): optimize hair export rendering`) e depois `4d461bf` (Fabricador). No código atualizado, o cabelo já usa **canvas vivo embutido no SVG** durante o export, evitando PNG/Blob intermediário por quadro; o worker também mantém estado físico determinístico, fase individual e a transição de pose. Já havia um harness recém-implementado para benchmark isolado `--hair-preset-slot=2`, mas **não havia relatório reproduzível do Editor V6 06 confirmando 10–15 s** no repositório.

A run hospedada do HEAD anterior [41758711521](https://github.com/nestarasup-sys/Native-gacha/actions/runs/41758711521) havia aprovado Ubuntu/Windows/arquitetura na consulta, com teste MP4 ainda em execução; isso **não valida o tempo do projeto pessoal**.

### Falha concreta de medição corrigida

O novo harness `electron/main.ts` definia `expectedAudioClips = 0` sempre que `hairPresetSlot` fosse informado. `scripts/editor-v6/benchmark-project-export.cjs` também rejeitava qualquer resumo com `run.audioClips !== 0` ou `run.audioOutput !== false`. Isso significa que um projeto real com fala e/ou música podia exportar um MP4 **correto** e mesmo assim ser marcado como falha do benchmark.

Mudanças nesta rodada:

1. `src/shared/editorV6Export.ts`: `editorV6BenchmarkAudioMatchesExport(audioClips, outputHasAudio)` verifica que áudio está presente **se e somente se** houver clipes de áudio efetivamente planejados para a saída, sem supor que a cena é muda.
2. `electron/main.ts`: o benchmark real com cabelo usa essa verificação; o stress sintético histórico mantém seus critérios originais.
3. `scripts/editor-v6/benchmark-project-export.cjs`: valida a mesma coerência no resumo, verifica que o número de clipes é consistente entre as três rodadas e protege contra um projeto errado ou com menos de 300 quadros.
4. `tests/editor-v6/editorV6Export.test.ts`: cobre zero, um e vários clipes, soundtrack presente/ausente, números inválidos.

**A proteção de áudio não faz mixagem nem altera a saída:** ela corrige somente a lógica que aceita/rejeita a medição.

## Como retomar no PC — sem tocar no perfil pessoal

O script já exige fontes em `out/editor-v6-stress/backups/` e cria cópias isoladas em `out/editor-v6-stress/runs/`:

```powershell
npm run build
npm run bench:editor-v6:project -- --project=<backup-verificado-do-projeto-Editor-V6-06> --library=<backup-verificado-da-Base> --characters=<arquivo-copiado-de-personagens> --fabricator=<backup-verificado-do-Fabricador> --motion-cache=<cache-isolado-ou-copiado> --session-data=<sessao-Chromium-copiada-e-validada> --hair-preset-slot=2
```

Os caminhos acima são **placeholders**: antes de executar, confirmar o layout real dos backups, o armazenamento de `localStorage`, o conteúdo do Preset 2, o endereço/origem da sessão isolada, e os hashes das cópias. **Nunca** usar a fonte real editável como pasta de benchmark. A cena precisa ser exatamente **Editor V6 06** com pelo menos 300 frames; o teste exporta os primeiros 300 frames em 1920×1080, Turbo e H.264 automático. Se o usuário mediu outra resolução/opção, repetir nesse perfil para uma comparação justa ou documentar diferença.

O harness registra `hairPreparationWallMs` e `mainExportWallMs` separadamente; é essencial medir **do preparo ao MP4 final**, não apenas a etapa `rendering`. Ele também registra fases, métricas do Main/processos, encoder real e cache quente/frio. Comparar as três rodadas e não usar somente a execução mais rápida como prova da meta.

## Limites ainda abertos

- **Não houve benchmark real** neste ambiente: os arquivos/presets locais do usuário não ficam no GitHub.
- A versão atual do harness pode exigir ajustes específicos para copiar a sessão Chromium de maneira válida no PC. Não inventar `localStorage` se o Preset 2 não estiver presente; resolver pelo próprio código de armazenamento.
- O tempo de 65 s é a observação **aproximada** do usuário, não uma medição automática previamente reproduzida.
- A Rodada 05 **não promete** reduzir em segundos a exportação; ela destrava a comparação que vai provar qual parte é lenta.

**Próxima entrega técnica:** [Rodada 06 — malha WebGL sem cálculos redundantes](RODADA_06_V4_MALHA_CABELO_GPU.md).
