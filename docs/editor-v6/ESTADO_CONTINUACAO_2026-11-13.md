# Editor V6 — estado da continuação

Data do checkpoint: 13/11/2026, BRT

- **Repositório:** `C:\TRABALHO 2\OUTROS\GACHA EM C++`
- **Branch:** `Dev-V2`
- **Último commit de código:** `0c0fa988 Memoize duplicate asset guard in Editor V6`
- **Distância local/remoto antes do commit do checkpoint:** 63 commits à frente de `origin/Dev-V2`. Nada foi enviado ao GitHub.

## O que estava sendo feito

Continuação da reestruturação e da busca por melhorias de desempenho no Editor V6, principalmente na preparação de transições de cabelo e na composição de quadros. O trabalho desta sessão evitou mudanças de qualidade/resolução e não usou o projeto pessoal de 12 minutos nem a pasta `app-data` como fixture.

Commits feitos nesta continuação:

- `4a0994a3` — durante transições completas, calcula e registra somente os flips das camadas em vez de interpolar um rig inteiro apenas para ler `flipX`. O caminho físico e os fallbacks para rigs incompletos foram mantidos.
- `48dbe434` — reutiliza o mapa de personagens do pré-cálculo da trajetória entre quadros e limita-o aos IDs com cabelo animado.
- `474ffddb` — deixa de copiar o array da cena quando nenhum personagem rigged tem `mouthPatch`; quando ele existe, continua removendo os patches antes da composição e sem mutar a cena original.
- `446b9f97` — registra a última execução do harness Electron sintético.
- `a96e9c08` — limita o mapa dos elementos originais aos IDs rigged, que são os únicos consultados pelo compositor.
- `0c0fa988` — verifica IDs de assets duplicados em uma passagem sem `assets.map(...)` e memoriza o resultado pela referência da coleção, evitando repetir a verificação ao selecionar blocos/personagens quando os assets não mudaram.

As otimizações anteriores desta mesma linha de trabalho estão registradas em `PLANO_ACELERACAO_EXPORT.md` e `REESTRUTURACAO.md`. Elas incluem configuração de movimento de cabelo compilada, pares de camadas compilados, pontos extremos da trajetória pré-calculados, leituras faciais compartilhadas durante o preparo e clones de personagem adiados até um bake necessário.

## O que melhorou

- Menos rigs e arrays temporários no caminho por quadro do cabelo; foram mantidos os cálculos geométricos e as regras de fallback existentes.
- Menos objetos/mapas descartáveis no processamento da trajetória e da composição facial.
- Menos verificações repetidas da coleção de assets durante mudanças de seleção na interface.
- A preparação dos movimentos evita trabalho e leituras repetidas em transições já atendidas pela cache.

Alguns microbenchmarks sintéticos de etapas anteriores mostraram reduções isoladas, não equivalentes à velocidade de um MP4:

- configuração de movimento: mediana de 47,16 ms para 18,63 ms em 50.000 chamadas sintéticas;
- interpolação dos pares de camadas: 44,79 ms para 25,72 ms em 20.000 interpolações;
- trajetória física: 17,38 ms para 2,42 ms em 100.000 pontos.

Esses números só descrevem as operações medidas. **Não demonstram que o export inteiro ficou nessa proporção mais rápido.**

## Verificações concluídas

- `npx vitest run --config vitest.editor-v6.config.ts tests/editor-v6/editorV6Timeline.test.ts`: 31 testes passaram.
- `npm run test:editor-v6`: 179 arquivos passaram, 1 ignorado; 800 testes passaram, 1 ignorado.
- `npm run typecheck`: passou.
- `npm run audit:architecture`: passou; 878 arquivos inspecionados, sem erros de sintaxe, imports ausentes ou violações de fronteira.
- `npm run build`: passou.
- `npm run test:editor-v6:export`: passou durante a sessão. O harness cobriu 81 quadros, 78 reutilizados, áudio na emenda, fallback, cancelamento/destino preservado, movimento na emenda turbo, Full HD e preloads sandbox. A fixture de boca percorreu 301 quadros e reportou pico de RSS do processo principal de 168.607.744 bytes. O próprio harness removeu seus arquivos temporários.

O harness Electron foi executado antes dos dois últimos ajustes pequenos (índice limitado a IDs rigged e memo da checagem de duplicados). Esses ajustes têm suíte completa, typecheck, auditoria e build aprovados; o harness ainda não foi repetido depois deles.

## O que continua complicado ou sem comprovação

- **Velocidade do export longo:** não houve comparação A/B do mesmo projeto de 12 minutos, mesma configuração e máquina. Os microbenchmarks não substituem essa comparação.
- **Crash `-36861`/Crashpad:** o harness sintético passou, mas isso não reproduz o projeto com 473 transições nem explica por que o handler do Crashpad se desconectou após uma exportação longa.
- **Memória total:** o número de RSS do harness é do processo principal; não inclui de forma completa os renderizadores, GPU e FFmpeg.
- **Captura e ciclo de pintura:** testes anteriores rejeitaram substituir `capturePage()` pelo bitmap antecipado do evento `paint` e remover uma das duas esperas de `requestAnimationFrame`: os tempos pareciam melhores, mas os quadros divergiam visualmente. Não remover essas proteções sem uma nova prova de paridade.
- **Harness de flip individual:** rodadas anteriores falharam ocasionalmente numa asserção de fixture estática sem transições, com erro de cerca de 2,2–2,3 px para limite fixo de 2 px. Não houve alteração de tolerância. A falha foi documentada e não foi reproduzida nesta rodada integrada sintética.
- **Teste manual da interface:** o app não foi aberto visualmente nesta continuação; o build e os testes aprovados não substituem a conferência visual dentro do Electron.

## O app está usável?

**Pelos gates atuais, sim para continuar editando e desenvolver:** o typecheck, a suíte completa e o build passaram, e o harness Electron sintético de exportação também passou. Não encontrei evidência de que estas alterações tenham quebrado o app.

**Limite dessa conclusão:** ainda não confirmei manualmente o layout no app aberto nem fiz um novo export real de 12 minutos/473 transições. Portanto, não dá para garantir por esta rodada que o caso longo está livre do encerramento `-36861` ou que o ganho de velocidade se aplique ao projeto real.

## Próximos passos ao retomar

1. Continuar pela branch `Dev-V2`, sem trocar para a branch Lab nem mexer na pasta principal/remoto sem pedido.
2. Usar este checkpoint e `PLANO_ACELERACAO_EXPORT.md` como ponto de partida; revisar o próximo custo com evidência antes de alterar.
3. Priorizar medições limpas e reproduzíveis do mesmo export longo quando a máquina estiver disponível. Se a máquina continuar em uso, limitar-se a fixtures sintéticas pequenas e não apresentar seus tempos como ganho real.
4. Preservar o ciclo de pintura, dimensões, qualidade visual, controle de cancelamento e destino anterior do MP4.
5. Para cada mudança: diff pequeno, testes próximos, suíte Editor V6, typecheck, auditoria, build, revisão do diff e commit local. Não fazer push sem solicitação.

## Arquivos locais preservados

Os seguintes itens já estavam fora do Git e não foram incluídos nos commits:

- `.codex-editor-v6-thumbnail-diagnostic.html`
- `codex-editor-v6-thumbnail-diagnostic.html`
- `public/`
- `src/renderer/public/codex-editor-v6-thumbnail-diagnostic.html`

Nenhum conteúdo de `app-data` ou mídia pessoal foi aberto, alterado ou incluído.
