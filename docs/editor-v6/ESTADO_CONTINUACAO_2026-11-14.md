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
