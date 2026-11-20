# Melhorias de desempenho do Editor V6

Registro das 50 melhorias adicionais solicitadas. Cada item conta uma mudança distinta. A medição de uma função isolada não representa a latência do editor inteiro.

| Nº | Mudança | Evidência |
| --- | --- | --- |
| 1 | Preparar áudio só nos clipes ativos ou prestes a começar, em vez de abrir todos na entrada do projeto. | Inspeção do ciclo de vida e typecheck. Reprodução no Electron pendente. |
| 2 | Buscar candidatos de áudio por intervalo indexado, evitando pausar todos os outros clipes a cada quadro. | Inspeção da busca e typecheck. Sincronismo no Electron pendente. |
| 3 | Selecionar blocos visíveis com busca binária que preserva sobreposições e bordas. | Mil consultas em 20 mil blocos deram os mesmos resultados que o filtro antigo. Mediana de cinco repetições com índice quente: 166,32 ms → 0,33 ms. |
| 4 | Reusar a lista de blocos visíveis em renderizações da faixa que mantêm o mesmo intervalo. | Testes do modelo de faixas e timeline. |
| 5 | Ignorar medições idênticas do viewport para evitar atualizações sem mudança de posição ou largura. | Testes do viewport e typecheck. |

Ainda falta medir numa sessão real a abertura, a inserção de vídeo, a troca de expressão e o sincronismo do áudio. O MP4 não foi cronometrado nesta rodada.
