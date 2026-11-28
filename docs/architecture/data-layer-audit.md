# Auditoria da camada de dados

## Mapa de propriedade

- `electron/dataPlatform.cjs`: catálogo SQLite, metadados dos assets, objetos por hash, arquivos e referências por domínio. Liga foreign keys ao abrir o banco (`dataPlatform.cjs:59–90`), cria/migra schema em transações (`:137–193`) e usa transações para gravação/exclusão (`:277–318`, `:433–504`).
- `electron/dataMigration.cjs`: inventaria arquivos legados, copia para staging, registra manifestos e hashes, e finaliza migração dentro de transação (`dataMigration.cjs:73–119`, `:156–232`).
- `electron/dataBackups.cjs`: backup completo para staging, manifesto com tamanho/SHA-256, revalidação, `integrity_check` SQLite e restauração em área temporária antes de promover (`dataBackups.cjs:83–127`, `:149–212`, `:221–290`).
- IPC de backup e migração permanece nos domínios `electron/domains/storage/*Ipc.ts`.

## Proteções verificadas

- Caminhos são normalizados/limitados ao root e diretórios reais são verificados contra symlink antes da operação.
- O catálogo mantém `asset_objects`, `domain_files` e `domain_image_refs`; a coleta de objeto consulta todas as referências antes de remover bytes compartilhados (`dataPlatform.cjs:456–471`, `:534–546`).
- Migração e backup conferem hashes antes de finalizar. Não encontrei uma ação de exclusão de assets que autorize ignorar referências compartilhadas.
- As operações SQL críticas usam transações síncronas do better-sqlite3 ou staging com manifesto; não alterar ordem/schema sem estratégia de rollback.

## Riscos e custo de `.cjs`

- A lógica tem validações em runtime, mas o contrato com TypeScript não é verificado pelo compilador; consumidores dependem de nomes e formatos implícitos.
- A troca direta para TypeScript pode mudar resolução de módulos, caminho do banco, recuperação de staging ou comportamento de rollback.
- Funções de migração/backup são assíncronas e tocam filesystem e SQLite; testar crash em cada limite é necessário antes de mexer.

## Caminho recomendado

1. Manter schema e tabelas atuais. Criar tipos TypeScript compartilhados só para os DTOs de entrada/saída e validar nas fronteiras CJS.
2. Adicionar testes de contrato para migration manifest, referências cruzadas, restore staged, `integrity_check` e recuperação após falha. Usar cópia sintética do catálogo.
3. Tipar cada método em um adapter estreito e migrar um domínio por vez, sem mover quem é dono dos assets.
4. Só avaliar migração integral de `.cjs` depois que os contratos exercitarem compatibilidade e recovery.

Esta investigação é somente leitura. Não houve alteração de schema, migração, backup ou exclusão.
