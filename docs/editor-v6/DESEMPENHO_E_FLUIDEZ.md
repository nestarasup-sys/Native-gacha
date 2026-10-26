# Fluidez e desempenho das animações — avaliação do Editor V6

**Pesquisa iniciada e ampliada em 26/10/2026.** Este documento reúne a inspeção do código, o hardware detectado, fontes oficiais, documentação e código de outros editores, além de um plano de decisão por medições. Ele distingue fatos já confirmados de hipóteses que ainda precisam de um perfil com um projeto Gacha representativo.

## Conclusão executiva

**Electron + Chromium não impedem um editor de vídeo/animado de ser fluido.** O Electron usa o motor Chromium para a interface e oferece workers, composição pela GPU e renderização offscreen. A própria documentação diz que desempenho depende de medir e otimizar o trabalho da aplicação, e não de simplesmente escolher Electron ou C++.

O Editor V6 já toma boas decisões: não recompõe a personagem a cada quadro da reprodução; pré-calcula até sete recortes por troca de pose/expressão; reutiliza esse atlas durante o seek, preview e export; compartilha o mesmo desenho de cena com o exportador; e envia renderização/captura do export para janelas ocultas. Isso deixa o caminho de reprodução muito mais leve que o de preparação.

Há, porém, dois limites concretos visíveis no código atual:

1. **A reprodução avança em quadros inteiros a 30 FPS.** O relógio calcula `floor(tempo × 30)`. Portanto a prévia não atualiza a animação a 60 FPS, mesmo que o monitor consiga apresentar 60/120 Hz. Em 250 ms, a transição tem sete imagens intermediárias; em tela de 60 Hz cada imagem pode ficar visível por cerca de 33 ms.
2. **O teto de 8,1 milhões de pixels vale por atlas, não pelo projeto inteiro.** Um atlas RGBA de 8,1 MP ocupa aproximadamente 31 MiB descomprimido; PNG comprimido e texto Base64 variam por desenho. Muitos blocos animados podem aumentar o JSON do projeto, memória de CPU/GPU e tempo de carregar/salvar. O limite individual não é uma meta recomendada para todos os atlas.

**Recomendação:** manter Electron + React + TypeScript + FFmpeg. A próxima decisão de tecnologia deve vir de um perfil em cenas reais. A primeira melhoria a avaliar é um modo de preview de 60 FPS, independente da timeline/export de 30 FPS. Em paralelo, adicionar um orçamento global de memória por projeto para os atlas. Prototipar em Canvas2D/OffscreenCanvas só se o perfil mostrar que o desenho SVG/React ou o compositor são o gargalo. Considerar C++ apenas para uma etapa de CPU identificada e isolável. WebGPU ou substituição do app inteiro não são o próximo passo indicado.

A pesquisa comparativa reforçou essa conclusão. Editores desktop e web com a mesma família de tecnologias usam motores de composição dedicados, workers, limites explícitos de fila e memória e, em alguns casos, módulos nativos. Isso não prova que o V6 precise copiar esse nível de complexidade: ele anima imagens de personagem pré-calculadas, um caso mais simples que decodificar várias faixas de vídeo. A lição é separar a interface do trabalho por quadro e medir as cópias de imagem antes de trocar o renderer.

## O que examinei no projeto

- A aplicação usa Electron e React/TypeScript. O Electron instalado no workspace é **44.9.3**; a tabela oficial lista Chromium **152.0.7977.167** para essa versão.
- O hardware deste workspace é **AMD Ryzen 5 4600G (6 núcleos / 12 threads), Radeon RX 7600 e 15,4 GB de RAM**. O computador contém também vídeo integrado AMD. Não medi ainda qual GPU o processo Chromium seleciona, a frequência real do monitor nem carga térmica.
- A tela principal é uma janela Chromium normal, com `backgroundThrottling: true`. A prévia não é a janela offscreen do exportador. A janela de exportação é offscreen; as duas partes do Turbo são renderizadas em paralelo.
- O relógio da prévia usa `requestAnimationFrame`, mas transforma o tempo em quadro inteiro com `Math.floor((now-started) * 30 / 1000)`. A timeline e o MP4 também trabalham a 30 FPS.
- A resolução da cena atual seleciona o estado do personagem pela posição do playhead. O resolvedor guarda índices da timeline e da animação por referência ao documento. Dentro do trecho animado, o trabalho por quadro é principalmente localizar um dos até sete sprites e apresentar seus valores.
- `SceneSurface` é um SVG React. Personagens e objetos aparecem como imagens; o sprite animado é um recorte de atlas. A camada da cena é memoizada, então estados de objetos que mantêm a mesma referência podem ser reaproveitados; só a personagem que anima precisa mudar.
- A geração do atlas usa o renderizador canônico do V6 e acontece em Chromium oculto com fila serial. Uma troca de pose pode preparar os dois extremos e até sete rigs intermediários; uma troca só facial reutiliza um único rig. Existe cancelamento e liberação de canvas.
- Cada atlas admite até aproximadamente 8,1 MP, até sete sprites e dimensões de textura limitadas. O cache de trabalho do renderer limita resultados recentes, mas os atlas usados continuam no documento para o projeto permanecer portátil. Não há hoje um orçamento agregado em bytes/pixels para todos os atlas do projeto.
- Para exportar, o app captura bitmap BGRA de janelas offscreen e o FFmpeg codifica as partes. A opção Turbo usa dois renderizadores ao mesmo tempo. Isso é um caminho separado da prévia interativa.
- O computador tem uma GPU dedicada boa para desenho e um processador de seis núcleos, mas isso por si só não prova que o app está usando a GPU dedicada nem garante 60 FPS. É necessário conferir o adaptador de Chromium/Windows e medir o processo real.

As afirmações sobre o código acima são uma inspeção estática. Os testes sintéticos já confirmam que uma peça e uma boca se movem entre os sprites e que a emenda Turbo não congela o atlas. **Eles não medem a fluidez de um projeto real com roupas, efeitos, personagens grandes e muitos atlas.** A amostra sintética de 100×100 não serve para prever o tempo de preparação de sprites reais.

## Onde Electron ajuda e onde tem custo

O Chromium do Electron consegue compor cenas usando aceleração gráfica e processar trabalho fora do thread da interface. Um desenho com alguns sprites transparentes, transformações 2D e textos cabe bem nesse modelo. Para transições pré-calculadas, a reprodução pode limitar-se a trocar recortes e posições no relógio da tela; não é necessário re-renderizar cabelo, roupa e rosto a cada tick.

O custo aparece quando trabalho pesado continua no thread visual, quando a cada quadro se copia pixels entre GPU e CPU, quando se mantém muita imagem descomprimida na memória, ou quando a aplicação atualiza mais do que consegue apresentar. O Electron também inclui Chromium e Node, então consome mais memória base que um pequeno binário nativo. Isso é diferente de dizer que o movimento será lento.

O modo offscreen de Electron não representa um limite de 30 FPS da janela principal: `setFrameRate` controla a pintura da janela offscreen. A documentação do Electron distingue composição GPU, bitmap CPU e textura GPU compartilhada. A opção de textura compartilhada evita cópias CPU/GPU, mas é avançada e requer um módulo nativo; não deve ser adotada sem mostrar que a captura offscreen é o gargalo.

## O que “liso” significa neste produto

Uma timeline de 30 FPS permite um quadro novo a cada **33,3 ms**. Para a prévia parecer fluida em monitor de 60 Hz, o alvo razoável é atualizar a imagem animada a cada **16,7 ms**, preservando o relógio e os pontos de edição da timeline em 30 FPS. Isso requer distinguir tempo de preview (contínuo/60 Hz) de tempo editável/exportável (quadro inteiro de 30 FPS).

No desenho atual, cada pose intermediária é uma imagem inteira do personagem. Reproduzir a 60 Hz não pode apenas segurar cada uma das sete imagens por dois refreshes sem aumentar os degraus. Um experimento honesto precisa preparar até cerca de **15 amostras por transição de 250 ms**, e então medir custo de bake, tamanho do atlas e qualidade. O export 30 FPS continua escolhendo os instantes correspondentes a seus quadros; a timeline JSON pode continuar em 30 FPS.

60 FPS melhora a cadência de movimento; não corrige poses que parecem erradas. A qualidade também depende de pivôs, ancoragem das peças, roupas e escolha do instante de troca de desenho. Os pivôs explícitos já são interpolados no V6, mas não existe um novo solver de cinemática inversa que garanta encaixe de qualquer rig.

## Hipóteses de gargalo, em ordem

1. **Cadência atual da prévia: comprovado no código.** O clock é discretizado em 30 FPS. É a primeira limitação se a expectativa é movimento de 60 FPS.
2. **Memória cumulativa dos atlas: risco estrutural comprovado, impacto ainda não medido.** O teto é por transição. Além da imagem PNG no projeto, Chromium pode manter uma cópia decodificada na memória da imagem e texturas. Número de transições × área × resolução do personagem será determinante.
3. **Preparação de trocas de pose: provável custo de edição inicial, não do Play.** Até nove renderizações do rig por transição de pose. A fila é serial para limitar memória e concorrência. Um projeto com muitas fronteiras pode ficar aguardando preparo.
4. **Desenho de cena React/SVG: ainda sem perfil.** O cenário tem componentes memoizados e busca de animação limitada, o que é adequado para poucos elementos. Verificar CPU do renderer e pintura do Chromium antes de reescrever em canvas.
5. **Leitura de pixels ao criar atlas: custo local de bake.** O código varre alpha via `getImageData`; não ocorre a cada quadro do Play. Não otimizar esse caminho às custas da reprodução sem medir tempo do bake.
6. **Exportação 1080p: custo distinto.** Um quadro BGRA 1920×1080 cru tem aproximadamente 7,9 MiB. Captura offscreen, cópias para CPU e duas instâncias simultâneas podem exigir bastante RAM/largura de banda. O Turbo acelera algumas máquinas, mas aumenta concorrência.
7. **GPU escolhida pelo Chromium: desconhecido neste workspace.** Há Radeon 7600 e uma GPU integrada. Confirmar GPU ativa no Gerenciador de Tarefas/`chrome://gpu` via ferramentas do próprio app antes de supor aceleração.

## Plano de medição antes de escolher arquitetura

### Cenas de referência

Usar uma cópia isolada do mesmo projeto e marcar sua revisão/configuração, sem sobrescrever arquivos reais:

- A: cena estática, um personagem.
- B: uma transição facial e uma transição de pose.
- C: três personagens animando no mesmo intervalo.
- D: cena representativa do usuário com cabelo, roupas, efeitos faciais e o maior tamanho usual.
- E: maior projeto planejado, repetindo transições por pelo menos um minuto.

Repetir com prévia em tamanho de painel, preview em tela maior e exportação 1080p. Separar o modo CPU/GPU do FFmpeg, a exportação Turbo e o Play; seus tempos não são a mesma métrica.

### Métricas

Registrar por 60 segundos em repouso e em movimento:

- Intervalo entre quadros apresentados: mediana, p95 e p99.
- Quadros acima de 16,7 ms e 33,3 ms; contagem de quedas e pausas acima de 100 ms.
- Tempo de bake por rig, total por transição e tempo até a fila ficar pronta.
- Bytes PNG por atlas e soma por projeto; memória privada do renderer, processo GPU e total do app antes/depois de abrir, tocar e fechar o projeto.
- Uso de CPU por processo e GPU 3D/cópia/Video Encode durante Play, bake e export.
- Tempo de interação na timeline: arrastar bloco, seek e selecionar personagem.

A gravação do Performance panel e a sobreposição de frames do Chromium distinguem frame renderizado, parcial e perdido; o overlay também mostra GPU raster e uso de memória de GPU. Manter mesma resolução e mesma cena ao comparar alternativas. Sem registrar essas métricas, “parece melhor” não identifica a causa.

### Critérios de aceite para a experiência

- Play em foreground de uma cena comum: alvo **60 FPS apresentado** se a tela suportar, com p95 até 16,7 ms e sem pausas visíveis. Em hardware/driver que não sustenta isso, degradação previsível a 30 FPS sem atrasar o relógio.
- Timeline e controles permanecem interativos; nenhum bake/export longo ocupa o thread da interface.
- Duração do movimento e chegada ao estado seguinte permanecem determinísticas em 30 FPS no MP4.
- Atlas e projeto permanecem dentro de orçamento global mensurado; abrir/salvar projeto não vira segundos de bloqueio.
- Exportação pode ser mais lenta que reprodução, mas não muda duração, não perde quadros e libera memória ao terminar.

Os valores acima são alvos de engenharia a confirmar com a cena e o hardware real, não medições já obtidas.

## Solução recomendada em etapas

### 1. Medir a linha de base

Registrar foreground com DevTools Performance/FPS, Windows Task Manager e um projeto de referência. Comparar quadro atual de 30 FPS com a capacidade da tela. Registrar as versões reais do app e Chromium. Verificar se renderer, GPU process ou FFmpeg fica saturado. Separar custo para preparar uma transição do custo para exibi-la.

### 2. Fazer um experimento isolado de preview 60 FPS

Sem mudar a resolução/semântica da timeline nem a exportação, representar o playhead de reprodução com tempo fracionário. Gerar até quinze amostras internas por 250 ms, respeitando o tempo exato da transição, e selecionar a amostra pela cadência do monitor. O exportador de 30 FPS consulta seus quadros inteiros como antes. Comparar 30 versus 60 em cena B e D: fluidez visual, tempo de preparação e bytes agregados.

Não interpolar dois PNGs inteiros por dissolução: isso cria fantasmas e não equivale a interpolar braços/face. Se não der para gerar quinze quadros dentro do orçamento, manter o corte/30 FPS naquela fronteira e indicar a degradação.

### 3. Dar ao projeto um orçamento total de atlas

Medir PNG real comprimido e memória aproximada descomprimida. Estabelecer limite global por projeto com alertas; reduzir as amostras/resolução do atlas antes de chegar ao teto; conservar em arquivo somente transições requeridas pelo projeto; regenerar sob demanda em cache temporário quando fizer sentido. Versionar qualquer mudança do formato do atlas. Não deixar cada transição consumir seu próprio máximo sem considerar o conjunto.

O SVG da cena aponta para o PNG completo do atlas e muda o `viewBox` para mostrar cada recorte. Assim, ao usar um atlas, o Chromium pode decodificar a imagem inteira mesmo que o recorte ativo seja pequeno. Uma direção de armazenamento é persistir PNG como arquivo de asset binário e manter ID/checksum/metadados no JSON, em vez de transformar todos os megabytes em texto Base64 dentro do documento. Isso requer migração portátil cuidadosa e só vale se salvar, abrir ou memória comprovadamente doer.

### 4. Só então comparar backends gráficos

Se a gravação mostrar gargalo no thread React/SVG ou muitas repinturas, experimentar um Canvas2D dedicado para o palco, com `OffscreenCanvas` em worker, sprites e elementos imutáveis. Manter controles, inspector, foco e timeline em React. Medir o custo de transferir `ImageBitmap` e atualizar/invalidar texturas. Comparar a saída com a atual antes de migrar a prévia.

Se a gravação mostrar GPU saturada ou alto custo de muitas operações de composição, aí comparar WebGL/WebGPU com a mesma cena. WebGPU tem requisitos de adaptador, aceleração/driver e contexto seguro. No Windows, o Chromium pode escolher somente um adaptador e não necessariamente o de alto desempenho. No Windows, Chromium usa um adaptador por vez e pode manter a escolha de GPU do perfil do sistema; por isso, ter uma RX 7600 não prova que a prévia esteja sendo executada nela. Confirmar em `chrome://gpu` ou no diagnóstico do processo; a orientação oficial do [Chromium para WebGPU no Windows](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips) descreve essa limitação.

### 5. Tratar codificação separadamente

Manter o FFmpeg para mux de áudio, validação, montagem segura e fallback. O WebCodecs pode acessar codificadores disponíveis no browser e executar trabalho assíncrono; é uma hipótese para comparar se o perfil mostrar que codificação domina o export. Não presumir que seja sempre acelerado ou mais rápido: consultar `isConfigSupported`, encoder selecionado, fila, memória e qualidade. Uma migração exige ainda mux, compatibilidade MP4, cancelamento, fallback e os testes de saída que o FFmpeg já cobre.

### 6. Usar C++ apenas em gargalo delimitado

Electron aceita módulos nativos para operações intensivas. Um módulo de geometria ou composição pixel a pixel pode ser apropriado se perfil comprovar que essa operação CPU-bound domina e se a interface mantiver contrato por IPC/worker. Não reescrever as telas, timeline, persistência e controles em C++ sem uma evidência que justifique custo de reimplementação e perda temporária de funcionalidades.

## Decisão sobre tecnologias

| Opção | Veredito para o V6 | Motivo |
| --- | --- | --- |
| Electron + Chromium | **Manter** | Já entrega janela de desktop, UI React, SVG/imagens, workers e APIs gráficas atuais. Sem evidência de gargalo inevitável no runtime. |
| React + TypeScript | **Manter** | Bom encaixe para painel e timeline; manter fora do renderer de personagem o trabalho pesado de preparar sprites. |
| Atlas PNG pré-preparado | **Manter e limitar globalmente** | Bom para Play determinístico. Aumentar amostras só se o perfil 60 FPS justificar custo de memória e bake. |
| SVG atual | **Manter como referência** | Simples para camadas e seleção. Comparar Canvas somente se houver repintura/layout/React no perfil. |
| Canvas2D + OffscreenCanvas worker | **Primeiro candidato a protótipo de palco alternativo** | Pode tirar desenho do thread visual e reduzir overhead para muitas imagens; exige prova de transferência/captura e fidelidade. |
| WebGL / WebGPU | **Não adotar ainda** | Mais controle de GPU e pode ajudar muitas camadas/efeitos; adiciona complexidade, caminhos de fallback e requisitos de GPU. |
| FFmpeg atual | **Manter no primeiro ciclo** | Já tem mixagem, concatenação, validação, cancelamento e recuperação. Comparar WebCodecs só se a codificação ficar identificada como gargalo. |
| C++ / addon nativo | **Usar seletivamente** | Pode acelerar uma operação nativa identificada; não elimina custo de render React/Chromium e aumenta build/manutenção por plataforma. |

## Pesquisa oficial

- [Desempenho no Electron](https://www.electronjs.org/docs/latest/tutorial/performance): orienta a medir/profile e descarregar trabalho caro do thread visual/main.
- [Offscreen rendering no Electron](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering): explica bitmap, composição GPU, cópia GPU→CPU e textura compartilhada que requer módulo nativo.
- [Releases do Electron](https://releases.electronjs.org/): tabela de versão e Chromium; no workspace Electron 44.9.3 corresponde a Chromium 152.0.7977.167.
- [Código nativo com Electron](https://www.electronjs.org/docs/latest/tutorial/native-code-and-electron): addons C++/Rust podem implementar operações críticas isoladas.
- [OffscreenCanvas no Chromium](https://developer.chrome.com/docs/web-platform/offscreencanvas): renderização 2D fora do thread principal.
- [Processamento de vídeo com WebCodecs](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs): encode/decode e frames nos workers; configurações precisam ser testadas e a fila monitorada.
- [Problemas de compatibilidade/performance WebGPU](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips): GPU bloqueada, aceleração desligada, adaptador ausente e diferenças de plataforma.
- [FPS, quadros descartados e memória GPU no DevTools](https://developer.chrome.com/docs/devtools/rendering/performance): overlay de frames, estado de GPU raster e consumo de memória.
- [Chromium Canvas2D](https://developer.chrome.com/blog/canvas2d/): leitura de pixels via `getImageData()` pode ser cara; `willReadFrequently` permite otimização quando leitura é intencional.

## Pesquisa comparativa: editores que usam Electron, React ou Chromium

**Como ler esta comparação:** consultei READMEs, documentação de arquitetura e páginas oficiais dos projetos em 26/10/2026. “Suporta” ou “rápido” em um README é uma declaração do próprio projeto, não um benchmark independente. Estrelas e commits mostram atividade/alcance do repositório, mas não atestam qualidade, estabilidade ou desempenho. Os projetos abaixo servem como evidência de decisões de arquitetura possíveis.

### WeftCut — exemplo técnico mais próximo do V6 em stack e pipeline

[WeftCut](https://github.com/WeftCut/WeftCut) é um editor local em Electron 44, React 19, TypeScript e Zustand/Immer. Seu preview usa PixiJS com WebGPU/WebGL, WebCodecs para decodificar vídeo e Web Audio como relógio. O export usa worker, `OffscreenCanvas`, passagem de cor na GPU e FFmpeg; a aplicação também tem um núcleo Rust integrado via napi-rs para tarefas nativas e decodificação.

O documento de [arquitetura](https://github.com/WeftCut/WeftCut/blob/main/docs/architecture.md) descreve dois princípios fortes: um único ator em TypeScript é dono do estado editável; e o mesmo compositor Pixi/WebCodecs é chamado tanto pelo preview quanto pelo worker de export. O [README e o mapa técnico](https://github.com/WeftCut/WeftCut#tech-stack) descrevem ainda filas de decodificação e separação de responsabilidades. É uma boa referência de como evoluir para vídeo multifaixa e composições complexas mantendo uma fonte visual comum.

**O que aproveitar no V6:** manter o estado/projeto em TypeScript; separar o cálculo determinístico da cena da interface React; deixar o renderer trabalhar com descritores de cena e recursos já preparados; medir filas, retenção de `VideoFrame` e cópias GPU↔CPU; preservar uma fonte visual comum para preview/export. **O que não copiar agora:** Pixi, WebGPU, WebCodecs e Rust formam uma pilha bem maior do que a necessária para trocar sprites pré-calculados de personagens. O próprio projeto exige Node, Rust e ferramentas C++ para compilar seus addons; isso amplia bastante build, suporte por sistema e manutenção. A documentação é detalhada, mas as declarações de desempenho continuam sendo do projeto, sem validação independente nesta pesquisa.

Uma descoberta especialmente útil está nos próprios [documentos de desempenho do preview](https://github.com/WeftCut/WeftCut/blob/main/docs/render.md) e no [benchmark permanente de reprodução](https://github.com/WeftCut/WeftCut/blob/main/docs/playback-perf.md). Eles registram problemas concretos encontrados enquanto o projeto evoluía: publicar o playhead 30–60 vezes por segundo em estado React de alto nível recalculava a árvore inteira e elevava memória; leituras de layout dentro do ciclo por quadro forçavam reflow; várias faixas compartilhando um decoder podiam resetar e expulsar os próprios quadros; um caminho de export fazia readback síncrono de cerca de 20 ms por frame. As soluções descritas incluem um store de playhead restrito a componentes pequenos, medidas de layout em cache, coalescência do scrub, filas/rings limitados e benchmarks repetíveis que medem cada estágio. São exemplos de problemas observados no projeto deles, não defeitos automaticamente presentes no V6. As regras transferíveis são: **não colocar o playhead contínuo no estado React global; evitar leituras de layout no `requestAnimationFrame`; impor limites à fila e à memória; manter um benchmark reproduzível por número de personagens/faixas.**

### Motion Canvas e Remotion — animação por tempo determinístico

[Motion Canvas](https://motioncanvas.io/docs/) é uma ferramenta TypeScript especializada em animação vetorial, com editor e preview em tempo real; não é um editor NLE tradicional. Sua documentação permite escolher escala e FPS de preview separadamente da resolução/FPS de export. Isso valida uma direção útil para o V6: o preview pode priorizar fluidez e o MP4 manter o contrato de 30 FPS, desde que o estado visual continue sendo calculado pelo tempo da timeline.

[Remotion](https://www.remotion.dev/docs/flickering) recomenda que a animação dependa do frame solicitado, seja repetível se o renderer pedir o mesmo frame outra vez e não dependa de os quadros serem chamados em ordem. Isso é especialmente relevante para seek e export paralelo: o desenho da personagem deve ser uma função do instante, nunca um timer autônomo que avança por conta própria. Remotion não é um NLE equivalente; serve como referência de renderização determinística baseada em React/Chromium, não como prova de que sua árvore React seja a melhor superfície para a timeline inteira.

### Clipzu Desktop — referência de timeline Canvas e integração Electron/FFmpeg

[Clipzu Desktop](https://github.com/clipzuapp/clipzu-dekstop) declara Electron 30, React 18, TypeScript, Zustand/Immer, Canvas para timeline, uma máquina de interação separada, preview Canvas, Web Audio e FFmpeg iniciado de forma assíncrona por processo filho. Ele documenta uma árvore de efeitos/keyframes e um grafo de export que leva as configurações para o FFmpeg, além de salvamento atômico, cache de thumbnails, recuperação de mídia e fila de export.

Isso mostra uma opção intermediária para o V6: React continua cuidando dos painéis, enquanto uma superfície Canvas pode desenhar a régua e os blocos densos e uma máquina pequena trata seleção/arraste. O README também explicita limites de maturidade: **beta para Windows x64**; os runtimes empacotados de macOS/Linux ainda não passaram pela validação de release. As capacidades são documentadas pelo próprio projeto e não são uma medição independente. Fonte: [recursos e stack do Clipzu](https://github.com/clipzuapp/clipzu-dekstop#features).

### OpenScene — um exemplo honesto de preview diferente do arquivo final

[OpenScene](https://github.com/Theorvane/openscene) é desktop Electron/React, com mídia local e export MP4 pelo FFmpeg. O projeto chama o monitor de programa de **best-effort** e declara que o MP4 do FFmpeg é o resultado autoritativo. Está explicitamente marcado como **early**.

Esse contrato pode ser aceitável para um editor que prioriza compatibilidade de codecs, mas o V6 deve tentar manter preview e export consistentes porque suas cenas são controladas pelo próprio aplicativo e o projeto atual já compartilha o `SceneSurface`. Se um trecho usar caminhos de render diferentes, precisa ser documentado e comparado por quadro. Fonte: [arquitetura e limites do OpenScene](https://github.com/Theorvane/openscene#architecture).

### Cutaway — ideias úteis de uma aplicação React/Chromium sem Electron

[Cutaway](https://github.com/S07K/cutaway) roda no navegador, com React, timeline desenhada em Canvas e compositor PixiJS/WebGL. O README afirma que preview e export consomem a mesma cena resolvida. Está em desenvolvimento ativo e lista o ciclo de importar, editar, reproduzir e exportar como funcional; o repositório tem porte e histórico de um projeto ainda pequeno.

Mesmo não sendo Electron, é um exemplo útil de separar o motor de cena do componente visual React e usar Canvas para áreas com muitos elementos interativos. Ele não demonstra que o V6 precise de Pixi: o volume de objetos de personagem e a necessidade de vídeo do V6 devem ser medidos separadamente. Fonte: [README do Cutaway](https://github.com/S07K/cutaway#what-it-does).

### OpenScreen — composição animada desktop, com ressalva de manutenção

[OpenScreen](https://github.com/getopenscreen/openscreen) é uma ferramenta Electron para gravação e montagem de demos, com animações de câmera/cursor, sobreposições, textos, timeline e export. O projeto usa PixiJS e traz vários aspectos de motion que podem servir de referência visual. O repositório original [foi arquivado](https://github.com/siddharthvaddem/openscreen) e encaminha usuários ao fork comunitário mantido; o próprio projeto original avisa que nasceu como side project e não é production grade.

É inspiração para experimentar como camadas e movimento ficam na tela, não para adotar a arquitetura sem revisar. Como o foco é pós-produção de gravação de tela, seu compositor e seu modelo de timeline não são iguais ao modelo de personagem Gacha do V6.

### Descript e Clipchamp — evidência de produtos reais com tecnologia web

O artigo de engenharia do [Descript](https://www.descript.com/blog/article/the-new-descript-how-we-multiplied-the-apps-speed-and-performance) descreve seis anos de produto Electron e depois a reconstrução de peças do motor de mídia para compartilhar um engine entre desktop e web. O texto diz que o caminho anterior copiava frames decodificados do FFmpeg nativo para o WebGL, adicionando duas cópias e limitando a reprodução média a 720p; com WebCodecs/WebGL e retenção de quadros na GPU, a empresa relata exports 4K duas a três vezes mais rápidos. É um caso publicado pela própria empresa, sem conjunto de hardware/benchmark completo no artigo. Além disso, seu novo fluxo usa transcodificação em servidor e streaming sob demanda; essa parte não combina com o requisito local do V6.

O ganho transferível não é “migrar o V6 para WebCodecs” automaticamente: é **evitar cópias de pixels** e só introduzir uma pipeline própria de decode/encode quando vídeo importado ou export for medido como gargalo. Para as animações Gacha pré-calculadas, a pipeline de atlas continua mais simples. Fonte técnica adicional: [sessão de Clipchamp no workshop W3C sobre integração de WebCodecs](https://www.w3.org/2021/03/media-production-workshop/talks/slides/soeren-balko-clipchamp-webcodecs.pdf), que explica a combinação de FFmpeg/WASM para demux/mux e fallback com WebCodecs para encode/decode. Os slides também registram o desafio de coordenar chamadas WebCodecs assíncronas com um processamento FFmpeg originalmente síncrono.

A própria [Microsoft documenta](https://support.microsoft.com/en-us/clipchamp/how-clipchamp-stores-and-processes-media-files-in-editing-projects) que o Clipchamp usa tecnologias de browser tanto na versão web quanto na aplicação Windows e processa preview/export localmente. Isso comprova viabilidade de produto com tecnologias web no desktop, mas não identifica React/Electron como sua stack e não permite transferir números de desempenho ao V6.

### Remotion e bibliotecas de editor — úteis, mas não são NLEs equivalentes

[Remotion](https://www.remotion.dev/docs/client-side-rendering) transforma composições React em quadros de vídeo. A renderização server-side também oferece controle de navegador, renderização em paralelo e FFmpeg; é uma boa referência de saída determinística baseada em tempo/quadro. Ele **não é um editor de timeline profissional tradicional** e sua exportação de quadro completo não deve ser usada como prova de que uma preview interativa ficará fluida.

Projetos como [OpenVideo React Video Editor](https://github.com/openvideodev/react-video-editor) e [React Video Timeline Editor](https://github.com/Ektie/react-video-timeline-editor) oferecem peças/referências de interface para React. Devem ser avaliados pelo contrato de licença, maturidade e integração com o motor existente antes de considerar uma dependência; um componente de timeline não resolve decode, áudio sincronizado, preview, histórico, salvamento ou export.

## Síntese para a arquitetura do Editor V6

| Problema | Padrão encontrado nos projetos/fonte | Direção para o V6 |
| --- | --- | --- |
| Muitos blocos na timeline | Canvas para régua/blocos + máquina de interação (Clipzu, Cutaway), com um caso que ainda redesenha o Canvas inteiro a cada tick (Clipzu) | Canvas não é otimização por si só. Virtualizar pelo intervalo visível, limitar desenho a regiões alteradas e manter o playhead fora de atualizações amplas. |
| Estado editável e histórico | Ator único e snapshots/ações explícitas (WeftCut, Clipzu) | Ter um modelo determinístico do projeto; mudanças entram como comandos undoáveis; preview não vira dona do projeto. |
| Movimento de personagem | Estado visual determinístico consultado por frame/tempo (Motion Canvas, Remotion, WeftCut) | Continuar com `sceneAt(frame)`; usar os atlas/sprites preparados para pose/expressão e selecionar sprite pelo relógio. |
| Preview diferente do export | Alguns projetos aceitam preview aproximado e FFmpeg autoritativo (OpenScene) | Preservar o `SceneSurface` comum; criar comparação visual por quadro ao adicionar backend alternativo. |
| Imagens/vídeos pesados | Workers, filas limitadas, decode acelerado e evitar CPU↔GPU cópias (WeftCut, Descript, WebCodecs) | Medir número de quadros simultâneos e cópias; fechar frames e liberar texturas; não deixar filas crescerem sem limite. |
| Export | FFmpeg nativo assíncrono ou WebCodecs/hardware com pipeline complexa | Manter FFmpeg até medir; separar encode do draw/capture; limitar concorrência do Turbo conforme RAM/CPU e permitir caminho seguro. |
| Integração nativa | Rust/C++ em módulos pequenos para mídia e hot paths (WeftCut, Descript) | Só mover operação já medida; manter timeline e modelo do projeto independentes do binding nativo. |

### O que a pesquisa mudou na recomendação

Não apareceu evidência de que Electron, React ou TypeScript sejam, por si, a causa inevitável de preview travada ou animação lenta. Apareceu evidência de que editores maiores não dependem da árvore React para cada frame e de que cópias desnecessárias de imagens podem limitar resoluções e export.

Para o Editor V6, a evolução com menor risco fica assim: **(1)** preservar o motor canônico e os atlas; **(2)** medir 30/60 FPS, bytes dos atlas e memória acumulada; **(3)** separar o desenho da timeline em Canvas apenas se a quantidade de blocos fizer React/SVG aparecer no perfil; **(4)** experimentar Canvas/OffscreenCanvas para a cena apenas se CPU de renderer ou pintura for o gargalo; **(5)** avaliar WebGL/WebGPU ou WebCodecs apenas se composição/decode/encode dominar; **(6)** avaliar C++/Rust só para uma rotina delimitada. Essa sequência mantém o app funcionando enquanto cada custo é comprovado.

As limitações encontradas nos projetos de terceiros também são parte da evidência: alguns estão em beta/pré-1.0, alguns são protótipos e o OpenScreen original foi arquivado. Não devemos inferir robustez ou FPS a partir de screenshots, marketing, estrelas ou README.

Também consultei discussões de desenvolvedores e questões de projeto. Elas mostram opiniões divergentes sobre consumo de memória e acesso a codecs, mas quase nunca controlam máquina, versão do Chromium, mídia e efeito. Por isso, não usei relatos isolados de fórum para concluir que Electron é lento ou que WebGPU/WebCodecs sempre será mais rápido; eles servem para encontrar hipóteses que devem virar medições do V6.

## O que falta para fechar a solução

A hipótese mais forte é: **primeiro desacoplar o preview para 60 Hz, sem mudar timeline/export; controlar o total de atlas; e medir contra um projeto representativo.** Ainda não há gravação/perfil de uma cena Gacha real nem medida de memória do maior projeto. Depois dessa linha de base, o relatório deve dizer qual processo/thread limita cada cenário e decidir se o V6 atual já atende ou se vale implementar um Canvas worker.

### Fixtures locais de estresse

Foram criados três projetos sintéticos no perfil local do app para medir carregamento, timeline, estados sobrepostos e atlas sem alterar os projetos normais:

| Perfil | Duração | Faixas | Blocos | Assets | Personagens |
| --- | ---: | ---: | ---: | ---: | ---: |
| Leve | 30 s | 7 | 80 | 18 | 4 |
| Médio | 120 s | 7 | 284 | 28 | 4 |
| Pesado | 300 s | 7 | 752 | 48 | 4 |

O gerador pode ser repetido com `npm run editor-v6:stress-projects`. Ele salva projetos com prefixo `[TESTE]` na biblioteca local e usa atores Gacha sintéticos. A verificação percorre o leitor de persistência do app e valida PNGs, referências e atlas. Isso comprova que os fixtures são estruturalmente reabríveis; ainda não mede FPS nem substitui um personagem real com roupas, acessórios e rig complexo.

Na mesma rodada, a biblioteca passou a listar manifestos-resumo sem ler PNGs. `loadEditorV6Project(id)` lê os assets só quando o usuário abre um projeto; o estado da biblioteca guarda resumos, enquanto a área de edição e o histórico mantêm o projeto ativo. O salvamento ainda decodifica e publica todos os PNGs do projeto ativo em cada auto-save; a gravação incremental é o próximo trabalho pendente.

## Pesquisa ampliada: tecnologias e integração do aplicativo

Em 26/10/2026, ampliei a leitura do V6 para o repositório inteiro e comparei o desenho com fontes oficiais, código/documentação de outros editores, casos de empresas e relatos de engenharia. A inspeção do repositório é estática; o perfil de desempenho com mídia real ainda falta. O mapa de processos e dados está em [ARQUITETURA_E_INTEGRACAO.md](ARQUITETURA_E_INTEGRACAO.md).

### O papel de cada tecnologia — sem confundir build com runtime

| Camada | Tecnologia real no app | O que faz | O que não resolve sozinha |
| --- | --- | --- | --- |
| Desktop e renderização | Electron 44 + Chromium, com React 19 | Abre a janela, compõe a interface e oferece APIs desktop por processos isolados. | Electron não limita as animações a 30 FPS. Um renderer bloqueado, um main ocupado ou cópias pesadas podem engasgar qualquer framework de janela. |
| Interface e timeline | React, React Router e TypeScript | Painéis, seleção, inspector, timeline DOM/CSS e estado tipado. | TypeScript é removido na compilação; tipagem não reduz o trabalho do renderer. Canvas só ajuda se DOM, layout ou pintura forem medidos como gargalo. |
| Estado | Zustand + Immer | Guarda resumos da biblioteca e o documento ativo; o histórico é próprio do V6 e o playhead fica local à tela. | A lista leve reduz retenção de projetos não selecionados. O projeto aberto ainda usa Data URLs; Immer não é codec de imagem nem armazenamento de mídia. |
| Validação e contratos | Zod 4 + tipos em `src/shared` | Confere shapes de documentos e jobs recebidos pelos canais IPC/persistência. | Validar é trabalho de CPU e cria/normaliza valores; deve ocorrer nas fronteiras importantes, mas não a cada pixel/frame. |
| App desktop | Node.js no processo main + preload tipado | Arquivos, diálogos, serviços, subprocessos, banco e IPC. | Não é um servidor web/backend remoto. O processo main tem um event loop/UI próprio que não deve receber trabalho CPU longo/síncrono. |
| Build e distribuição | electron-vite + Vite; Electron Builder | Gera bundles separados de main/preload/renderer, HMR de desenvolvimento e pacote portátil Windows x64. | Build tooling não melhora o fps do app executando. `electron-builder` empacota; não é necessário para timeline, preview ou export. |
| Imagens do app | Sharp/libvips | Normaliza imagens importadas e suporta alguns fluxos de catálogo. | Não participa do tick normal da animação do V6. Não usar processamento de alta resolução em cada alteração do playhead. |
| Dados do app | SQLite (`better-sqlite3`) + DataPlatform/CAS | Indexa e persiste alguns domínios do app, com binários fora do banco. | O V6 ainda não usa esse catálogo para seus projetos. SQL síncrono é ótimo para consultas curtas, mas uma consulta lenta no main pode bloquear outros eventos. |
| Export | FFmpeg + FFprobe subprocessos locais | Codifica H.264, une partes, mistura áudio e valida o MP4. | “Turbo 2×” significa duas partes simultâneas, não export duas vezes mais rápido; captura da cena e cópias BGRA continuam no caminho crítico. O encoder automático tenta encoders de hardware disponíveis e tem fallback CPU. |
| Verificação | Vitest e scripts específicos | Exercitam regras e fronteiras no desenvolvimento. | Não ficam rodando dentro do app e não aumentam a velocidade em produção. |

O mapa de tecnologias declarado, funções e limites está detalhado em [ARQUITETURA_E_INTEGRACAO.md](ARQUITETURA_E_INTEGRACAO.md). Para escolher tecnologia de frame, as variáveis mais importantes são resolução e quantidade de imagens, memória descomprimida, frequência de render e quantidade de cópias entre GPU e CPU — não a presença de TypeScript ou Vite.

### Fluxo atual entre V6 e o resto do Gacha

O produto principal tem uma cadeia de produção: Fabricador publica poses/peças/expressões; Customizer compõe personagens; Studio Principal usa esses personagens em documentos próprios. O V6 é uma nova área separada. Ele consulta catálogos/personagens por API, tira snapshot do conteúdo escolhido e armazena cenas, histórico e export em seus próprios arquivos. Isso mantém a independência pedida e evita o V6 alterar silenciosamente outras áreas.

Há uma boa decisão de desempenho já aplicada: o playhead é local à página do V6, e `EditorV6Timeline` memoiza as linhas; durante Play, elas só deixam o cursor overlay se mover. Assim o V6 não reproduz diretamente um dos problemas que o WeftCut encontrou ao publicar cada atualização de playhead por uma árvore React ampla. O trabalho da cena ainda roda na cadência atual de 30 FPS.

Há uma plataforma comum de armazenamento no app para domínios que já foram migrados. O V6 ainda não está registrado como domínio nesse catálogo. Ele está sob o perfil local portátil e entra nos backups do perfil, porém não usa ainda o índice, deduplicação ou protocolo de assets do catálogo. A recomendação é integrar o V6 ao **mecanismo** compartilhado de dados e manter um domínio de projeto próprio; isso não exige compartilhar documentos ou estado do Studio.

O app já possui um diagnóstico opt-in de commits React e tarefas longas, mas o mapa de rotas não classifica `/editor-v6`: os dados caem na categoria genérica “outra rota”. Também faltam medidas específicas de fps apresentado, latência de abrir/salvar e bytes/memória dos atlas. Portanto ainda não há números do perfil de V6 para usar como linha de base.

Outro descompasso confirmado: a faixa V6 chamada “Vídeo” atualmente organiza fundos/imagens. O app aceita importar áudio para o exportador, mas os sons ficam em lista própria (`exportAudio`), fora da timeline e sem faixa de áudio. O export reporta zero entradas de vídeo e zero proxies. A biblioteca de Base de Vídeos/Roteiros vive sob o antigo caminho `studios/Editor Gacha`, mas não tem integração de import com o V6. Logo, o requisito discutido de importar vídeo/áudio para projetos próprios ainda depende de uma etapa real de produto e arquitetura.

### Novos exemplos: o que os editores mais maduros ensinam

#### Grandes ferramentas web/desktop separam UI de motor de mídia

O [Adobe UXP](https://developer.adobe.com/uxp/) executa painéis HTML/CSS/JavaScript dentro de Premiere e Media Encoder, com APIs do host para sequências, faixas, clips e export. A Adobe também documenta [plugins híbridos com C++](https://developer.adobe.com/premiere-pro/uxp/introduction/). Isso não significa que o Premiere inteiro seja feito de React/Electron: a interface de extensão é web, enquanto o aplicativo mantém um host/motor próprio. A lição transferível ao V6 é estabilizar o contrato entre UI React e motor de cena/mídia para que um backend nativo pontual possa ser acrescentado depois sem reescrever a edição.

A [Microsoft explica o Clipchamp](https://support.microsoft.com/en-us/clipchamp/how-clipchamp-stores-and-processes-media-files-in-editing-projects) como aplicação Windows/browser com tecnologias web e processamento local; para contas de trabalho, mídia e estado podem ser sincronizados em OneDrive/SharePoint. É evidência de que browser tech atende edição real, mas sua solução de armazenamento cloud/híbrida não atende automaticamente à exigência do V6 de projeto local e mídia copiada para dentro dele.

#### Mais código de referência com Electron/React/TypeScript

- **[WeftCut](https://github.com/WeftCut/WeftCut)** continua sendo a referência técnica mais próxima: Electron 44, React 19, Zustand/Immer, compositor Pixi, WebCodecs e um addon Rust para serviços de mídia. Nos próprios documentos, relata regressões que vieram de atualizar o playhead em estado amplo, leituras de layout dentro do frame, fila/compartilhamento de decoder e readback síncrono. O takeaway para o V6 é localizar estado de alta frequência, cachear medidas, limitar filas e medir operações individuais. Isso não prova que nosso playhead local ou nossa timeline tenham o mesmo defeito.
- **[Clipzu Desktop](https://github.com/clipzuapp/clipzu-dekstop)** combina Electron, React/TS, Zustand/Immer, timeline Canvas, máquina de interação e FFmpeg. É uma referência de isolamento do arraste e desenho de timeline em alto volume; o próprio projeto informa maturidade beta e suporte validado limitado. É referência de arquitetura, não certificação de robustez.
- **[OpenScene](https://github.com/Theorvane/openscene)** põe React/timeline e APIs atrás de um preload tipado, e usa FFmpeg local. Assume que preview é “best effort” e o MP4 é autoritativo. O V6 já compartilha `SceneSurface` entre preview/captura, contrato útil para preservar quando adicionar vídeo.
- **[LosslessCut](https://losslesscut.app/docs/features)** é um editor Electron centrado em corte/concatenação sem recodificar, com thumbnails e waveform. Sua velocidade vem em parte de evitar recodificação quando os cortes permitem stream-copy. Isso serve para tarefas simples de mídia e concatenação; não substitui a codificação do V6, que compõe personagens/texto/transparência e precisa gerar quadros novos.
- **[Descript](https://www.descript.com/blog/article/the-new-descript-how-we-multiplied-the-apps-speed-and-performance)** relata melhorias ao retirar cópias de frames e redesenhar o engine de mídia. O número 2–3× de export 4K é uma declaração de engenharia do fornecedor, não uma previsão para o V6; eles também passaram a usar infraestrutura cloud em partes do produto.

O editor menor mais parecido pode expor muito bem sua estrutura, mas não fornece prova de que funcionará em milhares de projetos/usuários. Um editor proprietário pode confirmar um padrão arquitetural sem expor o interior inteiro. Por isso a pesquisa combina documentação e repositórios com medições nossas, em vez de tratar README, post ou estrelas do GitHub como benchmark.

### Direção completa sugerida

1. **Concluído em parte:** listar resumo de metadados e abrir PNGs apenas ao abrir um projeto. Falta gravar apenas assets novos ou alterados e manter referências/bytes fora do payload completo de auto-save.
2. **Medir antes/depois**: tempo para abrir a tela e projeto, memória de pico, duração e bytes do save, p95/p99 do frame de preview e custo do bake. Comparar uma cena estática, uma transição, três personagens e um projeto típico grande. Não existe ainda uma linha de base real.
3. **Definir o contrato de mídia do V6**: cada import é copiado para o projeto; o original durável fica intacto; proxies, thumbs, waveform e índice de seek são temporários/regeneráveis. Registrar tamanho, fps, codec, streams, tempo de origem e hashes com FFprobe/índices.
4. **Adicionar clips reais à timeline**: vídeo como faixa visual, fala/pensamento como eventos e sons como uma ou mais faixas sincronizadas. Usar um único relógio de reprodução; limitar quantidade de decoders/frames em cache e permitir qualidade de preview reduzida sem alterar o export.
5. **Manter funções determinísticas de cena**: a timeline resolve estado e composição em um instante; preview e export chamam o mesmo resolver. A camada que decodifica vídeo pode variar, mas a composição e o contrato de tempo continuam comparáveis.
6. **Só após medir, escolher Canvas, WebGL/WebGPU, WebCodecs ou C++/Rust.** Canvas atende bem timeline densa e 2D; WebGL/WebGPU podem servir compositor com muitas camadas e texturas; WebCodecs dá acesso a decode/encode do Chromium, mas ainda exige controle de filas, timestamps, memória e mux; addon nativo pode remover cópias/hot loops, mas aumenta construção e suporte por plataforma.

Essa ordem é importante para obter ganhos perceptíveis sem introduzir uma segunda engine, formatos de projeto e dependências nativas antes de comprovar necessidade. O carregamento sob demanda já foi implementado e validado. A próxima etapa é escrita incremental de assets e depois medição real; vídeo entra como capacidade isolada da área V6.

### Fontes oficiais e primárias adicionadas

- [Performance no Electron](https://www.electronjs.org/docs/latest/tutorial/performance): recomenda perfilar, evitar trabalho longo no main e descarregar trabalho no renderer.
- [Modelo de processos Electron](https://www.electronjs.org/docs/latest/tutorial/process-model), [IPC](https://www.electronjs.org/docs/latest/tutorial/ipc), [sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox) e [context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation): limites entre renderer, preload e main.
- [Offscreen no Electron](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering): distingue captura como bitmap CPU, composição GPU e textura compartilhada que exige integração nativa.
- [electron-vite](https://electron-vite.org/guide/) e [build de produção](https://electron-vite.org/guide/build): bundling dos três contextos e ciclo de desenvolvimento.
- [React: `memo`](https://react.dev/reference/react/memo) e [Zustand: `useShallow`](https://zustand.docs.pmnd.rs/learn/guides/prevent-rerenders-with-use-shallow): renderizações devem ser localizadas e confirmadas em perfil.
- [Immer: recomendações de desempenho](https://immerjs.github.io/immer/performance/): evite busca custosa dentro de drafts e produza uma vez quando o estado já é grande.
- [Node worker threads](https://nodejs.org/api/worker_threads.html): indicado para CPU intensiva, não para substituir I/O assíncrona.
- [better-sqlite3 e workers](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/threads.md): consultas curtas podem ficar no main; mover consultas lentas para worker se preciso.
- [FFmpeg](https://ffmpeg.org/ffmpeg.html) e [encoders](https://ffmpeg.org/ffmpeg-codecs.html): filtros, stream-copy e codificação de hardware dependem do build, encoder e pixel format.
- [Sharp: performance](https://sharp.pixelplumbing.com/performance/), [Zod: validar dados](https://zod.dev/basics), [Vitest](https://vitest.dev/guide/) e [DevTools: frames, GPU e memória](https://developer.chrome.com/docs/devtools/rendering/performance).
- [Clipchamp: processamento e armazenamento](https://support.microsoft.com/en-us/clipchamp/how-clipchamp-stores-and-processes-media-files-in-editing-projects), [Premiere UXP](https://developer.adobe.com/uxp/) e [WebCodecs no Clipchamp (W3C)](https://www.w3.org/2021/03/media-production-workshop/talks/slides/soeren-balko-clipchamp-webcodecs.pdf).

## Atualização da pesquisa em editores e runtimes — 26/10/2026

Esta rodada conferiu as páginas e repositórios diretamente. Código e README de terceiros mostram escolhas e problemas relatados pelos próprios autores; não são medições independentes do nosso hardware. A lista abaixo foca editores que compartilham Electron/React/TypeScript ou usam Chromium para animação e composição.

| Referência | O que a fonte mostra | Aplicação para o V6 | Limite da evidência |
| --- | --- | --- | --- |
| [WeftCut](https://github.com/WeftCut/WeftCut) | Editor Electron 44 + React 19 + TypeScript. A arquitetura descreve um compositor Pixi/WebCodecs comum à prévia e ao export, estado de projeto com escritor único e addon Rust para serviços de mídia. O projeto mantém documentos próprios de perfil de playback e registra custos de cada etapa. | Melhor exemplo encontrado de separação clara entre estado de edição, relógio, compositor, decodificadores e export. Vale adotar a disciplina de medir por estágio, não a pilha inteira. | O próprio repositório está em desenvolvimento e suas alegações/benchmarks não foram repetidos nesta máquina. O compositor dele trata muitas faixas de vídeo; o V6 atual troca imagens de personagem já preparadas.
| [OpenChatCut](https://github.com/0xsline/OpenChatCut) | React 19 + TypeScript, Electron 43, timeline real, Remotion para render e WebGL/GLSL para efeitos; mantém um núcleo de edição separado da UI. | Referência atual de como uma aplicação Electron/React pode oferecer timeline, preview, gráficos e export. Reforça que React pode comandar um editor enquanto um motor de cena especializado desenha os quadros. | Projeto jovem e com escopo de vídeo/IA mais amplo. Stack e README não demonstram fluidez ou estabilidade sob o projeto Gacha.
| [Clipzu Desktop](https://github.com/clipzuapp/clipzu-dekstop) | React/TypeScript + Electron 30, FFmpeg assíncrono, Web Audio, timeline Canvas e máquina explícita de interação. A documentação reconhece que sua timeline Canvas ainda redesenha toda a superfície a cada tick e que uma consulta SQLite síncrona fica no processo main. | Exemplo prático de que Canvas e Electron não garantem desempenho por si sós. Precisamos reduzir trabalho repetido, limitar o que redesenha e manter o main livre de operações demoradas. | A própria página chama o produto de beta Windows x64 e diz que os pacotes de mídia para macOS/Linux não foram validados.
| [OpenScene](https://github.com/Theorvane/openscene) | Desktop Electron + React Native, timeline compartilhada e export local por FFmpeg; descreve o projeto como early-stage. | Confirma uma arquitetura local com FFmpeg e fronteiras explícitas entre app desktop e modelo de edição. | Não promete equivalência pixel a pixel: assume preview best-effort e MP4 autoritativo, ao contrário do contrato que queremos preservar no V6.
| [Motion Canvas](https://motioncanvas.io/docs/rendering/) | Editor TypeScript para animação 2D com Canvas; separa escala/FPS do preview dos valores de renderização final. | Preview pode ter cadência/resolução de interação diferentes do MP4. No V6 isso deve preservar o estado calculado em cada instante, inclusive quando o usuário pausa ou arrasta o playhead. | É uma ferramenta especializada de motion graphics, não um editor de vídeo multifaixa.
| [Remotion](https://www.remotion.dev/docs/flickering) | Faz animações dependerem do frame solicitado, aguarda assets e permite render em paralelo; alerta que aumentar concorrência pode saturar memória e que vídeos HTML5 numerosos podem engasgar. | Animação precisa ser uma função repetível `frame -> cena`, para que seek, preview e export paralelo concordem. Toda fila e número de renderizadores paralelos precisa ter limite. | Renderizador de vídeo programático, não prova de ergonomia ou FPS de uma timeline interativa.
| [Kdenlive](https://docs.kdenlive.org/en/tips_and_tricks/tips_and_tricks/timeline_preview_rendering.html) | Editor nativo usa renderização de preview por zonas/chunks e invalida os chunks afetados quando a composição muda; explica que preview render melhora playback, não a edição. | Para mídia e efeitos futuros, cachear trechos caros pode ajudar a reprodução. Mudanças visuais invalidam apenas a região dependente, sem misturar isso com salvar ou exportar. | Kdenlive usa um motor nativo diferente. A técnica é transferível, a performance não.
| [Cutaway](https://github.com/S07K/cutaway) | Editor web React/TypeScript separa timeline, animação, composição e export em pacotes que não dependem de React; export e preview percorrem um grafo de cena comum. | É referência para manter resolução de cena e regras de animação fora dos componentes visuais, com interfaces simples entre modelo e backend gráfico. | Não usa Electron; README e roadmap não são benchmark independente nem validação de versão desktop.

### O que esta rodada acrescenta

1. **Canvas não resolve sozinho uma timeline lenta.** Um editor da mesma família documenta o custo de redesenhar a tela inteira a cada tick. A versão V6 deve primeiro preservar o cursor em uma camada atualizável isoladamente e desenhar os blocos visíveis; mudar a implementação para Canvas só depois de medir React/DOM como gargalo.
2. **Transições devem depender do relógio do projeto, não de `setTimeout`/CSS autônomo.** Para qualquer frame consultado, o resolver deve retornar a mesma imagem e os mesmos valores. Isso sustenta pausa, seek reverso, render fora de ordem e export dividido.
3. **Fluidez de preview e precisão de export são orçamentos diferentes.** Motion Canvas permite perfis distintos. No V6, um experimento a 60 Hz pode escolher/interpolar amostras durante Play sem mudar o FPS nem os tempos da timeline/export; é preciso medir se os sete sprites atuais bastam visualmente antes de aumentar o atlas.
4. **Preview cache e proxy não são a mesma coisa.** O Kdenlive invalida zonas de preview alteradas; proxies reduzem custo de decodificação da fonte. Para o V6, cache de uma cena composta pode ajudar trechos estáveis, mas não deve ocultar mudanças de personagem, fala, pensamento ou mídia que alterem esses quadros.
5. **Memória e filas fazem parte do desempenho.** WeftCut e Remotion documentam os custos de render paralelo, buffers e assets. O V6 precisa impor um teto agregado aos atlas/cache e limitar paralelismo de bake/export pela RAM disponível, sempre com cancelamento e fallback.

### Revisão de precisão das referências

A referência anterior chamada **Premation** apontava para um repositório GitHub inexistente (resposta 404) e foi retirada. A ideia de separar FPS de preview e render foi substituída pela documentação verificável do Motion Canvas; a regra de quadros determinísticos foi apoiada na documentação do Remotion. Isso deixa as recomendações ancoradas em fontes acessíveis e identificáveis.

Fontes adicionadas nesta rodada: [Electron Performance](https://www.electronjs.org/docs/latest/tutorial/performance), [modelo de processos Electron](https://www.electronjs.org/docs/latest/tutorial/process-model), [React Profiler](https://react.dev/reference/react/Profiler), [React memo](https://react.dev/reference/react/memo), [WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API), [cuidados com memória no WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Using_the_WebCodecs_API), [Motion Canvas rendering](https://motioncanvas.io/docs/rendering/), [Remotion: determinismo e flickering](https://www.remotion.dev/docs/flickering), [Remotion: paralelismo e memória](https://convert.remotion.dev/docs/parallel-encoding), [Kdenlive: render de preview por zona](https://docs.kdenlive.org/en/tips_and_tricks/tips_and_tricks/timeline_preview_rendering.html), e os repositórios [WeftCut](https://github.com/WeftCut/WeftCut), [OpenChatCut](https://github.com/0xsline/OpenChatCut), [Clipzu](https://github.com/clipzuapp/clipzu-dekstop), [OpenScene](https://github.com/Theorvane/openscene) e [Cutaway](https://github.com/S07K/cutaway).
