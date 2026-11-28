# ADR-001 — Modularizar antes de substituir a plataforma

**Data:** 2026-10-22  
**Situação:** decisão inicial, reversível. 

## Contexto

O aplicativo funciona, mas o processo Electron principal concentra handlers e regras de aplicação, e a interface apresenta dependências entre funcionalidades. O Video Studio não é prioridade neste ciclo.

## Decisão

Manter Electron, React e TypeScript nesta etapa. Introduzir **módulos por domínio**, avançando de fora para dentro, com estas responsabilidades:

1. `ipc.ts`: adaptação de transporte e autenticação; sem SQL ou regras de produto.
2. `service.ts`: casos de uso e ordem das operações, dependências explícitas injetadas.
3. `repository.ts`: queries e transações; não conhece Electron ou renderer.
4. `validation.ts`: invariantes de entrada, preferencialmente puros e testados.
5. `src/shared`: formatos persistidos, DTOs e tipos consumidos entre processos.

Não mover os formatos persistidos de uma só vez. Não alterar caminhos, nomes dos canais IPC, esquema SQLite, fila de gravação nem formatos do usuário sem testes de compatibilidade prévios. Permitir que regras puras migrem para `core/` posteriormente, quando as fronteiras ficarem claras, em vez de introduzir abstrações genéricas prematuras.

## Razões

- O backend local já existe no processo principal Electron; um servidor HTTP separado não é requisito para organização.
- O risco principal é a regressão nas integrações e formatos; troca de framework não elimina esse risco.
- O uso de injeção de dependências por interfaces pequenas permite testar regras com SQLite sintético sem carregar o Electron.
- Mudanças pequenas e reversíveis são mais seguras do que mover centenas de arquivos simultaneamente.

## Compromissos explícitos

- **Video Studio:** sem refatoração de engine/exportação nesta etapa.
- **Armazenamento:** preservar bancos e dados; sem migrações automáticas.
- **React:** manter telas e interfaces de `window.desktop` existentes.
- **Segurança:** toda entrada IPC continua verificando a origem do sender no primeiro passo.
- **Fila:** Base de Vídeos mantém sincronização com a fila `roteirosSaveQueue`.

## Consequências e próximos passos

Avançar por domínio, sempre com testes e possibilidade de voltar ao módulo anterior. Depois de Base de Vídeos e validação dos Roteiros, os próximos candidatos são rotas de exportação de Roteiros, persistência do Customizador, bibliotecas de assets do Fabricador e Studio. Trocar Electron só deve ser reconsiderado diante de necessidades e medições concretas.

## Compatibilidade: tronco masculino do Fabricador

O projeto de modelo pode conter `maleTorso`, uma cópia editável e independente do tronco feminino. O manifesto mantém somente os metadados dessa peça; a imagem é armazenada em `parts/male-torso.png`, e o histórico mantém sua imagem como asset referenciado por hash. Projetos antigos sem `maleTorso` continuam válidos. Customizador e renderizadores aplicam a cópia somente a personagens masculinos, sem alterar a montagem feminina de origem.

## Fichas narrativas dos personagens

Roteiros mantém fichas narrativas locais vinculadas pelo ID atual do personagem do Customizador. A tela React obtém a lista pelo contrato `RoteirosDesktopApi`; o preload encaminha listagem e gravação a handlers IPC que validam a origem do renderer. O serviço valida campos e limites e grava pela fila de escrita na tabela `roteiro_character_sheets` do catálogo local. A tabela já existe no schema 17 e não recebe dados durante a abertura da tela. Fichas ausentes são apresentadas vazias e só passam a persistir quando o usuário edita. A exportação TXT da Base de Vídeos consulta a ficha pelo mesmo ID e usa um objeto vazio quando não existe registro. Nenhum conteúdo do aplicativo legado é importado.

O botão Exportar roteiro cria o TXT para o importador do Editor V6 a partir do documento e dos contratos de leitura do Customizador, Fabricador, Base de Vídeos e fichas. A seleção de até cinco poses continua pertencendo ao Fabricador por modelo; o TXT apresenta categorias e quantidade de variações, sem copiar poses ou mídias. O renderer monta o texto e o envia pelo preload a um IPC de Roteiros que valida origem e tamanho, acompanha a gravação durante o encerramento e só grava após o diálogo de destino escolhido pelo usuário. As demais exportações de assets mantêm seu fluxo anterior.

No JSON portátil V1, `poseCategory` no elenco e nos beats identifica a categoria; o importador resolve a seleção atual do Fabricador e materializa os slots concretos como snapshots da timeline. As trocas automáticas respeitam a categoria ativa. `Parado` e `Em pé` são equivalentes nessa resolução. Uma categoria sem variações selecionadas é rejeitada. Projetos e JSONs antigos continuam usando seus slots, e a exportação de uma timeline continua registrando os slots concretos para permitir reprodução fiel. Não se combinam referências por categoria e por slot no mesmo personagem.

No Editor V6, editar posição, escala, largura, altura, rotação, espelhamento ou camada de um personagem aplica o controle alterado a seus estados na timeline e ao elemento-base. Os recortes, poses e expressões continuam próprios de cada estado; abrir um projeto antigo não reescreve seus dados. A edição respeita o bloqueio da faixa e invalida animações preparadas que deixem de corresponder aos estados.

O contrato portátil `NYMI_EDITOR_V6_REACT_V1` aceita `englishText` opcional em cada fala ou pensamento: `text` conserva o português e `englishText` o inglês fornecido. O compilador cria o mesmo elemento bilíngue usado pela edição manual; a exportação de roteiro V6 e a conversão para Roteiros preservam ambos. Arquivos antigos sem o campo mantêm um único balão. Não há tradução automática nem migração dos projetos existentes.

Importações de roteiro em JSON são marcadas em `roteiro_import_origins` (schema 18), uma tabela com chave estrangeira para `roteiros` e remoção em cascata dos metadados quando um documento é apagado. O JSON só pode referenciar mídias da biblioteca local; a confirmação cria personagens novos pelo Customizador e salva o roteiro nativo. Duplicar um roteiro remove a marca de importação para que a cópia não apareça na biblioteca de importados.
