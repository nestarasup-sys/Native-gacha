# Guia para reconstrução do Native Gacha em C++

## Objetivo

Reconstruir o aplicativo desktop existente usando uma stack nativa, preservando os fluxos de criação e personalização de personagens, os dados dos usuários, os formatos portáteis e as integrações entre módulos. Trate isso como migração de produto por etapas, não como tradução automática de arquivos TypeScript para C++.

O snapshot é a referência do comportamento que existe hoje. Antes de implementar cada fluxo, rastreie a tela, os contratos compartilhados, o serviço de persistência e os testes relacionados. Se uma documentação antiga divergir do código e dos testes, registre a divergência e valide o comportamento observado.

## Escolha tecnológica inicial recomendada

- **C++20 + Qt 6 (Qt Quick/QML)** para desktop, painéis, listas e controles; C++ para lógica de domínio e persistência. Mantenha o core independente de Qt sempre que possível.
- **CMake + vcpkg** para build e dependências reproduzíveis no Windows.
- **SQLite** para catálogo, metadados, índices e projetos; arquivos de imagem e mídia ficam no filesystem, com referências e hashes no banco.
- **FFmpeg**, executado em processo de trabalho isolado, para decodificar, converter, extrair thumbnails/waveforms e exportar mídia. Nunca bloquear a thread da interface.
- **Qt Multimedia** pode servir à reprodução inicial. Defina um relógio mestre e valide sincronismo antes de adotá-lo como engine completa.
- Para composição Gacha, implemente primeiro um renderer determinístico com cache limitado e buffers de imagem. Avalie QRhi/scene graph do Qt para aceleração; use Skia somente se benchmarks provarem que a rota Qt não atende. Evite manter vários engines gráficos sem necessidade medida.
- Tarefas pesadas devem rodar em workers/processos com fila limitada, cancelamento, progresso, backpressure e recuperação de falhas.

Esta é uma recomendação a prototipar, não uma afirmação de que dependências ou codecs estão selecionados/licenciados para distribuição. Revise as licenças e opções de build de Qt, FFmpeg e codecs antes de distribuir.

## Arquitetura atual

```text
src/renderer/src/features/*  UI React por módulo
src/shared/*                 contratos, regras e modelos compartilhados
src/renderer/src/characters  composição e renderização de personagens
        │ API tipada via preload / IPC
        ▼
electron/main.ts             bootstrap e roteamento local
electron/domains/*           serviços, validação, repositórios e persistência
        │
        ├── SQLite e catálogo local
        └── filesystem, objetos de mídia, projetos e backups
```

O backend atual é local: processo principal Electron, serviços Node, SQLite e filesystem. Não há requisito de servidor remoto. O renderer não acessa o disco diretamente; o preload expõe uma superfície controlada de IPC. A versão nativa deve preservar essa separação de segurança, mesmo que IPC seja substituído por interfaces internas.

## Módulos funcionais a reconstruir

- **Fabricador DEV** (`src/renderer/src/features/fabricator`, `electron/domains/fabricator`): autor de modelos, poses, roupas, cabelo, componentes faciais, expressões e ferramentas de animação/presets. Proprietário dos catálogos de origem.
- **Customizador** (`src/renderer/src/features/customizer`, `electron/domains/customizer`): cria personagens com IDs estáveis e guarda escolhas e ajustes por personagem. Não grava alterações nos catálogos do Fabricador.
- **Renderer compartilhado** (`src/renderer/src/characters`, `src/shared/characterRenderAssets.ts`): resolve assets e compõe corpo, roupas, cabelo e rosto. Trate-o como contrato visual importante; crie fixtures golden para comparar pixels durante a migração.
- **Studio Principal** (`src/renderer/src/features/studio`, `electron/domains/studio`): compõe cenas com personagens e elementos. Consome personagens e é proprietário do estado de suas cenas.
- **Roteiros e Base de Vídeos** (`src/renderer/src/features/roteiros`, `electron/domains/baseVideos`, `electron/roteiro*`, `electron/videoLibrary.ts`): roteiros, projetos, bibliotecas compartilhadas de vídeo/fundos e exportação de personagens. A biblioteca de mídia existe independentemente do Video Studio removido.
- **Opções e dados** (`src/renderer/src/features/options`, `electron/dataPlatform.cjs`, `electron/domainFileSystem.cjs`, `electron/dataBackups.cjs`, `docs/APP_DATA_ESCALAVEL.md`): migração local guiada, catálogo, armazenamento por conteúdo, backups e restauração.

O **Video Studio foi removido** da versão atual desta branch. Não reintroduza suas telas ou engine antiga como parte da reconstrução dos módulos existentes. Base de Vídeos e Roteiros continuam mantendo suas bibliotecas e fluxos próprios de mídia.

## Regras de propriedade e compatibilidade

1. Fabricador é proprietário dos catálogos; Customizador é proprietário das diferenças por personagem; Studio Principal é proprietário do estado de suas cenas.
2. Use IDs estáveis e referências. Não derive identidade de nomes de arquivo. Entidades distintas podem compartilhar hash de conteúdo sem se tornarem a mesma entidade.
3. Binários ficam fora do SQLite. O banco mantém metadados/relações; objetos imutáveis podem usar SHA-256.
4. Preserve nomes de arquivo, dimensões, alpha, ordem de composição, coordenadas, cores, transparência e compatibilidade legada. Valide com capturas golden de personagens.
5. Não migre/sobrescreva dados reais durante testes. Use cópias sintéticas, fixtures e migrações versionadas, com backup verificável e rollback.
6. Preserve importadores para JSON legado (`characters.json`, projetos e catálogos). Não altere formato de usuário sem migração, testes de ida/volta e documentação.
7. SQLite: operações transacionais, foreign keys, WAL quando apropriado, backups consistentes via API SQLite; assets publicados via staging e rename atômico; caminhos confinados à raiz dos dados.
8. Logs não registram texto de projetos, personagens, caminhos privados ou conteúdo de mídia.

Consulte `docs/APP_DATA_PORTABLE.md`, `docs/APP_DATA_ESCALAVEL.md`, `electron/dataMigration.cjs`, `electron/dataPlatform.cjs`, `electron/domainFileSystem.cjs` e testes de migração/continuidade.

## Migração incremental proposta

### 0 — Inventário verificável

Catalogar telas, comandos, regras, persistência, formatos e testes. Criar gravações/capturas de referência e fixtures sintéticas. Separar dados portáteis de cache.

### 1 — Contratos e core C++

Criar repositório/build CMake, tipos de domínio, leitura/escrita versionada e importadores somente leitura dos formatos legados. Portar regras puras e testar contratos sem UI. Definir IDs e política de versão.

### 2 — Persistência e assets

Implementar SQLite e asset store em paralelo ao app atual, usando cópia sintética do perfil. Testar import/export de personagens, referências, hashes, recuperação e restauração. Não fazer cutover antes de paridade.

### 3 — Renderer de personagem

Portar o compositor conforme o código observado. Criar fixtures sintéticas e comparar dimensões/pixels com tolerância documentada. Resolver diferenças de rasterização antes das telas finais.

### 4 — Módulos existentes

Reconstruir Fabricador, Customizador, Studio Principal, Roteiros/Base de Vídeos e Opções. Cada módulo deve ter dono de dados, comandos claros e persistência testável, sem gravações incidentais em outro domínio. Video Studio não está no escopo atual.

### 5 — Validação e corte

Validar cópias de bancos, golden images, falhas/crash/cancelamento/rollback, memória e tempo. Só então oferecer migração para dados reais. Manter backup/export do formato anterior até estabilidade comprovada.

## Riscos a medir

- Compatibilidade visual entre Canvas/browser e Qt/renderizador nativo.
- Importação legada sem perda de IDs/slots, geometria ou resolução.
- Licenciamento/distribuição de Qt, FFmpeg e codecs.
- Desempenho em máquinas mais limitadas, sobretudo em mídia, timelines longas e caches de imagens grandes.
- Requisitos funcionais ainda incompletos devem ser prototipados e validados antes de congelar modelos de dados.

C++ por si só não elimina travamentos, exportação lenta ou incompatibilidades; threading, filas, limites de memória, codecs e benchmarks determinam o resultado.

## Executar o snapshot atual

Requisitos e comandos completos estão em `README.md`. Em resumo: Node.js 22.22+, `npm ci`, depois `npm run typecheck`, `npm run build` e comandos de teste do `package.json`. Windows é recomendado para integração desktop. Os arquivos `app-data` não vêm no pacote por privacidade; use fixtures em `tests/`.
