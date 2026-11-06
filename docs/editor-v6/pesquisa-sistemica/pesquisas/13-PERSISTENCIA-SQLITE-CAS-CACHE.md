# Pesquisa 13 — SQLite, WAL, CAS SHA-256, JSON, filas e integridade de dados

**Estado:** PESQUISADA EM CÓDIGO E DOCUMENTAÇÃO PRIMÁRIA · RUNTIME/TESTES NÃO EXECUTADOS.
**Data:** 06/11/2026. **Base estática:** Dev-V2 (commit `5166de7`, antes dos documentos deste Grupo A). Revalidar HEAD e working tree local antes de implementar.

## Questão e critério de saída

Como o Native Gacha mantém referências e durabilidade entre os módulos, e onde um futuro cache de imagens/render pode ser introduzido sem tocar em conteúdo canônico do usuário?

## Evidências verificadas no código do aplicativo

1. **[CÓDIGO]** `electron/domains/storage/catalogSchema.cjs:4` fixa `CATALOG_SCHEMA_VERSION=18`; `:14–15` configura SQLite em `journal_mode=WAL` e `synchronous=FULL`, e declara objetos, domínios, assets, referências, Roteiros e Base de Vídeos.

2. **[CÓDIGO]** `electron/dataPlatform.cjs:70–85` cria subpastas para banco, objetos, migrações, backups e cache; `:80` abre `database/catalog.sqlite` e recusa downgrade de schema.

3. **[CÓDIGO]** `electron/dataPlatform.cjs:156–180` registra domínios e migra schema com transação; `:205–320` vincula assets/objetos por SHA-256, versiona relações e mantém rastros de migração.

4. **[CÓDIGO]** `electron/domainFileSystem.cjs:19–45` define domínios lógicos e marca referências de imagens externalizadas por `@gacha-image:<hash>`; `:132–181` permite leitura de JSON e externalização para CAS, não simplesmente arquivo físico em cada caminho.

5. **[CÓDIGO]** `electron/domains/storage/contentAddressedStore.cjs:18–57` grava objetos por SHA-256 com temporários e rename, verificando reuso; `:59–98` oferece cópia/ingestão de arquivo por streams.

6. **[CÓDIGO]** `electron/domains/storage/keyedOperationQueue.ts:4–28` serializa ações por entidade e conserva falhas conforme opção; `pendingPersistenceIpc.ts:18–21` força flush de writes do renderer antes do Main.

7. **[CÓDIGO]** `electron/domains/editorV6/documentPersistence.ts:69–149` lê e normaliza `editorV6.json`/mídia/atlas e `:149–223` publica projeto via transação de assets; outros módulos não usam necessariamente SQLite como fonte exclusiva.

8. **[CÓDIGO]** `electron/domains/customizer/repository.ts:51–112` lê e grava biblioteca JSON com backup/temporário; `electron/domains/studio/documentPersistence.ts` mantém `studio.json`+assets.

9. **[CÓDIGO]** `electron/domains/mediaLibrary/videoLibraryStore.ts:73–96` administra catálogo JSON da biblioteca de vídeo, hash e operação pendente; Roteiros/Base de Vídeos usam repositórios SQLite.

## Pesquisa nas fontes oficiais

1. **[FONTE OFICIAL] [SQLite WAL](https://www.sqlite.org/wal.html)** — Permite leitores com um escritor; checkpoint pode ser bloqueado por leitores antigos, WAL pode crescer sem limite; não usar WAL em network filesystem.

2. **[FONTE OFICIAL] [SQLite Atomic Commit](https://www.sqlite.org/atomiccommit.html)** — Atomicidade depende do sistema de arquivos, transações, journal/fsync e configuração; não remover sync por suposto ganho de export.

3. **[FONTE OFICIAL] [Node fs](https://nodejs.org/api/fs.html)** — rename e escrita de arquivos não substituem por si sós protocolo transacional entre manifestos, assets e banco.

4. **[FONTE OFICIAL] [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)** — Acesso a dados privilegiados deve permanecer no Main/serviços e ser autorizado por sender/IPCs.

5. **[FONTE OFICIAL] [Node Streams](https://nodejs.org/api/stream.html)** — Streams limitam memory pressure em ingestão de assets grandes com backpressure correto.

**Limite de proveniência:** informações de documentação oficial foram confrontadas conceitualmente com as APIs usadas no código, mas o EXE e as versões efetivas instaladas não foram executados. Não existe medição própria neste estudo.

## Análise causal e possibilidades de mudança

### 1. Não existe um único banco

[CÓDIGO] Projetos V6 e Studio são documentos/manifests JSON + assets; Roteiros/Base de Vídeos utilizam SQLite; algumas imagens são CAS. Fazer cache persistente na pasta errada pode criar incoerência e perda de referência.

### 2. Cache derivado ≠ fonte canônica

[HIPÓTESE] Se V6 precisa reusar rig/atlas/face, usar um armazenamento de artefatos derivados com fingerprint completo e versionamento, budget, eviction e invalidação. O projeto original e sua fonte no Fabricador não são alterados.

### 3. Invalidação cruzada é desafio central

[CÓDIGO] Customizador verifica referências de roupa, cabelo, olhos e pose; V6 verifica revisões das fontes. A chave do cache deve acompanhar source/pose/wardrobe/tint/face/rig/crop/revisions, não apenas `characterId`.

### 4. Processo de publicação já protege dados

[CÓDIGO] O app já tem filas, transações de assets e recuperação. Pesquisa deve proteger esses contratos e evitar gravar blobs temporários diretamente em JSON de projeto para 'acelerar'.

### 5. WAL não é motor de pixels

[HIPÓTESE rejeitada provisoriamente] Migrar frames completos para SQLite não resolve render de 1080p e pode piorar I/O; nenhuma medição indica banco dominando export.

## Experimentos propostos (ainda não rodados)

1. **DB-01:** Somente fixture sintética: restart/crash entre publicação de assets e manifesto, verificar recovery de Studio/V6/Customizador.

2. **DB-02:** Mudar pose/roupa/face/cabelo e comparar hash de artefatos para demonstrar cache invalidado corretamente; não usar userData.

3. **DB-03:** Testar várias operações concorrentes por entidade e pending-write flush antes do shutdown.

4. **DB-04:** Inspecionar `PRAGMA journal_mode/synchronous`, sqlite integrity_check, schema migration e ocupação WAL de fixture, sem modificar produção.

5. **DB-05:** Criar hipótese de cache de read-only pixels e comparar primeiro cold export, segundo warm export, RAM e disco, sem escrever dentro de manifest canônico.

## Gates de segurança, qualidade e integração

- Nunca apagar/recriar catálogos pessoais para benchmarking.
- Downgrade de schema deve continuar recusado e compatibilidade legada preservada.
- Exclusão de biblioteca deve manter check de referências cruzadas.
- Assets têm verificação de hash/conteúdo e transações existentes; não relaxá-las.
- Toda melhoria de cache precisa de eviction, limite de bytes, invalidação, rollback, recuperação após falha e suite de consumidores.

## Veredito da pesquisa

**Preservar arquitetura de dados existente e localizar caches derivados fora do conteúdo canônico é a direção segura.** Não reescrever persistência para otimizar render. A tarefa `DATA-001` é mapear revisions e invalidação antes de um cache compartilhado de materiais/camadas.

**[A CONFIRMAR]** Diferença real de tempo em dados canônicos/cached em projetos grandes, chaves corretas de todas as fontes e casos de recovery não cobertos pelas fixtures.

**Rastreabilidade:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md), [Plano executável](../PLANO_EXECUTAVEL.md), [Matriz](../MATRIZ_DE_OPORTUNIDADES.md), [Fontes oficiais](../evidencias/FONTES-OFICIAIS.md).
