# Desempenho da atualização de personagens — Editor V6

## Diagnóstico

Ao abrir um projeto, `useEditorV6CharacterSnapshotRefresh` marcava o projeto como recém-aberto e passava `forceRefresh=true` ao planejador. Esse sinal ignorava as revisões salvas e agendava novamente a renderização de todos os retratos, embora fontes e versão de renderizador ainda fossem atuais. A alteração de geometria facial em 27/11 elevou o custo de cada lote e tornou essa atualização incondicional visivelmente mais lenta.

O projeto V4 já preservado em `out/editor-v6-stress/backups/current-project-3f1acc2c-investigation/` foi usado como fixture somente de leitura. Seu manifesto possui 261 snapshots de personagem, 374 blocos, 12 faixas e cinco personagens distintos. Os 261 snapshots estão na versão de quadro-fonte 11, têm timestamp de fonte e variantes faciais; nenhum precisa da normalização de recortes antigos.

## Correção

O planejador agora agenda apenas snapshots realmente desatualizados: revisão da pose/modelo, roupas, cabelo, componentes faciais ou versão/timestamp da renderização. A barreira de abertura continua segurando Exportar até terminar uma atualização necessária ou até confirmar que não há trabalho. Projetos legados continuam sendo atualizados; snapshots atuais não são renderizados de novo apenas porque o projeto foi aberto.

## Benchmark isolado

No mesmo manifesto do projeto V4, comparei o planejamento atual com o trabalho equivalente à política anterior, que forçava todos os snapshots a parecerem antigos. As condições de fonte foram sintetizadas a partir das revisões persistidas no próprio manifesto; nenhum projeto original foi modificado.

| Medida | Atual seletivo | Abertura forçada anterior |
| --- | ---: | ---: |
| Snapshots enviados para renderização | 0/261 | 261/261 |
| Grupos de renderização | 0 | 97 |
| Mediana do planejamento, 20 repetições | 0,40 ms | 5,88 ms |

Isso elimina 97 lotes de renderização no cenário atual desse projeto. A mediana do planejador caiu aproximadamente 93%; o tempo total de renderização não foi medido porque este benchmark isola o agendador e não acessa o Customizador local. Se uma fonte ou revisão estiver realmente antiga, o Editor ainda executará os lotes necessários antes de liberar Exportar.

## Verificação

- Testes do planejador: snapshots atuais não criam trabalho; snapshots com versão antiga continuam criando atualização.
- Testes focados de refresh e normalização legada aprovados.
- Suíte completa do Editor V6, typecheck e auditoria de arquitetura executados após a implementação.
