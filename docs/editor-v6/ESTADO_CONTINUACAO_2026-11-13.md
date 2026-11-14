# Editor V6 — estado da continuação

Data do checkpoint: 13/11/2026, BRT

- **Repositório:** `C:\TRABALHO 2\OUTROS\GACHA EM C++`
- **Branch:** `Dev-V2`
- **Base desta etapa:** `93ffcd04 docs: checkpoint Editor V6 continuation`.
- **Commit de código desta etapa:** `c4b98add perf: avoid per-row copies in Editor V6 capture`.
- **Branch após o commit:** `Dev-V2`, 70 commits à frente de `origin/Dev-V2`. Sem push.
- **Continuação mais recente:** eliminar as cópias de pixels por linha na captura do compositor, mantendo a cerca de token por quadro.

## O que estava sendo feito

Continuação da refatoração e da otimização do Editor V6, priorizando o custo por quadro sem mudar resolução, qualidade, ciclos de pintura, regras de cancelamento ou formato dos projetos. Foram preservados os dados locais e usados apenas testes sintéticos; o projeto pessoal de 12 minutos e `app-data` não foram abertos nem usados como fixture.

Nesta última alteração, o caminho que gera as chaves de reaproveitamento de quadro repetia `JSON.stringify` dos mesmos elementos visuais estáticos em todos os frames. Agora `editorV6VisualKeys` e `editorV6CompleteVisualKeys` recebem uma cache opcional por referência. O renderizador cria uma `WeakMap` por exportação e reutiliza a serialização de snapshots imutáveis que reaparecem. Elementos novos de movimento ou boca mantêm suas chaves próprias. As chamadas sem cache continuam com o contrato anterior.

O benchmark sintético comparou a criação dessas chaves em 1.800 quadros por rodada, 80 elementos estáveis e cinco rodadas: mediana de **55,35 ms sem cache** contra **7,31 ms com cache** (86,8% menos nesta operação isolada). Isso não mede nem prevê a duração do MP4 completo.

Na continuação seguinte, também eliminei a criação de um novo objeto para o fundo padrão a cada quadro. O resolver agora conserva o snapshot padrão por referência de documento e verifica seus campos para perceber alterações até se o mesmo objeto for modificado. A serialização de fundos persistentes também é reutilizada pela cache fraca do renderizador. O benchmark atualizado (mesma fixture, cinco rodadas) marcou medianas de **54,33 ms sem cache** e **6,66 ms com cache**; continua medindo só a construção de chaves.

Na última etapa, o readiness SVG não cria mais uma Promise resolvida por imagem nem suspende o renderizador quando `onLoad` já confirmou todas as fontes atuais. O worker percorre o `NodeList` diretamente e aguarda somente imagens ainda pendentes. Um microbenchmark com dez imagens prontas em cada um dos 5.700 quadros ficou em mediana **12,51 ms no caminho com Promises** contra **3,01 ms sem Promises pendentes**. É o custo isolado do readiness; não estima o tempo do MP4.

Nesta etapa, movi o marcador de pintura de uma faixa de 24 px à direita para uma faixa de 24 px abaixo da cena. O worker passa a capturar exatamente `largura × (altura + 24)`, valida o token na faixa inferior e envia ao FFmpeg somente os primeiros `largura × altura` pixels BGRA. No caminho sem vídeo em camadas, isso é uma view do buffer de `toBitmap()` sem cópia; em camadas, cada imagem validada é copiada em uma operação contínua para o buffer reutilizável, em vez de copiar linha por linha. A fila serial do FFmpeg, o token de mesmo quadro, os limites de dimensões, alpha e os retries permanecem ativos.

O microbenchmark sintético em 1920×1080 e 120 capturas mediu mediana **142,03 ms** no caminho anterior (cópia por linha), **0,10 ms** no novo caminho sem camadas (view sem cópia) e **78,86 ms** com uma cópia contínua para o fluxo em camadas. O fixture reutilizou o mesmo buffer e não mediu o custo real de `capturePage()`, da alocação de `toBitmap()` ou do MP4 completo; os números servem apenas para comparar o trabalho de recorte/cópia.

## O que melhorou nesta linha de trabalho

As otimizações de cabelo e exportação documentadas em `PLANO_ACELERACAO_EXPORT.md` e `REESTRUTURACAO.md` reduzem trabalho repetido por quadro: preparo da física do cabelo, correspondência e interpolação das mechas, trajetória da cabeça, mapas de personagens, cópias da cena, consultas a assets, leituras faciais e geração das chaves visuais. A resolução dos frames, a composição e as regras visuais foram preservadas.

Benchmarks anteriores também mostraram ganhos isolados nas operações medidas: preparação de cabelo (mediana 47,16 ms → 18,63 ms em 50.000 chamadas), pares de mechas (44,79 ms → 25,72 ms em 20.000 interpolações) e trajetória (17,38 ms → 2,42 ms em 100.000 pontos). Nenhum desses números equivale à velocidade do vídeo final.

## Verificações concluídas nesta retomada

- Testes focados de prontidão SVG e renderizador: **8 testes aprovados**.
- `npm run test:editor-v6`: **179 arquivos aprovados, 1 ignorado; 803 testes aprovados, 1 ignorado**. O perfil sintético incluído também passou (23 verificações).
- `npm run typecheck`: passou.
- `npm run audit:architecture`: passou; 878 arquivos TS/TSX, sem erros de sintaxe, imports ausentes ou violações de fronteira.
- `npm run test:editor-v6:export`: build e harness Electron integrado passaram após a troca de geometria; cobriu 81 quadros (78 reutilizados), áudio contínuo na emenda, fallback, cancelamento preservando o destino anterior, movimento na emenda turbo, Full HD e preloads sandbox. A fixture sintética de boca percorreu 301 quadros; o pico de RSS reportado do processo principal foi **169.488.384 bytes**. O harness removeu os próprios temporários.
- `npm run test:editor-v6:export-overlay`: build e teste de paridade com MP4 real passaram em 60 quadros, duas partes Turbo, três entradas de mídia e emenda nos quadros 29/30; cobre o caminho em camadas.
- Testes focados de bitmap, workers e superfície: **23 aprovados**, incluindo token inferior, view zero-copy, buffer combinado, dimensões, alpha, imagem stale e cancelamento.
- Microbenchmarks das chaves visuais: a rodada anterior teve mediana 55,35 ms sem cache e 7,31 ms com cache; a rodada após incluir os fundos, 54,33 ms e 6,66 ms. Ambos são isolados da exportação MP4.
- `git diff --check`: passou antes do commit local de código `c4b98add`.

## O que permanece sem comprovação

- **Exportação longa real:** `PLANO_ACELERACAO_EXPORT.md` contém comparações históricas do projeto de 5.700 quadros/190 s, inclusive cache aquecido, workers e preparo de boca. Não houve nesta continuação um A/B da nova série de commits nesses dados, nem foi reproduzido especificamente o projeto de 12 minutos/473 transições. Os microbenchmarks desta retomada isolam operações JavaScript.
- **Crash `-36861` / Crashpad:** o harness sintético passou, mas não reproduz o encerramento do projeto longo e não explica a desconexão do Crashpad.
- **Memória do sistema inteiro:** o RSS registrado é apenas do processo principal; não representa memória combinada de renderer, GPU e FFmpeg.
- **Layout manual:** esta retomada não abriu o app para conferir visualmente a interface. Build e testes não substituem essa checagem.
- **Captura e pintura:** medições anteriores rejeitaram remover esperas de pintura ou trocar `capturePage()` por bitmap antecipado porque os quadros divergiam visualmente. Preservar essas proteções até uma nova prova de paridade.
- **Harness de flip individual:** há registro histórico de falha ocasional de fixture estática em torno de 2,2–2,3 px para limite de 2 px. A tolerância não foi relaxada; o harness integrado de exportação passou nesta retomada, mas não substitui uma fixture específica de cabelo.

## Estado de uso

**O app permanece utilizável para continuar editando e desenvolvendo** segundo os gates automatizados desta retomada: suíte, typecheck, auditoria, build e harnesses Electron de exportação e sobreposição passaram depois da alteração. Não há evidência de regressão na captura ou composição.

Isso não garante o cenário do projeto longo, a duração total do export, a ausência do `-36861` nem a experiência visual manual, pois esses pontos não foram reproduzidos nesta rodada.

## Próximos passos ao retomar

1. Permanecer na `Dev-V2`; não trocar para a branch Lab nem sincronizar com GitHub sem pedido.
2. **Ponto exato da pausa:** o código sem cópia por linha foi commitado em `c4b98add`; os testes funcionais e a paridade de vídeo passaram. A leitura de `exportPartRenderer.ts`, `exportAttemptRenderer.ts`, `exportFrameCapture.ts`, `exportFramePipeline.ts` e dos workers já foi feita nesta etapa.
3. **Próxima investigação:** obter `captureBitmapMs` e tempo de parede em comparações equivalentes para descobrir quanto do microbenchmark aparece no export completo; em paralelo, continuar pelo maior estágio de caminho crítico entre IPC/desenho, espera de pintura e escrita FFmpeg. Os tempos históricos dessas fases são acumulados e se sobrepõem, portanto não somá-los como parede.
4. Manter a sincronização de pintura, token do mesmo quadro, fila de escrita limitada, cancelamento e validação das emendas. As tentativas antigas de usar evento paint como fonte direta e remover a espera de pintura tiveram divergência visual.
5. Comparar o mesmo projeto longo, resolução e encoder sob cache comparável quando essa medição puder ocorrer sem interferência. Não modificar os dados do projeto nem `app-data`; ainda falta A/B específico para 12 min/473 transições.
6. Investigar o `-36861` por logs e perfis de processo: os harnesses aprovados não reproduzem o encerramento longo e não identificam por que o handler do Crashpad se desconectou.
7. Repetir o teste específico de transições/flip e fazer inspeção visual no app quando a sessão permitir.
8. Para cada alteração: teste focado, suíte V6, typecheck, auditoria, build e revisão do diff conforme o escopo; atualizar este checkpoint e criar commit local. Não fazer push sem solicitação.

## Registro da pausa solicitada

- O checkpoint anterior foi salvo em `93ffcd04`; a melhoria da captura foi salva em `c4b98add`.
- O plano e este relatório registram o estado posterior à implementação, as verificações e a investigação seguinte. O objetivo contínuo de melhorar confiabilidade e desempenho do Editor V6 permanece ativo.
- A branch permanece `Dev-V2`; os commits desta etapa são locais e nenhum push foi feito.
- Os quatro caminhos não rastreados listados abaixo já existiam e foram preservados; eles não fazem parte deste checkpoint nem devem ser removidos como limpeza.

## Arquivos locais preservados

Continuam fora do Git, sem alteração ou inclusão nos commits desta tarefa:

- `.codex-editor-v6-thumbnail-diagnostic.html`
- `codex-editor-v6-thumbnail-diagnostic.html`
- `public/`
- `src/renderer/public/codex-editor-v6-thumbnail-diagnostic.html`

Nenhum conteúdo de `app-data` ou mídia pessoal foi aberto, alterado ou incluído.
