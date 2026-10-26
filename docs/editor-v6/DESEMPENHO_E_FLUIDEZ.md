# Fluidez e desempenho das animações — avaliação do Editor V6

**Pesquisa iniciada em 26/10/2026.** Este documento reúne a inspeção do código, o hardware detectado, as fontes oficiais consultadas e um plano de decisão por medições. Ele distingue fatos já confirmados de hipóteses que ainda precisam de um perfil com um projeto Gacha representativo.

## Conclusão executiva

**Electron + Chromium não impedem um editor de vídeo/animado de ser fluido.** O Electron usa o motor Chromium para a interface e oferece workers, composição pela GPU e renderização offscreen. A própria documentação diz que desempenho depende de medir e otimizar o trabalho da aplicação, e não de simplesmente escolher Electron ou C++.

O Editor V6 já toma boas decisões: não recompõe a personagem a cada quadro da reprodução; pré-calcula até sete recortes por troca de pose/expressão; reutiliza esse atlas durante o seek, preview e export; compartilha o mesmo desenho de cena com o exportador; e envia renderização/captura do export para janelas ocultas. Isso deixa o caminho de reprodução muito mais leve que o de preparação.

Há, porém, dois limites concretos visíveis no código atual:

1. **A reprodução avança em quadros inteiros a 30 FPS.** O relógio calcula `floor(tempo × 30)`. Portanto a prévia não atualiza a animação a 60 FPS, mesmo que o monitor consiga apresentar 60/120 Hz. Em 250 ms, a transição tem sete imagens intermediárias; em tela de 60 Hz cada imagem pode ficar visível por cerca de 33 ms.
2. **O teto de 8,1 milhões de pixels vale por atlas, não pelo projeto inteiro.** Um atlas RGBA de 8,1 MP ocupa aproximadamente 31 MiB descomprimido; PNG comprimido e texto Base64 variam por desenho. Muitos blocos animados podem aumentar o JSON do projeto, memória de CPU/GPU e tempo de carregar/salvar. O limite individual não é uma meta recomendada para todos os atlas.

**Recomendação:** manter Electron + React + TypeScript + FFmpeg. A próxima decisão de tecnologia deve vir de um perfil em cenas reais. A primeira melhoria a avaliar é um modo de preview de 60 FPS, independente da timeline/export de 30 FPS. Em paralelo, adicionar um orçamento global de memória por projeto para os atlas. Prototipar em Canvas2D/OffscreenCanvas só se o perfil mostrar que o desenho SVG/React ou o compositor são o gargalo. Considerar C++ apenas para uma etapa de CPU identificada e isolável. WebGPU ou substituição do app inteiro não são o próximo passo indicado.

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

## O que falta para fechar a solução

A hipótese mais forte é: **primeiro desacoplar o preview para 60 Hz, sem mudar timeline/export; controlar o total de atlas; e medir contra um projeto representativo.** Ainda não há gravação/perfil de uma cena Gacha real nem medida de memória do maior projeto. Depois dessa linha de base, o relatório deve dizer qual processo/thread limita cada cenário e decidir se o V6 atual já atende ou se vale implementar um Canvas worker.
