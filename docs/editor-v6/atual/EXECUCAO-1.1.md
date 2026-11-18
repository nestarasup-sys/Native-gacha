# Execução 1.1 — 18/11/2026

## Estado recebido

- `975336ac` usa uma camada em trechos sem vídeo sobreposto.
- `1551cbf2` acrescenta resumo por tentativa, fases e diagnóstico de falhas por trecho.
- `45e009f0` reduz carregamento duplicado de imagens e mede prontidão do worker e espera descoberta no pipe.
- O usuário observou que exportações continuam próximas da duração do vídeo. Seu corte novo foi localizado e analisado em [Pesquisa 1.1](PESQUISA-1.1.md).

## Próxima execução autônoma

### Autorização e meta

O usuário autorizou exportar autonomamente o mesmo corte de **3 min 20 s** do projeto `editorV6-408a77d1-d964-4c04-a66b-f4e9fcfeee46`. Use o intervalo de timeline `[0, 6000)`, 1920×1080, 30 FPS, Turbo com dois workers, CPU `libopenh264`, boca com ciclo de 30 quadros e cabelo posterior com preset 2 e reação à pose. Consulte o JSON de referência para reproduzir as opções exatas.

A meta é **90 s no caminho padrão**, incluindo preparação anterior ao IPC, transições, renderização, validação e publicação. Frente aos 200,84 s registrados só no main, isso exige pelo menos **55% de redução** e ganho em mais de uma fase. A renderização sozinha levou 147,23 s. Como orçamento de investigação, mire em 25 s de preparação total, 60 s de renderização e 5 s de finalização. O critério de aceitação é o tempo total, com a qualidade e os 6.000 quadros verificados.

O projeto real é fonte de leitura. Use o harness isolado e uma cópia verificada do projeto e das dependências necessárias, com destino único em `out/`. O comando existente é `npm run bench:editor-v6:project -- ...`. Leia `scripts/editor-v6/benchmark-project-export.cjs` antes de executar. Confira as validações de origem, cópia, mídia e perfil. Se ele não admitir este corte, adapte o caminho de teste com autorização por ID exato e mantenha as verificações de isolamento e integridade. Preserve os dados e MP4s do usuário.

### Ordem de trabalho

1. Confira se o relatório e os scripts de teste continuam correspondendo ao código da branch.
2. Reaproveite o relatório existente para triagem. Crie ou amplie um analisador que compare relatórios e confira intervalo, perfil, encoder efetivo, revisão e fases antes de calcular ganhos. Use um cenário sintético curto para selecionar mudanças de captura, transições e prontidão com baixo custo.
3. Se captura não der um ganho consistente sem diferença visual, investigue as transições da preparação global. Use perfil de bake e fila por personagem. Se só houver dados somados, acrescente uma medição leve no relatório existente.
4. Se o problema se concentrar em prontidão, inspecione a montagem do renderer por fase. A leitura de 22,12 s depois da navegação cobre vários trechos. Verifique se a espera está em decodificação, montagem ou concorrência.
5. Use o corte real para medir conjuntamente fases, emendas, qualidade e limpeza. Ajude a localizar perdas adicionando métricas quando houver uma lacuna concreta. Rode novamente o corte completo para validar um candidato com potencial de ganho ou obter um controle equivalente quando ele faltar. Faça commit local após cada mudança concluída e continue pelas hipóteses verificáveis até atingir a meta ou documentar um bloqueio concreto.

## Restrições da entrega

- Use `Dev-V2` em `C:\TRABALHO 2\OUTROS\GACHA EM C++`. Preserve mudanças locais e dados do usuário.
- Compare exports com as mesmas opções. Uma diferença de encoder, FPS, animações ou escala invalida a atribuição de ganho.
- Nenhum reaproveitamento de resultados entre exports. No fluxo normal só permanecem MP4 e relatório. Em falha ou cancelamento, preserve o destino anterior e limpe os temporários do job.
- Preserve escala, recortes e altura nas transições, qualidade visual, áudio e emendas. O relatório aponta onde olhar, e as verificações visuais usam quadros decodificados ou fixtures.
- Use fixtures sintéticas para triagem e o corte real autorizado para comprovação. Prossiga sem depender de novos exports manuais do usuário.

## Registro desta passagem

- Localizado e interpretado o relatório de 6.000 quadros. O trabalho ativo foi consolidado nesta pasta.
- As otimizações citadas acima já pertencem aos commits indicados. Esta passagem é de documentação e preparação da próxima rodada.
- Próxima nota de execução deve registrar hipótese, fixture, controles, números, decisão, testes e commit em um único lugar.

## Rodada de comparação — alpha e captura

- Repeti o corte `[0, 6000)`, 1080p/30, dois workers, CPU `libopenh264`, áudio, boca e cabelo ativos, em perfil isolado. Backup e preset ficam em `out/editor-v6-stress`; o preset 2 disponível é o preset sintético autorizado do harness, não o estado exato da UI do usuário.
- Antes do export, validei que a leitura de alpha em fixture 960×1280 devolve os mesmos limites do algoritmo anterior. O scan novo levou 0,36 ms versus 1,76 ms por chamada no microbenchmark local. Essa diferença não apareceu no export inteiro: `cropDetectionMs` foi 39,83 s antes e 39,61 s depois, pois a medição inclui uma leitura Canvas custosa. Não atribuir o tempo total ao scan de bytes.
- A execução completa passou: 6.000 quadros H.264, 1920×1080, 30 FPS, 200 s, 6 clipes de áudio, 19 emendas, limpeza dos temporários. Tempo clique→MP4 validado 206,06 s; processo principal 191,95 s; renderização 141,25 s; preparação de movimento 45,76 s; cabelo 12,25 s; boca 24,49 s somados.
- O controle da rodada anterior, também captura 8 ms, foi 209,87 s. `captureStaleReadbacks` mudou de 429/2139 (20,1%) para 423/2133 (19,8%); captura descartada segue sem evidência de redução material. A medição de 3,81 s (1,8%) é pequena demais para confirmar melhoria.
- Não alterar o retry padrão: continua em 16 ms; 8 ms permanece apenas como modo de laboratório. Não anunciar a meta de 90 s como atingida.
- Ampliei o comparador para aceitar diretamente o relatório agregado do harness. Ele calcula clique→validado, identifica o projeto, compara os mesmos parâmetros e recusa conclusão quando faltam quadros, áudio, emendas ou limpeza. O relatório produzido antes desta ampliação não traz ID do projeto nem `cleanupErrors`; o comparador agora o rejeita como prova completa. Próximos relatórios de laboratório incluem esses campos.
- Nova tentativa recusada antes de rodar porque o harness não recebeu o ID autorizado no formato que espera; outra falhou na preparação por não injetar o preset; ambas pararam antes do primeiro quadro e não alteraram a fonte. A repetição final incluiu ID UUID, arquivo de preset e perfil UI.
- Próximo foco: a renderização consome 141 s de parede; captura, frame roundtrip e FFmpeg são custos sobrepostos. Investigar por trecho o ciclo de worker/FFmpeg e a contenção de CPU. A troca para AMF e quatro workers em corte curto já não mostrou caminho para uma redução de 2×. Não fazer novo corte completo sem candidato que ataque a etapa crítica.
