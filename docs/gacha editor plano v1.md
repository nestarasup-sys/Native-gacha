# Plano inicial — Animações do Editor Gacha

**Status:** rascunho inicial, baseado nas regras já descritas pelo usuário.  
**Escopo desta versão:** organizar o conceito da timeline e os comportamentos conhecidos. Ainda não define a implementação final.

## Visão da timeline

A primeira versão terá faixas de **personagem**, **fala**, **pensamento**, **vídeo** e **áudio**. Cada faixa poderá conter **blocos independentes** que determinam o que aparece e por quanto tempo.

Um bloco de personagem representa uma imagem parada da cena: pose, expressão e demais escolhas naquele trecho. O estado permanece até o próximo bloco começar. Trocar de bloco não precisa gerar movimento automaticamente; pode ser uma troca direta ou uma transição configurada.

Blocos de faixas diferentes podem se sobrepor. A fala e o pensamento podem acontecer enquanto o bloco visual do personagem ou um clipe de vídeo continuam ativos. O áudio original de cada clipe de vídeo começa ligado e pode ser silenciado; faixas de áudio independentes podem tocar junto.

## Decisões confirmadas para a primeira versão

- Importar personagens/imagens Gacha, texto, vídeos e áudios externos desde o início.
- Exportar prioritariamente em **MP4, 1920×1080 (1080p), 30 FPS**.
- Manter blocos/faixas de fala, pensamento, personagem, vídeo e áudio independentes e sobreponíveis.
- Copiar cada vídeo/áudio importado para a mídia gerenciada pelo projeto, para que o projeto continue portátil.
- Manter o áudio original de um clipe de vídeo ligado por padrão; permitir silenciá-lo por clipe.

## Comportamentos conhecidos

### Pose e expressão

- Cada bloco visual mantém a pose e o preset de expressão escolhidos, sem movimento contínuo por padrão.
- Ao trocar para outro bloco visual, pode existir uma transição entre a pose anterior e a nova, ou entre o preset anterior e o novo.
- A duração inicial recomendada para essas transições é **250 ms**. Ela pode ser ajustada quando o usuário quiser uma troca mais rápida ou mais lenta.

### Fala e boca

- Um bloco de fala contém o texto e identifica o personagem que está falando.
- Enquanto o bloco estiver ativo, o personagem assume a forma de boca **Talk**.
- Por padrão, Talk é uma imagem parada com a boca aberta. A boca só se mexe se o usuário adicionar uma animação de boca.
- Ao terminar o bloco de fala, a boca volta à forma definida pelo estado visual ativo.

### Pensamento

- Um bloco de pensamento exibe o texto associado, mas não ativa Talk nem abre a boca.
- O personagem mantém a pose, a expressão e a boca do estado visual ativo.

### Piscada

- Piscar é uma troca curta entre a imagem de olhos abertos e a imagem de olhos fechados.
- A piscada não precisa animar o corpo ou a cabeça.
- O sistema pode fazer essa troca automaticamente em intervalos, sem exigir blocos manuais para cada piscada. Ainda será possível definir se o usuário pode desligar ou ajustar a frequência.

## Recomendação para o novo editor

Começar como um **editor de cenas por estados**, em vez de exigir que tudo seja animado quadro a quadro:

1. **Blocos visuais estáticos:** cada bloco guarda a pose e o preset de expressão que ficam ativos naquele intervalo.
2. **Faixas de fala e pensamento:** blocos de texto sobrepõem o estado visual. Fala ativa a boca Talk parada; pensamento não altera a boca.
3. **Trocas explícitas:** uma transição acontece somente quando configurada entre blocos. A opção inicial pode ser “troca direta” ou “transição de 250 ms”.
4. **Animações pequenas e opcionais:** piscada e movimento de boca são trocas de partes do rosto, independentes do bloco visual do corpo.
5. **Adicionar complexidade aos poucos:** começar sem exigir movimento corporal contínuo, sincronização labial automática ou edição quadro a quadro. Essas possibilidades podem ser adicionadas depois, se fizerem falta.

Assim, a timeline continua simples de montar e cada personagem pode ficar parado durante a cena. O usuário anima apenas as partes e as trocas que realmente quiser.

## Protótipos existentes

O **Animador DEV** e o **Animador Preset DEV** contêm uma base experimental para explorar animações e presets.

Essas ferramentas são **protótipos**, não a especificação nem a arquitetura final do Editor Gacha. Podem servir como referência visual e conceitual, mas suas limitações e decisões internas não devem ser tratadas automaticamente como requisitos definitivos.

## Decisões em aberto

- Unidade interna de tempo e sincronização de áudio, vídeo e animações.
- Como o usuário escolhe os estados visuais dentro de cada bloco.
- Se a piscada automática poderá ser desligada e como ajustar sua frequência.
- Como o Talk se combina com presets que também alteram olhos ou boca.
- Como a troca direta e a transição de 250 ms aparecem e são editadas na timeline.
- Se, futuramente, o movimento de boca será feito com poses desenhadas pelo usuário ou por outro método.

## Análise do app atual e recomendação tecnológica

**Revisão do código:** 24/10/2026. O Editor Gacha é um produto novo e independente. Esta análise observa tecnologias e capacidades gerais do restante do app; o Studio Principal não é referência de layout, timeline, projeto ou persistência.

### O que o restante do app já oferece

- O app usa Electron 44.7.1, React 19.2 e TypeScript. Não há atualmente uma engine ou biblioteca de timeline instalada; isso permite começar com uma solução sob medida e pequena.
- O Fabricador já envia operações de processamento de imagem para Web Workers em vários fluxos. Esse padrão pode ser reaproveitado para trabalho pesado.
- O restante do app tem um renderizador compartilhado de personagens com composição em Canvas 2D e buffers de face/corpo preparados. Ele pode ser avaliado como fornecedor de personagens, mas não determina a arquitetura do Editor Gacha nem obriga o novo editor a reutilizar sua composição interna.
- O Studio Principal é uma ferramenta separada e não serve de referência para a tela, a timeline, o modelo de projeto ou o salvamento do Editor Gacha. As decisões do novo editor serão desenhadas do zero para este produto.
- Alguns fluxos existentes do app transportam imagens como Data URLs. Para o Editor Gacha, recomendo um contrato próprio que armazene referências a assets e metadados, sem copiar imagens/vídeos grandes em cada atualização.
- A tela principal do Electron tem bastante responsabilidade concentrada em `electron/main.ts`; o banco SQLite usa `better-sqlite3`, que tem chamadas síncronas. Nenhuma leitura de projeto, codificação de mídia ou renderização de quadro deve entrar no caminho síncrono do processo principal.
- Há cache de imagens de personagem com limite por quantidade de entradas. Uma imagem grande pode consumir muito mais memória que uma pequena, então o novo editor precisa controlar cache pelo custo aproximado em bytes/pixels, e não só por número de imagens.

### Arquitetura recomendada

A meta inicial confirmada é importar vídeo e áudio externos e produzir MP4 1080p/30 FPS.

1. **Manter Electron, React e TypeScript.** O app já tem essas tecnologias, e o formato de editor proposto não justifica uma migração para C++ ou outro framework.
2. **React para a interface; Canvas 2D para a prévia composta.** Faixas, inspector, botões e edição de texto continuam em React. A imagem final da cena é desenhada em uma superfície Canvas com as camadas visuais necessárias.
3. **Timeline por dados esparsos.** Guardar início/fim como ticks inteiros em uma base comum de 48.000 ticks por segundo. Isso representa 250 ms e alinha o padrão de 30 FPS a 1.600 ticks por quadro. Um bloco parado ocupa um intervalo; não criar um objeto por quadro. Consultar somente os blocos ativos no instante atual e os blocos visíveis na janela da timeline.
4. **Reprodução sem rerender global.** O relógio da reprodução usa `requestAnimationFrame` para manter o tempo visual e atualizar apenas o playhead/prévia necessária. Não chamar `setState` da página inteira em cada quadro, nem ordenar ou clonar todos os blocos durante a reprodução.
5. **Separar a prévia do editor de timeline.** A prévia renderiza a cena atual. A timeline desenha ou monta somente a região visível e os blocos próximos. Começar com DOM virtualizado; se a medição mostrar custo alto com muitas faixas/blocos, desenhar a área central da timeline em Canvas.
6. **Usar Web Workers com transferência de buffers.** Cálculo de blocos ativos, thumbnails, waveform e composição cara podem sair da thread visual. `OffscreenCanvas` pode ser testado para a prévia em worker, com caminho de compatibilidade no renderer normal. Não transferir imagens enormes como base64 em cada atualização.
7. **Limitar tudo que cresce.** Cache LRU com orçamento de memória; pré-carregar apenas mídia perto do playhead; gerar miniaturas/proxies de preview; liberar bitmaps e frames ao fechar ou trocar de projeto; fila limitada para descodificação e exportação. O projeto guarda metadados e referências, enquanto os binários ficam separados.
8. **Autosave incremental.** Salvar metadados alterados em lotes após pausas curtas e manter escrita fora do frame de reprodução. Não regravar nem reserializar a mídia do projeto quando só mudou o playhead.

### Exportação sem travar o app

- Fazer a exportação como trabalho independente da janela, executado em Web Worker e/ou processo utilitário do Electron. A tela continua responsiva, mostra progresso e pode cancelar.
- Renderizar os quadros pelo mesmo modelo visual da prévia, mas em lotes limitados. Evitar capturar a janela com `MediaRecorder` como único caminho: isso acopla o resultado à taxa de atualização da tela e à velocidade de reprodução.
- Avaliar **WebCodecs** como caminho rápido quando o codec adequado estiver disponível. A codificação é assíncrona, mas a fila precisa de limite e cada `VideoFrame` precisa ser liberado. WebCodecs produz chunks codificados; ainda é necessário muxar áudio/vídeo em um arquivo/container compatível.
- Manter um backend de exportação alternativo com FFmpeg empacotado se a comparação em máquinas Windows mostrar diferenças de codec ou falhas de compatibilidade. Executar FFmpeg fora do processo principal, com versões/licenças documentadas e sem transportar frames como Data URLs.
- Não escolher entre WebCodecs e FFmpeg só por promessa de velocidade. Fazer um protótipo curto e medir em hardware real: tempo total, FPS exportados, uso de CPU/GPU, RAM/VRAM, tamanho final, qualidade e estabilidade. O caminho rápido pode variar conforme GPU, driver e codec instalado.
- Saída inicial confirmada: MP4 1080p a 30 FPS. A base temporal interna de 48.000 ticks/s mantém transições de 250 ms e sincronismo de áudio precisos; 60 FPS pode ser avaliado depois, sem alterar o projeto.

### Leitura das capacidades e riscos gerais do app

- O Fabricador já tem bons exemplos de workers para tratamento pesado de imagens. Essa é a parte que mais diretamente ajuda a proteger a responsividade.
- O renderizador de personagens usa Canvas e buffers de composição, mas o helper `canvasSurface.ts` apenas prevê o uso de OffscreenCanvas quando chamado dentro de um worker; a composição comum ainda é executada pelo renderer. Só mover essa composição para worker se o profiler mostrar que ela ocupa o frame.
- Alguns caminhos atuais serializam ou transportam imagens como Data URLs. O Editor Gacha deve definir seu próprio contrato de mídia: IDs e referências controladas, alterações de metadados e lotes pequenos.
- A janela já usa `contextIsolation`, `nodeIntegration: false` e sandbox. Manter esse limite: workers recebem só dados necessários; o renderer não ganha acesso direto ao filesystem ou ao banco.

### Como evitar regressões de desempenho

Antes de ampliar funcionalidades, definir projetos sintéticos de referência: cena curta com personagens, timeline longa com muitos blocos, imagens de tamanhos variados, vídeos com taxas diferentes, áudio e exportações MP4 1080p/30 de 1, 5 e 10 minutos. Medir no Windows-alvo:

- atraso de arraste/edição e tempo de resposta ao clicar;
- quadros perdidos e tempo de cada frame durante playback;
- tempo para abrir, salvar e trocar de projeto;
- pico de RAM/VRAM e tamanho dos caches;
- velocidade de exportação em relação à duração do projeto;
- cancelamento, retomada segura e integridade do arquivo produzido.

A aprovação deve se basear em metas medidas em uma máquina de referência e em pelo menos uma máquina mais limitada. Se uma mudança piorar um desses indicadores, reduzir o escopo ou otimizar antes de adicionar novas faixas/efeitos.

### Documentação técnica consultada

- [Electron: performance](https://www.electronjs.org/docs/latest/tutorial/performance) — evitar bloquear main/renderer e medir antes de otimizar.
- [Electron: process model](https://www.electronjs.org/docs/latest/tutorial/process-model) e [utility process](https://www.electronjs.org/docs/latest/api/utility-process) — isolamento de tarefas pesadas em outro processo.
- [React: Profiler](https://react.dev/reference/react/Profiler) e [memo](https://react.dev/reference/react/memo) — medir commits e reduzir rerenders somente onde houver evidência.
- [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) — transferir renderização de Canvas para Worker quando suportado.
- [Chrome: processamento de vídeo com WebCodecs](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs) e [MDN: filas e ciclo de vida do WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Using_the_WebCodecs_API) — codificação por chunks, controle de fila e liberação de frames.


## Como construir o Editor Gacha como produto profissional

O Editor Gacha deve nascer como uma aplicação de edição própria dentro do app Electron, com contratos, projeto, interface e pipeline de renderização independentes. As tecnologias do restante do app são ferramentas disponíveis, não um modelo de produto.

### Camadas do novo editor

1. **Shell desktop — Electron.** Janela, menus, atalhos globais, diálogos de arquivos, atualização e integração com o sistema. O `main` coordena janelas e permissões; não calcula quadros, mistura áudio ou codifica vídeo.
2. **Interface — React + TypeScript.** Painéis, faixa de ferramentas, inspector, biblioteca de assets, timeline, seleção e comandos. Componentes pequenos e estado separado por faixa/seleção para que mudar o playhead não redesenhe todos os painéis.
3. **Núcleo da timeline — TypeScript puro.** Um módulo sem React/Electron que valida projeto, converte tempo em quadro, encontra blocos ativos, calcula a pose/expressão/boca/olhos em um instante e resolve sobreposições. Esse núcleo é a fonte de verdade para prévia e exportação.
4. **Prévia — Canvas 2D primeiro.** O motor compõe as camadas visíveis em uma superfície própria do Editor Gacha. React desenha a moldura e os controles, sem criar um nó DOM por peça visual ou por quadro. Se medições mostrarem que Canvas 2D não atende projetos-alvo, comparar WebGL como uma otimização isolada, preservando o mesmo núcleo da timeline.
5. **Trabalho em segundo plano — Web Workers.** Cálculo/consulta de timeline, thumbnails, leitura de waveform e renderização podem usar workers. `OffscreenCanvas` é uma opção de renderização no worker, com fallback no renderer quando indisponível. Não habilitar Node dentro de worker: manter o sandbox atual do Electron e mandar operações de arquivo pelo preload/IPC autorizado.
6. **Persistência do projeto — formato próprio versionado.** Manifesto compacto com schema, faixas, blocos, referências de mídia e preferências; arquivos binários ficam separados e endereçados por ID/hash. Não incluir Data URLs gigantes em cada bloco. Autosave por alterações, recuperação após queda e migrações de schema explícitas.
7. **Exportação — backend substituível.** Interface interna `ExportBackend` com seleção de backend após prova de desempenho. WebCodecs pode fornecer um caminho de codificação acelerada; FFmpeg pode ser fallback de compatibilidade executado em processo utilitário. O projeto não deve depender de detalhes específicos de nenhum backend.

### Modelo de dados inicial

- Um projeto tem base temporal, taxa e tamanho de saída, faixas, assets referenciados e preferências de áudio.
- Cada bloco guarda `id`, faixa, início/fim em ticks inteiros e somente as propriedades que muda.
- Um asset de vídeo guarda duração, resolução, taxa de quadros, streams de áudio e referência ao arquivo original. Um asset de áudio guarda duração, canais e taxa de amostragem. Dados derivados, como thumbnails, proxies e waveform, ficam em cache recriável.
- No import, copiar o original para a pasta de mídia gerenciada pelo projeto e registrar metadados. Deduplicar arquivos idênticos por hash dentro do projeto. Gerar proxies, thumbnails e waveform em cache recriável, sem substituir o original.
- Bloco parado representa permanência de um estado; não precisa repetir a mesma imagem em cada quadro.
- Um bloco de fala tem texto, personagem associado e estilo; durante seu intervalo define o estado Talk da boca.
- Um bloco de pensamento tem texto e estilo, sem mudar a boca.
- Piscada é evento curto de olhos abertos/fechados. Talk parado é estado de boca; animação de boca só existe se houver poses/quadros configurados pelo usuário.
- Transição é dado próprio entre estados consecutivos: tipo, duração, curva e propriedades que podem mudar. 250 ms é a predefinição inicial; edição quadro a quadro fica opcional.
- Sobreposição é permitida entre faixas. Regras de prioridade definem, por exemplo, se o bloco Talk prevalece sobre a boca selecionada no estado visual e como o preset controla os olhos durante a piscada.
- Usar ticks inteiros de 48 kHz para edição e salvamento. O arquivo inicial sai em 30 FPS; timestamps variáveis da fonte são mapeados explicitamente para a base do projeto e amostrados de forma determinística na exportação.

### Desempenho desde o primeiro protótipo

- Virtualizar faixas/blocos fora da área visível; navegar em uma timeline com milhares de blocos não deve montar milhares de nós de interface.
- Consultar blocos ativos usando índice por intervalo, em vez de procurar e ordenar todos os blocos a cada atualização do playhead.
- Reproduzir usando tempo absoluto do relógio: se um quadro atrasar, o próximo é calculado no tempo correto. Não acumular atraso com `setInterval`.
- Canvas recebe apenas mudanças necessárias. Se a boca muda, não remontar todas as imagens do personagem. Se o playhead muda sem trocar estado, não reprocessar o projeto nem salvar.
- Limites de memória por bytes/pixels para imagens decodificadas e frames. Pré-carregar uma janela curta perto do playhead, liberar recursos de frames e descartar caches ao trocar de projeto.
- Exportação usa fila limitada com backpressure, grupos pequenos de quadros, cancelamento e limpeza garantida. Não deixar a fila de encoder crescer sem limite.
- Manter `contextIsolation`, `nodeIntegration: false` e sandbox. A thread de interface não lê arquivos diretamente.

### Roteiro de desenvolvimento

**Fase 0 — Contrato do produto**  
Fechar comportamento de estados/blocos, prioridades de Talk/piscada/preset, duração da transição, base temporal, sincronismo e codecs/container do MP4 inicial (1080p/30 já definidos). Desenhar o fluxo e o formato de projeto sem aproveitar o documento do Studio.

**Fase 1 — Núcleo independente**  
Implementar tipos versionados, comandos de edição, undo/redo, índice temporal, cálculo determinístico do estado de um personagem em qualquer quadro e autosave recuperável. Ainda sem exportação.

**Fase 2 — Editor estático e mídia**  
Construir tela própria, faixas de personagem/fala/pensamento/vídeo/áudio, import gerenciado, blocos, zoom, rolagem, snap, seleção, mover/aparar, duplicar e prévia estática. Criar thumbnails, metadados e waveform em segundo plano. Medir o projeto sintético de referência antes de adicionar efeitos.

**Fase 3 — Animações por estados**  
Adicionar transições entre pose/preset, piscada por troca de olhos, Talk parado e opção de animação de boca. Usar a mesma avaliação determinística no pause, scrub, playback e export.

**Fase 4 — Playback robusto**  
Adicionar relógio mestre de áudio, vídeo sincronizado, pausa, scrub, salto para marcador, descarte controlado de quadros atrasados, cache limitado e relatório de frames perdidos. Fazer perfil em máquina de referência e em uma máquina mais fraca.

**Fase 5 — Exportação MP4**  
Comparar um protótipo WebCodecs e outro FFmpeg isolado no mesmo projeto e hardware. Validar MP4 1080p/30 com vídeo, áudio AAC, codec H.264, qualidade, sincronismo, cancelamento, falhas, RAM, velocidade e reprodução do arquivo final. Escolher backend principal pelos resultados e manter fallback se necessário.

**Fase 6 — Acabamento profissional**  
Recuperação de autosave, backup/export de projeto, migração de versão, atalhos configuráveis, painéis redimensionáveis, barra de progresso, logs de suporte sem mídia pessoal, testes de carga e pacote Windows verificado.

### Critérios de qualidade antes de liberar

- Mesma imagem no preview parado e no quadro exportado.
- Scrub/arraste responsivo em projetos grandes de referência; nenhuma alteração do playhead dispara salvamento do projeto.
- Playback não entra em atraso crescente; atrasos são medidos e exibidos em relatório de diagnóstico.
- Exportação deixa a janela utilizável, informa progresso, cancela sem corromper projeto e fecha todos os frames/arquivos temporários.
- Projeto reabre após interrupção usando autosave e mantém os assets vinculados.
- Memória permanece limitada em uso longo, troca repetida de projetos e exportações consecutivas.
- Benchmark registra duração do projeto, resolução, FPS, dispositivo, backend, tempo, pico de memória e qualidade para cada execução.

A arquitetura reduz os riscos de timeline lenta, congelamentos e exportação instável, mas nenhuma tecnologia garante o mesmo resultado em todo hardware. O desempenho precisa ser aprovado por medições no PC-alvo e por pelo menos uma máquina mais limitada.

### Referências oficiais de tecnologia

- [Electron: performance](https://www.electronjs.org/docs/latest/tutorial/performance) — trabalho caro fora das threads que atendem a interface.
- [Electron: multithreading](https://www.electronjs.org/docs/latest/tutorial/multithreading) — uso e limites de Web Workers no Electron.
- [Electron: Utility Process](https://www.electronjs.org/docs/latest/api/utility-process) — processo isolado para tarefas CPU-intensivas e com risco de falha.
- [Chrome: WebCodecs](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs) — detecção de suporte, codificação assíncrona e transferência de frames.
- [FFmpeg: licenças e distribuição](https://www.ffmpeg.org/legal.html) — a licença depende das opções e bibliotecas incluídas no binário distribuído.
