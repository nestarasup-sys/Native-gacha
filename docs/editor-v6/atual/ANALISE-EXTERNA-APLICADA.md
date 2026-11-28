# Aplicação da análise externa do Editor V6

**Data:** 21/11/2026 · **Branch:** `Dev-V2` · **Fonte:** `ANALISE_EDITOR_V6.md`

Este registro separa mudanças confirmadas por código/testes de propostas que a própria análise condiciona a medições. Não promove hipótese de desempenho a comportamento padrão sem evidência.

## Aplicado

- Os quatro testes de caminhos IPC usam caminhos absolutos temporários do sistema operacional, portáveis entre Windows e Linux.
- O teste de medição do Plano B usa projeto sintético em memória; não depende mais de um projeto do perfil local.
- A suíte `test:refactor` foi extraída para `tests/groups.json` e é executada sequencialmente por `scripts/testing/run-group.mjs`, interrompendo na primeira falha.
- Os contratos esperados por quatro testes de arquitetura foram atualizados para refletir os módulos e nomes atuais, sem relaxar as asserções.
- FPS fixo da timeline, taxa de áudio e amostras por quadro agora têm um contrato compartilhado em `src/shared/editorV6Timing.ts`; os consumidores V6 usam essas constantes.
- Busca binária de limite inferior/superior foi consolidada em `src/shared/editorV6SortedSearch.ts` com testes próprios.
- As amostras de qualidade de export foram movidas da composição para `electron/domains/editorV6/exportQualitySamples.ts`.
- Quatro cópias do diagnóstico de miniaturas foram consolidadas em uma página reutilizável em `scripts/diagnostics/`.
- O ZIP de diagnóstico da raiz foi copiado para Downloads e o SHA-256 da cópia foi conferido antes de removê-lo do repositório. A raiz passou a ignorar esse nome de artefato.
- CI agora usa a versão Node indicada por `.nvmrc` (`22.22.0`).

## Verificações

- `npm run test:refactor`: concluído com sucesso; 50 comandos do grupo executados.
- `npm exec -- vitest run --config vitest.editor-v6.config.ts`: 186 arquivos passaram, 1 ignorado; 890 testes passaram, 1 ignorado.
- `npm run typecheck`: passou.
- `npm run audit:architecture`: passou; 891 arquivos TS/TSX, sem violações de sintaxe, import ou fronteira.
- `npm run build`: passou.
- `git diff --check`: sem erros de whitespace após limpeza do fim de arquivo.

## Decisões ainda condicionadas a evidência

- **Quadros repetidos no FFmpeg:** o pipeline escreve cada quadro no pipe mesmo quando reutiliza o bitmap. Rawvideo não carrega PTS, então pular escritas sem trocar o protocolo altera duração/sincronismo. O relatório anterior mostra escrita não coberta agregada por workers, que não é tempo de parede. Fazer primeiro o protótipo NUT/PTS ou corridas e comparar pixels, emendas e áudio; só integrar se o corte de referência demonstrar ganho repetível.
- **WebCodecs:** ainda não há caminho implementado. O spike precisa cobrir H.264 no hardware real, cor BT.709, áudio, emendas e composição de vídeo. Começar sem camada de vídeo e abandonar se não preservar qualidade ou não superar o critério de 30% definido na análise.
- **Página, store e caches WeakMap:** a análise identifica riscos possíveis, mas não mediu play/drag nem contagem de reconstrução. A página tem IDs de sessão e projeto carregado com funções distintas; não unificar estado nem reestruturar hooks sem perfil e rastreamento desses contratos.
- **Medições de export:** decisões futuras devem usar pelo menos três repetições por lado, mediana/mínimo e limiar definido antes do teste (5% para promoção), em cópia verificada e conforme o protocolo de [Execução 1.1](EXECUCAO-1.1.md).
- **Formatter:** nenhum formatter foi adicionado. A sugestão de ferramenta precisa de escolha de padrão e deve ser aplicada somente a arquivos tocados, sem reformatar o repositório inteiro.
- **Editor V7 e outras áreas:** a análise não leu essas implementações em profundidade. A decisão de compartilhar cena com V6 e a auditoria de `electron/main.ts`, Fabricador, SQLite e IPC são trabalhos de investigação separados, não mudanças seguras derivadas deste relatório.

O código de produção alterado nesta rodada se limita a constantes compartilhadas e busca binária comum do V6. Nenhum caminho de export ou estado de projeto foi trocado sem benchmark ou prova do contrato.
