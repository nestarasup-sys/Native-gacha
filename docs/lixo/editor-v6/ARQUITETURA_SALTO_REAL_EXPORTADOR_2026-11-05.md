# Editor V6 — mudanças de arquitetura capazes de alterar o patamar da exportação

**Estado:** análise de arquitetura baseada no código de `Dev-V2` em 05/11/2026 e na primeira medição do **novo projeto**. Proposta técnica; **nenhuma das velocidades-alvo abaixo foi demonstrada**. Usuário mediu o modo 01/Controle e não observou melhora relevante. O laboratório com seis botões saiu da interface; o único botão volta a iniciar o exportador padrão seguro. Os experimentos podem permanecer no código como ferramentas internas, mas não há promessa de ganho.

## Ponto de partida real

Novo projeto: 309 quadros, 1080p, 30fps, Turbo 2×, CPU H.264, Preset 2, cabelo posterior; exportação sem fallback e MP4 validado. **54,7158 s** incluindo **10,503 s de preparação de cabelo antes do job**, **23,7045 s de preparação de 21 transições** e **17,7905 s de renderização/codificação**. 141 rigs construídos, zero reutilizados; 292 quadros renderizados, 17 reutilizados. 16,3693 s de capturas somadas entre dois workers — **não** equivalem a 16 s de tempo de parede recuperável. Uma única exportação não é uma mediana.

Para chegar a 15 s, precisamos reduzir o caminho total em cerca de 73%. Para chegar a 10 s, cerca de 82%. Isso exige substituir operações inteiras, não poupar 8 ms por retry.

## Mecanismos que mantemos hoje e por que limitam o desempenho

1. **Pré-render de todas as transições em atlas PNG.** `prepareExportMotions` procura planos ausentes, faz bake no Electron e adiciona assets de atlas ao projeto. `bakeMotion.ts` interpola partes, rosto, roupas e bounds e chama `prepareSavedCharacterRenderer` para diversos estados/samples. O trabalho escala com *transições × amostras × complexidade das peças*; na baseline foram 21 bakes e 141 rigs sem reuso. A solução de referência não é aumentar cache indefinidamente: **substituir o atlas obrigatório por comando de pose + camadas reutilizáveis + animação por frame**, reservando bake para efeitos que não puderem ser compostos em tempo real.

2. **Captura de janelas Electron como fonte de cada frame.** `exportWorkers.ts` abre até duas `BrowserWindow` ocultas, renderiza via `executeJavaScript`, usa token pintado como cerca e chama `webContents.capturePage` até recuperar o bitmap correto. `exportRunner.ts` envia BGRA de volta ao Main e ao stdin do FFmpeg, um frame por vez. Isso inclui composição/paint da janela, leitura de pixels e cópias CPU. **Substituir por um compositor de exportação dedicado** que leia comandos de cena/poses de um render target `Canvas/WebGL`, sem depender da captura de janela do Electron. O caminho compatível deve usar pixel buffer validado, sem assumir que o evento `paint` experimental entrega o frame certo. Evoluir para readback assíncrono (p. ex. PBO quando suportado) ou encoder GPU somente após garantir ordem e paridade dos frames.

3. **Preparação de cabelo separada e duplicação dos rig renderers.** `editorV6HairMotionPreparation.ts` prepara `originalRenderer` e `hairlessRenderer` de cada alvo, mede todas as expressões, serializa superfícies e prepara transições sem cabelo. Isso roda **antes** do main job e adicionou 10,503 s. A arquitetura desejada é uma **representação única de personagem com camadas imutáveis e variantes**: construir o corpo/roupa uma vez; compor cabelo, rosto e motion como dependências do mesmo grafo. Ainda é necessário preservar o recorte de alpha e a semântica exata dos presets do cabelo.

4. **Atlas de boca por trecho Turbo.** Em `exportRunner.ts`, cada `renderPart` prepara seus próprios `mouthLoops` antes de iniciar o worker e encoder daquela parte. Ao invés disso, o compilador de cena deveria produzir recursos de fala **uma vez por identidade visual/expressão** e fazer os dois workers consumirem esses recursos imutáveis, sem duplicação por pedaço de vídeo. A fase global da boca, cancelamento e orçamento precisam continuar corretos.

5. **H.264 por CPU fixo no perfil padrão.** `DEFAULT_EXPORT_SETTINGS.encoder='cpu'` e `encodingArgs` podem usar o `libopenh264`. É correto preservar uma opção previsível de qualidade, mas a meta grande deve medir **tempo de renderização separado de encode** antes de investir em AMF/Quick Sync/NVENC. A baseline aponta que a preparação de movimentos e cabelo, não o encoder, consomem a maior parte do tempo. Trocar encoder sozinho não elimina os 34 s dessas fases.

## Apostas de arquitetura (em ordem)

### A — Exportador compilado de cena + compositor por peças (maior potencial)

**Objetivo:** eliminar a necessidade de gerar 21 atlases de movimento completos a cada exportação. Em uma fase de *compile*, transformar timeline e personagens em:
- catálogo de texturas e máscaras imutáveis (corpo, roupas, acessórios, cabelo/rosto, boca);
- grafo ordenado de layers, transforms, tint, flip, alpha e oclusão;
- faixas temporais com estados interpolados, blink/fala, física de cabelo e recortes;
- dependências cacheáveis por **hash do conteúdo visual**, não só ID de personagem.

Um renderizador dedicado avalia as transformações por frame e compõe as texturas. O mesmo trabalho que hoje produz pixels de um atlas para cada pose passa a produzir geometria e comandos reutilizáveis. **Complexidade e risco altos**: roupas deformadas, articulações, contornos, assets, cabelo e face tornam inadequado um compositor 2D simplista. R37 é uma bancada parcial, **não substituto funcional**. Reusar os módulos de material/face existentes para obter equivalência antes de redesenhar shaders.

**Primeiro gate:** 7 transições reais e 30 frames consecutivos de personagem, corpo e roupa, sem costuras, flipX individual e global, face, piscada, boca, cabelo, alpha e ordem das camadas. Só depois medir a preparação e converter o total de 309 frames. Se falhar, voltar ao caminho atual sem qualquer fallback silencioso.

### B — Render-to-buffer assíncrono, sem screenshot do BrowserWindow

**Objetivo:** eliminar `executeJavaScript → paint → capturePage → Buffer → stdin` como ciclo obrigatório dos 292 quadros realmente renderizados. Criar compositor offline isolado com estado explícito `render(frame, token)`; buffer de pixels BGRA, e pipeline com 2–3 buffers em voo (render N+1 enquanto write/encode N). Não violar ordem, não reciclar buffer antes de o encoder consumir, não reintroduzir frame stale. A alternativa avançada é pipeline de vídeo nativo/GPU, com risco de dependência de driver e alto custo de distribuição/compatibilidade.

**Primeiro gate:** MP4 Turbo real com 309/309 quadros, seam, *byte/pixel parity* em regiões de personagem, roupas, cabelo e rosto. Testar pixel alpha antes de H.264 com fundo colorido e checkerboard; o H.264 é lossy e não deve ser usado como único oráculo de igualdade RGBA. Benchmark em hardware real do usuário. Não promover o R36 `paint` sem fence confiável.

### C — Compilador único de personagem/face/cabelo e cache por conteúdo

**Objetivo:** fundir os dois preparos de personagem normal/sem cabelo, as quatro expressões, atlas da boca e rig de transição em um único grafo de recursos compartilháveis. Reduzir `hairPreparation` (10,503 s) e duplicação Turbo. Uma cache por hash inclui versão de renderização, personagem, slot/modelo, roupas, texturas, pose, preset, dimensões e efeitos; limites de memória, invalidadores e disco isolado. Desabilitar por padrão reuso quando faltar informação de identidade visual.

**Gate:** contar `builds` e cache hit *por conteúdo*; validar primeiro cold export (baseline atual sem hits) e depois warm export. Cache quente **não** comprova melhora da primeira exportação.

## Sequência de execução proposta

1. **Fixar a paridade do compositor** em um conjunto de fixtures de personagens complexos do Fabricador/Customizador e o projeto do usuário isolado, sem mandar assets pessoais ao GitHub. Medir `motionPreparation`, `hairPreparation` e `rendering` separadamente, além do total.
2. Desenvolver **A** fora do caminho oficial, compartilhando os mesmos dados sem refazer regras visuais. Entregar primeiro uma única transição de personagem com pixels corretos; depois várias trocas de pose, roupas, face, boca e cabelo. Interromper se o compositor não alcançar paridade completa.
3. Integrar **C** como compilador de recursos da mesma cena, permitindo saída do caminho legado e do novo por um teste A/B controlado (testes internos; **sem seis botões na interface**). 
4. Desenvolver **B** com captura direta determinística e buffers, substituindo o screenshot apenas após comprovar equivalência de pixels e benefício para 1080p/309 quadros.
5. Repetir 3 exportações completas em ambiente frio comparável; aceitar a mudança de arquitetura somente se a mediana **do total incluindo preparação do cabelo** cair, o vídeo preservar 309 quadros/seam e não houver regressão de memória, cancelamento, presets nem imagem.

**Critérios de promoção:** uma opção interna não muda o botão único nem a exportação real até passar testes de RGBA, MP4, CPU/memória, risco de drivers e 3 medições do mesmo projeto. Resultados de CI Windows Server, por mais completos, não substituem a GPU/Windows 11 real.

## O que não vale tratar como vitória

Mudar 16 ms para 8 ms de retry; trocar duas lanes por uma; remover uma chamada `toDataURL`; abrir cache com chaves vagas; habilitar `paint` experimental; trocar encoder isoladamente; diminuir FPS/resolução ou remover expressões. Essas ações podem ter seu lugar em telemetria, mas não atacam o modelo de custo que produziu os 54,7 s.
