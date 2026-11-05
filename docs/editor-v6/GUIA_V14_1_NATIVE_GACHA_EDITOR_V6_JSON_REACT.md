# GUIA V14.1 — Native Gacha / Editor V6 — React editável por JSON

**Uso:** entregue à IA este guia, o TXT exportado de Roteiros e um inventário atual de personagens, poses, expressões, vídeos e fundo. A IA dirige a atuação e entrega um JSON para **Importar vídeo em JSON** na biblioteca do Editor V6.

**Formato externo:** `NYMI_EDITOR_V6_REACT_V1`. **Editor:** Native Gacha, Editor V6, 30 FPS. V14.1 é a versão deste guia; não é uma nova versão do formato JSON. O conteúdo criativo deriva do V13.1 consolidado fornecido pelo usuário, incluindo seu núcleo V12.4.1. As estruturas do Editor V4 foram substituídas pelo contrato efetivamente aceito no V6.

## 1. Prioridade e fidelidade

1. A instrução explícita mais recente do usuário governa a direção criativa.
2. O roteiro e os recursos reais são a fonte de fatos, falas, relações e limites. A ficha do autor prevalece sobre pesquisa externa.
3. Este guia define a atuação; exemplos narrativos são ilustrativos, nunca dados do projeto atual.
4. O schema e a implementação reais do V6 determinam o que é importável. Não invente campos nem apresente recursos ausentes como implementados.

O roteiro de falas e pensamentos já foi escrito. **Não crie, melhore, corrija, traduza, resuma, junte, separe, troque, reordene ou omita textos.** Preserve para cada ocorrência o texto exato, quebras de linha, pontuação, falante, tipo e ordem. A IA cria a **atuação visual e os tempos**, respeitando as instruções do autor, sem criar falas novas. Uma pessoa mencionada no vídeo não vira integrante da sala automaticamente.

## 2. Antes de gerar

Leia o roteiro inteiro e o contexto adicional. Monte um inventário real: personagens do Customizador (nome único ou UUID), modelo de cada um, `poseSlot` existentes, presets de expressão disponíveis para cada modelo, vídeos publicados e seus `videoId`, `videoNumber` ou nomes únicos, duração e, se houver, UUID de fundo da biblioteca. A existência de um nome ou caminho no TXT não prova que o recurso está disponível no aplicativo.

Quando um recurso essencial não puder ser identificado sem ambiguidade, peça os dados ou apresente a limitação; nunca fabrique UUID, pose, preset, mídia ou resultado de teste. A IA não pode garantir a importação, sprites, áudio ou MP4 sem executá-los.

O TXT de exportação de Roteiros pode conter caminhos `assets/...` herdados do V4. Eles ajudam a identificar o material, mas **não entram no JSON V6**. Use identificadores da biblioteca atual. O TXT pode não conter IDs completos, fichas ou inventário atualizado: solicite os dados que faltarem.

## 3. Contrato técnico do JSON

Retorne **somente um objeto JSON válido**, sem cercas Markdown, comentários ou texto antes/depois. Se o usuário solicitar auditoria, entregue-a separadamente do arquivo JSON, sem inserir campos extras na raiz. A raiz é estrita: use apenas os campos abaixo.

```json
{
  "format": "NYMI_EDITOR_V6_REACT_V1",
  "title": "Título do roteiro",
  "seed": 20261105,
  "backgroundColor": "#d7b5cd",
  "autoPoseEverySeconds": 15,
  "autoListenerGaze": true,
  "cast": [
    { "character": "Nome único ou UUID real", "x": -30, "y": 14, "scale": 121, "flipX": false, "poseSlot": 1, "expression": "Nome ou ID real do preset" }
  ],
  "videos": [
    { "videoNumber": 1, "startSeconds": 8, "layout": { "x": 0, "y": -14, "width": 40, "height": 40, "rotation": 0 } }
  ],
  "lines": [
    { "character": "Nome único ou UUID real", "kind": "speech", "text": "Texto literal fornecido pelo usuário.", "startSeconds": 14.2, "durationSeconds": 3.9 }
  ],
  "beats": [
    { "character": "Nome único ou UUID real", "startSeconds": 10, "expression": "Nome ou ID real do preset" }
  ],
  "durationSeconds": 20
}
```

Os valores do exemplo são ilustrativos: **não presuma que pose 1, vídeo 1 ou o preset existam**. Para cada vídeo use exatamente um de `videoId`, `videoNumber` ou `videoName`; IDs devem existir, números devem estar publicados e nomes devem ser únicos. Os clipes não podem se sobrepor na faixa de vídeo. `startSeconds` é tempo absoluto do projeto; `durationSeconds` do vídeo é opcional e limita o trecho ao tamanho da mídia. `layout` é opcional e usa porcentagens do palco; se fornecido, inclua `x`, `y`, `width`, `height` e `rotation`.

`cast` aceita 1–24 personagens, cada um uma única vez; `character`, `x`, `y` são obrigatórios. A origem do palco fica em `(0,0)`, x negativo à esquerda. A escala inicial importada é **121 para todos**, mesmo que outro `scale` venha no JSON. Use `poseSlot` real ou `null` para pose base e `expression` existente no modelo; não invente nomes. Omissões podem acionar escolha automática determinística de pose ou expressão: para preservar a direção, especifique-as com base no inventário. A IA não deve confiar nesse fallback para interpretar emoções.

Em `lines`, `character`, `kind` (`speech` ou `thought`), `text`, `startSeconds` e `durationSeconds` são obrigatórios; posição e tamanho `x`, `y`, `width`, `height` são opcionais. Abertura pode ser composta por linhas e beats desde o início, sem campo `intro`. A fala aciona o agendamento de boca ligado ao personagem; pensamento não aciona fala nem escuta. A animação real depende dos assets faciais disponíveis.

Em `beats`, forneça `character`, `startSeconds` absoluto e pelo menos um de `poseSlot`, `expression`, `gaze`. Os campos omitidos persistem. O importador constrói os estados, snapshots e faixas nativos; **não emita** `schema_version`, `timeline`, `character_tracks`, `timeline_tracks`, `state`, `group_reaction`, `use_talk`, `at`, `comments` ou caminhos V4. `scene_end` e tempos de reação são dados de planejamento, não propriedades aceitas pelo JSON. Não há campo de tradução, card, loading, fades, música externa ou visibilidade neste formato de intercâmbio: informe a limitação e faça os ajustes manualmente no V6 quando necessários. Não invente uma tradução nem descarte silenciosamente um trecho de roteiro que o formato não representa.

`seed` é inteiro entre 0 e 2.147.483.647. `backgroundColor` é `#RRGGBB`; `backgroundLibraryId`, quando usado, é UUID de fundo disponível. `autoPoseEverySeconds` recebe 15 por padrão ou 0 para desligar o automático; `autoListenerGaze` é `true` por padrão. `durationSeconds` na raiz é duração mínima, não encurta eventos existentes. Limites: JSON de até 2 MB; até 500 vídeos, 10.000 linhas e 10.000 beats no formato; o compilador ainda limita a 1.000 camadas, 1.000 estados visuais e 1.000 blocos por faixa, 5.000 assets e 1.000.000 de quadros. A disponibilidade real de memória e mídias também limita o projeto.

## 4. Sala, espelhamento e atenção

Distribua a TV e os personagens segundo relações, proximidade, tensão, frequência de falas e legibilidade, salvo posicionamento definido pelo autor. O x da primeira TV é `videos[0].layout.x`, ou 0 se omitido. Em posição normal de atenção à TV, elenco à esquerda usa `flipX: false`; à direita usa `flipX: true`. O importador define isso pelo lado quando `flipX` é omitido. **Não use PT para compensar um personagem sem espelhamento.** Um `flipX` explícito é respeitado; o espelhamento é fixo por personagem neste formato.

`gaze: "left"` e `"right"` referem-se a direções **absolutas no palco**; o importador converte a direção para o rosto local depois do espelhamento. PT significa olhar para trás mantendo a emoção; não é uma emoção nem um preset `pt ...` inventado. Antes de aplicar PT, construa a geometria real: entre TV e falante, quem está do mesmo lado e mais perto da TV pode precisar olhar para trás ao ouvi-lo. Não vire automaticamente o outro lado da sala; pensamento privado não dispara PT. Ao terminar a fala, volte à orientação de atenção à TV com a emoção atual; se a emoção mudar durante PT, conserve a nova emoção ao retornar.

Com `autoListenerGaze: true`, o importador aplica a regra geométrica e recalcula nas fronteiras de falas, inclusive sobreposições. Um `gaze` explícito tem prioridade no mesmo quadro; alterações de fala posteriores podem gerar novo olhar automático. Para direção totalmente manual, defina `autoListenerGaze: false` e escreva tanto a virada quanto o retorno em beats. Respostas dirigidas ao lado oposto são exceções a planejar, não viradas automáticas para todos.

## 5. Como dirigir a atuação

### Causalidade e conhecimento

Personagem **não lê o roteiro**: reage apenas ao que já viu ou ouviu até aquele instante. Não antecipar próxima fala, revelação, vídeo ou resultado. Em cada impacto importante — ameaça, afeto, humilhação, sofrimento, romance, acusação, surpresa ou mudança de contexto — avalie **todos os presentes**. Para cada um, decida conscientemente manter ou mudar a emoção. Um personagem silencioso continua assistindo, ouvindo e interpretando.

Antes da própria fala, reavalie o speaker: sua expressão comunica como está dizendo a frase? Ao ouvir, o listener só reage quando a informação relevante chegou; não responda à frase inteira no primeiro frame se o gatilho é no final. Identifique destinatário direto por nome, pergunta, resposta, acusação, ordem ou contexto já conhecido, nunca apenas porque alguém fala depois. Pensamento é privado: não faz outros ouvirem, responderem ou virarem.

Cada emoção decorre de **estímulo + personalidade + história + relação + conhecimento atual**. Pesquise personagens de obras existentes quando necessário, distinguindo fase da história e identidade civil da heroica. Não generalize informações futuras ou poderes à versão presente. Em fanfics, respeite as fichas do autor. Aparições sugerindo romance, separação, morte ou traição não confirmam automaticamente esses fatos.

### Pico, processamento e descrição

A primeira reação coletiva, quando houver, marca o **pico do impacto**; a segunda mostra **processamento, descontração ou evolução** depois do pico. Processar não significa sorrir ou voltar a `normal`: pode ser sair de surpresa para preocupação, suspeita, seriedade ou tristeza. Avaliar todos não exige que todos mudem ou tenham reações fortes idênticas.

Leia descrição, contexto adicional, campo de duração, `scene_end` e os dois marcadores. Priorize um acontecimento com tempo explicitamente indicado na descrição; depois, considere `scene_end` e marcadores válidos e coerentes. `0,00`, `-`, vazio ou “não informado” podem ser campos incompletos, não ordens de reagir no zero nem proibição de reagir. Se o zero for literal e coerente com o autor, preserve-o. Um tempo impossível deve ser registrado como dúvida, sem inventar certeza.

Procure revelações, cortes, frases, gestos, olhares, armas, abraços e payoffs mencionados; eles podem justificar beats adicionais além dos dois marcadores. Um beat não obriga reação coletiva: uma mudança individual ou silêncio podem ser melhores. Não atribua a todos a mesma intensidade. Para cenas curtas, 1–3 beats relevantes é referência; médias, 2–5; longas, quantos o conteúdo realmente sustentar. Não use essa referência como obrigação matemática.

### Continuidade, intensidade e relações

Estados atravessam falas e vídeos. Não reinicie o elenco em `normal` a cada TikTok. Um padrão repetido deve ser processado de forma evolutiva, não provocar o mesmo choque inicial em todos os vídeos. Surpresa, confusão e impressão frequentemente são transitórias: considere o que cada um concluiu após o impacto. Não fixe a personalidade numa expressão única nem troque de rosto aleatoriamente para variar.

Revise se uma mesma expressão atravessa aproximadamente 30 segundos, dois vídeos materialmente diferentes, ou se uma pessoa muda muito menos que as outras. Pergunte se a persistência faz sentido ou se ela foi esquecida. Compare mudanças individuais, expressões distintas e duração; assimetria pode ser legítima quando a narrativa justifica.

Ciúme exige vínculo e ameaça percebida, sensação de substituição ou outro motivo concreto; futuro romântico na tela não cria amor presente. Romance não apaga suspeita, preocupação, tristeza, orgulho ou insegurança. Constrangimento e afeto são diferentes. Sofrimento pode provocar seriedade, culpa, decepção, raiva, preocupação ou tristeza, conforme cada personagem. Humor não cancela dor; provocar enquanto inseguro ou negar preocupação pode ser coerente, mas precisa de contexto.

### Poses

Comece com poses reais distribuídas de forma equilibrada e com rostos coerentes com cada personalidade; não deixe todos iguais por comodidade. Com mais personagens que poses, repetir é inevitável. A cada 15 segundos globais, procure trocar a pose de **um** personagem elegível para outra pose real, com sequência reproduzível por seed; preserve emoção e orientação. Trocas narrativas excepcionais são independentes. Uma troca de pose não muda emoção. Não use a regra antiga de trocar todo o elenco a cada sete segundos.

O automático do V6 tenta uma troca em cada marco quando há personagem com mais de uma pose; ele pula o marco se já existe beat de pose nele e não garante lidar sozinho com colisões dramáticas. Para controle criativo preciso, use `autoPoseEverySeconds: 0` e emita os beats de pose explicitamente, deslocando o mínimo necessário quando o autor exigir evitar um momento crítico. Registre exceções na auditoria.

## 6. Dicionário de atuação facial

Escolha pelo **estado interno e pela anatomia real do preset**, não apenas pela palavra mais próxima do texto. Aplique a menor intensidade adequada e confira o catálogo; o dicionário não cria assets nem garante que o modelo possua as 21 expressões. `normal`, `sorrindo de canto`, `surpresa`, `envergonhada`, `impressionada`, `indignada`, `desconfiada`, `sorriso maligno`, `nojo`, `orgulhosa`, `cansada`, `animada`, `ciumenta`, `aliviada`, `seria`, `preocupada`, `triste magoada`, `irritada`, `confusa`, `decepcionada`, `apaixonada` são categorias criativas; use só o nome ou ID confirmado no modelo.

Distinções obrigatórias: surpresa/choque não é admiração; preocupação é alerta antecipatório, tristeza é dor já sentida; confusão é busca de entendimento, desconfiança é julgamento; séria é foco sem raiva, irritada é impaciência, indignada é raiva forte; sorriso de canto é provocação leve, sorriso maligno é calculado e raro; cansaço é falta real de energia, decepção é desaprovação resignada; envergonhada é constrangimento, apaixonada exige afeto/atração efetivos. Não usar ciúme nem romance sem fundamento.

TALK deve preservar a emoção, sobrancelhas, olhos, marcas e tensão, mudando essencialmente a boca; BLINK deve preservar a emoção ao piscar. O V6 escolhe modos de face pelo agendamento e pelos assets existentes; a IA não deve inventar arquivos ou afirmar que as variantes funcionam sem verificação.

## 7. Tempo, leitura e transições

Para o primeiro comentário pós-cena, `startSeconds = início absoluto do vídeo + scene_end` válido, sem acrescentar 0,6 segundo nem silêncio automático. Respeite exceção explícita mais recente do usuário. Comentários posteriores respeitam ordem, leitura e espaço entre bolhas. Uma fala durante o vídeo é permitida quando o roteiro permitir e não atropelar informação importante. O vídeo pode continuar depois de `scene_end`; uma bubble pode continuar após o fim do MP4.

Tempo é quantizado em 30 FPS: quadro inicial = `ceil(segundos × 30)` com compensação numérica mínima; intervalos são `[início, fim)`. A duração total precisa incluir o fim de todos os clipes, linhas e estados. Entre falas, 0,3 s é referência usual, podendo variar de 0,3 a 0,5 s; instrução explícita do usuário prevalece.

Pisos de leitura: 1–3 palavras 2,6 s; 4–7 3,2 s; 8–12 3,9 s; 13–18 4,9 s; 19–25 6,2 s; 26–35 7,6 s; 36–45 9 s; 46–60 11 s; acima disso calcule individualmente. Use o maior entre o piso e `1,3 + 0,24 × palavras`, com mínimo absoluto 2,6 s. Pensamentos somam 0,4 s. Se uma duração explícita do usuário diferir, respeite a instrução. O formato V1 aceita apenas `text`, sem campo de segunda língua; não prometa importar PT e EN separadamente.

O V6 anima trocas elegíveis de pose e expressão na faixa de personagem: a transição padrão pode começar **até 250 ms antes** do quadro final do beat, limitada pelo início do bloco anterior. Isso pode antecipar visualmente uma reação em relação ao instante informado. Se causalidade exigir que ela não comece antes do gatilho, programe o estado final considerando essa antecedência e confira no editor; não desloque a primeira fala pós-cena. O formato não oferece controle por beat para corte instantâneo. As faixas amarelas dependem de estados diferentes e da animação estar habilitada; não afirme que toda fronteira produzirá uma transição.

## 8. Processo de trabalho e auditoria

1. Compare cada fala e pensamento com a fonte; conte-os e identifique falante, tipo e ordem.
2. Faça inventário confirmado dos recursos e resolva ambiguidades; decida o posicionamento e orientação da sala.
3. Planeje cada vídeo, seus tempos absolutos, `scene_end`, pico, processamento, beats adicionais e cauda; preserve textos.
4. Acompanhe por personagem emoção, pose, olhar, relações e conhecimento; reavalie speakers, listeners e silenciosos em cada estímulo.
5. Escolha presets e poses reais, planeje PT e os marcos de 15 segundos sem trocar emoção por conveniência. Considere a antecedência das transições.
6. Produza `cast`, `videos`, `lines` e `beats`; confira limites, IDs, ausência de sobreposição de vídeos e duração total. Use o formato V1, não o projeto interno ou JSON V4.
7. Audite por personagem: beats individuais/coletivos, diversidade contextual, maior intervalo sem mudança, vídeos sem reação individual e justificativas para permanência. Audite por TikTok: descrição, tempos, causalidade, pico/processamento, PT, poses e cauda. Audite por fala: texto/tipo/falante, speaker, alvo, ouvintes, instante em que escutam, PT e leitura.
8. Compare literalmente quantidade, ordem e texto do roteiro original com `lines`. Verifique todos os nomes, tempos e recursos; não declare testes de Electron, importação ou MP4 que não foram executados. Ao importar, confira o projeto na timeline, a prévia e um MP4 antes de declarar o trabalho validado.

Os exemplos da próxima seção são referências de anatomia e direção, não substitutos para os presets reais do Fabricador.

## 9. Receitas faciais originais do V13.1

As receitas abaixo são referências de atuação e anatomia; consulte os presets disponíveis no modelo. A IA não cria nem verifica assets ao gerar JSON.

## 158. Dicionário oficial das 21 expressões

1. **Neutro / Observando — `NEUTRAL / OBSERVING`**\
   **Objetivo:** estado padrão atento, calmo e analítico. Não deve parecer feliz, triste, bravo ou cansado.\
   **Sobrancelhas:** relaxadas, próximas da altura natural, praticamente simétricas; sem arqueamento dramático e sem compressão central.\
   **Olhos:** atentos, porém levemente relaxados. Pálpebras superiores discretamente mais baixas que um olhar totalmente alerta.\
   **Boca:** fechada, relativamente larga, limpa e quase reta. Pode ter uma curva relaxada mínima, mas não chega a sorrir. Cantos equilibrados.\
   **Tensão:** muito baixa.\
   **Marcas/efeitos:** mínimas; sem blush e sem degradê escuro.\
   **Atuação:** personagem está escutando, observando ou pensando normalmente. Deve ser o ponto zero para comparar as outras expressões.\
   **TALK:** abertura baixa, calma e quase simétrica.
2. **Sorrisinho de Canto — `SIDE SMIRK`**\
   **Objetivo:** satisfação discreta, charme, provocação leve ou sensação de “eu sei de alguma coisa”. Não é malicioso.\
   **Sobrancelhas:** confiantes e relaxadas; pode haver pequena assimetria, mas sem o arco agressivo do sorriso malicioso.\
   **Olhos:** confiantes, relaxados e conscientes da outra pessoa; podem ficar ligeiramente mais estreitos que Neutral.\
   **Boca:** fechada e lateralmente assimétrica. Um canto sobe de forma claramente visível, o outro permanece mais plano. Curva elegante.\
   **Tensão:** baixa a média.\
   **Marcas/efeitos:** pequenos sinais no canto da boca ou dos olhos; sem blush e normalmente sem sombra escura.\
   **Atuação:** provocação gentil, charme, pequena vitória, resposta irônica leve.\
   **TALK:** abertura assimétrica mantendo o canto mais alto.
3. **Surpresa / Choque — `SURPRISE / SHOCK`**\
   **Objetivo:** reação imediata e forte a algo inesperado.\
   **Sobrancelhas:** ambas claramente levantadas; arco alto, relativamente simétrico.\
   **Olhos:** mais abertos que Neutral. A abertura vem principalmente da elevação da pálpebra superior. Deve ser uma das maiores aberturas do conjunto, mas sem deformar os olhos.\
   **Boca:** continua fechada no BASE; relativamente larga, comprimida e tensa. Deve parecer que a pessoa travou por um instante.\
   **Tensão:** alta e instantânea.\
   **Marcas/efeitos:** pequenas marcas de reação ao redor dos olhos/bochechas; sombra emocional superior leve opcional; sem blush por padrão.\
   **Atuação:** “O quê?!”, descoberta repentina, susto, informação inesperada.\
   **TALK:** abertura reativa pequena, maior que Neutral, mas nunca um grito enorme.
4. **Envergonhado / Sem Jeito — `EMBARRASSED / AWKWARD`**\
   **Objetivo:** constrangimento social, nervosismo, desconforto e dificuldade de reagir.\
   **Sobrancelhas:** nervosas, com leve irregularidade; menos firmes e mais inseguras.\
   **Olhos:** desconfortáveis; pálpebras levemente comprimidas. A expressão deve parecer retraída.\
   **Boca:** fechada, largura média; comprimida, hesitante, irregular e até levemente trêmula.\
   **Tensão:** média, nervosa.\
   **Marcas/efeitos:** **blush claramente visível**, pequenas marcas de estresse; gota de suor pequena opcional. Sem degradê preto por padrão.\
   **Atuação:** personagem foi pego de surpresa socialmente, ficou sem graça, está tentando responder enquanto sente vergonha.\
   **TALK:** pequena abertura hesitante mantendo a irregularidade.
5. **Impressionado — `IMPRESSED`**\
   **Objetivo:** admiração, impacto positivo ou “uau” controlado. Menos intenso que Shock.\
   **Sobrancelhas:** um pouco levantadas, de maneira controlada.\
   **Olhos:** mais atentos e ligeiramente mais abertos que Neutral, porém claramente menos abertos que Surprise.\
   **Boca:** fechada, relativamente larga, firme; pode ter compressão ou uma curva sutil de admiração. Não deve virar um grande sorriso.\
   **Tensão:** média-baixa, positiva.\
   **Marcas/efeitos:** pequenas marcas de impacto; brilho ocular discreto opcional; sem blush e sem degradê escuro por padrão.\
   **Atuação:** algo é surpreendentemente bom, competente, bonito ou impressionante.\
   **TALK:** abertura compacta e controlada.
6. **Indignado / Bravo — `INDIGNANT / ANGRY`**\
   **Objetivo:** raiva forte, indignação e confronto. Deve ser muito mais intenso que Serious ou Irritated.\
   **Sobrancelhas:** fortemente abaixadas e inclinadas para dentro; lados internos descem/convergem na direção do centro do rosto.\
   **Olhos:** afiados, tensos e agressivos; pálpebras superiores pressionam o olhar.\
   **Boca:** fechada e larga; muito comprimida, dura, agressiva e achatada. Pode possuir ângulo descendente forte.\
   **Tensão:** muito alta.\
   **Marcas/efeitos:** marcas fortes de testa e sobrancelhas, linhas de tensão facial; símbolo de veia de raiva opcional. **Degradê escuro mais forte do Prompt 1**, concentrado na metade superior do rosto e enfraquecendo para baixo.\
   **Atuação:** verdadeira raiva, discussão séria, ofensa, ameaça ou situação intolerável.\
   **TALK:** abertura curta, tensa, cortante, com cantos duros.
7. **Desconfiado / Julgando — `SUSPICIOUS / JUDGING`**\
   **Objetivo:** ceticismo, julgamento, descrença: “não acredito nisso”.\
   **Sobrancelhas:** assimetria forte; **uma fica claramente mais alta que a outra**.\
   **Olhos:** também assimétricos, com aparência julgadora; uma pálpebra pode pressionar mais que a outra.\
   **Boca:** fechada, larga, torta/lateral. Um lado é puxado mais que o outro.\
   **Tensão:** média.\
   **Marcas/efeitos:** marcas limpas de julgamento; degradê superior moderado, claramente abaixo da intensidade de Angry. Sem blush.\
   **Atuação:** questionar a honestidade de alguém, achar algo suspeito, considerar uma explicação absurda.\
   **TALK:** abertura lateral e cética, mantendo a boca torta.
8. **Sorrisinho Malicioso de Canto — `EVIL SIDE SMIRK`**\
   **Objetivo:** provocação sombria, calculista e deliberadamente maliciosa.\
   **Sobrancelhas:** uma fica bastante arqueada e afiada; a outra mais baixa e firme. Assimetria maior que Side Smirk.\
   **Olhos:** baixos, calculistas e levemente estreitados.\
   **Boca:** fechada, larga, diagonal e fortemente assimétrica. Um canto fica muito mais alto. Curva afiada e maliciosa.\
   **Tensão:** média, controlada.\
   **Marcas/efeitos:** marcas discretas de malícia perto do olho/boca; sombra ominosa superior leve opcional; sem blush.\
   **Atuação:** personagem tem vantagem, pretende provocar, sabe algo perigoso ou está prestes a fazer algo questionável.\
   **TALK:** abertura baixa e assimétrica mantendo o canto malicioso.
9. **Nojo / Repulsa — `DISGUST / REPULSION`**\
   **Objetivo:** rejeição física/emocional clara. Não deve parecer apenas bravo.\
   **Sobrancelhas:** contraídas e puxadas para baixo.\
   **Olhos:** estreitados; uma pálpebra pode fechar mais que a outra.\
   **Nariz:** levemente enrugado/tensionado — elemento importante dessa expressão.\
   **Boca:** fechada, larga, retraída, irregular. Centro comprimido; um canto pode puxar para trás/cima enquanto o outro permanece rígido.\
   **Tensão:** alta na região central do rosto.\
   **Marcas/efeitos:** marcas no nariz e boca; sombra emocional moderada principalmente na metade superior, olhos e nariz. Sem blush.\
   **Atuação:** algo cheira mal, é repulsivo, moralmente nojento ou fisicamente desagradável.\
   **TALK:** abertura compacta mantendo a retração dos cantos.
10. **Orgulhoso / Convencido — `PROUD / SMUG`**\
    &#x20;  **Objetivo:** autoconfiança, satisfação consigo mesmo, sensação de superioridade controlada.\
    &#x20;  **Sobrancelhas:** arqueadas com confiança; mais equilibradas que Evil Smirk.\
    &#x20;  **Olhos:** seguros; pálpebras superiores levemente abaixadas numa atitude relaxada e dominante.\
    &#x20;  **Boca:** sorriso fechado, largo, limpo e quase simétrico. Ambos os cantos sobem discretamente.\
    &#x20;  **Tensão:** baixa, controlada.\
    &#x20;  **Marcas/efeitos:** pequenas marcas nos cantos da boca; sem blush e sem degradê escuro.\
    &#x20;  **Atuação:** “eu sabia”, “óbvio que consegui”, confiança elevada sem necessariamente ser hostil.\
    &#x20;  **TALK:** abertura equilibrada e confiante, cantos levemente elevados.
11. **Cansado / Exausto — `TIRED / EXHAUSTED`**\
    &#x20;  **Objetivo:** exaustão real, falta de energia. Não tristeza.\
    &#x20;  **Sobrancelhas:** soltas, fracas, sem energia muscular.\
    &#x20;  **Olhos:** quase fechados; pálpebras superiores muito pesadas e baixas.\
    &#x20;  **Boca:** fechada, relativamente larga, macia e caída; centro e cantos ligeiramente para baixo. Não muito comprimida.\
    &#x20;  **Tensão:** muito baixa; peso facial alto.\
    &#x20;  **Marcas/efeitos:** marcas visíveis abaixo dos olhos e sombreado delicado de fadiga; sem degradê preto geral.\
    &#x20;  **Atuação:** privação de sono, esforço prolongado, personagem sem energia para reagir.\
    &#x20;  **TALK:** abertura fraca e baixa, cantos ainda caídos.
12. **Animado / Entusiasmado — `EXCITED / ENTHUSIASTIC`**\
    &#x20;  **Objetivo:** energia positiva forte. Não é Surprise.\
    &#x20;  **Sobrancelhas:** abertas e otimistas.\
    &#x20;  **Olhos:** vivos e brilhantes; pálpebras superiores um pouco levantadas, mas sem a abertura extrema de Shock.\
    &#x20;  **Bochechas:** levemente erguidas pela energia do sorriso.\
    &#x20;  **Boca:** **o sorriso fechado mais largo das 21 expressões originais do conjunto**; ambos os cantos claramente elevados, arco positivo forte.\
    &#x20;  **Tensão:** positiva, alta.\
    &#x20;  **Marcas/efeitos:** brilho ocular opcional; blush positivo muito leve opcional; sem degradê preto.\
    &#x20;  **Atuação:** entusiasmo genuíno, notícia boa, expectativa positiva, empolgação.\
    &#x20;  **TALK:** abertura mais animada e larga, mas ainda controlada.
13. **Ciumento — `JEALOUS`**\
    &#x20;  **Objetivo:** ressentimento contido, ciúme e incômodo emocional. Não é raiva aberta.\
    &#x20;  **Sobrancelhas:** puxadas discretamente para dentro, com pequena contração central.\
    &#x20;  **Olhos:** intensos; pálpebras baixas e tensas.\
    &#x20;  **Boca:** fechada, larga e moderadamente comprimida; um lado fica mais preso/puxado que o outro.\
    &#x20;  **Tensão:** média-alta, reprimida.\
    &#x20;  **Marcas/efeitos:** marcas de tensão; blush muito leve opcional; degradê emocional superior moderado, abaixo de Angry.\
    &#x20;  **Atuação:** personagem tenta esconder que algo afetou seu orgulho ou vínculo afetivo.\
    &#x20;  **TALK:** abertura baixa e contida, mantendo tensão unilateral.
14. **Aliviado — `RELIEVED`**\
    &#x20;  **Objetivo:** liberação de tensão, “ufa”. Não é Excited.\
    &#x20;  **Sobrancelhas:** completamente relaxadas.\
    &#x20;  **Olhos:** semi-fechados ou suavemente relaxados; parecem soltos, não pesados como Tired.\
    &#x20;  **Boca:** sorriso fechado raso, largo e suave; cantos sobem pouco.\
    &#x20;  **Tensão:** muito baixa.\
    &#x20;  **Marcas/efeitos:** pequena gota de suor ou brilho ocular opcionais; sem blush e sem degradê escuro.\
    &#x20;  **Atuação:** perigo passou, resposta desejada chegou, personagem finalmente relaxa.\
    &#x20;  **TALK:** abertura baixa e suave mantendo leve sorriso.
15. **Sério — `SERIOUS`**\
    &#x20;  **Objetivo:** foco, gravidade e tensão controlada **sem raiva**. Serve para frases importantes, decisões, explicações e problemas reais.\
    &#x20;  **Sobrancelhas:** ambas discretamente abaixo do Neutral; praticamente simétricas; lados internos podem apontar um pouco para dentro/baixo, mas com ângulo raso.\
    &#x20;  **Olhos:** atentos, focados e moderadamente estreitos; pálpebra superior mais firme.\
    &#x20;  **Boca:** fechada, média-larga, reta e firme. Pouquíssima curva; cantos neutros ou só minimamente endurecidos para baixo.\
    &#x20;  **Tensão:** baixa-média e estável.\
    &#x20;  **Marcas/efeitos:** marcas controladas mínimas; sem blush e normalmente sem degradê. Sombra de tensão muito leve apenas se necessário.\
    &#x20;  **Atuação:** “Agora temos um problema”, “Ela precisa comer”, conversa séria sem hostilidade.\
    &#x20;  **TALK:** abertura horizontal, compacta e firme.
16. **Preocupado — `WORRIED`**\
    &#x20;  **Objetivo:** **ansiedade alerta/protetora**. A pessoa acredita no perigo e está preocupada com o que pode acontecer. É deliberadamente muito diferente de Sad/Hurt.\
    &#x20;  **Assinatura:** **sobrancelhas altas + olhos abertos/alertas + boca pequena e apertada + gota de suor**.\
    &#x20;  **Sobrancelhas:** ambas claramente altas; extremidades internas fortemente levantadas; arco de preocupação alto; ligeiramente puxadas uma em direção à outra.\
    &#x20;  **Olhos:** claramente mais abertos e alertas que Sad/Hurt. Pálpebras superiores levantadas; nada de olhar pesado ou lacrimejante.\
    &#x20;  **Boca:** fechada, **menor e mais apertada** que Sad. Formato horizontal tenso; centro pinçado; cantos puxados para dentro/lateralmente, e não para baixo.\
    &#x20;  **Tensão:** alta, nervosa, antecipatória.\
    &#x20;  **Marcas/efeitos:** **uma pequena gota de suor obrigatória**; marcas de ansiedade nas sobrancelhas/área externa dos olhos; sem lágrimas. Degradê superior de preocupação **leve a moderado**.\
    &#x20;  **Atuação:** medo pelo bem-estar de alguém, perceber que existe risco, esperar uma consequência ruim. A mente ainda está ativa procurando solução.\
    &#x20;  **TALK:** abertura pequena e horizontalmente tensa; não usar cantos tristes para baixo.
17. **Triste / Magoado — `SAD / HURT`**\
    &#x20;  **Objetivo:** dor emocional, vulnerabilidade e sofrimento. Deve ser o oposto visual de Worried: não alerta, mas **machucado e pesado**.\
    &#x20;  **Assinatura:** **sobrancelhas de dor + olhos pesados + boca claramente caída + olhos úmidos**.\
    &#x20;  **Sobrancelhas:** extremidades internas levantadas num arco doloroso; juntas no centro, porém o conjunto fica mais baixo que Worried.\
    &#x20;  **Olhos:** pálpebras superiores claramente mais baixas/pesadas; abertura menor que Worried; olhar vulnerável, abatido.\
    &#x20;  **Boca:** fechada, média-larga e **claramente curvada para baixo**. Ambos os cantos descem de forma perceptível; pequena instabilidade/tremor permitido.\
    &#x20;  **Tensão:** emocional, para dentro.\
    &#x20;  **Marcas/efeitos:** **brilho aquoso nos olhos obrigatório**, marcas emocionais suaves abaixo dos olhos obrigatórias; sem gota de suor; sem blush. Degradê emocional superior **moderado**.\
    &#x20;  **Atuação:** lembrança dolorosa, abandono, rejeição, insegurança profunda, personagem emocionalmente ferido.\
    &#x20;  **TALK:** abertura triste mais larga e baixa; ambos os cantos continuam visivelmente caídos.
18. **Irritado — `IRRITATED`**\
    &#x20;  **Objetivo:** impaciência e irritação clara, porém abaixo de Angry. “Você está me irritando.”\
    &#x20;  **Sobrancelhas:** moderadamente abaixadas; extremidades internas apontam para dentro. Tensão visível, mas muito menor que Angry.\
    &#x20;  **Olhos:** moderadamente estreitos, tensos e pouco impressionados. Mais afiados que Serious.\
    &#x20;  **Boca:** fechada, média-larga; achatada e comprimida. Pode possuir leve diagonal ou puxão lateral. Mais dura que Serious, mas menos extrema que Angry.\
    &#x20;  **Tensão:** média-alta.\
    &#x20;  **Marcas/efeitos:** marcas de tensão em testa/têmpora; pequena marca de irritação permitida. Sem blush. **Degradê superior moderado**, claramente abaixo de Angry.\
    &#x20;  **Atuação:** paciência acabando, alguém disse algo irritante, personagem quer encerrar a discussão sem estar furioso.\
    &#x20;  **TALK:** abertura curta, comprimida e cortante.
19. **Confuso — `CONFUSED`**\
    &#x20;  **Objetivo:** processar informação estranha, “hã?”, “como assim?”. Não é suspeita nem choque.\
    &#x20;  **Assinatura:** **assimetria questionadora**.\
    &#x20;  **Sobrancelhas:** assimétricas; uma visivelmente mais alta, a outra neutra ou discretamente baixa. A assimetria é curiosa, não julgadora.\
    &#x20;  **Olhos:** atentos/procurando resposta; um pode estar ligeiramente mais aberto que o outro.\
    &#x20;  **Boca:** fechada, pequena-média, **torta e questionadora**. Um canto claramente diferente do outro; centro pode ficar pinçado.\
    &#x20;  **Tensão:** baixa-média, cognitiva.\
    &#x20;  **Marcas/efeitos:** pequenas marcas de dúvida; símbolo de interrogação/uncertainty permitido. Sem blush e sem degradê escuro por padrão.\
    &#x20;  **Atuação:** personagem ainda está tentando entender; informação não encaixa; reação curta antes de perguntar algo.\
    &#x20;  **TALK:** abertura pequena, questionadora e assimétrica.
20. **Decepcionado — `DISAPPOINTED`**\
    &#x20;  **Objetivo:** frustração resignada: “eu esperava mais”, “sério isso?”. Diferente de Confused porque **já entendeu** o que aconteceu; apenas desaprovou.\
    &#x20;  **Assinatura:** **simetria resignada + queda suave**, em oposição à assimetria curiosa de Confused.\
    &#x20;  **Sobrancelhas:** discretamente baixas; extremidades externas achatadas/caídas; tensão resignada e relativamente simétrica.\
    &#x20;  **Olhos:** pálpebras superiores moderadamente baixas; olhar cansado da situação, mas não fisicamente exausto. Olhos mais equilibrados/simétricos que Confused.\
    &#x20;  **Boca:** fechada, média-larga; **curva rasa para baixo**, ambos os cantos discretamente caídos. Muito mais uniforme que Confused e menos profunda que Sad/Hurt.\
    &#x20;  **Tensão:** baixa-média, resignada.\
    &#x20;  **Marcas/efeitos:** marcas discretas de desânimo; sem blush. Degradê emocional superior **leve a moderado**, mais quieto que Sad/Hurt.\
    &#x20;  **Atuação:** alguém tomou uma decisão ruim; comportamento ficou abaixo das expectativas; personagem desaprova sem explodir.\
    &#x20;  **TALK:** abertura baixa e resignada, mantendo queda rasa e relativamente simétrica.
21. **Apaixonado / Olhar Apaixonado — `LOVE-STRUCK / LOVING GAZE`**\
    &#x20;  **Objetivo:** carinho, atração e ternura evidentes. **Não é vergonha.** Deve servir como estado romântico estável depois de Embarrassed.\
    &#x20;  **Sobrancelhas:** suavemente levantadas, arco gentil e relaxado; pouquíssima tensão.\
    &#x20;  **Olhos:** suaves, atentos e calorosos; pálpebras superiores relaxadas/levemente baixas; brilho ocular discreto permitido.\
    &#x20;  **Boca:** fechada, média-larga, sorriso afetivo suave. Ambos os cantos sobem gentilmente; curva relaxada, podendo ter assimetria natural mínima. Não deve parecer Side Smirk.\
    &#x20;  **Tensão:** quase nenhuma; sensação de segurança e afeto.\
    &#x20;  **Marcas/efeitos:** pouquíssimas marcas. **Blush apenas opcional e MUITO leve**, localizado principalmente nas bochechas e obrigatoriamente muito mais fraco que Embarrassed. Sem degradê preto. Brilho ocular sutil recomendado.\
    &#x20;  **Atuação:** olhar para alguém com carinho, admiração romântica, proximidade emocional, ternura silenciosa. Pode ser usado depois de uma fase de vergonha para mostrar que o constrangimento passou e ficou apenas o afeto.\
    &#x20;  **TALK:** abertura suave e afetuosa mantendo cantos gentilmente elevados.


## 10. Exemplos narrativos preservados do V13.1

Estes exemplos aplicam-se somente quando esses personagens e esta fase forem relevantes para o roteiro. A ficha e as instruções do autor prevalecem sobre eles.

## 176. Callisto — regra de provocação

Callisto do começo não deve ter `sorrindo de canto` como estado automático.

Usar:

### `sorrindo de canto`
Somente provocação leve, pequena vitória ou ironia relativamente relaxada.

### `sorriso maligno`
Quando ele deliberadamente explora desconforto, possui vantagem ou provoca de forma ameaçadora/calculada.

### `orgulhosa`
Quando predomina superioridade/autoconfiança, sem intenção específica de ferir.

### `desconfiada`
Quando está tentando ler Penelope ou percebe que ela sabe algo.

### `seria`
Quando o futuro deixa de ser engraçado e exige avaliação real.

### `confusa`
Quando a informação genuinamente não encaixa em sua compreensão.

### `impressionada`
Quando observa capacidade, ousadia ou algo positivamente inesperado.

No começo:

> curiosidade não é amizade.

Provocação não é carinho.

Interesse não é romance.

## 177. Penelope — regra de defesa

Penelope do começo deve priorizar:

```text
desconfiada
seria
preocupada
irritada
confusa
surpresa
```

conforme o estímulo.

`envergonhada` exige constrangimento social verdadeiro e não deve ser acionada simplesmente porque a TV sugere romance.

`apaixonada` exige vínculo emocional real e deve ser praticamente impossível para a versão inicial apenas assistindo ao futuro.

A pergunta interna típica é:

> “Que risco/informação isso representa?”

antes de:

> “O que isso significa romanticamente?”

## 178. Reynold — regra de hostilidade e rachadura gradual

No começo:

- hostilidade;
- irritação;
- julgamento;
- orgulho;
- explosão rápida.

Proteção deve surgir como contradição:

```text
irritada
→ preocupada
→ nega a preocupação
```

Não usar `ciumenta` cedo apenas porque Callisto aparece perto de Penelope.

A expressão `ciumenta` só é adequada quando já existe territorialidade fraternal suficiente para justificar a anatomia de ressentimento contido.

## 179. Derrick — regra de controle

Derrick não deve reagir como “Reynold menos barulhento”.

Priorizar:

```text
normal
seria
desconfiada
decepcionada
irritada
preocupada
impressionada
```

conforme:

- reputação;
- segurança;
- política;
- controle;
- evidência que contradiz seu julgamento.

Mudanças emocionais fortes devem ser raras e significativas.

## 180. Duque — regra de autoridade/paternidade involuntária

Duque não precisa ficar eternamente `seria`.

Pode usar:

- `normal` para observação;
- `desconfiada` para avaliar Callisto/intenção;
- `decepcionada` para culpa/desaprovação resignada;
- `surpresa` em descoberta realmente inesperada;
- `preocupada` quando risco à filha se torna concreto;
- `impressionada` diante de competência/posição inesperada.

Mas sua atuação deve permanecer contida.
