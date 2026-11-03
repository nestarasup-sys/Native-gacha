# CODEX — NATIVE-GACHA
# REFATORAÇÃO GERAL V2 + EVOLUÇÃO COMPLETA DO APLICATIVO + LOGS DEV

## 1. MISSÃO

Você é o engenheiro principal responsável pela evolução arquitetural, técnica e funcional do Native-gacha.

Continue o programa de refatoração geral já iniciado, aproveitando integralmente os trabalhos anteriores.

O objetivo agora é:

**Levar a arquitetura, confiabilidade, segurança, desempenho, manutenção, testes e ferramentas de diagnóstico do Native-gacha ao melhor nível tecnicamente viável, sem comprometer as funcionalidades existentes.**

Trabalhe em TODO o aplicativo.

Não concentre o trabalho apenas no Editor V6.

Inclua:

- Electron Main, preload e IPC.
- Fabricador DEV.
- Customizador.
- Studio Principal.
- Editor V6.
- Sistemas de mídia e exportação.
- Roteiros.
- Base de Vídeos.
- Armazenamento, SQLite, assets e backups.
- Interface global.
- Área Logs Dev.
- Testes, ferramentas, benchmarks e CI.
- Documentação e contratos compartilhados.

O aplicativo já passou por uma refatoração extensa. Não reinicie a arquitetura do zero.

**Refatore o que ainda precisa, consolide o que já ficou bom e corrija problemas estruturais comprovados.**

## 2. REPOSITÓRIO E REGRAS DE GIT

Repositório: `nestarasup-sys/Native-gacha`

**Branch única: `Dev-V2`**

Commit de referência da análise: `02e617e5d0db93b5f0c26d04da4faf5f2db8d8bb`

A versão local poderá estar mais recente. Antes de começar, confirme o HEAD e o estado do Git.

Regras obrigatórias:

- Trabalhe exclusivamente na `Dev-V2`.
- NÃO crie outras branches, nem temporárias.
- NÃO faça push.
- NÃO crie Pull Requests.
- NÃO faça merge ou rebase.
- NÃO altere `main`, `Main-desenvolvimento` ou qualquer outra branch.
- NÃO utilize resets ou limpezas destrutivas.
- Preserve as alterações locais preexistentes.
- Crie commits locais pequenos, coerentes e rastreáveis.
- Aguarde autorização explícita do usuário para qualquer publicação no GitHub.

Você pode editar localmente arquivos de workflow, testes, código, documentação e configurações do projeto.

## 3. AUTONOMIA

Você tem autonomia para investigar, pesquisar, planejar, implementar, testar, corrigir, reorganizar e melhorar o aplicativo.

Não peça confirmação para cada pequena decisão técnica.

Não conclua uma fase simplesmente entregando um plano. Implemente as melhorias justificadas, valide-as e continue para a próxima.

Você pode reordenar tarefas quando houver dependências técnicas, desde que registre o motivo.

Não interrompa o desenvolvimento por problemas solucionáveis com investigação, depuração ou testes.

Entretanto, pare antes de:

- Qualquer operação destrutiva com dados do usuário.
- Migração incompatível sem estratégia verificável de reversão.
- Publicação remota.
- Mudança de branch.
- Alteração fundamental de stack sem justificativa e aprovação.
- Uso de credenciais ou serviços externos não autorizados.

Não presuma que o ambiente permite execução infinita. Caso precise interromper por limite de sessão ou ambiente, registre um checkpoint reproduzível com commits, testes, pendências e a próxima ação segura.

## 4. LEITURA INICIAL OBRIGATÓRIA

Leia e utilize:

- `AGENTS.md`
- `docs/architecture/AUDITORIA_REFATORACAO_GERAL_V1_FASE_0.md`
- `docs/architecture/PROGRAMA_REFATORACAO_GERAL_NATIVE_GACHA.md`
- `docs/architecture/ADR-001-modular-electron.md`
- `docs/architecture/ADR-002-fluxo-personagens.md`
- `docs/architecture/CHARACTER_PRODUCTION_CONTRACT.md`

Além dos documentos específicos de Fabricador, Customizador, Studio, Editor V6 e sistemas de dados.

O relatório da V1 já registra:

- Fases 0, 1 e 2 concluídas.
- Fases 3, 4, 5 e 6 em andamento.
- Extrações de comandos, serviços, seletores e contratos.
- Testes de regressão adicionados.
- Baselines sintéticos de performance.
- Riscos ainda abertos.

**Não duplique o trabalho que já foi realizado.**

Confira as afirmações do relatório contra o código atual.

Reclassifique cada pendência como concluída, parcialmente concluída, ainda necessária ou obsoleta.

## 5. PESQUISA EXTERNA E REFERÊNCIAS TÉCNICAS

A pesquisa técnica é obrigatória para decisões estruturais importantes.

Você deve pesquisar:

1. Documentações oficiais.
2. Referências da versão instalada.
3. Guias de migração.
4. Breaking changes.
5. Recomendações de segurança.
6. Padrões de desempenho e profiling.
7. Issues e discussões dos mantenedores, quando necessárias.
8. Exemplos oficiais e repositórios de referência.
9. Wikis e artigos especializados como fontes complementares.

Priorize documentação oficial sobre tutoriais genéricos ou recomendações antigas.

### Tecnologias identificadas no projeto

Pesquise e confira as versões realmente instaladas de:

**Electron**  
https://www.electronjs.org/docs/latest/

**Segurança Electron**  
https://www.electronjs.org/docs/latest/tutorial/security

**Processos Electron**  
https://www.electronjs.org/docs/latest/tutorial/process-model

**IPC Electron**  
https://www.electronjs.org/docs/latest/tutorial/ipc

**Performance Electron**  
https://www.electronjs.org/docs/latest/tutorial/performance

**React**  
https://react.dev/

**React Router**  
https://reactrouter.com/

**TypeScript**  
https://www.typescriptlang.org/docs/

**Node.js**  
https://nodejs.org/api/

**Vite**  
https://vite.dev/

**electron-vite**  
https://electron-vite.org/

**Electron Builder**  
https://www.electron.build/

**Vitest**  
https://vitest.dev/

**Zustand**  
https://zustand.docs.pmnd.rs/

**Immer**  
https://immerjs.github.io/immer/

**Zod**  
https://zod.dev/

**Sharp**  
https://sharp.pixelplumbing.com/

**SQLite**  
https://www.sqlite.org/docs.html

**better-sqlite3**  
https://github.com/WiseLibs/better-sqlite3

**FFmpeg**  
https://ffmpeg.org/documentation.html

**GitHub Actions**  
https://docs.github.com/en/actions

Pesquise também as APIs de Canvas, SVG, Web Workers, OffscreenCanvas, Chromium DevTools e sistemas de mídia quando forem relevantes.

### Regras da pesquisa

Não execute atualizações indiscriminadas de dependências.

Primeiro avalie compatibilidade com o runtime Electron, Node.js, sistema operacional, módulos nativos e build.

Não introduza tecnologias novas apenas por popularidade.

Não reproduza código encontrado na internet sem verificar licença, segurança, versão e adequação.

Registre referências oficiais, URLs, versões consultadas e decisões importantes.

Se não tiver acesso à internet, não invente resultados de pesquisa. Registre a limitação e trabalhe com as referências locais disponíveis.

---

# PARTE I — ANÁLISE DA REFATORAÇÃO EXISTENTE

## 6. CONFIRMAR O QUE JÁ FOI BEM REFATORADO

Faça uma auditoria diferencial entre a arquitetura anterior e a atual.

Investigue especialmente as extrações realizadas nos últimos commits:

- Encerramento e drenagem de persistência.
- Geometria compartilhada de personagens.
- Comandos de salvamento do Fabricador.
- Manipulação de roupas e cabelos.
- Comandos do Animator.
- Gerenciamento de slots e catálogos.
- Seleção e persistência do Customizador.
- Comandos do Studio.
- Comandos do Editor V6.
- Biblioteca e Base de Vídeos.
- Roteiros.
- Diagnósticos e Opções.
- Workflows e benchmarks.

Para cada módulo, determine se a extração realmente reduziu acoplamento e misturas de responsabilidades.

Não considere um módulo automaticamente bem refatorado apenas por ter sido movido para outro arquivo.

Verifique:

- Dependências.
- Clareza das responsabilidades.
- Qualidade dos contratos.
- Testabilidade.
- Consistência dos dados.
- Tratamento de falhas.
- Presença de duplicação.
- Ciclo de vida de recursos.
- Desempenho.

Preserve implementações que já estejam adequadas.

## 7. PRIORIDADES ARQUITETURAIS IDENTIFICADAS

A última análise identificou como candidatos prioritários:

- `electron/main.ts`
- `src/renderer/src/ui/styles.css`
- `src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx`
- `src/renderer/src/features/fabricator/AnimatorWorkspace.tsx`
- `src/renderer/src/features/fabricator/face/FaceComponentsWorkspace.tsx`
- `src/renderer/src/features/fabricator/ExpressionPresetWorkspace.tsx`
- `src/renderer/src/features/fabricator/HairWorkspace.tsx`
- `src/renderer/src/features/fabricator/ModelSourceEditor.tsx`
- `src/renderer/src/features/fabricator/FabricatorPage.tsx`
- `src/renderer/src/features/customizer/CustomizerPage.tsx`
- `src/renderer/src/features/studio/StudioPage.tsx`
- `src/renderer/src/features/editorV6/EditorV6Page.tsx`

Também devem ser revisados os serviços de persistência, os renderizadores compartilhados, as filas de gravação e os workers.

O tamanho dos arquivos é somente um indicador de investigação, não um defeito por si só.

Refatore os pontos em que encontrar responsabilidades realmente misturadas, lógica duplicada ou acoplamento excessivo.

---

# PARTE II — CONTINUAR A REFATORAÇÃO GERAL

## 8. ELECTRON E INFRAESTRUTURA

A Fase 1 anterior está documentada como concluída.

Não a repita.

Execute uma auditoria de consolidação do resultado.

Verifique especialmente:

- Composition root do `electron/main.ts`.
- Inicialização de serviços.
- Ordem dos registros IPC.
- Políticas de segurança.
- Dependências e contratos compartilhados.
- Tratamento de erros.
- Encerramento com operações pendentes.
- Backups.
- Transações e journals.
- Recuperação após interrupção.
- Processos auxiliares.
- Recursos e memória liberados no fechamento.

Extraia novas responsabilidades somente quando isso reduzir efetivamente complexidade e risco.

Audite se há lógica de produto no Main que deveria pertencer aos serviços dos domínios.

Verifique se existe algum código bloqueante no Main que possa causar congelamentos.

Preserve os contratos atuais.

## 9. NÚCLEO COMPARTILHADO DE PERSONAGENS

A Fase 2 anterior também está documentada como concluída.

Preserve o núcleo já organizado.

Concentre-se em novas inconsistências identificadas durante o desenvolvimento posterior.

Teste especialmente:

- Modelos femininos e masculinos.
- Tronco masculino deformado.
- Proporções corporais.
- Juntas.
- Roupas articuladas.
- Novos conjuntos pareados de sapatos.
- Ordem das camadas dos sapatos e canelas.
- Cabelo deformado.
- Olhos e pupilas.
- Expressões.
- Animações de boca.
- Renderizadores de prévia.
- Renderizadores dos Studios.
- Persistência dos assets.

Não misture a propriedade dos catálogos do Fabricador com as personalizações do Customizador.

Toda regra compartilhada deve ser testada em todos os consumidores relevantes.

## 10. FABRICADOR DEV — REFATORAÇÃO PROFUNDA

Esta é uma das prioridades mais importantes da V2.

Continue a decomposição dos workspaces grandes.

O objetivo é separar claramente:

**Visualização**  
Componentes responsáveis por apresentar interface e coletar ações.

**Estado da sessão**  
Hooks e controladores responsáveis pela seleção, estado temporário, ferramenta ativa e operações em andamento.

**Comandos**  
Casos de uso como criar, salvar, duplicar, excluir, mover, editar, publicar e desfazer.

**Algoritmos**  
Processamento de imagem, malhas, deformação, recorte, montagem, animação, geometria e paletas.

**Persistência**  
Operações realizadas através dos contratos de serviço e IPC existentes.

### Áreas obrigatórias

- Editor de modelos.
- Editor de poses.
- Roupas DEV.
- Cabelos DEV.
- Componentes de rosto.
- Expressões e presets.
- Animator DEV.
- Importação de grades.
- Deformação por pincel.
- Histórico de edição.
- Edição e publicação de assets.

Evite que o mesmo evento de UI concentre cálculos, manipulação de arquivos, atualização de catálogo e tratamento de erro.

Proteja o histórico de undo/redo.

Teste falhas parciais de salvamento, edição rápida, carregamento concorrente e fechamento durante operações.

Não reescreva os algoritmos visuais sem necessidade. Se mudar algum, compare a saída de pixels e a geometria.

## 11. CUSTOMIZADOR — REVISÃO E CONSOLIDAÇÃO

Refatore os pontos restantes do Customizador, aproveitando os hooks e comandos já extraídos.

Separe:

- Gestão de personagens.
- Seleção de modelos e poses.
- Personalização corporal.
- Roupas e conjuntos.
- Cabelos.
- Face.
- Cores.
- Prévia visual.
- Sincronização com catálogos.
- Persistência e atualizações concorrentes.

Revise a consistência entre o estado exibido e o estado realmente salvo.

Valide respostas assíncronas antigas.

Não permita que alterações em um personagem contaminem outro.

Garanta compatibilidade com personagens anteriores à introdução de gênero, tronco masculino e sapatos pareados.

## 12. STUDIO PRINCIPAL

Continue a modularização do Studio sem recriar suas funcionalidades.

Prioridades:

- Orquestração da página principal.
- Estado de cena.
- Seleção e manipulação de elementos.
- Renderização.
- Histórico.
- Comandos.
- Salvamento.
- Miniaturas.
- Impressão.
- Integridade de assets.
- Integração de personagens e vídeos.

Revise como o Studio mantém referências e snapshots.

Teste apagar, duplicar, desfazer, refazer, salvar, fechar e reabrir.

Não modifique a interface visual sem justificativa.

## 13. EDITOR V6 E EXPORTAÇÃO

Continue a refatoração dos módulos ainda acoplados.

Prioridades:

- Página principal.
- Estado e comandos.
- Timeline.
- Playback.
- Renderização.
- Preparação de motions.
- Cache de atlas.
- Composição facial.
- Workers.
- Exportação.
- Recuperação de assets.
- Integração com Customizador e Fabricador.

### Regras visuais obrigatórias

A boca deve continuar animando automaticamente durante a fala.

Não reduza a resolução do personagem.

Não crie artefatos retangulares, halos ou resíduos em animações faciais.

Não provoque deslocamentos corporais durante expressões.

Mantenha a paridade entre prévia e MP4.

Preserve 720p, 1080p, 30 FPS, Turbo, modo seguro, áudio e composição de vídeos.

Valide a geometria de todos os personagens durante a exportação.

### Última alteração relevante

O HEAD analisado inclui uma otimização de empacotamento dos atlases de movimento.

Verifique sua eficiência e seus limites de memória usando fixtures sintéticas.

Não considere a redução da área de atlas suficiente para comprovar melhora global de exportação.

## 14. ROTEIROS E BASE DE VÍDEOS

As duas áreas já receberam extrações importantes.

Agora consolide:

- Contratos de mídia.
- Importação e publicação.
- Salvamento.
- Exclusões.
- Proteção de referências.
- Filas.
- Histórico.
- Recuperação.
- Estado assíncrono.
- Erros.
- Interface e estilos.

Não una os domínios indevidamente.

Biblioteca de Mídia continua responsável pelos bytes e IDs dos arquivos.

Base de Vídeos continua responsável pelos metadados editoriais.

Roteiros continua responsável pelos seus documentos e referências.

---

# PARTE III — NOVA ÁREA LOGS DEV

## 15. TRANSFORMAR OPÇÕES EM LOGS DEV

Esta é uma mudança funcional explicitamente autorizada.

A área atualmente chamada **Opções** deve passar a se chamar:

# LOGS DEV

A intenção é transformá-la em uma central de desenvolvimento, diagnóstico, manutenção e investigação de problemas do Native-gacha.

Não será apenas uma alteração de texto.

### Nome e navegação

- Renomear o item do menu superior de `Opções` para `Logs Dev`.
- Renomear título, cabeçalhos e acessibilidade da página.
- Manter a rota `/opcoes` funcionando por compatibilidade.
- Não alterar os canais IPC existentes somente por causa da mudança de nome.
- Manter os recursos atuais de backup, armazenamento, migração e exportação de diagnóstico.

A estrutura interna dos arquivos pode continuar em `features/options` durante uma migração segura. Renomear diretórios não é um objetivo em si.

## 16. ARQUITETURA DA TELA LOGS DEV

Organize a interface em áreas independentes, preferencialmente abas ou seções:

### A. Visão geral

Criar um painel de diagnóstico com:

- Quantidade de erros recentes.
- Quantidade de avisos.
- Última falha registrada.
- Estado conhecido do processo principal.
- Versões do aplicativo.
- Última leitura de desempenho.
- Última medição de armazenamento.
- Quantidade de backups e backups verificados.
- Acesso rápido para investigar eventos.
- Acesso para gerar relatório de diagnóstico.

Diferencie claramente:

**Sem problemas registrados**

de

**Verificação executada e aprovada**.

Não exiba “tudo saudável” quando determinada checagem ainda não foi executada.

### B. Eventos e logs

Transforme a listagem atual em um navegador técnico de eventos.

Implementar:

- Busca textual.
- Filtro por gravidade.
- Filtro por módulo ou domínio.
- Filtro por processo de origem.
- Filtro por intervalo de tempo.
- Ordenação por data.
- Expansão de detalhes.
- Cópia de um evento sanitizado.
- Exportação de eventos filtrados.
- Estado vazio claro.
- Mensagens explicando possíveis causas quando houver informação confiável.

Preserve a leitura dos eventos históricos existentes em JSONL.

Não invente stack traces se eles não foram capturados.

### C. Eventos estruturados

Avalie evoluir o contrato dos logs para incluir campos opcionais como:

- Identificador do evento.
- Timestamp.
- Gravidade.
- Domínio.
- Código do evento.
- Processo de origem.
- Operação.
- Etapa.
- Resultado.
- Duração, quando medida.
- ID de correlação técnico e não pessoal.
- Mensagem resumida e sanitizada.

Faça isso de maneira compatível com eventos antigos.

Não registre dados de personagens, conteúdo de roteiros, nomes de arquivos pessoais, caminhos absolutos ou payloads IPC completos.

### D. Desempenho

Criar um painel técnico sob demanda para:

- Processo principal Electron.
- Renderer principal.
- Processos auxiliares identificáveis.
- Uso de memória.
- CPU, se a API suportar.
- Tempo de atividade.
- Estatísticas de IPC agregadas.
- Operações com maior latência medida.
- Informações de renderização quando disponíveis.
- Métricas sintéticas ou de exportação previamente produzidas.

Utilize APIs oficiais compatíveis com a versão instalada do Electron.

Os dados precisam informar:

- Quando foram medidos.
- Qual processo foi medido.
- Quais métricas estão indisponíveis.
- Se são amostras instantâneas, máximos ou médias.

Não confunda memória do Main com memória total do aplicativo.

Não exiba FPS da timeline baseado em estimativa não medida.

Se implementar coleta durante um intervalo, mantenha-a opcional, limitada, cancelável e com orçamento de CPU/memória.

O monitoramento pesado fica desabilitado por padrão.

### E. Armazenamento

Aprimore a visualização já existente:

- Uso por categoria.
- Arquivos e espaço total.
- Catálogo e objetos referenciados.
- Caches recriáveis.
- Itens que não puderam ser medidos.
- Resultados de verificações explícitas.

As leituras custosas devem continuar sob demanda.

Não adicione ferramentas de limpeza destrutiva automática.

### F. Backups e recuperação

Preserve:

- Criação.
- Listagem.
- Verificação.
- Restauração.
- Exclusão manual.
- Segurança das operações pendentes.

Melhore a clareza visual de avisos e resultados.

A restauração exige confirmação adequada e verificações de integridade.

Não restaure, apague ou migre dados automaticamente como parte de um diagnóstico.

### G. Ferramentas Dev

Criar uma seção avançada com:

- Informações de versão e runtime.
- Resumo técnico do ambiente.
- Testes rápidos não destrutivos.
- Verificações de contratos seguros.
- Acesso aos diagnósticos existentes.
- Exportação de relatório.
- Ferramentas de migração legada em área separada e claramente identificada.

Os autodiagnósticos devem ser leves, canceláveis e somente de leitura, salvo ação explicitamente confirmada.

Não transforme esta área em um terminal com execução arbitrária de comandos.

## 17. RELATÓRIOS DE DIAGNÓSTICO

Melhore a exportação já existente.

O relatório deve ser útil para investigar erros compartilhados com um desenvolvedor.

Quando disponíveis, inclua dados técnicos sanitizados sobre:

- Versões.
- Runtime.
- Processos.
- Indicadores de memória.
- Eventos recentes.
- Estado de armazenamento.
- Resumo de backups.
- Resultado de autodiagnósticos.
- Métricas de desempenho explicitamente coletadas.

Não inclua por padrão conteúdos de projetos, mídias, nomes de personagens, caminhos pessoais, credenciais ou dados sensíveis.

Implemente prévia ou resumo claro do que será exportado.

O usuário deve escolher salvar o arquivo localmente.

Nenhum relatório será enviado automaticamente para internet, GitHub, serviços de telemetria ou terceiros.

## 18. SEGURANÇA E EFICIÊNCIA DOS LOGS

Audite:

- `electron/domains/storage/diagnosticsLog.ts`
- `electron/domains/storage/diagnosticsIpc.ts`
- `src/renderer/src/ui/diagnosticCapture.ts`
- `src/shared/dataManagement.ts`
- `src/renderer/src/features/options/`

O logger atual tem limites de retenção e sanitização. Preserve seus dados existentes e evolua esse mecanismo sem perder compatibilidade.

Proteja contra:

- Mensagens excessivamente grandes.
- Inundação de eventos repetidos.
- Cargas abusivas no IPC.
- Caminhos privados.
- URLs com dados sensíveis.
- Tokens, cookies ou credenciais em mensagens.
- Erros que causem novos erros no próprio logger.
- Bloqueio do processo Main por diagnósticos comuns.

Avalie deduplicação e agregação de eventos repetidos, políticas de retenção e leitura paginada somente se os benefícios justificarem.

Não descarte registros antigos arbitrariamente para implementar o novo layout.

Qualquer ação de apagar histórico precisa ser explícita e segura.

## 19. TESTES DE LOGS DEV

Crie testes para:

- Renomeação visual e navegação.
- Compatibilidade da rota `/opcoes`.
- Filtros e busca.
- Ordenação.
- Eventos inválidos e antigos.
- Mensagens sanitizadas.
- Exportação sem dados sensíveis.
- Falhas de leitura.
- Escritas concorrentes.
- Limites de retenção.
- Atualização manual de métricas.
- Cancelamento de coleta.
- Performance da listagem.
- Backups e migração preservados.
- Segurança e autorização IPC.

Teste a interface real do Electron quando o ambiente permitir.

---

# PARTE IV — DESEMPENHO E CONFIABILIDADE

## 20. PERFILAMENTO DO APLICATIVO INTEIRO

O projeto já tem benchmarks sintéticos importantes.

Não os descarte.

Amplie a cobertura para:

- Inicialização do Electron.
- Primeiro render da interface.
- Troca entre páginas.
- Abertura do Fabricador.
- Abertura de modelos e poses.
- Catálogos de roupa e cabelo.
- Prévia de personagens.
- Carregamento do Customizador.
- Salvamento de personagem.
- Carregamento do Studio.
- Timeline do Editor V6.
- Exportação MP4.
- Roteiros.
- Base de Vídeos.
- Logs Dev.

Para cada cenário relevante, meça:

- Latência percebida.
- CPU.
- Memória dos processos envolvidos.
- Frequência e duração de tarefas longas.
- Operações IPC.
- Tempo de leitura e gravação.
- Quantidade de recursos mantidos em cache.
- Comportamento após repetidas aberturas e fechamentos.

Use fixtures sintéticas e perfis isolados.

Não utilize o perfil pessoal do usuário como ambiente de stress.

### Método

1. Crie uma baseline reproduzível.
2. Identifique o gargalo.
3. Investigue a causa.
4. Implemente melhoria apropriada.
5. Repita a medição.
6. Compare resultados sob condições equivalentes.
7. Reverta otimizações regressivas ou injustificadas.

Diferencie ganho de algoritmo sintético e ganho real na interface.

Não reduza qualidade visual para melhorar números.

## 21. MEMÓRIA, WORKERS E CACHES

Revise:

- Caches de imagens.
- Caches de personagens.
- Decodificação.
- Canvas e bitmaps.
- URLs temporárias.
- Workers.
- Renderizadores ocultos.
- Processos FFmpeg.
- Listeners e assinaturas.
- Promises pendentes.
- Operações canceladas.
- Recursos de GPU quando observáveis.

Garanta liberação correta quando a operação termina, a tela fecha ou uma tarefa é cancelada.

Não implemente limpeza agressiva que cause redecodificações constantes ou perda de desempenho.

Meça o custo real de cada cache.

## 22. CSS E INTERFACE

Continue reduzindo a responsabilidade da folha global:

`src/renderer/src/ui/styles.css`

Mova estilos para módulos proprietários quando houver vantagem clara.

Preserve:

- Aparência.
- Espaçamentos.
- Responsividade.
- Seletores necessários.
- Prioridade da cascata.
- Estados visuais.
- Acessibilidade.

Use comparações de capturas antes/depois em telas importantes.

Não faça redesign do aplicativo, com exceção da reorganização funcional autorizada para Logs Dev.

---

# PARTE V — TESTES, CI E SEGURANÇA

## 23. QUALIDADE E REGRESSÕES

Preserve e fortaleça:

- Testes unitários.
- Testes de contratos.
- Testes de integração.
- Testes de persistência.
- Testes de falhas parciais.
- Testes de UI real.
- Testes de renderização.
- Testes de exportação MP4.
- Testes de arquitetura.
- Testes de recuperação.

A última CI publicada do commit de referência concluiu com sucesso.

Mantenha esse baseline.

Não enfraqueça testes para fazer uma refatoração passar.

Inclua cobertura de casos negativos e condições de corrida.

Quando a cobertura puder ser medida com ferramentas suportadas, use-a para identificar lacunas reais, especialmente nos módulos alterados.

Não persiga percentuais arbitrários à custa de testes sem valor.

## 24. CI DA DEV-V2

O workflow atual já executa:

- Auditoria arquitetural.
- Contratos de refatoração.
- Geometria compartilhada.
- Typecheck.
- Suítes Editor V6 em Windows e Linux.
- Build Windows.
- Exportação real com FFmpeg.

Preserve essa estrutura funcional.

Avalie acrescentar testes de Logs Dev, Fabricador, Customizador, Studio e armazenamento nos gates adequados.

Evite builds duplicados e custos desnecessários.

Mantenha a segurança e as permissões mínimas do GitHub Actions.

Lembre-se: os arquivos do workflow serão editados apenas localmente, e a execução hospedada somente poderá ser confirmada após o usuário autorizar o push.

## 25. COMANDOS E VALIDAÇÃO

Confirme os scripts atuais do `package.json` antes de executá-los.

Inclua, quando aplicável:

```bash
npm run audit:architecture
npm run test:refactor
npm run test:geometry
npm run test:editor-v6
npm run typecheck
npm run build
```

Execute também os testes específicos das áreas modificadas.

Use os harnesses Electron/FFmpeg e testes reais de interface quando disponíveis.

Não declare um teste como aprovado se não o executou.

Diferencie testes locais, testes Windows, verificações sintéticas e CI remota.

---

# PARTE VI — EXECUÇÃO CONTÍNUA

## 26. ORGANIZAÇÃO DO TRABALHO

Trabalhe em unidades de implementação pequenas.

Para cada unidade:

1. Comprove o problema ou oportunidade.
2. Identifique os consumidores.
3. Consulte as fontes técnicas pertinentes.
4. Proteja o comportamento atual com testes.
5. Refatore ou implemente a melhoria.
6. Execute verificações.
7. Examine o diff.
8. Crie commit local.
9. Atualize o relatório de progresso.
10. Continue para a próxima prioridade.

Não acumule mudanças enormes sem validação.

Não modifique dezenas de módulos simultaneamente quando isso impedir identificar a origem de uma regressão.

## 27. ORDEM RECOMENDADA

Comece assim:

**Ciclo A — Reconciliação da refatoração V1**

Revisar o trabalho existente, identificar pendências reais e proteger a baseline.

**Ciclo B — Logs Dev**

Implementar a mudança de nome, a nova estrutura de interface e os recursos de diagnóstico prioritários, com privacidade e testes.

**Ciclo C — Fabricador e Customizador**

Concluir a decomposição dos maiores workspaces e reforçar continuidade visual e persistência.

**Ciclo D — Electron e núcleo compartilhado**

Consolidar os limites que ainda forem complexos, sem reescrever módulos já adequados.

**Ciclo E — Studio Principal e Editor V6**

Concluir as extrações com proteção de assets, timeline, reprodução e exportação.

**Ciclo F — Roteiros, Base de Vídeos e interface global**

Revisar as áreas restantes e consolidar CSS/componentes.

**Ciclo G — Performance, segurança e testes**

Medir, otimizar, validar e atualizar os gates de qualidade.

Pode ajustar a ordem interna quando houver dependências técnicas importantes.

## 28. DOCUMENTAÇÃO DA V2

Crie ou atualize um documento central, por exemplo:

`docs/architecture/PROGRAMA_REFATORACAO_GERAL_V2_NATIVE_GACHA.md`

Registre:

- Diagnóstico atualizado.
- Módulos já adequados.
- Dívidas restantes.
- Implementações realizadas.
- Decisões técnicas.
- Referências pesquisadas.
- Testes.
- Benchmarks.
- Commits.
- Pendências.
- Riscos.

Não duplique integralmente os relatórios anteriores.

A V2 deve ser continuidade da V1.

## 29. CRITÉRIOS DE CONCLUSÃO

Considere uma etapa concluída somente quando houver:

- Mudança concreta implementada.
- Responsabilidade arquitetural clara.
- Compatibilidade preservada.
- Testes pertinentes aprovados.
- Diff revisado.
- Commit local.
- Registro das decisões e evidências.

A redução de linhas de código não é critério suficiente.

A simples criação de arquivos novos não é critério suficiente.

A aprovação dos testes sintéticos não comprova automaticamente paridade visual em projetos reais.

## 30. RELATÓRIO FINAL

Ao concluir a execução possível, apresente em português:

**O que já estava bem refatorado.**

**O que foi adicionalmente refatorado.**

**Quais problemas foram corrigidos.**

**Como ficou a nova Logs Dev.**

**O que foi melhorado em performance.**

**Quais testes realmente passaram.**

**Quais referências oficiais foram pesquisadas.**

**Quais commits locais foram criados.**

**Quais itens continuam pendentes.**

Informe separadamente as melhorias comprovadas e as hipóteses ainda não verificadas.

---

# PARTE VII — REGRA ADICIONAL: USO DE RECURSOS DO COMPUTADOR E BENCHMARKS

## 31. CONTEXTO: O USUÁRIO ESTÁ JOGANDO NO COMPUTADOR

**ATENÇÃO: O USUÁRIO ESTÁ JOGANDO NO COMPUTADOR ENQUANTO VOCÊ TRABALHA.**

Você tem autorização explícita para utilizar intensamente os recursos do computador durante toda a refatoração, mesmo enquanto o usuário estiver jogando.

### Liberdade de execução

- Pode utilizar CPU, GPU, RAM e todos os núcleos disponíveis conforme a necessidade dos testes.
- Pode executar builds completos, testes pesados, benchmarks, stress tests e exportações de vídeo.
- Pode utilizar paralelismo, múltiplos workers e processos simultâneos quando tecnicamente apropriado.
- **Não reduza artificialmente a intensidade dos testes para economizar recursos por causa do jogo.**
- Não precisa adiar os testes pesados até o usuário parar de jogar.
- Não precisa pedir autorização adicional para executar testes intensivos normais do projeto.

Respeite apenas os limites técnicos e de segurança necessários para evitar corrupção de dados, operações destrutivas ou resultados inválidos.

### IMPORTANTE — INTERPRETAÇÃO DOS BENCHMARKS

Como o usuário está jogando simultaneamente, o ambiente possui carga concorrente variável.

Isso significa que:

1. Os resultados de CPU, GPU, RAM, FPS e tempo de execução podem sofrer interferência do jogo.
2. Benchmarks executados nessas condições devem ser identificados como **medições sob carga concorrente**.
3. Não apresente esses resultados como medições limpas ou controladas.
4. Não declare ganhos ou perdas definitivos de desempenho baseados apenas nessas amostras.
5. Sempre que possível, faça várias medições e registre a variação dos resultados.
6. Compare configurações sob condições semelhantes, alternando a ordem das execuções quando apropriado.
7. Quando for necessária uma medição rigorosamente controlada, registre essa pendência para validação futura, sem bloquear as demais refatorações.

### PRIORIDADE

**Continue trabalhando normalmente, com toda a capacidade computacional necessária.**

O fato de o usuário estar jogando não deve limitar a profundidade da análise, a quantidade de testes ou a intensidade das verificações.

O único cuidado adicional é interpretar os números de desempenho corretamente.

**Não economize recursos artificialmente. Não diminua a qualidade dos testes. Não interrompa o programa de refatoração por causa do jogo.**

---

# ORDEM FINAL

Trabalhe autonomamente e de forma contínua em toda a refatoração geral V2.

Não espere um novo prompt para cada módulo.

Não faça reescritas desnecessárias.

Não prejudique funcionalidades já prontas.

Não reduza qualidade de imagem ou vídeo.

Não apague dados.

Não crie outra branch.

Não faça push, PR, merge ou rebase.

**TODAS AS ALTERAÇÕES DEVEM SER FEITAS LOCALMENTE NA DEV-V2.**

Somente o usuário autorizará a publicação.

Comece revisando o relatório da V1 e o estado local atual. Em seguida, execute a V2, começando pelo ciclo de reconciliação e pela implementação da nova central Logs Dev.

**Missão final: transformar o Native-gacha em um aplicativo mais bem estruturado, confiável, rápido, diagnosticável e fácil de evoluir, preservando integralmente o trabalho criativo do usuário.**
