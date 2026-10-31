# Documentação — Native Gacha

Este índice separa **referências vigentes**, documentação operacional, pesquisa em andamento e registros históricos. O código e os testes da branch analisada prevalecem sobre descrições antigas.

## Comece aqui

| Assunto | Documento | Papel |
| --- | --- | --- |
| Produto, instalação e comandos | [README principal](../README.md) | Entrada do repositório |
| Arquitetura e contratos | [Índice de arquitetura](architecture/README.md) | Diretrizes e contratos atuais |
| Dados portáteis, backup e restauração | [Dados portáteis](APP_DATA_PORTABLE.md) | Operação e segurança |
| Plataforma e migração de dados | [Dados escaláveis](APP_DATA_ESCALAVEL.md) | Layout, migração e limites |
| Editor V6 | [Índice do editor](editor-v6/README.md) | Contratos e material de performance |
| Exportação de código para estudo em C++ | [Handoff C++](handoff-cpp/LEIA-PRIMEIRO.md) | Proposta; não é a implementação atual |
| Proveniência do código importado | [Importação original](IMPORTAR_ZIP.md) | Registro histórico de origem |
| Registros de ciclos anteriores | [Arquivo histórico](archive/README.md) | Evidências; não instruções atuais |
| Contexto para agentes | [Registro técnico](../.ai/README.md) | Estado e backlog de engenharia |

## Pesquisa em curso

A [investigação extensa iniciada em 27/10](architecture/INVESTIGACAO_REFATORACAO_APP_2026-10-27.md) acumula observações de várias rodadas. **Não é uma especificação única nem garantia do estado atual**: hipóteses e resultados antigos devem ser conferidos no código e no commit pertinente antes de agir.

## Regras de manutenção

1. Novas decisões de arquitetura: `docs/architecture/`, com estado, contexto, alternativas e impactos.
2. Guias de domínio: pasta do domínio em `docs/`; atualize a referência existente antes de criar outra.
3. Ciclos concluídos, relatórios datados e incidentes encerrados: `docs/archive/`, com link de volta no índice.
4. Registros de trabalho de agentes: `.ai/`, curtos e verificáveis; nunca armazenar dados reais, credenciais ou cadeia privada de raciocínio.
5. Ao renomear/mover documentação, atualizar links Markdown relativos e conferir caminhos. Não interpretar nomes de branches, comandos ou números de testes de relatórios antigos como estado atual.
