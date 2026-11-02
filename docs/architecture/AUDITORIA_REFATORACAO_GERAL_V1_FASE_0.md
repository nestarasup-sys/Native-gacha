# Auditoria arquitetural Native-gacha — Refatoração Geral V1 · Fase 0

- **Data:** 01/11/2026
- **Repositório:** nestarasup-sys/Native-gacha
- **Branch auditada:** Dev-V2
- **Commit-base:** 12641ad7eddc48478a501353a470f7c13d01662b
- **Estado inicial do worktree:** limpo
- **Escopo executado:** inventário e análise estática do aplicativo, investigação do teste CI de atlas facial e correção exclusiva do fixture desse teste. Nenhuma alteração de interface, formato salvo, serviço ou comportamento do aplicativo foi feita.

## Resumo executivo

O Native-gacha já tem fronteiras por domínio no processo principal, contratos compartilhados, sete rotas de produto com carregamento sob demanda e um verificador de dependências. Na auditoria, o gate encontrou 562 arquivos TS/TSX sem erros de sintaxe, zero imports locais quebrados, zero imports de runtime entre features e zero violações estritas entre camadas.

A dívida mais visível está concentrada em quatro pontos: o composition root Electron, alguns workspaces React com centenas de linhas, a folha global de estilos com cerca de 399 KB e diferenças de tipagem nos contratos IPC. A persistência já possui mecanismos fortes de integridade; isso aumenta o custo e o risco de mudanças que cruzem domínios e torna essencial testar filas, referências, migração e recuperação antes de extrair módulos.

O teste de atlas facial falhava porque o fixture genérico não preenchia o formato estrito já exigido para um atlas facial estático. O contrato e a validação foram preservados. Após ajustar o fixture, toda a suíte automatizada do Editor V6 passou. O typecheck ainda encontra dois erros existentes em chamadas de diagnóstico de memória em electron/main.ts; esse arquivo não foi alterado nesta fase.

## 1. Mapa arquitetural do aplicativo

- **Shell e rotas:** electron inicia a aplicação; src/renderer/src/main.tsx monta a shell React em ui/mountApp.tsx. ui/App.tsx mantém HashRouter, TopBar, Error Boundaries, Profiler e sete rotas lazy: Customizador, Studio, Editor V6, Roteiros, Base de Vídeos, Opções e Fabricador DEV.
- **Renderer e UI:** src/renderer/src/features/{domínio} contém telas e workspaces; src/renderer/src/ui contém componentes compartilhados, hooks, caches, filas de persistência, diagnósticos e estilos globais.
- **Renderização de personagens:** src/renderer/src/characters concentra resolução de fontes, composição de camadas, roupas, rosto e adaptações usadas por mais de uma área. É uma fronteira importante entre o catálogo e seus consumidores.
- **Contratos puros e compartilhados:** src/shared guarda tipos, schemas, validadores e cálculos consumidos pelo processo principal, preload e renderer. Inclui contratos próprios de Fabricator, Customizer, Studio, Editor V6, mídia, Roteiros e Base de Vídeos.
- **Preload e IPC:** electron/preload.ts publica window.desktop por contextBridge. As APIs tipadas ficam agrupadas por domínio. Fabricator, Studio e Editor V6 têm helpers de canal/invocação em src/shared; parte das outras APIs ainda chama ipcRenderer.invoke com nomes de canal em texto no preload.
- **Processo principal:** electron/main.ts inicializa caminhos e políticas do Electron, plataforma de dados, serviços e coordenadores entre domínios; registra adaptadores IPC e workers e drena gravações pendentes ao fechar. electron/application contém bootstrap de app-data, janela e confiança do renderer. electron/domains/{domínio} contém adaptadores IPC, serviços, repositórios e persistência.
- **Persistência:** o aplicativo usa app-data local. electron/dataPlatform.cjs coordena SQLite, arquivos lógicos por domínio, referências de imagem e Content Addressed Store (CAS). electron/domainFileSystem.cjs integra caminhos legados e o catálogo. Migração e backup têm serviços próprios, manifests e verificações de hash/integridade.
- **Workers e exportação:** Editor V6 tem workers/preloads isolados para preparar movimento e exportar vídeo. Roteiros possui serviços de exportação e gravação. Ferramentas de teste visual, exportação e stress ficam em scripts.
- **Ferramentas internas:** scripts/ contém 59 arquivos, organizados em architecture, dev-ai, diagnostics, editor-v6, fabricator e video-studio. São harnesses, auditorias, benchmarks, importação e captura; devem permanecer fora do caminho normal da UI.

Fluxo resumido:

    Feature React → API window.desktop do preload → canal IPC validado no Electron Main
       → serviço/caso de uso do domínio → repositório ou DataPlatform/DomainFileSystem
       → documento/asset persistido → referência por ID consumida pelas áreas autorizadas

O processo principal atua como backend local. Não há servidor HTTP separado no desenho observado.

## 2. Módulos e respectivos responsáveis

| Módulo | Responsabilidade e propriedade |
|---|---|
| Fabricador DEV | Dono do catálogo-fonte: modelos, poses, roupas, rosto, cabelo, expressões e animações. Publica e altera assets e referências do catálogo. |
| Customizador | Dono de personagens persistidos e suas diferenças por personagem: escolhas, cores e overrides. Lê catálogo por IDs e slots; alterações do personagem não devem regravar a fonte do Fabricador. |
| Studio Principal | Dono dos documentos de cena, composição, posição e overrides daquela cena. Guarda characterId e estado/snapshot apropriado à cena. |
| Editor V6 | Dono dos projetos, timeline, elementos, assets e exportação. Resolve personagens e vídeos por referências próprias; controla cache e workers de movimento/vídeo. |
| Biblioteca de Mídia | Dona dos arquivos de vídeo e IDs. Fornece leitura/importação e protege exclusão quando Roteiros, Base de Vídeos ou Editor V6 ainda referenciam o item. |
| Base de Vídeos | Dona dos metadados editoriais, categorias, publicação e numeração associados ao ID da Biblioteca de Mídia. |
| Roteiros | Dono dos documentos, logs e exportações de roteiro; referencia vídeos e personagens sem assumir o catálogo-fonte desses recursos. |
| Opções e storage | Opções expõe manutenção, migração, backups e diagnósticos. Domínio storage coordena persistência e infraestrutura; não é proprietário dos dados editoriais de cada feature. |
| Shared e characters | Tipos, validações e regras puras comuns. Renderização compartilhada de personagens fica em characters; as telas consumidoras mantêm seus históricos e persistência próprios. |

Os contratos de personagens refletem ADR-002-fluxo-personagens.md e CHARACTER_PRODUCTION_CONTRACT.md. A propriedade e os IDs documentados devem guiar cada extração.

## 3. Ranking de problemas, evidência, gravidade e impacto

“Gravidade” nesta tabela descreve o risco arquitetural para manutenção/refatoração; os itens sem defeito reproduzido são riscos estruturais, não bugs confirmados.

| Rank | Achado e evidência | Gravidade | Impacto |
|---|---|---|---|
| 1 | **Persistência e referências têm alto raio de impacto.** dataPlatform.cjs concentra schema SQLite, CAS, manifests, referências e coleta de objetos; dataMigration.cjs e dataBackups.cjs tratam migração, hash, staging e integridade. Referências de vídeo e personagens atravessam domínios. | Alta | Mudança mal delimitada pode perder arquivos, quebrar IDs ou restaurar documentos inconsistentes. Requer fixtures sintéticas e testes de falha antes de extração. |
| 2 | **Composition root extenso.** electron/main.ts tem 1.050 linhas e aproximadamente 66 KB; importa serviços de praticamente todos os domínios, monta filas/coordenadores, configura IPC e ciclo de vida. | Alta | Mudanças de domínio ficam difíceis de revisar isoladamente. Uma extração apressada pode alterar ordem de inicialização, flush, guards ou dependências injetadas. |
| 3 | **Workspaces e páginas com responsabilidades concentradas.** WardrobeWorkspace.tsx: 845 linhas; AnimatorWorkspace.tsx: 797; FaceComponentsWorkspace.tsx e ExpressionPresetWorkspace.tsx: 848 cada; EditorV6Page.tsx: 893; StudioPage.tsx: 873; CustomizerPage.tsx: 912. | Média-alta | Eventos, estado, carregamento, apresentação e ações podem ficar acoplados no mesmo arquivo. Aumenta custo de revisão e risco de regressão por estado obsoleto. Os números indicam prioridade para inspeção, não provam que toda função no arquivo esteja misturada. |
| 4 | **Abstrações IPC assimétricas.** Fabricator, Studio e Editor V6 usam invokers e canais compartilhados; chamadas de Customizer, Base de Vídeos, Roteiros e manutenção incluem strings diretamente em preload.ts. | Média-alta | Canal, payload e API podem divergir entre preload, registrador e tipo público. Migração futura deve preservar exatamente os canais existentes e as verificações de origem/payload. |
| 5 | **Filas de gravação com garantias diferentes.** Há createKeyedOperationQueue, createRoteirosWriteQueue, SerializedDocumentSaveQueue e cadeias/mapas locais em Customizer, pose, cabelo, roupa e serviços. Elas variam em chave, retenção de falha e inventário de pendências. | Média-alta | Uma abstração comum pode esconder diferenças necessárias de ordenação e falha. Primeiro documentar garantias por entidade e ciclo de vida; consolidar só quando testes demonstrarem equivalência. |
| 6 | **CSS global muito concentrado.** styles.css tem 3.275 linhas e 399.296 bytes; no renderer existem quatro arquivos CSS, com apenas algumas folhas locais no Fabricador. | Média | Uma mudança de seletor pode atingir áreas distantes e torna difícil localizar o dono visual. Não há evidência aqui de gargalo de runtime causado pelo tamanho; o impacto demonstrado é de manutenção e risco de cascata. |
| 7 | **Gerenciamento de estado assíncrono heterogêneo.** Foram encontrados useEffect em 74 arquivos de features, com cancelamento local por flag/request generation em diversas telas; Editor V6 também tem editorV6Store em Zustand, enquanto os outros domínios usam mais estado/hooks locais. | Média | Regras de descarte de resultados e salvamento variam entre features. Necessário mapear cada operação antes de trocar por hook/estado comum; os padrões encontrados incluem cancelamento, portanto não implicam falha generalizada. |
| 8 | **Desempenho é medido por recortes, sem baseline comum.** App instala React Profiler e diagnósticos; há benchmarks específicos para projeção de personagens, candidatos de roupas, composição do Fabricador e movimento do Editor V6. | Média | As medições existentes ajudam a otimizar esses caminhos, mas não formam uma linha de base contínua para o aplicativo inteiro. Não foi confirmado gargalo atual em runtime; CSS e tamanho de arquivos, isoladamente, não provam lentidão. |
| 9 | **Cobertura de CI desigual para Dev-V2 e sem orçamento de cobertura encontrado.** editor-v6-parity.yml roda em push/PR de Dev-V2; ci-core.yml e quality.yml não incluem Dev-V2 nos filtros de push/PR. O typecheck executado falha em electron/main.ts:959–960: a declaração Electron de WebContents não reconhece getProcessMemoryInfo. Não foi encontrada configuração/script de relatório ou threshold global de cobertura. | Alta para o gate; média para cobertura | O ramo recebe teste específico do Editor V6, enquanto os gates gerais não são acionados pelos eventos declarados para Dev-V2. O erro de types impede tratar typecheck como gate aprovado; ele está fora dos arquivos modificados nesta fase. |
| 10 | **Compatibilidade legado precisa de política explícita.** legacySceneCatalog é consumido por Studio e Editor V6; legacyPoseMigration é iniciado e acompanhado no Main; legacyExpressionEffects atende importação, persistência e renderização. | Média | Esses arquivos têm consumidores atuais. A auditoria não confirmou código morto para remoção. A busca de imports do gate garante resolução e fronteiras, mas não prova ausência de consumidores de exports dinâmicos/reflexivos. |

### Duplicação e abstrações inconsistentes

A evidência mais concreta é a repetição de formas de serializar gravações com contratos diferentes, somada aos invokers IPC disponíveis apenas para alguns domínios. Isso merece matriz de semântica e cobertura de contrato. Não recomendo fundir filas por semelhança de sintaxe: uma preserva falhas para flush/backup, outra evita bloquear gravações posteriores, e algumas operam por chave/slot. A estrutura atual também mantém regras comuns de geometria e personagens em src/shared e characters, sinal de que nem todo código semelhante é duplicado.

## 4. Arquivos prioritários e motivo

1. **electron/main.ts** — reduzir gradualmente composição de dependências e coordenação transversal; manter a inicialização fina e os adaptadores no domínio dono.
2. **electron/dataPlatform.cjs, electron/dataMigration.cjs, electron/dataBackups.cjs, electron/domainFileSystem.cjs** — documentar contratos, transações e pontos de recuperação antes de mexer em persistência.
3. **electron/preload.ts e src/shared/*IpcChannels.ts** — uniformizar contratos por domínio sem alterar nomes de canal ou forma persistida.
4. **src/renderer/src/features/fabricator/{wardrobe/WardrobeWorkspace,AnimatorWorkspace,face/FaceComponentsWorkspace,ExpressionPresetWorkspace}.tsx** — pontos com maior volume de UI do Fabricador.
5. **src/renderer/src/features/{customizer/CustomizerPage,studio/StudioPage,editorV6/EditorV6Page}.tsx** — separar comandos/estado/visualização em incrementos que mantenham cada feature dona de seu fluxo.
6. **src/renderer/src/ui/styles.css** — extrair estilos por propriedade somente com comparação visual equivalente.
7. **scripts/dev-ai/asset-ui-authoring.cjs e scripts/editor-v6/test-stress-offscreen.cjs** — ferramentas internas extensas, prioridade após os fluxos de produto; preservar isolamento e uso de perfis sintéticos.

## 5. Dependências e contratos que precisam ser protegidos

- **Fonte e instância:** Fabricador mantém catálogo-fonte; Customizador guarda instância e overrides por personagem. Preservar modelSlot, setId, componentId e demais IDs persistidos.
- **Cena e projeto:** Studio mantém estado da cena; Editor V6 mantém documento/timeline. Ambos consomem personagem por characterId e podem carregar snapshot apropriado. Alterar origem não pode sobrescrever cenas/projetos silenciosamente.
- **Vídeos:** Biblioteca de Mídia mantém bytes e ID; Base de Vídeos guarda metadados editoriais; Roteiros e Editor V6 guardam referências. Exclusão exige consultar consumidores antes de apagar.
- **Renderização:** src/renderer/src/characters e regras puras de src/shared alimentam várias áreas. Mudança compartilhada requer verificar Customizador, Studio, Editor V6 e exportação.
- **IPC:** manter nomes de canais, validação da origem do sender, validação de dados na entrada, namespaces públicos e ciclo de eventos. Renderer segue sem acesso direto a SQLite/filesystem.
- **Persistência:** preservar IDs, caminhos legados, JSON/schema version, hashes, journal/backup, atomicidade, ordem de fila e restauração. Nenhum schema ou migração faz parte da Fase 0.
- **Fechamento:** flush de operações em curso é contrato transversal do ciclo de vida, não detalhe substituível por um hook visual.

## 6. Ordem recomendada das próximas fases

0. **Fase 0 — concluída:** mapear; corrigir fixture de atlas estático; documentar riscos e resultados.
1. **Fase 1 — tornar os gates confiáveis:** resolver o erro atual de typecheck, definir os workflows de Dev-V2 e registrar cobertura por domínio sem relaxar validações.
2. **Fase 2 — fechar contratos IPC por domínio:** começar por APIs com chamadas raw; tipar um domínio por vez e testar preload ↔ registrador ↔ validação.
3. **Fase 3 — matriz de persistência e recuperação:** por dono de dado, cobrir sucesso, falha parcial, retry, interrupção, backup, restore e referências; usar perfis sintéticos temporários.
4. **Fase 4 — composição Main:** extrair montagem de dependências/registradores e coordenadores transversais em módulos de application, preservando registradores e serviços do domínio dono.
5. **Fase 5 — páginas/workspaces:** extrair sessões/commands e componentes visuais em pequenos recortes, mantendo estado na feature e comparando saída visual.
6. **Fase 6 — CSS por propriedade:** extrair base/shell/componentes e estilos de feature gradualmente, conferindo captura antes/depois.
7. **Fase 7 — desempenho e legado:** medir benchmarks existentes por feature, acrescentar baselines onde faltarem e remover código legado somente após provar ausência de consumidores e compatibilidade de dados.

## 7. Proposta de pastas

A estrutura atual por domínio já tem benefício e deve ser mantida. Não proponho mover todas as features nem criar framework de DI, servidor ou banco novo.

Benefício comprovável: dividir a folha global em folhas sob propriedade clara, por exemplo:

- src/renderer/src/ui/styles/base.css
- src/renderer/src/ui/styles/shell.css
- src/renderer/src/ui/styles/components.css
- src/renderer/src/features/{domínio}/{domínio}.css para estilos realmente exclusivos da feature

A divisão deve ser progressiva, começar por uma seção pequena, preservar a ordem atual de cascata e usar comparação visual. Para Main, basta expandir electron/application com composição injetável quando uma extração concreta surgir; não criar um novo container genérico.

## 8. Testes, compatibilidade e rollback

### Correção preliminar da CI

Antes da mudança, a execução isolada de tests/editor-v6/motionPreparation.test.ts reproduziu 1 falha e 21 sucessos. O cenário de atlas facial localizado estático usava resultFor genérico: faltavam assetRole = face-atlas e os facePatch obrigatórios por frame. O cache chama editorV6MotionResultSchema, que exige sprite correspondente ao frame, replace e replaceBounds, além da ausência de um segundo faceAsset.

A alteração ficou no fixture do teste. Foi criado staticMouthAtlasResultFor e o próprio teste faz parse pelo schema estrito antes de gravar/ler o cache. Nenhuma regra de validação foi enfraquecida.

### Resultados executados

- npm run test:editor-v6: passou — 3 testes de perfil stress; Vitest com 38 arquivos aprovados, 1 ignorado, 220 testes aprovados e 1 ignorado.
- npm run audit:architecture: passou — 562 TS/TSX sem erros de sintaxe, 0 imports locais ausentes, 0 imports runtime entre features, 0 violações estritas.
- O inventário contém 214 arquivos de teste. Há suítes por domínio e contratos visuais/integração; não foi encontrado threshold de cobertura automatizada.
- npm run typecheck: falhou em duas referências a WebContents.getProcessMemoryInfo em electron/main.ts:959–960. electron/main.ts está idêntico ao commit-base e não foi alterado nesta fase. Resultado registrado como pendência real do repositório.
- npm run build e a suíte geral test:refactor não foram executados. A correção é apenas fixture; o gate funcional pertinente e a auditoria de fronteiras foram executados. Typecheck já bloqueia em erro fora do escopo autorizado.

### Estratégia para próximas mudanças

- Criar fixtures sintéticas por domínio; não usar app-data real nem assets pessoais.
- Adicionar testes de unidade para regra pura, testes de serviço/repositório para persistência e testes IPC para origem, payload e canal.
- Para referências entre áreas, testar ID existente, ID removido/bloqueado, snapshot antigo e tentativa de sobrescrita cruzada.
- Para UI compartilhada/render/export, comparar previews e imagens exportadas com casos dourados; no Editor V6, manter os testes de timeline, export e paridade atuais.
- Para migrações/backups, testar hashes, paths canônicos, falha no staging, corrupção e recuperação; validar snapshot SQLite com integrity_check.
- Preservar APIs e caminhos legados até todos os leitores estarem migrados. Executar typecheck, auditoria, suíte do domínio, test:refactor e build conforme o alcance.
- Cada alteração de persistência deve ser compatível com dados já salvos e ter caminho de rollback em commit, sem exclusão/reset. Para mudanças de formato, exigir backup sintético verificado e estratégia de leitura da versão anterior antes de gravar o novo formato.

## 9. Esforço relativo e risco por módulo

| Módulo | Esforço relativo | Risco | Razão |
|---|---:|---:|---|
| DataPlatform, migração, backup, DomainFileSystem | XL | Muito alto | Dados compartilhados, formatos legados, CAS, integridade e recuperação. |
| Main, preload e IPC | L | Alto | Ciclo de vida, autorização, flush e contrato público de várias features. |
| Fabricador DEV | XL | Alto | Maior área do renderer e catálogo que alimenta consumidores. |
| Customizador e renderização de personagem | L | Alto | Overrides por personagem e regras visuais compartilhadas. |
| Studio Principal | L | Alto | Documento de cena, autosave, snapshot e renderer compartilhado. |
| Editor V6 e exportação/vídeo | XL | Alto | Timeline, caches, workers, performance e paridade de exportação. |
| Media Library, Base de Vídeos e Roteiros | L | Alto | IDs compartilhados, exclusão referenciada, logs e exportação. |
| Opções e manutenção | M | Médio | UI menor, mas controla operações de dados sensíveis. |
| CSS e componentes compartilhados | L | Médio-alto | Grande alcance visual e pouca segmentação atual. |
| Scripts e harnesses internos | M | Médio | Grande volume e dependências de perfis/permissões de teste; execução isolada. |

## 10. Primeiros cinco tickets pequenos e independentes

1. **Corrigir o typecheck de diagnóstico de memória.** Ajustar a chamada/tipo conforme API Electron instalada; preservar o fallback de captura opcional. Aceite: npm run typecheck passa e teste cobre indisponibilidade da métrica.
2. **Adicionar gates gerais à Dev-V2.** Ajustar eventos de ci-core/quality para a branch autorizada; manter test:refactor, typecheck e build. Aceite: workflow aplicável a Dev-V2 e nenhum gate reduzido.
3. **Tipar os canais da Base de Vídeos.** Criar contrato/invoker compartilhado e migrar apenas preload e registrador desse domínio, preservando strings de canal. Aceite: teste de correspondência de todos os métodos e validação existente.
4. **Cobrir backup/restore com falhas sintéticas.** Testar hash divergente, interrupção do staging e restore incompleto em diretório temporário. Aceite: dados atuais preservados na falha e backup íntegro verificável.
5. **Extrair um recorte visual pequeno de Opções.** Separar o painel de backups da folha global para arquivo pertencente à feature, mantendo a ordem CSS. Aceite: captura antes/depois equivalente e nenhuma alteração em canais/fluxo de manutenção.

Cada ticket pode ser revisado e revertido isoladamente. Nenhum deles foi iniciado nesta Fase 0.
