# Editor V6: arquitetura e integração

**Auditoria estática do código em 26/10/2026.** Este documento descreve o Editor V6 que existe hoje, separa seu domínio do restante do app e propõe uma evolução para um editor de vídeo local. As oportunidades de desempenho são hipóteses até medirmos projetos reais.

## Mapa do aplicativo

```mermaid
flowchart LR
  subgraph UI[Electron renderer: React + TypeScript]
    TOP[TopBar e rotas carregadas sob demanda]
    V6[Área Editor V6]
    PREVIEW[SceneSurface: React/SVG]
    TL[Timeline: React/DOM/CSS]
  end
  subgraph BRIDGE[Preload isolado e tipado]
    API[window.desktop / canais editor-v6]
  end
  subgraph MAIN[Electron main: Node.js]
    IPC[IPC validado]
    DOC[Projetos JSON + PNG por projeto]
    MOTION[Chromium oculto para preparar atlas]
    EXPORT[2 Chromium ocultos + FFmpeg/FFprobe]
    DATA[DataPlatform: SQLite + arquivos por hash]
  end
  FAB[Fabricador: poses e componentes] -->|catálogo de leitura| V6
  CUSTOM[Customizer: personagens] -->|catálogo de leitura / snapshot| V6
  TOP --> V6
  V6 --> PREVIEW
  V6 --> TL
  V6 <-->|IPC| API
  API <--> IPC
  IPC --> DOC
  IPC --> MOTION
  IPC --> EXPORT
  EXPORT -->|MP4| FFMPEG[FFmpeg e FFprobe]
  DATA -. outros domínios do app .-> FAB
  DATA -. outros domínios do app .-> CUSTOM
  VIDEO[Base de Vídeos / Roteiros] -->|Editor Gacha/media-library| DATA
```

## O que está implementado

- O V6 é uma rota própria, carregada sob demanda, em `src/renderer/src/features/editorV6`. Tem modelo, validação, IPC, persistência, histórico, renderizador e serviços de animação próprios. Não importa a página nem os documentos do Studio Principal.
- A janela principal usa `contextIsolation: true`, `nodeIntegration: false` e `sandbox: true`. O preload expõe métodos tipados e específicos, em vez de entregar o `ipcRenderer` inteiro. O processo principal valida o remetente antes de operar nos canais do V6.
- O V6 pode consultar personagens do Customizer e fontes do Fabricador. Ao colocar um personagem na cena, guarda um snapshot visual e metadados de origem. Alterar a biblioteca depois não atualiza cenas existentes por conta própria, e editar uma cena não grava na origem.
- Projetos persistem em `userData/studios/Editor V6/editorV6-<id>/`: manifesto `editorV6.json`, PNGs em subpastas próprias, impressões e áudio importado. Há journal transacional para publicar PNGs e manifesto sem deixar uma gravação interrompida em estado ambíguo.
- `SceneSurface` é a composição visual comum entre prévia e captura de quadros. O renderer de export e o de preparação de animação são BrowserWindows ocultos, com preloads próprios e sandbox. O export passa bitmaps BGRA ao processo FFmpeg.
- O app geral usa `DataPlatform`, SQLite, `DomainFileSystem`, `better-sqlite3` e objetos de mídia identificados por hash para alguns domínios. Base de Vídeos e Roteiros usam o domínio de bibliotecas que ainda fica fisicamente em `studios/Editor Gacha`.

## Onde o V6 se separa do Studio e das outras áreas

O V6 tem outra pasta, outro schema, canais `editor-v6:*`, outra fila de salvamento, armazenamento de assets próprio e estado/histórico próprios. Isso atende à separação funcional pedida. Compartilhar Electron, React, APIs de leitura de personagens/poses, o shell e serviços genéricos de arquivos não torna os projetos do V6 documentos do Studio.

O `DomainFileSystem` e a lista `BUILTIN_DOMAINS` ainda **não registram** `studios/Editor V6`. Portanto os projetos V6 usam arquivos locais sob o perfil portátil do Electron, fora do catálogo SQLite/CAS. Os backups do app incluem `runtime/profile`, então isso não significa que o V6 esteja fora dos backups; significa que busca, deduplicação e migração por domínio não administram seus arquivos como fazem para domínios já migrados.

Direção: preservar o V6 como domínio de documentos independente e, quando a integração for feita, conectar o armazenamento por um adaptador `editor-v6.*` próprio. O domínio pode usar as ferramentas comuns de arquivo, hash, backup e streaming do app, mas não deve compartilhar documentos, histórico, identificadores de projeto nem regras de edição do Studio. Assets importados continuam pertencendo logicamente ao projeto V6; deduplicação física só é segura se o catálogo preservar essa propriedade e mantiver referências/backup consistentes.

## O que “Vídeo” e “áudio” significam hoje

- A faixa chamada `Vídeo` guarda mudanças visuais de fundo/imagem. O schema de assets do V6 aceita imagens; o relatório do export marca `videoInputs: 0` e `proxies: 0`. O V6 ainda não importa, decodifica ou reproduz clips de vídeo.
- Existe áudio importado e copiado para o projeto, configurável no painel de exportação. Os clips ficam em `exportAudio`, separados das faixas da timeline. O projeto não tem faixa de áudio na timeline, forma de posicionar vários sons pela timeline nem uma prévia sincronizada de áudio confirmada no caminho de Play.
- Base de Vídeos/Roteiros usam uma biblioteca de vídeo em outra área do app. O V6 não tem chamadas para importar esses itens e não os usa como mídia de cena.

Isso é uma diferença entre o objetivo já discutido para o editor — importar vídeo e áudio desde o começo, com cópia para o projeto — e o produto atual. A interface deve distinguir “imagem de fundo” de “clip de vídeo” quando a importação real for implementada, e os sons precisam virar clips temporizados editáveis em uma faixa apropriada.

## Tecnologias do app: função real e impacto

| Tecnologia | Papel atual | Relação com fluidez |
| --- | --- | --- |
| Electron + Chromium | Janela, isolamento de processos, APIs desktop e compositor do palco. | O framework oferece GPU, workers e offscreen; uma thread ocupada ou muitas cópias ainda travam a interface. |
| Node.js no processo main | IPC, arquivos, serviços, SQLite, coordenação de export e subprocessos. Não há um servidor HTTP dedicado para o V6. | Trabalho síncrono pesado no main pode travar o app inteiro; operações longas precisam ser assíncronas ou sair dessa thread. |
| React 19 + React Router | Painéis, controles, inspector, palco SVG e timeline DOM. Rotas são carregadas sob demanda. | O playhead é estado React local e as linhas da timeline são memoizadas; clips fora do intervalo visível são filtrados. Ainda é preciso medir commits e pintura do palco. |
| TypeScript 5.9 | Tipagem e compilação dos contratos UI/IPC/documento. | Ajuda a prevenir erros de estrutura; tipos são removidos na execução e não aceleram renderização. |
| Zustand 5 + Immer 11 | Estado e histórico próprios do V6. A lista de projetos e documentos, incluindo assets, vai para estado de UI. | Seletores e compartilhamento imutável ajudam renderizações localizadas. Immer não reduz o custo de manter centenas de PNGs como Data URLs. |
| Zod 4 | Validação de documentos e jobs ao atravessar fronteiras de persistência/IPC. Há limites de 500 assets, 1.000 elementos e 200 faixas. | Validação protege os dados; validar/transportar um documento grande a cada salvamento pode custar. Não há medição de que Zod, sozinho, seja o gargalo. |
| electron-vite + Vite | Compila bundles separados para main, preload e renderer e serve HMR no desenvolvimento. Workers do renderer usam formato ES. | Ferramentas de build não fazem a cena ficar mais fluida durante a edição. Dividir em bundles e carregar a rota sob demanda ajuda inicialização. |
| FFmpeg + FFprobe | Subprocessos locais para codificar H.264, juntar trechos, mixar áudio e validar o MP4. | O exportador consulta NVENC, QSV, AMF e depois libopenh264. O encoder detectado depende da máquina/build; “Turbo 2×” ainda divide CPU, GPU, memória e disco. |
| Sharp/libvips | Normalização e análise de imagens no processo principal, fora do ciclo de cada frame. | Ajuda importações e processamento de imagens; arquivos grandes ainda podem gerar pico de memória durante operações. |
| SQLite + better-sqlite3 | Catálogo e metadados dos domínios migrados do app, com chamadas síncronas no main. O V6 não persiste seus projetos nesse banco hoje. | Consultas pequenas e indexadas são adequadas; uma consulta grande síncrona pode bloquear o event loop. Usar worker só se uma consulta real justificar. |
| Vitest | Testes automatizados de lógica e serviços. | Só roda em desenvolvimento/CI; não compõe nem exporta vídeo no uso normal. |
| Electron Builder | Empacota o app portátil Windows x64 e inclui FFmpeg/FFprobe e avisos de licença. | Não altera fps durante edição; nativos como SQLite/Sharp adicionam trabalho de build/rebuild e precisam ser validados no pacote. |

Os números acima são as versões declaradas no projeto (`package.json`), com faixas semver; o lockfile define as versões instaladas em cada build. Versões atuais não devem ser inferidas somente pelo `^` do manifesto.

No lockfile atual, as versões principais resolvem para Electron 44.9.3 / Chromium 152.0.7977.167, React e React DOM 19.3.0, React Router 8.4.0, Zustand 5.0.16, Immer 11.2.9, Zod 4.6.7, Vite 7.3.7, electron-vite 5.0.0, TypeScript 5.9.3, Vitest 5.0.5, Electron Builder 26.18.0, better-sqlite3 13.0.3 e Sharp 0.35.5. O pacote FFmpeg incluído foi identificado como n8.1.3-18-g46d899d7a0, build Windows x64 da BtbN, LGPL-2.1-or-later; a própria ficha pede completar a checagem de conformidade/fontes antes de uma release final.

## Decisões acertadas que o V6 já usa

- O playhead é estado local do `EditorV6Page`, não uma atualização do Zustand global. A timeline memoiza suas linhas; o comentário em `EditorV6Timeline.tsx` confirma que, durante Play, as linhas não precisam redesenhar e só o cursor avança.
- A timeline filtra blocos e transições pelo intervalo visível. A tela é DOM/CSS, mas não renderiza todos os clips fora da região que o usuário vê.
- O preparo de animações acontece numa BrowserWindow separada, em fila serial. O cache de trabalho limita número/tamanho, e o Play apenas escolhe um sprite já preparado.
- O exportador usa o mesmo componente de cena, limita quantos assets prepara em cache, aguarda o pipe do FFmpeg e reutiliza o bitmap para cenas visualmente idênticas. Falhas do caminho Turbo acionam fallback CPU.
- A rota V6 é carregada sob demanda; o build mantém main/preloads/renderer em bundles próprios. A janela e os workers mantêm sandbox e preload de escopo estreito.

Essas escolhas seguem padrões vistos nos editores pesquisados. Elas não removem o custo de abrir, validar e salvar os documentos inteiros com assets em Base64.

## Custos concretos a reduzir primeiro

1. **A lista carrega os projetos completos.** `listEditorV6Projects` chama `listEditorV6s`, que abre cada `editorV6.json`, lê todos os PNGs e converte cada um a Base64. A página guarda essa lista completa no estado de projetos. Com vários projetos e imagens grandes, a tela de biblioteca paga o custo de abrir assets que nem foram selecionados.
2. **Cada salvamento recodifica o conjunto inteiro de assets.** O auto-save ocorre depois de 650 ms sem mudança. `writeEditorV6` decodifica cada Data URL, normaliza formatos não-PNG e entrega todas as imagens à transação, mesmo quando só mudou um texto ou um bloco. A transação ainda lê/backupeia os caminhos existentes antes de publicar o manifesto.
3. **Data URL atravessa limites de estado e IPC.** O mesmo PNG pode existir como texto Base64 no estado do renderer, no payload de IPC e em buffers no processo principal. Base64 aumenta o tamanho do dado e cópias transitórias podem elevar a memória de pico.
4. **A captura do export é intensiva e concorrente.** Turbo cria dois renderizadores ocultos, captura cada imagem em BGRA e alimenta dois processos FFmpeg. O caminho já tem fallback e validação, mas exige uma comparação de tempo/memória no projeto real antes de assumir que duas partes sempre serão melhores.
5. **A fluidez de animação tem uma limitação visível no código.** O relógio atual publica quadros inteiros a 30 FPS. O relatório [DESEMPENHO_E_FLUIDEZ.md](DESEMPENHO_E_FLUIDEZ.md) descreve como comparar isso com preview de 60 Hz sem mudar a timeline/export de 30 FPS.
6. **Os diagnósticos existentes não classificam a rota V6.** O `performanceDiagnostics.ts` agrega commits React e long tasks quando `sessionStorage.gv5:perf` está ligado, mas sua lista de rotas não inclui `/editor-v6`. A rota cai em “outra rota”; o utilitário também não mede fps apresentado, tempo de abertura/salvamento nem bytes dos atlas. Estender os sinais de medição do V6 é necessário para comparar um antes/depois.

Esses pontos são oportunidades arquiteturais observadas no código, não uma alegação de que todos já causam lentidão perceptível. Priorizar por medição do volume de dados e por um perfil representativo.

## Direção recomendada

### Fase 1 — tirar mídia desnecessária do caminho crítico

- Separar API de **resumo de projetos** da API de **abrir projeto completo**. A biblioteca deve carregar título, datas, miniatura e tamanho; só o projeto selecionado carrega timeline e assets.
- Persistir assets como arquivos binários com IDs/hash no manifesto. O renderer recebe referências tipadas e miniaturas; não precisa manter todos os PNGs como Data URL.
- Na gravação, publicar somente assets novos ou cujo hash mudou; mudanças de timeline/texto publicam manifesto sem regravar PNGs. Agrupar auto-save durante arraste e garantir fila ordenada com a versão mais recente.
- Manter a propriedade portátil do projeto e o journal de recuperação. Criar migração por versão para documentos existentes antes de trocar o formato.

### Fase 2 — formalizar integração com os dados do app

- Registrar um domínio V6 próprio na camada de dados, começando por inventário, backup, hashes, migração guiada e protocolo local de leitura de asset.
- Usar protocolo de mídia com allowlist e leitura por ID, não caminhos de arquivo arbitrários na UI. A janela já usa segurança Electron correta; preservar `contextIsolation`, sandbox e APIs específicas no preload.
- Reusar contratos de catálogo para importar uma cópia visual de personagem/pose; não importar ou alterar os documentos do Studio. Ao atualizar uma personagem existente, pedir uma ação explícita e mostrar o que será recalculado.
- Deixar vídeos e sons como assets de propriedade do projeto. A biblioteca Base de Vídeos pode oferecer uma ação explícita de copiar/importar se isso ajudar o usuário, mas não deve virar dependência necessária para reabrir um projeto.

### Fase 3 — tornar mídia em timeline uma capacidade de primeira classe

- Modelar clips com IDs, arquivo de origem, `sourceIn`, início/duração na timeline, stream/codec, volume, mute, transformação e status de proxy. Cada trilha fica em quadros/timestamps definidos pelo projeto e resolve uma composição por tempo.
- Manter a escolha anterior de copiar vídeo/áudio para dentro do projeto. Preservar o original importado; criar proxies, miniaturas, waveform e índices de seek em cache recriável.
- Adicionar clips reais de vídeo na faixa de vídeo e som em uma ou mais faixas de áudio. Diálogo/fala/pensamento continuam eventos separados se isso representar melhor a intenção Gacha.
- Começar preview com poucos decoders ativos e fila de leitura/preparação limitada. Fazer áudio usar o mesmo relógio de reprodução. FFmpeg/FFprobe já são ferramentas presentes para metadados, proxy e export; decidir depois se preview deve usar `<video>`, FFmpeg ou um decoder dedicado com base em compatibilidade e perfil.
- Preservar uma função única `resolveScene(time)`/`renderScene(frame)` para prévia e export. O preview pode ser aproximação de codec, mas geometria, poses, camadas, texto, volume e duração devem manter resultado verificável.

### Fase 4 — otimizar desenho somente após medir

- Manter painéis e inspector em React. A timeline em React/DOM está virtualizada por tempo para clips e transições; só migrar sua superfície para Canvas se um projeto de muitos milhares de blocos mostrar custo de DOM/layout.
- Continuar com palco SVG para imagens e alguns personagens. Comparar Canvas2D/OffscreenCanvas quando perfis mostrarem re-render, layout ou paint como gargalo; comparar WebGL/WebGPU se composição e upload de textura dominarem.
- Considerar addon C++/Rust apenas para decode, composição ou leitura de pixels que apareça como CPU-bound. Um addon não remove cópias de memória ou trabalho feito no processo React por si só.
- Usar metas e relatórios separados para: inicialização, abrir/listar projeto, salvar, seek/play, bake de animações e export. Otimização de uma métrica não deve regressar as demais.

## Fronteiras arquiteturais recomendadas

- **Editor V6:** schema, timeline, histórico, transições, importação, cache de preview e export do V6.
- **Plataforma compartilhada:** IPC seguro, diálogo de arquivo, armazenamento por domínio, backup, logs, hash/protocolo de mídia e diagnósticos.
- **Fabricador/Customizer:** são autores das bibliotecas e personagens. O V6 consulta e captura snapshots por APIs formais, sem importar módulos internos dessas features.
- **Studio Principal:** permanece projeto independente. O V6 não importa o modelo nem os componentes dele. A checagem `scripts/architecture/check-boundaries.cjs` deve continuar bloqueando novas importações runtime entre features.
- **Base de Vídeos/Roteiros:** biblioteca atual separada do V6; no futuro pode oferecer uma operação explícita de importação, que faz a cópia definida pelo contrato do V6.

## Fontes técnicas e pesquisa comparativa

As fontes e os limites de comparação estão no relatório [DESEMPENHO_E_FLUIDEZ.md](DESEMPENHO_E_FLUIDEZ.md). As conclusões centrais são: Electron recomenda profiling e trabalho pesado fora do processo visual; WeftCut mostra store de playhead/filas limitadas e engine de mídia nativo; Descript relata ganhos ao reduzir cópias entre decode e GPU; Clipchamp documenta trabalho local usando tecnologias de browser com armazenamento cloud opcional; Premiere UXP mostra como uma UI HTML/JavaScript pode coexistir com motor desktop nativo. Esses exemplos não dão FPS transferível ao V6.

Fontes oficiais consultadas:

- [Electron: modelo de processos](https://www.electronjs.org/docs/latest/tutorial/process-model), [IPC](https://www.electronjs.org/docs/latest/tutorial/ipc), [isolamento de contexto](https://www.electronjs.org/docs/latest/tutorial/context-isolation) e [sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox).
- [Desempenho no Electron](https://www.electronjs.org/docs/latest/tutorial/performance) e [renderização offscreen](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering).
- [electron-vite: ambiente](https://electron-vite.org/guide/) e [compilação](https://electron-vite.org/guide/build).
- [React: `memo`](https://react.dev/reference/react/memo) e [Zustand: evitar renderizações desnecessárias](https://zustand.docs.pmnd.rs/learn/guides/prevent-rerenders-with-use-shallow).
- [Immer: desempenho](https://immerjs.github.io/immer/performance/) e [Zod: validar dados](https://zod.dev/basics).
- [FFmpeg](https://ffmpeg.org/ffmpeg.html), [codificadores](https://ffmpeg.org/ffmpeg-codecs.html), [Node.js worker threads](https://nodejs.org/api/worker_threads.html), [Sharp](https://sharp.pixelplumbing.com/performance/) e [Vitest](https://vitest.dev/guide/).

## Próxima decisão técnica

Antes de trocar a tecnologia gráfica, registrar a memória e o tempo de três operações usando projetos representativos: abrir biblioteca sem carregar PNGs; abrir projeto e salvar após editar texto versus alterar asset; Play com 1/3 personagens e vários atlas. Em seguida implementar o carregamento sob demanda e a gravação incremental dos assets, porque essas mudanças eliminam trabalho conhecido sem reescrever o motor visual. A pipeline de vídeo deve começar depois, com importação copiada, proxies/cache e clips com tempo de origem, mantendo a experiência de personagem como uma camada da composição.
