# Editor V6 — checkpoint de continuidade

Data: 14/11/2026 (BRT)

## Estado salvo

- Repositório: `C:\TRABALHO 2\OUTROS\GACHA EM C++`
- Branch ativa: `Dev-V2`; nenhum push foi feito.
- O código de produção está salvo nos commits anteriores. Esta rodada finalizou o relatório de captura no harness e registrou a continuação no plano de aceleração.
- `npm run typecheck`: passou.
- `npm run test:editor-v6:export`: build e harness Electron passaram.
- O harness produziu 81 quadros, reutilizou 78, validou fallback, cancelamento, emenda entre partes turbo, export 1080p, vídeo em camadas e stress sintético de boca de 301 quadros.
- Pico de RSS medido no processo principal da fixture de boca: 168.894.464 bytes. Não inclui renderer, GPU nem FFmpeg.

## O que foi melhorado

Nos commits anteriores desta linha de trabalho, o Editor V6 reduziu trabalho repetido por quadro em chaves visuais e fundo, prontidão de SVG, preparação/interpolação de cabelo, trajetória de cabeça e captura do compositor. A captura normal usa um `subarray` do bitmap e evita cópias por linha; a composição em camadas mantém uma única cópia contígua por camada. Token de sincronização, geometria, alpha, cancelamento, retry, backpressure do FFmpeg e resolução foram preservados.

Alguns microbenchmarks isolados documentados no `PLANO_ACELERACAO_EXPORT.md` mostraram reduções em operações específicas, como serialização de elementos estáticos e preparo de trajetória. Um microbenchmark de captura 1920×1080/120 quadros mediu 142,03 ms para o caminho antigo de cópias por linha, 0,10 ms para o caminho sem cópia e 78,86 ms para a cópia contígua por camada. Esses valores isolam código sintético; não representam o tempo total de exportação.

Nesta rodada, o harness passou a salvar no relatório os tempos de `frameRoundTrip`, `ipcDraw`, `capture`, `capturePage`, `captureBitmap`, captura de fundo/primeiro plano e escrita FFmpeg. As medições mais novas apontam `capturePage` como alvo de investigação: no teste 1080p, dois quadros únicos registraram 21,97 e 25,15 ms para captura da página, contra 3,90 e 3,73 ms para conversão do bitmap. No teste em camadas, a captura do primeiro plano chegou a 28,02 ms. A quantidade de amostras é pequena, então ainda não há conclusão de ganho total.

## O que falta e está complicado

- O export longo de aproximadamente 12 minutos e 473 transições, que terminou e depois encerrou o processo com `-36861`/mensagem do Crashpad, não foi reproduzido pelo harness sintético. A causa desse encerramento segue desconhecida.
- Ainda não existe comparação A/B limpa do projeto longo com a mesma resolução, encoder e cache. Microbenchmarks não permitem prever quanto o MP4 final vai demorar.
- O teste 1080p do harness tem apenas dois quadros únicos; as fixtures turbo reaproveitam muitos quadros. É preciso ampliar a amostra com cenas visuais únicas antes de otimizar a captura da página.
- O pico de RSS disponível mede apenas o processo principal; faltam métricas combinadas de renderer, GPU e FFmpeg.
- Não foi feita inspeção manual da interface ou reprodução visual de projeto real nesta retomada.
- Experimentos anteriores com evento de pintura como fonte direta tiveram divergências visuais. Não ativar esse caminho em produção sem comparar pixels e validar cancelamento/retry.

## O app está usável?

**Sim para continuar editando e para os fluxos de export cobertos pelos testes automatizados:** a build, o typecheck e o harness Electron passaram nesta rodada, sem mudança no fluxo de export em produção nesta rodada. As otimizações de produção anteriores também passaram as suítes e verificações listadas no checkpoint anterior.

Isso não certifica exportações longas nem resolve o encerramento `-36861`. A exportação de 12 minutos/473 transições ainda precisa de uma rodada controlada para confirmar duração, qualidade e estabilidade. O risco aberto é especificamente de export longo e de desempenho real; não há falha reproduzida nos cenários sintéticos desta rodada.

## Próximas ações ao retomar

1. Permanecer na `Dev-V2`; preservar os dados existentes e não fazer push sem pedido.
2. Melhorar a fixture de perfil para renderizar quadros visuais únicos em 320p e 1080p, incluindo camadas; repetir execuções e comparar p50/p95 e tempo de parede.
3. Usar o novo perfil para separar IPC/desenho, `capturePage`, composição e FFmpeg; escolher o estágio dominante com medições repetíveis.
4. Só testar outra fonte de captura após definir comparação pixel a pixel e cobrir sincronização, cancelamento e retries. Manter o caminho atual se não houver paridade comprovada.
5. Quando houver uma janela de teste sem uso concorrente do PC, investigar o `-36861` com logs e métricas dos processos e depois repetir o projeto longo sem alterar seus dados.
6. Após cada mudança: teste focado, typecheck e verificações de arquitetura/build pertinentes; revisar diff, atualizar este plano e fazer commit local pequeno.

## Arquivos locais preservados

Os seguintes itens não rastreados já existiam e foram deixados intactos, fora do commit:

- `.codex-editor-v6-thumbnail-diagnostic.html`
- `codex-editor-v6-thumbnail-diagnostic.html`
- `public/`
- `src/renderer/public/codex-editor-v6-thumbnail-diagnostic.html`

Nenhum conteúdo de `app-data` nem mídia pessoal foi usado ou modificado como fixture.

## Complemento desta continuação — 14/11/2026

Depois do checkpoint, aumentei a amostra de captura para 60 quadros visuais únicos em 320p e 1080p e executei uma comparação `capturePage`/`paint-event`. A cena é sintética e usa o mesmo documento/sequência em workers separados. Os 60 hashes BGRA coincidiram. Em 1080p, a mediana da captura de página foi 17,9 ms (p95 34,2 ms); conversão do bitmap, 3,3 ms (p95 6,9 ms). A exportação de 2 s levou 3,00 s com `capturePage` e 2,96 s com paint nesta única dupla. Paint teve `paintWaitMs` p50 17,3 ms/p95 89,4 ms. A variação pequena no tempo total e a cauda de espera não justificam trocar o caminho padrão; permanece `capturePage`.

O primeiro teste do caminho paint encontrou um timeout reproduzível: depois de uma imagem com token obsoleto, não havia nova invalidação por causa de uma condição baseada no contador de leituras. A captura paint agora repete a invalidação, limitada a uma chamada por intervalo de 16 ms, até o token correto ou cancelamento/timeout. Um teste de worker cobre token antigo seguido pelo atual. Essa alteração atua apenas no modo experimental paint.

Verificações executadas nesta continuação: worker (15/15), suíte Editor V6 (804 aprovados, 1 ignorado), typecheck, auditoria de arquitetura (878 arquivos) e harness Electron de exportação com perfil e comparação paint; tudo passou. Ainda falta comparar captura de página e paint no mesmo worker/mesmo estado com cabelo/face, verificar layered video e repetir A/B em múltiplas rodadas. O projeto real de 12 min/473 transições e o erro `-36861` seguem pendentes.

Na retomada, preservar a branch `Dev-V2`, `capturePage` como padrão e os quatro caminhos locais não rastreados listados acima. O próximo trabalho é localizar o estágio dominante no cenário atual e testar uma intervenção pequena com paridade, sem presumir que o resultado deste fixture sintético se aplica ao MP4 longo.

## Continuação salva — comparação no mesmo worker

### O que estava sendo feito

Foi fechado um experimento para verificar se a divergência observada anteriormente vinha de comparar workers em estados de pintura diferentes. O modo de teste `compare-paint` captura a página e o frame paint dentro do mesmo worker, usando o mesmo token antes de avançar o frame. Ele compara byte a byte os buffers BGRA. O modo é diagnóstico do harness e não muda o export normal.

### Resultado e estado atual

- Paridade BGRA no mesmo worker/token: **60 de 60 quadros** únicos em Full HD.
- Sem fallback, reutilização de quadro, renderizador residual ou erro no harness.
- `capturePage`: 2.882,92 ms nos 60 quadros; paint em worker independente: 2.861,76 ms. Diferença de ~0,7% em uma única dupla, insuficiente para declarar ganho.
- Espera paint p50/p95: 17,4/92 ms. A cauda continua alta.
- Captura pareada no mesmo worker: 3.275 ms porque faz as duas capturas; não usar como medição de velocidade.
- `capturePageMs` p50/p95: 17,2/33,7 ms. Conversão do bitmap: 3,3/6,6 ms.
- Escopo: fixture sintética simples; ainda não cobre cabelo/face em movimento, personagem real, layered video ou o projeto longo de 12 minutos.
- `capturePage` permanece o caminho padrão de produção.

### Verificações concluídas

- `npm run test:editor-v6:export`: passou, incluindo 60 quadros de paridade no mesmo worker e a fixture sintética de boca.
- `npm run test:editor-v6`: 179 arquivos passaram, 1 ignorado; 806 testes passaram, 1 ignorado.
- `npm run typecheck`: passou.
- `npm run audit:architecture`: passou; 878 arquivos TS/TSX, sem imports ausentes ou violações de fronteira.
- `git diff --check`: passou antes da atualização deste documento; repetir antes do commit.
- Branch `Dev-V2`, commit base `cba7dc1b`; pendente salvar esta rodada em commit local. Não fazer push.

### O que fazer em seguida

1. Revisar o diff desta comparação e salvar o código, testes e os dois documentos em um commit local pequeno.
2. Acrescentar ao harness uma comparação equivalente com vídeo em camadas, se possível usando o mesmo token e verificando as duas camadas separadamente.
3. Criar fixture sintética controlada com personagem/cabelo/face em movimento e verificar paridade de pixels, retries e cancelamento. Não usar mídia pessoal nem dados de `app-data`.
4. Repetir A/B independente em várias rodadas; manter `capturePage` se paint não mostrar ganho repetível sem regressão de cauda.
5. Depois dos perfis, escolher o próximo estágio dominante (IPC/desenho, captura, composição ou FFmpeg) com base nos relatórios.
6. Investigar o erro `-36861` e o projeto longo de 12 minutos/473 transições somente numa janela de export controlado; os harnesses sintéticos não reproduzem essa falha.

### Arquivos e dados preservados

Além das quatro entradas não rastreadas já listadas acima, esta rodada não abriu nem modificou `app-data`, mídia do usuário, projetos ou perfis locais. O commit deve incluir somente os quatro arquivos de código/teste da comparação e este checkpoint mais o plano de aceleração.
