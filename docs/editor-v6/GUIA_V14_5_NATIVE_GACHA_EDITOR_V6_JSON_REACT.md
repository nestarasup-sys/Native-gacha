# GUIA V14.5 — Native Gacha / Editor V6 — React editável por JSON

**Uso:** entregue à IA este guia, o roteiro exportado em Markdown e um inventário atual de personagens, poses, expressões, vídeos e fundo. A IA dirige a atuação e entrega um JSON para **Importar vídeo em JSON** na biblioteca do Editor V6.

**Formato externo:** `NYMI_EDITOR_V6_REACT_V1`. **Editor:** Native Gacha, Editor V6, 30 FPS. V14.5 é a versão deste guia; não é uma nova versão do formato JSON. O conteúdo criativo deriva do V13.1 consolidado fornecido pelo usuário, incluindo seu núcleo V12.4.1. As estruturas do Editor V4 foram substituídas pelo contrato efetivamente aceito no V6.

**Novidade V14.2 — PT contínuo por diálogo:** a direção de olhar considera a conversa completa, seus interlocutores e as pausas entre falas. O personagem não retorna à TV apenas porque uma fala terminou ou porque passou de ouvinte a falante. A IA planeja essa continuidade com os campos existentes do V6; não é uma nova função do importador.

**V14.3 — cards e Loading por vídeo:** mantém os recursos de apresentação documentados no V6.

**V14.5 — Intro opcional:** adiciona apresentações bilíngues de personagens e telas pretas com texto. Veja a seção 3.4.

**V14.4 — consolidação integral de direção:** recupera a estrutura operacional, as regras criativas, a interpretação temporal, o dicionário facial e as auditorias detalhadas do V13.1/V12.4.1, adaptando a materialização ao V6. Retira exemplos e prescrições de personagens específicos de outros projetos. **Loading é obrigatório antes de cada vídeo, inclusive o primeiro, salvo dispensa explícita do autor.** A regra antiga de Loading opcional está revogada. O formato permanece `NYMI_EDITOR_V6_REACT_V1`.

**Fontes e escopo:** V13.1 consolidado (Editor V4), V14.1 enviado e V14.3 (última versão com cards, GIF e PT contínuo). O V13.1 fornece a intenção criativa e a organização do trabalho; não fornece um schema válido para o V6. As funcionalidades técnicas aqui descritas são as documentadas pelo V14.3, não uma nova auditoria do código do aplicativo.

**Mapa do guia:** 1–3: fontes, inventário e contrato V6; 3.1–3.3: apresentação e Loading; 4: sala e PT; 5: direção; 6: atuação facial; 7: tempos; 8: produção e auditoria; 9: 21 receitas faciais; 10: dicionário operacional recuperado; 11: interpretação de roteiro e beats; 12: materialização e equivalências V4 → V6; 13: procedimento completo; 14: auditoria; 15: exemplos e checklist final.

## 1. Prioridade e fidelidade

1. A instrução explícita mais recente do usuário governa a direção criativa.
2. O roteiro e os recursos reais são a fonte de fatos, falas, relações e limites. A ficha do autor prevalece sobre pesquisa externa.
3. Este guia define a atuação; exemplos narrativos são ilustrativos, nunca dados do projeto atual.
4. O schema e a implementação reais do V6 determinam o que é importável. Não invente campos nem apresente recursos ausentes como implementados.

O roteiro de falas e pensamentos já foi escrito. **Não crie, melhore, corrija, traduza, resuma, junte, separe, troque, reordene ou omita textos.** Preserve para cada ocorrência o texto exato, quebras de linha, pontuação, falante, tipo e ordem. A IA cria a **atuação visual e os tempos**, respeitando as instruções do autor, sem criar falas novas. Uma pessoa mencionada no vídeo não vira integrante da sala automaticamente.

## 2. Antes de gerar

Leia o roteiro inteiro e o contexto adicional. Monte um inventário real: personagens do Customizador (nome único ou UUID), modelo de cada um, categorias de poses disponíveis, presets de expressão disponíveis para cada modelo, vídeos publicados e seus `videoId`, `videoNumber` ou nomes únicos, duração e, se houver, UUID de fundo da biblioteca. A existência de um nome ou caminho no roteiro não prova que o recurso está disponível no aplicativo.

Quando um recurso essencial não puder ser identificado sem ambiguidade, peça os dados ou apresente a limitação; nunca fabrique UUID, pose, preset, mídia ou resultado de teste. A IA não pode garantir a importação, sprites, áudio ou MP4 sem executá-los.

O botão **Exportar roteiro** da área Roteiros gera um Markdown para o V6 com IDs do elenco, poses selecionadas em Poses Dev, presets reais, fichas locais, fundo, vídeos, tempos, descrições e textos. Cada campo `Português` ou `English` é uma string JSON: decodifique aspas e escapes para recuperar o texto exato. Dados marcados indisponíveis precisam ser corrigidos antes da importação. TXTs antigos podem conter caminhos `assets/...` do V4; eles ajudam a identificar o material, mas **não entram no JSON V6**. Se faltar informação, solicite-a.

Para cada personagem use `poseCategory` com uma categoria disponível no inventário, como `"Em pé"` ou `"Sentado"`. O importador escolhe uma variação real entre as poses selecionadas em Poses Dev. Não invente categorias.

Confira também a categoria informada no inventário: para manter alguém sentado ou em pé, escolha apenas variações da mesma categoria. Não misture Em pé e Sentado sem pedido explícito.

## 3. Contrato técnico do JSON

Retorne **somente um objeto JSON válido**, sem cercas Markdown, comentários ou texto antes/depois. Se o usuário solicitar auditoria, entregue-a separadamente do arquivo JSON, sem inserir campos extras na raiz. A raiz é estrita: use apenas os campos documentados nesta seção, incluindo o campo opcional da seção 3.4.

```json
{
  "format": "NYMI_EDITOR_V6_REACT_V1",
  "title": "Título do roteiro",
  "seed": 20261105,
  "backgroundColor": "#d7b5cd",
  "autoPoseEverySeconds": 15,
  "autoListenerGaze": false,
  "cast": [
    { "character": "Nome único ou UUID real", "x": -30, "y": 14, "scale": 121, "flipX": false, "poseCategory": "Em pé", "expression": "Nome ou ID real do preset" }
  ],
  "videos": [
    { "videoNumber": 1, "startSeconds": 8, "layout": { "x": 0, "y": -5, "width": 40, "height": 40, "rotation": 0 }, "presentation": { "loadingGif": true } }
  ],
  "lines": [
    { "character": "Nome único ou UUID real", "kind": "speech", "text": "Texto literal fornecido pelo usuário.", "englishText": "Exact translation supplied by the user.", "startSeconds": 14.2, "durationSeconds": 3.9 }
  ],
  "beats": [
    { "character": "Nome único ou UUID real", "startSeconds": 10, "expression": "Nome ou ID real do preset" }
  ],
  "durationSeconds": 20
}
```

Os valores do exemplo são ilustrativos: **não presuma que uma categoria de pose, vídeo 1 ou preset exista**. Para cada vídeo use exatamente um de `videoId`, `videoNumber` ou `videoName`; IDs devem existir, números devem estar publicados e nomes devem ser únicos. Os clipes não podem se sobrepor na faixa de vídeo. `startSeconds` é tempo absoluto do projeto sem Intro, ou relativo ao fim da Intro quando presente; `durationSeconds` do vídeo é opcional e limita o trecho ao tamanho da mídia. `layout` é opcional e usa porcentagens do palco; se fornecido, inclua `x`, `y`, `width`, `height` e `rotation`.

`cast` aceita 1–24 personagens, cada um uma única vez; `character`, `x`, `y` são obrigatórios. A origem do palco fica em `(0,0)`, x negativo à esquerda. A escala inicial importada é **121 para todos**, mesmo que outro `scale` venha no JSON. Use `poseCategory` disponível e `expression` existente no modelo; não invente nomes. Para arquivos antigos, `poseSlot` continua aceito, mas não combine referências por categoria e por slot no mesmo personagem. Para usar a pose base quando não houver seleção, informe `poseSlot: null` e não use categoria nesse personagem. Omissões podem acionar escolha automática determinística de pose ou expressão: para preservar a direção, especifique-as com base no inventário. A IA não deve confiar nesse fallback para interpretar emoções.

Em `lines`, `character`, `kind` (`speech` ou `thought`), `text`, `startSeconds` e `durationSeconds` são obrigatórios; `englishText` e posição e tamanho `x`, `y`, `width`, `height` são opcionais. Quando houver tradução fornecida, copie-a literalmente em `englishText`; ela aparece no balão superior e `text` no inferior. Sem esse campo, há um único balão. Abertura pode ser composta por linhas e beats desde o início, sem usar o campo opcional `intro`. A fala aciona o agendamento de boca ligado ao personagem; pensamento não aciona fala nem escuta. A animação real depende dos assets faciais disponíveis.

Em `beats`, forneça `character`, `startSeconds` no relógio do conteúdo principal e pelo menos um de `poseCategory`, `expression`, `gaze`. Os campos omitidos persistem. O importador constrói os estados, snapshots e faixas nativos; **não emita** `schema_version`, `timeline`, `character_tracks`, `timeline_tracks`, `state`, `group_reaction`, `use_talk`, `at`, `comments` ou caminhos V4. `scene_end` e tempos de reação são dados de planejamento, não propriedades aceitas pelo JSON. Não há campo de fades, música externa ou visibilidade neste formato de intercâmbio: informe a limitação e faça os ajustes manualmente no V6 quando necessários. Não invente uma tradução nem descarte silenciosamente um trecho de roteiro que o formato não representa.

`seed` é inteiro entre 0 e 2.147.483.647. `backgroundColor` é `#RRGGBB`; `backgroundLibraryId`, quando usado, é UUID de fundo disponível. `autoPoseEverySeconds` recebe 15 por padrão ou 0 para desligar o automático; `autoListenerGaze` é `true` por padrão no importador, mas o padrão de geração deste guia é **`false` explícito**, com direção de olhar planejada pela IA (seção 4). `durationSeconds` na raiz é duração mínima, não encurta eventos existentes. Limites: JSON de até 2 MB; até 500 vídeos, 10.000 linhas e 10.000 beats no formato; o compilador ainda limita a 1.000 camadas, 1.000 estados visuais e 1.000 blocos por faixa, 5.000 assets e 1.000.000 de quadros. A disponibilidade real de memória e mídias também limita o projeto.

### 3.1. Apresentação de cada vídeo — cards solicitados e Loading obrigatório (V14.4)

**Todo item de `videos` deve conter `presentation.loadingGif: true`, inclusive quando não houver solicitação de cards.** Isso é a política de autoria V14.4, não uma alteração do default do aplicativo. Só omita/desative o GIF se o usuário dispensar expressamente o Loading naquele vídeo ou projeto. A ausência de uma instrução sobre GIF não é dispensa.

Cards superiores e inferiores continuam independentes e são ativados quando solicitados pelo autor. Se o autor pedir cards para todos os vídeos e fornecer `TEMPO`, `CARD`, classificação ou equivalências em um roteiro narrativo complementar, esse pedido já é suficiente: não exija que ele repita a instrução no Contexto adicional de cada vídeo. Faça o vínculo por ID, número original ou nome único. A classificação temporal isolada da Base de Vídeos, sem pedido de card, não é autorização automática de exibição. Não confunda nome do ator original com o papel na adaptação.

No campo **Contexto adicional** do trecho em Roteiros, o autor pode escrever, por exemplo, “Vídeo 01: mostrar Loading antes do vídeo, card temporal Past e card inferior com o texto ‘A primeira missão’”. Ao preparar o JSON, converta esse pedido para os campos da apresentação do Vídeo 01.

```json
{
  "videoNumber": 1,
  "startSeconds": 8,
  "presentation": {
    "bottomCard": "Texto do card abaixo do vídeo",
    "timeCard": "Past",
    "loadingGif": true
  }
}
```

- `bottomCard`: texto solicitado pelo autor, de 1 a 240 caracteres depois de aparar espaços externos. O card é SVG e fica encostado abaixo da imagem do vídeo, com a mesma largura da imagem visível. Para evitar corte em vídeos muito pequenos, prefira textos curtos.
- `timeCard`: card acima da imagem do vídeo. Aceita exclusivamente `"Past"`, `"Future"` ou `"Indecipherable"`, com essas maiúsculas e em inglês. Só use `"Indecipherable"` se o autor pedir o card e indicar que o contexto é indecifrável.
- `loadingGif`: use `true` para exibir o GIF Loading fornecido com o aplicativo, centralizado no palco. Com início em 8 s, ele fica visível de 5 s até imediatamente antes de 8 s. Omitir ou usar `false` desativa o GIF no aplicativo; no V14.4 isso só é permitido por dispensa explícita. Reserve três segundos livres antes do clipe, inclusive o primeiro, após o fim da cauda do bloco anterior. O campo não desloca o início do clipe automaticamente. Se o clipe começar antes de 3 s, o GIF é recortado no quadro zero; se começar no quadro zero, não aparece. Não programe esse recorte no fluxo padrão.
- Os cards fixos aparecem do primeiro ao último quadro do clipe, acompanham sua posição, rotação e tamanho e somem quando termina. Reserve espaço acima e abaixo no palco. Os cards ficam à frente do vídeo e atrás dos personagens e balões. O GIF fica à frente da cena. Se janelas de carregamento coincidirem, o palco mostra um GIF por vez, associado ao próximo vídeo sinalizado.
- Os elementos são salvos com o clipe e aparecem na prévia e no MP4. Mover ou aparar um clipe recalcula o intervalo. Ao dividir, os cards continuam nas duas peças e o GIF permanece na primeira. O export de roteiro JSON conserva `presentation`. O MP4 com esses recursos usa a composição padrão Electron/FFmpeg.

Para controlar quando os cards aparecem, use as listas opcionais `bottomCards` e `timeCards` dentro de `presentation`. Cada intervalo usa segundos relativos ao início do clipe. `startSeconds` inclui o instante inicial e `endSeconds` exclui o instante final. Em um vídeo de 20 segundos, o exemplo abaixo mostra o primeiro card inferior de 10 até antes de 15 segundos, deixa um intervalo vazio e mostra outro de 16 até antes de 20. O card superior muda de Past para Future em 15 segundos.

```json
{
  "videoNumber": 1,
  "startSeconds": 8,
  "durationSeconds": 20,
  "presentation": {
    "loadingGif": true,
    "bottomCards": [
      { "startSeconds": 10, "endSeconds": 15, "text": "Primeira mensagem" },
      { "startSeconds": 16, "endSeconds": 20, "text": "Outra mensagem" }
    ],
    "timeCards": [
      { "startSeconds": 0, "endSeconds": 15, "text": "Past" },
      { "startSeconds": 15, "endSeconds": 20, "text": "Future" }
    ]
  }
}
```

Para o card superior, `text` aceita somente `Past`, `Future` ou `Indecipherable`. Os intervalos de uma mesma lista não podem se sobrepor, precisam terminar depois do início e podem deixar espaços vazios. Cada intervalo novo deve ocupar pelo menos um quadro na timeline (30 fps); intervalos mais curtos são rejeitados na importação para não desaparecerem sem aviso. O início é convertido para o primeiro quadro que não antecede o tempo pedido, e o fim para o limite exclusivo do intervalo. Listas das posições superior e inferior são independentes. Use até 1.000 intervalos por posição. Escolha `bottomCard` ou `bottomCards`, e `timeCard` ou `timeCards`, sem combinar as duas formas na mesma posição. Os cards antigos em `bottomCard` e `timeCard` continuam aparecendo durante todo o clipe. Intervalos fora da duração do clipe ficam limitados à parte visível.

### 3.2. Loading obrigatório — planejamento e cauda (V14.4)

O GIF é uma transição entre blocos, não uma decoração. O intervalo padrão é de três segundos completos, equivalentes a 90 quadros a 30 FPS. Use o GIF fornecido pelo aplicativo; não crie mídia, UUID, path, evento `loading` ou outro campo para imitá-lo.

**Antes do primeiro vídeo:** se não houver abertura, o primeiro clipe começa em 3 s e o GIF aparece de 0 até antes de 3 s. Se houver falas/pensamentos de abertura, o GIF começa depois do fim deles, e o vídeo começa três segundos depois. Abertura vazia não recebe diálogos inventados.

**Entre vídeos:** calcule o fim real do bloco anterior, inclusive todos os balões que ultrapassam o MP4. A janela de Loading começa nesse fim (ou depois de um silêncio solicitado); o próximo vídeo começa três segundos depois. Não use apenas a duração física do MP4.

```text
videoEnd = início_do_vídeo + duração_visível
lineEnd = início_absoluto_da_linha + duração_da_linha
blockEnd = max(videoEnd, fim_de_todas_as_linhas_do_bloco, fim_de_beat_narrativo_que_precise_de_cauda)
loadingStart = blockEnd + silêncio_explícito_se_houver
nextVideoStart = loadingStart + 3
```

- O GIF não muda a duração do vídeo, não pausa o vídeo anterior e não resolve colisões por conta própria.
- Sem pedido de sobreposição, nenhum balão nem trecho de vídeo anterior deve ocupar a janela de Loading. Não corte uma fala para fazer o GIF caber.
- Planeje os tempos finais de conteúdo e os espaços de Loading antes de gerar beats absolutos. Se adicionar Loading a um projeto existente, desloque o bloco correspondente inteiro (vídeo, linhas, beats associados) e todos os blocos subsequentes de modo coerente; os intervalos internos de `presentation` continuam relativos ao clipe.
- O Loading não reinicia emoção, pose, conhecimento ou categoria. No Loading neutro, olhares retornam à TV se a conversa terminou. A continuidade de um diálogo ainda ativo só justifica PT durante Loading se for uma decisão narrativa explícita e se o conteúdo não conflitar com a janela reservada.
- Não acrescentar GIF após o último vídeo sem próximo clipe. O fechamento e sua cauda continuam conforme o roteiro.
- O GIF permanece obrigatório mesmo se não houver card superior ou inferior; `presentation: { "loadingGif": true }` é suficiente.

Exemplo de cálculo: abertura termina em 6,4 s; primeiro vídeo inicia em 9,4 s. Ele termina em 29,4 s, mas o último pensamento termina em 33 s. O Loading seguinte ocupa [33, 36) e o segundo vídeo começa em 36 s. O primeiro comentário de cada vídeo continua ligado ao seu `scene_end`, sem acrescentar três segundos dentro da cena.

### 3.3. Cards temporais, identidade e causalidade

- Superior: `timeCard` ou `timeCards`; `Past` = passado, `Future` = futuro, `Indecipherable` = indecifrável somente quando solicitado. Nunca usar `Passado`, `Futuro`, `Present` ou texto livre no campo técnico superior.
- Inferior: `bottomCard` ou `bottomCards`; copiar o texto aprovado, inclusive ordem dos nomes, pontuação e maiúsculas. Em pedido de card de identificação sem texto literal, construir um rótulo curto com os papéis confirmados; não inventar nomes nem deduzir parentesco ou romance.
- Se a identidade ou a fase temporal for uma revelação que o autor pediu para ocultar inicialmente, usar os intervalos relativos da seção 3.1 para mostrar o card apenas a partir do instante autorizado. Não trocar card no meio do clipe sem motivo; se o autor define um card fixo, manter durante todo o clipe.
- O que está escrito no card pode ser lido no instante em que aparece; não revela automaticamente ações que ainda não foram mostradas. O passado/futuro da tela não transfere memória, conhecimento ou sentimento às versões da sala.
- Reservar margem superior e inferior real para os SVGs e evitar sobreposição com personagens/balões. Como a imagem usa o layout do clipe, a largura visível pode depender da proporção da mídia; conferir na prévia.
- Para apresentação de personagem ou tela preta com texto no início, use a seção 3.4. Se for pedido outro tipo de cartela de tela cheia, corte/pausa do MP4, close, fade ou música externa, não falsificar isso com card inferior. Registrar os ajustes manuais necessários sem transformar notas de edição em falas.

### 3.4. Intro opcional — apresentações e telas pretas (V14.5)

Selecione o personagem da Intro para usar as abas Editor, Rosto e Presets do Inspetor. Pose, expressão e ajustes de rosto editam a parte selecionada. Em Presets → Pose, use **Aplicar esta pose a toda a Intro** para padronizar as poses disponíveis. Em cada parte do JSON, prefira `poseCategory` com uma categoria disponível no inventário; o importador escolhe uma das variações selecionadas dessa categoria. `poseSlot` numérico continua aceito para roteiros antigos, mas não combine os dois campos na mesma parte. O projeto mantém o slot real selecionado para renderizar a pose. Na exportação, as poses do personagem viram categorias quando todos os seus estados puderem ser reimportados dessa forma. Se um estado não tiver categoria selecionável ou usar a pose base (`null`), todos os estados desse personagem permanecem em `poseSlot` para evitar misturar os formatos; a exportação avisa. Os ajustes faciais ficam em `face`. Use `expression: null` para voltar à expressão base.

Use `intro` na raiz somente quando o autor pedir. A lista define a ordem das telas e cria uma faixa **Intro** com um bloco por tela preta e por parte da apresentação. Selecione um bloco para editar o texto no Inspetor. Use as bordas do bloco na timeline para ajustar a duração.

- `kind: "character"`: use em `character` o nome único ou UUID de alguém do `cast`. O retrato conserva a pose e o espelhamento iniciais e ocupa a metade esquerda, sobre a cor do projeto. Na metade direita, o card branco mostra `englishText` em cima e `text` em português embaixo.
- O enquadramento inicial pode ser ajustado no próprio palco e no Inspetor da Intro. Os controles de posição, escala, largura, altura, rotação, espelhamento e camada valem para todos os blocos daquele personagem na Intro. Há também uma trava de posição. Para especificar ajustes no JSON por parte, use `flipX` e/ou `portraitLayout`. Exemplo: `"flipX": true, "portraitLayout": { "x": -25, "y": 4, "characterScale": 115, "characterWidthScale": 100, "characterHeightScale": 100, "rotation": -5, "zIndex": 0 }`. X e Y vão de −100 a 100, as escalas de 1 a 300 e a rotação de −180 a 180 graus. `zIndex` aceita 0 atrás do card ou 1 à frente. Todos os campos são opcionais. O padrão posiciona o retrato em X −25 e Y 0, com todas as escalas em 100, rotação em 0 e camada atrás do card. Para travar o arraste, use `positionLocked: true` dentro de `portraitLayout`.
- `durationSeconds` é opcional. O padrão é **8 segundos no total por personagem**. Aumente a duração quando os textos precisarem de mais tempo de leitura.
- `parts`: cada parte tem `startSeconds` relativo ao início daquele personagem e os dois textos. A primeira começa em `0`. As outras precisam avançar pelo menos um quadro e começar antes do fim da apresentação. Uma parte dura até a próxima ou até o fim da apresentação. Para pose, use `poseCategory` (por exemplo, "Em pé" ou "Sentado") ou `poseSlot` legado, nunca ambos; se os dois forem omitidos, a pose anterior é mantida.
- `expression`: use em cada parte o nome ou ID de um preset real do modelo. A primeira parte herda a expressão inicial quando o campo é omitido. As seguintes mantêm a última expressão até uma nova troca. Para trocar só a expressão, repita os textos numa nova parte. As alterações da Intro são independentes das expressões do conteúdo principal.
- `kind: "black"`: tela preta inteira com `text` branco centralizado. A mensagem é livre. Use no começo, entre apresentações ou no final da Intro. O padrão é **3,5 segundos**, substituível por `durationSeconds`.
- Os itens da lista começam no quadro zero e são consecutivos por padrão. O `startSeconds` opcional **do item** usa o tempo absoluto da timeline e permite deixar um intervalo livre. Os itens precisam seguir a ordem da lista, sem sobreposição. A 30 FPS, cada mudança acontece no primeiro quadro que alcança o tempo especificado. Cada texto aceita até 800 caracteres. São permitidas até 100 partes por apresentação e 1.000 blocos de Intro.
- Com Intro, o zero de `videos`, `lines`, `beats` e da duração mínima da raiz passa a ser o **fim da Intro**. O Editor V6 faz o deslocamento. Os tempos dos cards de vídeo continuam relativos ao clipe. Reserve os três segundos de Loading depois da Intro quando solicitado pela política das seções 3.1 e 3.2.
- Use **Importar JSON** no Editor V6 para criar o projeto com a faixa. Na Base de Vídeos, a área Roteiros preserva a Intro no JSON original. A prévia e o MP4 exibem os mesmos blocos de Intro.

Exemplo completo com duas apresentações, troca de texto e expressão, e telas pretas nas três posições. Substitua o elenco, o preset e o vídeo conforme o inventário real.

```json
{
  "format": "NYMI_EDITOR_V6_REACT_V1",
  "title": "Apresentação e reação",
  "autoListenerGaze": false,
  "autoPoseEverySeconds": 0,
  "cast": [
    { "character": "Mara", "x": -30, "y": 14 },
    { "character": "Alex", "x": 30, "y": 14 }
  ],
  "intro": [
    { "kind": "black", "text": "Arquivo 07" },
    { "kind": "character", "character": "Mara", "durationSeconds": 12, "parts": [
      { "startSeconds": 0, "englishText": "My name is Mara.", "text": "Meu nome é Mara." },
      { "startSeconds": 5, "englishText": "I remember the warning.", "text": "Eu lembro do aviso.", "expression": "preocupada" }
    ] },
    { "kind": "black", "text": "Outro ponto de vista", "durationSeconds": 2 },
    { "kind": "character", "character": "Alex", "parts": [
      { "startSeconds": 0, "englishText": "I was there too.", "text": "Eu também estava lá." }
    ] },
    { "kind": "black", "text": "A gravação começa" }
  ],
  "videos": [
    { "videoNumber": 1, "startSeconds": 3, "presentation": { "loadingGif": true } }
  ],
  "lines": []
}
```

Aqui a Intro termina aos 29 s, o Loading começa aos 29 s e o Vídeo 01 começa aos 32 s. Confira na timeline o retrato, os idiomas, as expressões e as durações antes de exportar.

## 4. Sala, espelhamento e atenção

Distribua a TV e os personagens segundo relações, proximidade, tensão, frequência de falas e legibilidade, salvo posicionamento definido pelo autor. O x da primeira TV é `videos[0].layout.x`, ou 0 se omitido. Em posição normal de atenção à TV, elenco à esquerda usa `flipX: false`; à direita usa `flipX: true`. O importador define isso pelo lado quando `flipX` é omitido. **Não use PT para compensar um personagem sem espelhamento.** Um `flipX` explícito é respeitado; o espelhamento é fixo por personagem neste formato.

`gaze: "left"` e `"right"` referem-se a direções **absolutas no palco**; o importador converte a direção para o rosto local depois do espelhamento. PT significa olhar para trás mantendo a emoção; não é uma emoção nem um preset `pt ...` inventado. Antes de aplicar PT, construa a geometria real: entre TV e falante, quem está do mesmo lado e mais perto da TV pode precisar olhar para trás ao ouvi-lo. Não vire automaticamente o outro lado da sala; pensamento privado não dispara PT. O olhar para a TV é a orientação de referência, não um estado que deve ser restaurado a cada fim de fala. A mudança de atenção deve acontecer quando houver motivo narrativo.

### 4.1. PT contínuo por diálogo — regra obrigatória V14.2

**A unidade de direção do olhar é a conversa, não o balão individual.** Leia as falas anteriores e seguintes em conjunto antes de programar o PT. Identifique quem está falando, a quem se dirige, quem acompanha a troca e quando a conversa realmente termina. Não faça o personagem olhar para a TV por alguns quadros apenas para virar novamente na fala seguinte.

Para cada personagem, mantenha um registro de planejamento com direção atual, alvo de atenção (TV, interlocutor ou grupo), motivo da atenção e condição de encerramento. Isso é planejamento interno, não um novo campo do JSON. Um mesmo alvo pode ocupar várias falas, pensamentos e pausas. Se outro interlocutor relevante estiver na mesma direção, não há necessidade de novo beat de `gaze`.

#### Geometria e destinatários

- Determine a frente natural pela posição da TV e do personagem. À esquerda da TV, frente é `right`, atrás é `left`; à direita da TV, frente é `left`, atrás é `right`.
- Para olhar para uma pessoa, compare o x dela com o x de quem olha: alvo à esquerda → `left`; alvo à direita → `right`. Se a posição horizontal não distingue o alvo, preserve a direção coerente; não invente um eixo vertical nem uma terceira direção.
- Avalie os ouvintes de forma individual. A pessoa mais próxima da TV pode olhar para trás tanto para ouvir alguém do canto quanto para responder a essa pessoa. Outros personagens só viram quando a geometria e a participação justificam.
- Identifique o destinatário pela fala literal e pelo contexto: vocativo, pergunta e resposta, réplica, contestação, ordem, pedido, provocação ou continuidade de assunto. O próximo falante na lista não é necessariamente o destinatário da fala anterior. Em fala geral sobre a TV, não force contato visual com alguém específico.

#### Manutenção, resposta e encerramento

1. **Início:** vire quando a fala audível, uma chamada ou um estímulo já conhecido justificar a atenção ao interlocutor. Não antecipe uma revelação nem uma mudança de assunto que ainda não aconteceu.
2. **Fim de uma fala:** antes de criar o retorno à TV, examine a continuação do diálogo. Se o personagem que está em PT responderá ao mesmo interlocutor, se o falante continuará ou se outro personagem relevante atrás dele tomará a palavra na mesma conversa, mantenha a direção atual.
3. **Ouvinte vira falante:** quando a resposta se dirige a alguém atrás, mantenha PT durante a preparação da resposta, durante toda a parte da fala dirigida a esse interlocutor e nas pausas de continuidade. TALK deve ocorrer com a expressão e o olhar vigentes; falar não é motivo para voltar à frente. Se já estava olhando corretamente, não crie nova virada no início da resposta.
4. **Outros interlocutores:** se dois ou mais personagens atrás do ouvinte se alternam numa conversa relacionada, mantenha o PT enquanto a atenção continuar naquela direção. Se uma terceira pessoa assume a palavra mas não muda o foco da conversa, não faça todo o elenco seguir mecanicamente o novo falante. Se o alvo realmente muda para a outra direção, programe a virada no momento em que essa mudança se torna perceptível.
5. **Pausas:** os intervalos usuais de 0,3–0,5 s entre balões não encerram, por si só, uma troca de diálogo. Mantenha o olhar durante essas pausas quando a conversa continuar. Pausas maiores também podem manter a atenção se houver espera por resposta, tensão ou escuta ativa. Não aplique uma duração fixa de PT: decida pelo contexto e pelo tempo real. Se a conversa terminou e a pausa é de observação da TV, retorne à TV.
6. **Pensamento:** não trate o pensamento de outra pessoa como intervenção audível. Um pensamento próprio pode coexistir com o olhar já estabelecido; não obriga retorno à TV nem uma nova virada. Se o foco de atenção mudar por motivo visível, dirija essa mudança independentemente do pensamento. Não mantenha PT por um pensamento inteiro só porque depois existe outra fala: avalie a continuidade efetiva.
7. **Encerramento:** retorne à TV quando a conversa se resolver, o personagem passar a comentar diretamente o vídeo, a atenção mudar para outro alvo ou uma informação visual/sonora relevante exigir atenção à tela. Não prolongue o PT até uma fala distante e desconectada apenas por saber que ela ocorrerá no futuro. Um corte de vídeo pode justificar retorno, mas não é reset obrigatório de um diálogo ainda ativo.
8. **Emoção e pose:** mudanças de expressão, pose, TALK ou BLINK não encerram o olhar. Preserve a direção vigente durante elas; no retorno, preserve a emoção e a categoria de pose atuais, não aquelas do início do diálogo.

A IA pode ler o roteiro adiante para evitar movimentos inúteis, mas o personagem não tem acesso ao futuro. Sustentar um olhar já motivado é diferente de virar antecipadamente para um falante inesperado. A manutenção deve ser plausível com aquilo que o personagem já sabe.

### 4.2. Implementação no JSON — direção manual contínua

Com `autoListenerGaze: true`, o importador aplica a regra geométrica e recalcula nas fronteiras de falas, inclusive sobreposições. Um `gaze` explícito tem prioridade no mesmo quadro; alterações de fala posteriores podem gerar novo olhar automático. **Uma única instrução de PT não garante sua manutenção com o automático ligado.**

Por isso, para cumprir a V14.2, defina `autoListenerGaze: false` explicitamente na raiz e dirija os olhares de todo o elenco em `beats`. Não desative o PT na atuação: desative apenas a geração automática de olhares e substitua-a pela direção manual completa. O automático de poses é independente e mantém suas regras e categorias. Só utilize `autoListenerGaze: true` como exceção solicitada pelo usuário, ou se o comportamento de continuidade tiver sido comprovado no importador e não contrariar a direção planejada; não presuma que atualizar este guia altera o aplicativo.

- Parta da orientação inicial coerente com a TV e o `flipX`. Se precisar estabelecer explicitamente a direção inicial, emita um beat de `gaze` em `startSeconds: 0`.
- Calcule todos os intervalos de atenção usando os tempos absolutos finais das falas, incluindo pausas, sobreposições e os estímulos do vídeo. Avalie também personagens silenciosos. Em sobreposição, priorize o interlocutor efetivamente acompanhado e a relevância do estímulo; não alterne a direção em cada início ou fim de balão.
- Emita `gaze` apenas quando a direção realmente mudar, incluindo o retorno à TV ao fim da conversa. O campo omitido persiste: beats de expressão ou pose não precisam repetir `gaze`. Não insira um retorno em cada fim de fala. Se direção e expressão mudarem no mesmo quadro, consolide ambas no mesmo beat do personagem; não produza dois estados conflitantes.
- Preserve o `poseCategory` já escolhido. Não repita categoria para forçar continuidade de olhar, não troque `flipX` e não invente presets PT. Não use campos como `lookAt`, `target`, `speakerTarget`, `holdGaze`, `dialogueGroup` ou `gazeDuration`: os alvos e intervalos servem somente para calcular os beats válidos.
- Confira os frames reais depois da quantização em 30 FPS e considere a antecedência das transições elegíveis descrita na seção 7. Não antecipe um estímulo por causa da suavização e não desloque os textos para esconder viradas erradas.

### 4.3. Exemplos de continuidade (ilustrativos)

Considere a TV em x=0, A no canto esquerdo (x=-42), B mais perto da TV (x=-20), ambos com `flipX: false`. A fala com B. B deve olhar para `left`. A já olha para `right`, direção de B; não precisa virar para trás.

| Intervalo absoluto | Acontecimento | Olhar de B |
|---|---|---|
| Antes de 10 s | Assistindo à TV | `right` |
| 10–13 s | A pergunta a B | `left` |
| 13–13,4 s | Pausa para B responder | mantém `left` |
| 13,4–16,6 s | B responde a A | mantém `left` durante TALK |
| 16,6–17 s | Pausa entre réplicas | mantém `left` |
| 17–20 s | A continua a conversa | mantém `left` |
| A partir de 20 s | Conversa encerrada; atenção à TV | `right` |

O exemplo pressupõe que o gatilho de atenção já existe aos 10 s e que o encerramento acontece aos 20 s; na atuação real, ajuste os frames conforme a causalidade e as transições. O trecho de `beats` abaixo usa nomes fictícios e mostra somente as mudanças de olhar de B; substitua pelo identificador real e integre às demais mudanças do projeto. Com direção manual, não é necessário escrever `gaze` nas fronteiras intermediárias.

```json
[
  { "character": "B", "startSeconds": 10, "gaze": "left" },
  { "character": "B", "startSeconds": 20, "gaze": "right" }
]
```

**Errado:** virar para trás aos 10 s, voltar à TV aos 13 s, virar para trás aos 13,4 s, voltar aos 16,6 s e virar novamente aos 17 s. Isso fragmenta uma conversa contínua, cria movimentos de poucos quadros e perde contato visual durante a resposta.

**Variações que também devem funcionar:**

- Três personagens à esquerda: A e C estão atrás de B. A pergunta, C complementa e B responde aos dois. B mantém `left` enquanto acompanha a conversa. Se B direciona a resposta à TV em vez de A ou C, reavalie a direção nesse ponto; não use PT só pela ordem das falas.
- Caso espelhado à direita: A em x=42, B em x=20, ambos com `flipX: true`. B mantém `right` durante o diálogo com A e retorna a `left` ao voltar à TV.
- A fala, B escuta em PT, B muda de expressão e responde indignado. A direção continua a mesma; apenas a emoção muda. Se a categoria de pose receber variação automática, o olhar planejado também deve persistir.
- A fala, B escuta, a TV revela informação importante e B volta a assistir antes de C falar. A volta é justificada. Se C iniciar depois um novo diálogo atrás de B, uma nova virada é correta, não um erro de continuidade.
- A fala, B escuta, um pensamento de C aparece e depois A continua. O pensamento não é ouvido por B. Preserve ou encerre a atenção segundo a conversa audível, o tempo e a TV, nunca por causa do aparecimento do balão privado.


## 5. Como dirigir a atuação

### Causalidade e conhecimento

Personagem **não lê o roteiro**: reage apenas ao que já viu ou ouviu até aquele instante. Não antecipar próxima fala, revelação, vídeo ou resultado. Em cada impacto importante — ameaça, afeto, humilhação, sofrimento, romance, acusação, surpresa ou mudança de contexto — avalie **todos os presentes**. Para cada um, decida conscientemente manter ou mudar a emoção. Um personagem silencioso continua assistindo, ouvindo e interpretando.

Antes da própria fala, reavalie o speaker: sua expressão comunica como está dizendo a frase? Ao ouvir, o listener só reage quando a informação relevante chegou; não responda à frase inteira no primeiro frame se o gatilho é no final. Identifique destinatário direto por nome, pergunta, resposta, acusação, ordem ou contexto já conhecido, nunca apenas porque alguém fala depois. Pensamento é privado: não faz outros ouvirem, responderem ou virarem. A passagem de ouvinte para falante deve respeitar o destinatário e o olhar já estabelecido, conforme a seção 4; uma resposta direta não reinicia o olhar.

Cada emoção decorre de **estímulo + personalidade + história + relação + conhecimento atual**. Pesquise personagens de obras existentes quando necessário, distinguindo fase da história e identidade civil da heroica. Não generalize informações futuras ou poderes à versão presente. Em fanfics, respeite as fichas do autor. Aparições sugerindo romance, separação, morte ou traição não confirmam automaticamente esses fatos.

### Pico, processamento e descrição

A primeira reação coletiva, quando houver, marca o **pico do impacto**; a segunda mostra **processamento, descontração ou evolução** depois do pico. Processar não significa sorrir ou voltar a `normal`: pode ser sair de surpresa para preocupação, suspeita, seriedade ou tristeza. Avaliar todos não exige que todos mudem ou tenham reações fortes idênticas.

Leia descrição, contexto adicional, campo de duração, `scene_end` e os dois marcadores. Priorize um acontecimento com tempo explicitamente indicado na descrição; depois, considere `scene_end` e marcadores válidos e coerentes. `0,00`, `-`, vazio ou “não informado” podem ser campos incompletos, não ordens de reagir no zero nem proibição de reagir. Se o zero for literal e coerente com o autor, preserve-o. Um tempo impossível deve ser registrado como dúvida, sem inventar certeza.

Procure revelações, cortes, frases, gestos, olhares, armas, abraços e payoffs mencionados; eles podem justificar beats adicionais além dos dois marcadores. Um beat não obriga reação coletiva: uma mudança individual ou silêncio podem ser melhores. Não atribua a todos a mesma intensidade. Para cenas curtas, 1–3 beats relevantes é referência; médias, 2–5; longas, quantos o conteúdo realmente sustentar. Não use essa referência como obrigação matemática.

### Continuidade, intensidade e relações

Estados atravessam falas, vídeos e Loading. O olhar também persiste entre falas e pausas quando o foco de atenção permanece; não confunda fim de balão com fim de conversa. Não reinicie o elenco em `normal` a cada TikTok. Um padrão repetido deve ser processado de forma evolutiva, não provocar o mesmo choque inicial em todos os vídeos. Surpresa, confusão e impressão frequentemente são transitórias: considere o que cada um concluiu após o impacto. Não fixe a personalidade numa expressão única nem troque de rosto aleatoriamente para variar.

Revise se uma mesma expressão atravessa aproximadamente 30 segundos, dois vídeos materialmente diferentes, ou se uma pessoa muda muito menos que as outras. Pergunte se a persistência faz sentido ou se ela foi esquecida. Compare mudanças individuais, expressões distintas e duração; assimetria pode ser legítima quando a narrativa justifica.

Ciúme exige vínculo e ameaça percebida, sensação de substituição ou outro motivo concreto; futuro romântico na tela não cria amor presente. Romance não apaga suspeita, preocupação, tristeza, orgulho ou insegurança. Constrangimento e afeto são diferentes. Sofrimento pode provocar seriedade, culpa, decepção, raiva, preocupação ou tristeza, conforme cada personagem. Humor não cancela dor; provocar enquanto inseguro ou negar preocupação pode ser coerente, mas precisa de contexto.

### Poses

Comece com poses reais distribuídas de forma equilibrada e com rostos coerentes com cada personalidade; não deixe todos iguais por comodidade. Com mais personagens que poses, repetir é inevitável. A cada 15 segundos globais, procure trocar a pose de **um** personagem elegível para outra pose real, com sequência reproduzível por seed; preserve emoção e orientação. Trocas narrativas excepcionais são independentes. Uma troca de pose não muda emoção. Não use a regra antiga de trocar todo o elenco a cada sete segundos.

O automático tenta uma troca por marco e, quando o personagem tem `poseCategory`, usa somente as variações selecionadas daquela categoria no Poses Dev. Um beat com `poseCategory` muda a categoria a partir daquele instante; `autoPoseEverySeconds: 0` desliga as trocas automáticas. Para roteiros antigos sem categoria, mantém-se o comportamento anterior. Desloque o mínimo necessário para evitar momentos críticos. Se nenhuma pose estiver selecionada, não invente categorias.

## 6. Dicionário de atuação facial

Escolha pelo **estado interno e pela anatomia real do preset**, não apenas pela palavra mais próxima do texto. Aplique a menor intensidade adequada e confira o catálogo; o dicionário não cria assets nem garante que o modelo possua as 21 expressões. `normal`, `sorrindo de canto`, `surpresa`, `envergonhada`, `impressionada`, `indignada`, `desconfiada`, `sorriso maligno`, `nojo`, `orgulhosa`, `cansada`, `animada`, `ciumenta`, `aliviada`, `seria`, `preocupada`, `triste magoada`, `irritada`, `confusa`, `decepcionada`, `apaixonada` são categorias criativas; use só o nome ou ID confirmado no modelo.

Distinções obrigatórias: surpresa/choque não é admiração; preocupação é alerta antecipatório, tristeza é dor já sentida; confusão é busca de entendimento, desconfiança é julgamento; séria é foco sem raiva, irritada é impaciência, indignada é raiva forte; sorriso de canto é provocação leve, sorriso maligno é calculado e raro; cansaço é falta real de energia, decepção é desaprovação resignada; envergonhada é constrangimento, apaixonada exige afeto/atração efetivos. Não usar ciúme nem romance sem fundamento.

TALK deve preservar a emoção, sobrancelhas, olhos, marcas e tensão, mudando essencialmente a boca; BLINK deve preservar a emoção ao piscar. O V6 escolhe modos de face pelo agendamento e pelos assets existentes; a IA não deve inventar arquivos ou afirmar que as variantes funcionam sem verificação.

## 7. Tempo, leitura e transições

Para o primeiro comentário pós-cena, `startSeconds = início absoluto do vídeo + scene_end` válido, sem acrescentar 0,6 segundo nem silêncio automático. Respeite exceção explícita mais recente do usuário. Comentários posteriores respeitam ordem, leitura e espaço entre bolhas. Uma fala durante o vídeo é permitida quando o roteiro permitir e não atropelar informação importante. O vídeo pode continuar depois de `scene_end`; uma bubble pode continuar após o fim do MP4.

Tempo é quantizado em 30 FPS: quadro inicial = `ceil(segundos × 30)` com compensação numérica mínima; intervalos são `[início, fim)`. A duração total precisa incluir o fim de todos os clipes, linhas e estados. Entre falas, 0,3 s é referência usual, podendo variar de 0,3 a 0,5 s; instrução explícita do usuário prevalece. Essas pausas não são comandos de retorno à TV: aplique a continuidade da seção 4 sem alterar a duração ou a ordem das falas para evitar PT desnecessário.

Pisos de leitura: 1–3 palavras 2,6 s; 4–7 3,2 s; 8–12 3,9 s; 13–18 4,9 s; 19–25 6,2 s; 26–35 7,6 s; 36–45 9 s; 46–60 11 s; acima disso calcule individualmente. Use o maior entre o piso e `1,3 + 0,24 × palavras`, com mínimo absoluto 2,6 s. Pensamentos somam 0,4 s. Se uma duração explícita do usuário diferir, respeite a instrução. Quando houver tradução, conte palavras em cada idioma separadamente e use o maior dos dois números, não a soma (regra V11.2 preservada).

O V6 anima trocas elegíveis de pose e expressão na faixa de personagem: a transição padrão pode começar **até 250 ms antes** do quadro final do beat, limitada pelo início do bloco anterior. Isso pode antecipar visualmente uma reação em relação ao instante informado. Se causalidade exigir que ela não comece antes do gatilho, programe o estado final considerando essa antecedência e confira no editor; não desloque a primeira fala pós-cena. O formato não oferece controle por beat para corte instantâneo. As faixas amarelas dependem de estados diferentes e da animação estar habilitada; não afirme que toda fronteira produzirá uma transição.

## 8. Processo de trabalho e auditoria

1. Compare cada fala e pensamento com a fonte; conte-os e identifique falante, tipo e ordem.
2. Faça inventário confirmado dos recursos e resolva ambiguidades; decida o posicionamento e orientação da sala.
3. Planeje cada vídeo, seus tempos absolutos, `scene_end`, pico, processamento, beats adicionais e cauda; preserve textos. Identifique blocos de conversa, destinatários, réplicas e pontos reais de mudança de atenção antes de gerar os olhares.
4. Acompanhe por personagem emoção, pose, olhar, relações e conhecimento; reavalie speakers, listeners e silenciosos em cada estímulo.
5. Escolha presets e poses reais, planeje PT contínuo manual para o elenco e os marcos de 15 segundos sem trocar emoção por conveniência. Considere a antecedência das transições. Revise cada fim de fala junto à fala seguinte, inclusive quando o ouvinte vira falante.
6. Produza `cast`, `videos`, `lines` e `beats`; confira limites, IDs, ausência de sobreposição de vídeos e duração total. Use o formato V1, não o projeto interno ou JSON V4.
7. Audite por personagem: beats individuais/coletivos, diversidade contextual, maior intervalo sem mudança, vídeos sem reação individual e justificativas para permanência. Audite por TikTok: descrição, tempos, causalidade, pico/processamento, PT, poses e cauda. Audite por fala: texto/tipo/falante, speaker, alvo, ouvintes, instante em que escutam, PT e leitura.
8. Compare literalmente quantidade, ordem e texto do roteiro original com `lines`. Verifique todos os nomes, tempos e recursos; não declare testes de Electron, importação ou MP4 que não foram executados. Ao importar, confira o projeto na timeline, a prévia e um MP4 antes de declarar o trabalho validado.

### Auditoria obrigatória de continuidade de olhar (V14.2)

Antes de entregar, simule a sequência de estados por personagem, desde a orientação inicial até o último beat, nos quadros de início/fim das falas e nas mudanças de atenção. Para cada virada, identifique a direção anterior, a nova direção, o alvo e o motivo. Confira:

- `autoListenerGaze: false` explícito no modo manual e olhares de todos os personagens que necessitam de PT, não só dos protagonistas.
- Ouvinte que responde a alguém atrás conserva a direção durante a própria fala e as pausas relacionadas; o interlocutor que continua ou recebe uma réplica não provoca um retorno intermediário à TV.
- Falas consecutivas de interlocutores na mesma direção não geram viradas redundantes. Procure sequências `left → right → left` e `right → left → right`, sobretudo nos intervalos de 0,3–0,5 s. Se a virada intermediária não tiver um estímulo ou mudança de alvo real, remova-a.
- Pensamentos privados não acionam olhares de terceiros; mudanças de expressão, TALK, BLINK ou variações de pose não reiniciam o olhar.
- Após o encerramento do diálogo, confirme o retorno à TV ou a mudança justificada de alvo. Não deixe PT preso até o fim do projeto por falta de um beat de retorno.
- Todos os `gaze` respeitam a geometria absoluta do palco e a orientação por `flipX`. Não existem beats conflitantes no mesmo quadro para o mesmo personagem, nem campos inventados para representar alvos ou duração.
- Não antecipe informação futura para justificar um olhar. Mantenha os textos, tempos de leitura, categorias de pose e emoções conforme as demais regras do guia. Reavalie o total de estados e blocos dentro dos limites do compilador.

A verificação acima é de planejamento e estrutura do JSON. O comportamento visual das transições, PT, TALK e poses só pode ser confirmado pela prévia do aplicativo; não declare teste executado sem tê-lo feito. Entregue a auditoria separadamente somente quando solicitada.

Os exemplos da próxima seção são referências de anatomia e direção, não substitutos para os presets reais do Fabricador.

## 9. Receitas faciais originais do V13.1

As receitas abaixo são referências de atuação e anatomia; consulte os presets disponíveis no modelo. A IA não cria nem verifica assets ao gerar JSON.

### 9.1. Dicionário oficial das 21 expressões

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

---

## 10. Dicionário operacional de atuação — recuperação V13.1/V12.4.1

### Regra central e intensidade

A mesma frase pode ser dita com emoções diferentes conforme personalidade, relação, contexto e fase da história. Pergunte: **o que a pessoa sente e faz internamente neste exato instante?** Escolha pela resposta, não pela palavra emocional da frase. Use a menor intensidade suficiente: SERIOUS → IRRITATED → ANGRY é uma escala, não três sinônimos. O dicionário completo da seção 9 define a anatomia; as regras abaixo definem quando aplicá-la.

### 10.1. Mapeamento de categorias de atuação

Os nomes abaixo identificam categorias criativas. Em `expression`, use o ID ou nome exato confirmado no inventário, inclusive acentos e barras; este mapa não cria aliases no importador.

```text
normal              = NEUTRAL / OBSERVING
sorrindo de canto   = SIDE SMIRK
surpresa             = SURPRISE / SHOCK
envergonhada         = EMBARRASSED / AWKWARD
impressionada        = IMPRESSED
indignada            = INDIGNANT / ANGRY
desconfiada          = SUSPICIOUS / JUDGING
sorriso maligno      = EVIL SIDE SMIRK
nojo                 = DISGUST / REPULSION
orgulhosa            = PROUD / SMUG
cansada              = TIRED / EXHAUSTED
animada              = EXCITED / ENTHUSIASTIC
ciumenta             = JEALOUS
aliviada             = RELIEVED
seria                 = SERIOUS
preocupada           = WORRIED
triste magoada       = SAD / HURT
irritada             = IRRITATED
confusa              = CONFUSED
decepcionada         = DISAPPOINTED
apaixonada           = LOVE-STRUCK / LOVING GAZE
```

### 10.2. Regras anti-erro por expressão

#### `normal`

Usar quando:

- observando;
- escutando;
- analisando sem emoção dominante;
- estado-base.

Não usar para esconder uma reação que claramente deveria existir.

#### `sorrindo de canto`

Usar para:

- provocação leve;
- charme;
- ironia controlada;
- pequena vitória.

Não usar para:

- ameaça;
- malícia forte;
- amor.

#### `surpresa`

Usar para impacto repentino.

Não manter por muitos segundos após o choque já ter sido processado.

Depois de `surpresa`, normalmente evoluir para:

```text
confusa
desconfiada
impressionada
preocupada
irritada
```

conforme a interpretação.

#### `envergonhada`

Usar para:

- constrangimento;
- nervosismo social;
- situação romântica que realmente causa vergonha.

Não usar automaticamente porque aparece romance na tela.

Primeiro verificar se o personagem já possui vínculo emocional suficiente para sentir vergonha romântica.

#### `impressionada`

Usar quando algo causa admiração ou impacto positivo controlado.

Não usar quando o personagem está apenas chocado.

#### `indignada`

Reservar para raiva forte/confronto.

Não usar como irritação genérica.

#### `desconfiada`

Usar quando o personagem:

- julga;
- duvida;
- considera algo suspeito;
- não acredita numa explicação;
- observa intenção oculta.

#### `sorriso maligno`

Usar raramente.

Exige:

- intenção deliberadamente provocadora;
- sensação de vantagem;
- malícia;
- conhecimento que o outro não possui;
- provocação mais agressiva que `sorrindo de canto`.

#### `nojo`

Usar apenas para repulsa verdadeira.

Não substituir raiva ou desaprovação.

#### `orgulhosa`

Usar para autoconfiança/superioridade controlada.

Não confundir com provocação lateral.

#### `cansada`

Somente exaustão real.

Não usar como:

```text
"estou cansado dessa conversa"
```

se o personagem não está fisicamente/mentalmente exausto.

Para impaciência, preferir `irritada` ou `decepcionada`.

#### `animada`

Exige entusiasmo positivo real.

Não é apenas energia alta.

#### `ciumenta`

Usar somente quando houver vínculo/territorialidade emocional suficiente.

Não usar ciúme romântico precoce sem desenvolvimento.

Pode representar:

- ciúme romântico;
- territorialidade;
- vínculo fraternal;
- orgulho ferido;

desde que o contexto sustente.

#### `aliviada`

Usar depois de uma tensão efetivamente resolvida.

#### `seria`

É o estado de foco/gravidade sem raiva.

Excelente para:

- foco analítico;
- autoridade contida;
- análise política;
- decisões;
- fala de autoridade.

#### `preocupada`

É ansiedade ativa/protetora.

Usar quando o personagem pensa:

> “algo ruim pode acontecer.”

Não usar para dor emocional já consumada.

#### `triste magoada`

É dor emocional sofrida.

Usar quando algo:

- machucou;
- rejeitou;
- lembrou abandono;
- produziu vulnerabilidade real.

Não usar como preocupação antecipatória.

#### `irritada`

É impaciência/tensão clara.

Ótima para:

- provocação recebida;
- paciência acabando;
- resposta seca;
- desacordo moderado.

#### `confusa`

Usar quando a informação ainda não encaixou.

Pergunta interna:

> “Como assim?”

#### `decepcionada`

Usar quando a pessoa já entendeu e desaprovou.

Pergunta interna:

> “Sério que foi isso?”

#### `apaixonada`

Usar apenas quando existe:

- carinho;
- atração;
- ternura;
- segurança emocional;
- vínculo romântico estabelecido ou claramente desenvolvido.

Não usar como sinônimo de blush.

### 10.3. Progressão emocional

Não saltar diretamente para uma emoção final quando existe processo.

Exemplo:

```text
surpresa
→ confusa
→ desconfiada
→ seria
```

ou:

```text
surpresa
→ envergonhada
→ apaixonada
```

somente quando o arco emocional justificar.

### 10.4. Coerência por personagem

A mesma situação não deve produzir a mesma expressão em todos.

Exemplo:

um romance inesperado pode gerar:

```text
A (defensivo) = surpresa / desconfiada
B (provocador) = sorrindo de canto / impressionada
C (territorial, com vínculo estabelecido) = indignada / irritada
D (analítico) = seria / desconfiada
E (protetor, com vínculo estabelecido) = seria / preocupada
```

A expressão precisa passar pelo filtro de personalidade.

### 10.5. Romance precoce

Para personagens que ainda não desenvolveram sentimentos:

> evitar `apaixonada`.

Romance futuro visto em tela não cria automaticamente amor presente.

Possíveis respostas anteriores:

```text
surpresa
confusa
desconfiada
irritada
envergonhada
impressionada
preocupada
```

conforme o contexto.

### 10.6. Direção, TALK e BLINK

- PT é direção absoluta (`gaze`), não uma expressão `pt X`. Mantenha a emoção quando vira e a emoção nova quando retorna. Use a continuidade de diálogo da seção 4, não o retorno obrigatório por balão dos exemplos V4.
- TALK preserva sobrancelhas, pálpebras, tensão, blush, marcas e assimetria, alterando essencialmente a boca. No V6 a fala (`kind: "speech"`) aciona o agendamento; não escreva `use_talk` nem sprites inventados.
- BLINK preserva sobrancelhas, boca, marcas e emoção, fechando apenas a pálpebra conforme os assets. Não criar beats de piscar.
- Pensamento (`kind: "thought"`) é privado, não aciona TALK nem olhar de terceiros. Caso o autor queira uma fala audível, o tipo deve vir da instrução explícita; não mudar por conveniência.
- Para emoção persistente, emita um beat `expression` e deixe persistir. Para uma reação passageira, emita o beat de entrada e outro de saída com a emoção coerente após o estímulo; não use campos de duração ou reset que não existem em `beats`.
- Reação silenciosa durante a mídia precisa respeitar causalidade e inventário. Não depender de fala para atuar.

### 10.7. Regras generalizadas de personalidade (sem elenco predefinido)

Não fixe personagens por arquétipos. Use a ficha local como fonte de personalidade, fase, forma, conhecimento e relações. Um provocador pode perder o sorriso quando o assunto se torna grave. Uma pessoa defensiva pode interpretar perigo antes de interpretar romance; uma autoridade pode demonstrar preocupação sem perder a postura; uma pessoa hostil pode desenvolver proteção gradualmente, sem mudança brusca de lealdade. Curiosidade não é amizade; provocação não é carinho; interesse não é romance. Nenhum desses exemplos determina a atuação de um personagem específico.

Uma mesma cena pode gerar repulsa, indignação, culpa, suspeita, tristeza, cautela ou preocupação, não apenas dor uniforme. Humor não cancela emoção real: negar interesse, provocar por insegurança ou manter educação enquanto ferido pode ser coerente, mas precisa de causa. Para ciúme, pergunte qual vínculo existe, qual ameaça a pessoa percebe, se se sente substituída e se a cena realmente sustenta esse julgamento. Não use territorialidade como licença automática para ciúme.

### 10.8. Checklist facial recuperado

Antes de finalizar:

- [ ] expressão corresponde ao significado emocional real;
- [ ] intensidade não está exagerada;
- [ ] `surpresa` não virou estado permanente;
- [ ] `cansada` significa exaustão real;
- [ ] `preocupada` e `triste magoada` não foram confundidas;
- [ ] `envergonhada` e `apaixonada` não foram confundidas;
- [ ] `confusa` e `desconfiada` não foram confundidas;
- [ ] `seria`, `irritada` e `indignada` respeitam a escala de intensidade;
- [ ] `sorriso maligno` é raro e deliberado;
- [ ] ciúme possui base relacional;
- [ ] TALK preserva a emoção;
- [ ] BLINK preserva a emoção;
- [ ] PT preserva a emoção;
- [ ] listeners reagem somente depois da informação;
- [ ] pensamentos privados não causam reação externa;
- [ ] cada personagem reage pela própria personalidade.

---

## 11. Interpretação de descrição, tempos e atuação visual — contrato restaurado

### 11.1. Hierarquia de evidência temporal

Ao montar a atuação de um TikTok, usar esta ordem de confiança:

1. **tempo explicitamente ligado a um acontecimento na descrição/contexto adicional**;
2. **scene_end válido e coerente com a descrição**;
3. **tempo de reação em grupo explicitamente preenchido e coerente**;
4. **duração total do vídeo**;
5. valores `0,00`, `-`, “não informado” ou campos vazios.

Exemplo:

```text
scene_end = 0,00
descrição = "a primeira frase termina em 2,47 e a segunda em 6,23"
```

Interpretação correta:

```text
2,47 = beat real disponível
6,23 = beat real disponível
scene_end 0,00 = campo incompleto/sentinela, não fim literal da cena descrita
```

A ordem de confiança é para identificar acontecimentos; um `scene_end` válido continua sendo o instante do primeiro comentário pós-cena. Exceções explicitamente solicitadas pelo autor prevalecem. Não confunda os tempos da Base com o tempo absoluto final do projeto.

### 11.2. `0,00` não significa automaticamente “reagir no zero”

Quando um campo de reação contém `0,00`:

- não criar automaticamente beats de reação coletiva em `0.00`;
- verificar descrição e contexto adicional;
- procurar uma mudança visual, fim de frase, revelação, corte ou payoff posterior;
- se houver um beat claro, usar esse beat;
- se não houver, a reação pode ser omitida.

`0,00` pode significar:

- campo não preenchido;
- marcador provisório;
- ausência de decisão do autor;
- reação a ser inferida pela IA.

### 11.3. `-` não significa “proibido reagir”

Quando um campo vier com `-`:

> a IA tem liberdade de decidir se a cena merece reação.

Não é obrigatório criar reação.

Não é proibido criar reação.

A decisão deve vir da descrição.

### 11.4. A descrição pode criar beats adicionais

Se a descrição informa vários acontecimentos com tempos claros, esses acontecimentos podem gerar:

- beats simultâneos de expressão;
- beats individuais;
- mudança de pose;
- mudança de direção/PT;
- silêncio;
- pensamento já escrito e autorizado naquele trecho;

mesmo que não exista um campo formal específico para cada tempo.

Exemplo:

```text
4,91 = revela o par romântico
9,89 = revela que ele pensa nela diariamente
13,91 = a protagonista aponta a espada para ele
19,04 = payoff final
```

A IA pode atuar em todos esses quatro beats.

Não precisa limitar-se aos dois campos “Primeira reação” e “Segunda reação”.

### 11.5. Reação em grupo não é obrigatória

Mesmo quando existe um beat temporal:

- não é obrigatório criar beats simultâneos;
- pode ser melhor usar apenas 1 ou 2 beats individuais;
- silêncio pode ser a melhor atuação;
- um personagem pode permanecer neutro;
- outro pode reagir imediatamente;
- outro pode processar e reagir só no beat seguinte.

Uma reação coletiva existe para mudanças simultâneas relevantes, não para preencher todos os marcos.

### 11.6. Reação em grupo não significa cinco emoções fortes

Uma avaliação coletiva (somente planejamento interno) pode conter:

```text
A = preocupada
B = desconfiada
C = irritada
D = normal
E = seria
```

Isso é válido.

Não tentar “usar todas as expressões”.

Variedade é consequência da cena, não meta matemática.

### 11.7. Expressão deve ser escolhida pela anatomia descrita

A V12.4.1 reforça:

> **não escolher uma expressão apenas pelo nome.**

Antes de escolher, ler a receita facial da expressão e perguntar:

- sobrancelhas fazem sentido?
- abertura dos olhos faz sentido?
- boca faz sentido?
- tensão é adequada?
- blush é coerente?
- sombra/degradê é coerente?
- é uma emoção ativa ou pesada?
- é uma reação instantânea ou estado persistente?

Exemplo:

`WORRIED / preocupada` possui olhos alertas e busca solução.

Logo, não usar `preocupada` para uma personagem emocionalmente abatida depois de uma rejeição consumada.

Nesse caso, `SAD / HURT / triste magoada` pode ser correto.

### 11.8. Expressão instantânea versus estado sustentado

Expressões como:

- `surpresa`;
- `confusa`;
- `impressionada`;

podem funcionar como transições rápidas.

Não manter `surpresa` durante minutos depois que a informação já foi assimilada.

Depois do impacto, perguntar o que o personagem concluiu:

```text
surpresa
→ desconfiada
```

ou:

```text
surpresa
→ seria
```

ou:

```text
surpresa
→ preocupada
```

### 11.9. Construção facial vence “palavra emocional”

Exemplo:

Personagem recebe uma informação absurda e levanta uma sobrancelha, estreita os olhos e entorta a boca.

Mesmo que o texto pareça “confuso”, essa atuação é mais próxima de:

```text
desconfiada / julgando
```

porque a anatomia descrita é julgamento/ceticismo.

`confusa` exige busca genuína de entendimento, não descrença.

### 11.10. Anti-congelamento sem roleta de expressões

Não deixar um personagem em uma expressão por longos blocos quando a cena entrega novos estímulos relevantes.

Por outro lado:

> não trocar expressão apenas para criar variedade.

A cada novo beat, perguntar:

1. recebeu informação nova?
2. essa informação muda interpretação?
3. a expressão atual ainda representa o estado interno?
4. a mudança deveria ser facial, direcional, pose ou nenhuma?

Somente então alterar.

### 11.11. Regra de beat visual

Um beat é qualquer ponto em que o significado da cena muda.

Pode ser:

- fim de uma frase;
- entrada de outro personagem na imagem;
- revelação do par romântico;
- mudança de letra;
- corte de foto;
- arma levantada;
- abraço/beijo;
- revelação política;
- mudança de tom;
- payoff final.

A atuação deve seguir beats, não intervalos arbitrários.

### 11.12. Regra de silêncio antes da fala

**Regra V13.1:** `scene_end` válido é a entrada **exata** da primeira fala/pensamento pós-cena; **não inserir 0,5–2,5 s de silêncio automaticamente** entre `scene_end` e essa entrada. O processamento silencioso pode acontecer **antes de `scene_end`** por meio dos beats visuais e da segunda reação.

**Exceção por pedido explícito:** se o roteiro trouxer literalmente uma instrução como “pode botar só a reação em grupo no scene end e esperar uns 2 segundo antes das fala”, respeitar o pedido mais recente e documentar essa exceção. Não generalizar essa pausa para outros roteiros.

### 11.13. Fala durante o vídeo

Pode haver fala ou pensamento antes de `scene_end` somente quando:

- o roteiro permite;
- a fala não atropela informação audiovisual importante;
- existe tempo suficiente;
- faz sentido reagir naquele ponto.

Se a descrição diz “se quiser botar ou não falas aí é com tu”:

> a IA decide pela qualidade da cena.

Não inventar fala ou pensamento. Distribua somente os textos fornecidos; se não houver texto, use atuação silenciosa.

### 11.14. Uso criativo de reação coletiva

Em roteiros incompletos:

- inferir beats;
- escolher quantos personagens mudam;
- permitir que alguns permaneçam;
- evitar cinco reações fortes iguais;
- usar o mínimo necessário para comunicar a leitura da sala.

### 11.15. Regra de continuidade entre beats do mesmo TikTok

Exemplo:

```text
2,47 — frase começa a soar agressiva
A: desconfiada

6,23 — frase completa revela escalada
A: seria
B: orgulhosa
C: desconfiada
```

A primeira reação coletiva é o **pico emocional**; a segunda deve ser **processamento/descontração ou evolução** da primeira, nunca um reinício emocional nem um reset obrigatório para `normal`.

### 11.16. Continuidade entre TikToks

A interpretação acumulada importa.

Se cinco vídeos já associaram duas pessoas:

- o sexto vídeo não deve gerar o mesmo “O QUÊ? VOCÊS DOIS?!” do primeiro;
- pode gerar análise mais profunda;
- suspeita;
- desconforto;
- tentativa de entender causalidade.

Surpresa diminui conforme o padrão se repete.

### 11.17. Densidade de atuação

Meta qualitativa:

- cenas curtas: 1–3 beats visuais relevantes;
- cenas médias: 2–5;
- cenas longas/segmentadas: quantos beats a descrição realmente sustentar.

Não existe obrigação de usar todos.

### 11.18. Campos formais e descrição — regra de reconciliação

Quando campos e descrição divergirem:

### Campo plausível + descrição plausível
Combinar ambos.

### Campo `0,00` + descrição com tempo claro
Usar descrição.

### Campo `-` + descrição com acontecimento claro
IA decide reação.

### Campo com tempo impossível
Ignorar o tempo inválido e registrar a decisão na auditoria.

### Descrição sem tempo
Usar scene_end, duração e estrutura narrativa para estimar apenas quando necessário.

### 11.19. Reconciliação dos marcadores e avaliação completa

- Primeira reação informada: avaliar todos no pico indicado, respeitando aquilo que já foi mostrado. Não obrigar todos a mudar.
- Primeira reação zerada/ausente: usar a descrição para encontrar o primeiro impacto real. Se não houver beat antecipado identificável, avaliar no `scene_end` sem atrasar o primeiro comentário.
- Segunda reação zerada/ausente: preferir um instante de processamento após a primeira e antes do `scene_end`, se houver espaço e motivo. Não criar dois estados espremidos apenas para preencher dois campos. Se não houver motivo, preservar ou omitir a mudança, registrando a decisão na auditoria interna.
- Gatilho posterior ao primeiro: acrescentar um beat somente se houver novo estímulo conhecido. Se o dado for impossível ou contraditório, registrar a incerteza e priorizar os tempos concretos; não inventar precisão quadro a quadro.
- Se um card solicitado aparecer antes da revelação visual, o texto do card já pode informar identidade/tempo, mas não comportamento, motivação ou desfecho. Respeitar a convenção temporal e a adaptação narrativa do roteiro.

### 11.20. Duração de leitura e ritmo — regra V11.2 integral

O texto é feito principalmente para leitura em balões, não dublagem. Use o número de palavras do texto literal. Se houver duas línguas, calcule a quantidade separadamente e use a maior, nunca some as duas. Duração explicitamente especificada pelo autor tem precedência.

| Palavras | Piso (segundos) |
|---|---:|
| 1–3 | 2,6 |
| 4–7 | 3,2 |
| 8–12 | 3,9 |
| 13–18 | 4,9 |
| 19–25 | 6,2 |
| 26–35 | 7,6 |
| 36–45 | 9,0 |
| 46–60 | 11,0 |
| 61+ | calcular individualmente |

```text
duração_base = 1.3 + 0.24 × palavras
duração_fala = max(piso, duração_base, 2.6)
duração_pensamento = duração_fala + 0.4
```

Arredonde aproximadamente a 0,1 s, sem ficar abaixo do piso/fórmula; ajuste para a grade de 30 FPS. Uma única palavra também merece 2,6 s. Não comprima textos longos para caber no MP4. Um pensamento ganha 0,4 s e não se torna audível.

Gap recomendado de 0,3 s, com variação natural entre 0,3 e 0,5 s. Se alterar duração, propague o deslocamento dos comentários seguintes, do Loading, dos vídeos seguintes e dos beats relacionados. Não introduza sobreposição de balões acidental. O primeiro comentário continua no `scene_end` válido, sem gap artificial de entrada.

---

## 12. Estrutura operacional V13.1 adaptada ao Editor V6

O V13.1 separava conteúdo, aparência persistente e metadados de faixas. Preserve a separação mental, mas não serialize os objetos antigos. No V6, o importador constrói as faixas nativas a partir de um contrato externo diferente. **A tabela é uma matriz de migração de intenção, não uma lista de campos adicionais aceitos.**

### 12.1. Correspondência de todas as partes técnicas do V13.1

| Estrutura histórica | Equivalente de autoria V6 |
|---|---|
| I — Fonte e precedência | Seções 1–2: roteiro, instruções recentes e contrato V6; fichas reais prevalecem. |
| II — Raiz, resolução, FPS, paths | `format`, `title`, `seed`, `backgroundColor`/`backgroundLibraryId`, listas V6; 30 FPS; IDs da biblioteca. Não emitir resolução ou paths V4. |
| III — Faixas da interface | O importador cria faixas; não escrever `timeline_tracks`, `track_id`, `locked`, `collapsed` ou metadata. |
| IV — Characters, assets, estado base | `cast` com ID real, x/y/scale, flipX, poseCategory e expression reais; inicialização explícita; recursos do Customizador/Fabricador. |
| V — Faixas visuais canônicas | Simular estado por personagem desde 0 até o fim; `beats` alteram apenas campos aceitos; omissões persistem. Não serializar segmentos nativos. |
| VI — Materialização criativa | Beats de expressão, gaze e categoria; reações coletivas são planejamento; entrada/saída de estados transitórios são explícitas. |
| VII — Conteúdo e tempos | `videos`, `lines`, `presentation`; starts absolutos, intervalos de cards relativos ao clipe. |
| VIII — Fala, pensamento, TALK, BLINK | `kind: speech/thought`, `text`, `englishText` opcional e durações; layout de bolhas opcional; runtime gera TALK/BLINK. |
| IX — Vídeos, cauda e Loading | ID/número/nome único, duração visível, fim de bloco e `presentation.loadingGif: true` antes de cada clipe. |
| X — Intro | Falas/pensamentos e beats de abertura, ou faixa Intro conforme a seção 3.4. Visibilidade, crop e fades não representados neste formato. |
| XI — Card | `presentation.timeCard`/`timeCards` e `bottomCard`/`bottomCards`; não equivalem a cartela de tela inteira. |
| XII — Áudio e label | Áudio da mídia pelo comportamento do editor; áudio externo e label livre não documentados no intercâmbio. Card inferior identifica o conteúdo quando pedido. |
| XIII — Compatibilidade | Usar apenas o contrato V6; não presumir migração de Project V3 ou JSON interno. Legacy `poseSlot` conforme seção 3, nunca misturar com categoria no mesmo personagem. |
| XIV — Workflow | Passagens detalhadas da seção 13. |
| XV — Exemplos | Exemplos V6 da seção 15; sem templates executáveis V4. |
| XVI — Auditoria técnica | Checklist V6 da seção 14, simulação de estado e conferência de recursos. |
| XVII — Proibições | Seção 14.8; campos não suportados e erros criativos. |
| XVIII — Resumo operacional | Seção 15.4; conteúdo, estado, tempo e apresentação separados. |

### 12.2. Estado inicial e persistência

Monte uma tabela interna por personagem com ID, modelo, pose selecionada/categoria, expressão inicial, x/y, sentido normal e `flipX`. Distribua as posturas respeitando o pedido do autor; não invente pose nem assuma que o número da posição da lista é o slot. As faces iniciais devem ser escolhidas individualmente, não todas iguais por conveniência. Duas faces iguais são permitidas quando justificadas. Não adicionar mudanças emocionais durante a abertura apenas para criar quantidade.

O estado visual de autoria é `cast` mais a sequência cronológica de `beats`. A tabela de planejamento pode conter motivo, alvo, tempo relativo, tempo absoluto, frame, estado anterior e novo estado, mas esses campos internos não entram no arquivo. O estado permanece até a próxima alteração do mesmo atributo. O fim de fala, clipe ou GIF não apaga o estado.

### 12.3. Mudança persistente, transitória e simultânea

Mudança persistente: emita um beat com `expression` real no instante causal. Mudança temporária: emita a entrada e um beat posterior com o estado de processamento ou retorno. Se houver virada simultânea, consolide `expression` e `gaze` no mesmo beat. Não copie todo o estado para cada beat: a herança de campos omitidos é parte do contrato V6, ao contrário dos segmentos completos do V4.

Uma reação de um quadro pode ser uma decisão autoral válida no planejamento, mas não prometa que uma transição nativa de até 250 ms exibirá aquele estado como corte instantâneo. Não apagar um beat intencional só por ser curto; avaliar a duração perceptível, os limites e a prévia. Evitar sequência de quatro frames com múltiplas emoções quando não há intenção ou leitura visual possível.

### 12.4. Avaliação de grupo e stagger

Em cada impacto, preencha mentalmente um mapa de todos os presentes: preservar ou mudar. A preservação é uma decisão ativa, não omissão de trabalho. Emita beats para mudanças reais; não gere estados idênticos para simular que todos foram avaliados. Se o mesmo frame tiver duas alterações para uma pessoa, consolide. Se houver atraso individual intencional, calcule `startSeconds` distinto para cada pessoa; não usar `stagger` como campo.

Exemplo de tabela de planejamento (não JSON):

| Tempo relativo | Pessoa | Decisão | Causa |
|---:|---|---|---|
| 4,54 | A | surpresa | informação inesperada |
| 4,54 | B | impressionada | competência confirmada |
| 4,54 | C | mantém irritada | não aceita a atitude |
| 5,00 | D | preocupada | processa o risco |
| 9,26 | B | seria | passa a analisar |

Não crie beat para C quando nada mudou. Calcule o tempo absoluto usando o início final do vídeo. Reavalie a antecipação causada pela suavização.

### 12.5. Speaker, listeners, PT e pensamento — quatro decisões por fala

1. Speaker: reavaliar a expressão antes ou no início da fala, sem antecipar informação nova.
2. Target direto: identificar por texto e contexto conhecido; orientar o speaker ao alvo quando necessário, mantendo PT durante a resposta.
3. Listeners: considerar todos os ouvintes relevantes e o tempo em que a palavra/gatilho foi realmente recebido. A reação pode acontecer durante a frase, perto do fim ou depois; não usar sempre o primeiro frame.
4. Silenciosos: avaliar quem escuta/observa sem falar. Um pensamento tem efeito apenas no próprio pensador e não muda automaticamente o olhar alheio.

Se um interlocutor está atrás, a geometria e a continuidade determinam `gaze`. A direção mantém-se entre réplicas e pausas relacionadas, inclusive quando a expressão muda. No encerramento real, retorne à TV com a emoção vigente; não resetar ao rosto inicial.

### 12.6. Conteúdo, mídia, bolhas e recursos não representados

Preserve todos os textos e seus tipos. Não transforme descrição, rubrica de atuação, nome de card ou fala do vídeo-fonte em reação nova. Não adicione tradução sem texto fornecido. O campo opcional `englishText` é literal; se a tradução está vazia, omita. A posição de bolhas pode ser automática ou planejada pelos campos aceitos; não herdar coordenadas em pixels do V4. Não criar cor de nome, variantes de sprite, opacity, rotation de personagem, `stage_transform`, `visibility`, `clip_start`, `include_audio`, `hold_video_frame`, `fade_in` ou `fade_out` como campos do intercâmbio.

Respeite a mídia selecionada e seu limite de duração. Se precisar de cortes internos, pausas de reprodução, isolamento de personagem fora da Intro, zoom de close, cartela integral fora da Intro, áudio externo ou outra função não prevista no guia V6, registre a necessidade de edição manual. Não confundir esses recursos com o novo Loading ou os cards anexados à mídia. Não declarar que a representação manual foi executada se não foi.

### 12.7. Frames, cobertura e limites

Os estados planejados cobrem continuamente o intervalo [0, fim do projeto) pela persistência do `cast` e dos `beats`. Não escrever faixas completas de frames. Quantize os limites na grade de 30 FPS com `ceil(t × 30)` e compensação mínima de ponto flutuante. Para um instante de 4,54 s relativo a um início alinhado a frame, a fronteira relativa é 137. Uma reação de um quadro tem início e fim exclusivos separados por um frame; a renderização continua sujeita à transição nativa.

Simule cada personagem de forma cronológica, verificando duplicações ou conflitos no mesmo quadro, mudanças fora da duração, retornos de PT esquecidos e persistência correta. A duração real é o máximo do fim de todos os vídeos, linhas e estados que demandam cauda, mais apenas os silêncios solicitados. `durationSeconds` é duração mínima: não pode cortar conteúdo. Consulte os limites da seção 3, inclusive os limites do compilador, não apenas o tamanho do JSON.

---

## 13. Workflow completo de geração — doze passagens

Faça a revisão em ordem lógica. Não pule etapas por reutilizar um JSON anterior; se a tarefa for corrigir um arquivo existente, compare-o com o roteiro e guia vigentes antes de decidir o que preservar. O inventário e os IDs mais recentes vencem IDs antigos.

### Passagem 1 — Leitura integral e separação das fontes

- Ler guia completo, roteiro exportado e contexto complementar.
- Identificar a versão, ordem de TikToks, abertura/fechamento, textos, falantes e tipos, tempos, pedidos de cards e exceções de Loading.
- Separar roteiro humano, inventário e notas de montagem; não confundir metadado com reação.
- Identificar forma, fase da história, relações, personalidades e conhecimento inicial; quando necessário pesquisar a obra sem substituir a ficha do autor.

### Passagem 2 — Inventário real

- Confirmar todos os personagens pelo UUID/nome único; modelos e catálogo de expressões individuais; poses disponíveis e categorias selecionadas.
- Conferir mídia publicada, duração, nome e ID; fundo disponível ou cor autorizada.
- Conferir a disponibilidade de TALK/BLINK/PT na prévia se possível. Se não houver acesso aos sprites ou ao editor, declarar essa limitação.
- Não usar fallback como autorização para inventar assets.

### Passagem 3 — Sala e abertura

- Planejar a ordem horizontal, TV, x/y, espelhamento, espaço para cards, poses iniciais e emoções iniciais.
- Verificar proximidade, hierarquia, relações e frequência de falas; quando não houver posições definidas, escolher deliberadamente.
- Preservar posturas fixas por categoria. Para cada ator, anotar a direção normal em relação à TV.

### Passagem 4 — Conteúdo e apresentação

- Extrair os textos literais e definir durações conforme seção 11.20, traduções e gaps.
- Planejar `scene_end`, pausas explícitas, caudas, início/fim de cada vídeo e **Loading obrigatório de três segundos antes de cada vídeo**.
- Definir `presentation` para cada clipe, incluindo GIF e cards solicitados. Converter os intervalos de cards para segundos relativos ao clipe.
- Manter os vídeos na ordem pedida e sem sobreposição. Não inventar controles de corte/pausa ausentes.

### Passagem 5 — Duração global e grade de frames

- Obter os tempos absolutos finais de todos os blocos, falas e pensamentos.
- Conferir o primeiro comentário pós-cena e todos os tails; verificar os 90 frames de Loading por clipe, salvo exceção autorizada.
- Calcular a duração final incluindo conteúdo e beats narrativos; quantizar sem erros de arredondamento.

### Passagem 6 — Tabela interna de acontecimentos

- Ler cada descrição e contexto, extrair tempos concretos e reconciliar marcadores vazios/zero.
- Definir pico, processamento, beats extras e mudanças de significado; avaliar todos os presentes a cada impacto.
- Registrar para cada decisão o estímulo, o que a pessoa já sabe, o tempo relativo/absoluto, a expressão anterior e a posterior.

### Passagem 7 — Emoções individuais, silenciosos e continuidade

- Dirigir o speaker, o pensador e os ouvintes de forma independente.
- Escolher pela anatomia e intensidade, sem roleta de expressões; indicar persistência ou saída consciente de cada pico.
- Verificar personagens silenciosos, progressão de relações e anti-congelamento. Não resetar durante Loading.

### Passagem 8 — Blocos de conversa e PT

- Identificar interlocutores reais e o encadeamento de perguntas, respostas, réplicas e pausas.
- Planejar a atenção por personagem ao longo de toda a conversa e das cenas; não apenas seguir quem está falando.
- Usar `autoListenerGaze: false` e emitir mudanças reais de direção, inclusive o retorno ao alvo normal quando apropriado.
- Manter olhares em respostas dirigidas a quem está atrás; validar viradas espelhadas do lado direito e do esquerdo.

### Passagem 9 — Poses e integração dos beats

- Usar categorias selecionadas e `autoPoseEverySeconds: 15` como regra padrão; uma mudança elegível por marco global, quando o importador puder realizar.
- Não misturar categoria e slot nem exigir uma troca de postura não solicitada.
- Consolidar os beats por personagem/frame; preservar emoção e direção ao mudar pose; respeitar a antecedência das transições.

### Passagem 10 — Materialização do JSON

- Emitir apenas `format`, campos globais aceitos, `cast`, `videos`, `lines`, `beats` e duração.
- Especificar cada `presentation.loadingGif` corretamente; conferir cards fixos ou intervalos sem misturar modalidades.
- Nenhum campo interno de planejamento, schema antigo, path ou placeholder deve ir para o arquivo entregue.

### Passagem 11 — Auditoria criativa e técnica

- Executar toda a seção 14 e a auditoria de PT da seção 8. Comparar textos de origem e saída programaticamente quando possível.
- Simular estado persistente por pessoa; verificar identidade, categoria, olhares, emoções, tempo e conteúdo.
- Conferir todos os cards e Loading; não declarar importação/exportação sem executar.

### Passagem 12 — Entrega

- Salvar um único arquivo `.json` parseável em UTF-8, sem Markdown ou comentários no conteúdo.
- Entregar o arquivo para importação; auditoria separada somente quando solicitada. Informar limitações técnicas e decisões relevantes, sem inventar testes.
- Se o editor estiver disponível para validação, conferir timeline, preview e MP4, incluindo Loading e cards. Se não estiver, separar validação estrutural de validação de renderização.

---

## 14. Auditoria ampliada obrigatória — V14.4

### 14.1. Por personagem

- [ ] ID pertence ao inventário atual, modelo e presets reais conferidos.
- [ ] Posição, flipX, postura inicial e categoria coerentes; nenhuma mudança entre em pé/sentado não autorizada.
- [ ] Expressão inicial individualmente justificada.
- [ ] Quantidade de picos coletivos avaliados (incluindo preservações).
- [ ] Quantidade de mudanças individuais de expressão, expressões distintas e olhares reais; pose não conta como mudança facial.
- [ ] Maior intervalo contínuo sem mudança facial; revisar aproximadamente 30 s, dois TikToks diferentes, ou atuação muito inferior aos demais.
- [ ] TikToks sem reação individual: verificar silêncio consciente versus omissão.
- [ ] Personalidade não virou face fixa; mudanças têm causa; intensidade e romance/ciúme sustentados por contexto.
- [ ] Estados atravessam falas, vídeos e Loading; TALK/BLINK/PT preservam emoção e categoria.

### 14.2. Por TikTok

- [ ] Vídeo real, ordem, duração e correspondência com roteiro; descrição e contexto lidos integralmente.
- [ ] Tempos concretos extraídos; `0`, `-` e ausências interpretados, não tratados mecanicamente.
- [ ] Primeiro comentário em `scene_end` válido, salvo exceção explícita; não antecipar gatilho.
- [ ] Pico, processamento e novos beats causais; todos os presentes avaliados, nem todos obrigatoriamente alterados.
- [ ] Speaker, target, listeners e silenciosos revisados, incluindo tempo de chegada da informação.
- [ ] Pensamentos privados; pose, direção e continuidade entre cenas; nenhum reset gratuito.
- [ ] Cauda de leitura respeitada; vídeo seguinte não começa cedo demais.
- [ ] Cards temporais e de identificação corretos, coerentes com a adaptação e tempos relativos.
- [ ] Loading obrigatório de três segundos antes do vídeo (inclusive primeiro) salvo dispensa explícita; sem colisão com bloco anterior.
- [ ] Espaço visual para cards, vídeo e balões; limitações de montagem registradas.

### 14.3. Por fala ou pensamento

- [ ] Falante/ID, tipo, texto literal, tradução e ordem idênticos à fonte.
- [ ] Expressão do speaker corresponde à intenção; avaliar o próprio pensador.
- [ ] Target identificado pelo conteúdo, não pelo próximo falante.
- [ ] Listeners reagem após ouvir a informação relevante; terceiros não escutam pensamentos.
- [ ] Direção inicial e durante a resposta corretas; continuidade entre pausas, troca de falante e réplicas.
- [ ] Mudança emocional durante PT não encerra a direção; retorno apenas quando o foco realmente muda.
- [ ] Duração de leitura explícita, piso e fórmula aplicados; usar maior contagem entre idiomas; pensamento +0,4 s.
- [ ] Gap posterior coerente; nenhuma sobreposição acidental; pensamento não aciona TALK.

### 14.4. Raiz e recursos

- [ ] JSON parseável, sem comentários, chaves duplicadas ou números inválidos; formato `NYMI_EDITOR_V6_REACT_V1`.
- [ ] Apenas campos do contrato V6; seed inteiro permitido; cor válida ou UUID real de fundo.
- [ ] `cast` único com 1–24 integrantes; IDs confirmados; categorias existentes; nenhum `poseSlot` conflitante.
- [ ] `autoListenerGaze: false` no modo manual; `autoPoseEverySeconds: 15` por padrão.
- [ ] Cada vídeo tem exatamente uma referência real; não há sobreposição na faixa de vídeo.
- [ ] Todos os textos, beats e recursos referenciam integrantes reais. IDs de personagens, vídeos e presets não são criados pela IA.
- [ ] Tamanho e limites de listas/estados/blocos conforme seção 3. A contagem de beats não comprova o limite real de estados compilados.

### 14.5. Estado, tempo e PT

- [ ] Estado inicial completo na autoria e persistência simulada até o fim; campos omitidos não significam reset.
- [ ] `startSeconds` no relógio do conteúdo principal em `videos`, `lines`, `beats`; intervalos de cards relativos ao clipe.
- [ ] Quadros inteiros calculados com ceil e tolerância numérica mínima; fronteiras exclusivas, sem beats conflitantes para o mesmo personagem/frame.
- [ ] Nenhuma expressão antecipada por erro de tempo ou transição; reação transitória tem saída quando necessária.
- [ ] Procurar left→right→left e right→left→right em pausas curtas; remover o movimento intermediário sem motivo.
- [ ] Não retornar à TV antes de uma resposta dirigida a quem está atrás; não manter PT após o fim do diálogo sem motivo.
- [ ] Duração inclui todas as caudas; ao alterar um bloco, revalidar tempos subsequentes e beats correspondentes.

### 14.6. Apresentação e Loading — bloqueio de entrega

- [ ] Para N vídeos não dispensados, existem N itens com `presentation.loadingGif: true` (inclusive o vídeo 01).
- [ ] Primeiro vídeo começa depois de uma janela livre de pelo menos 3 s; cada Loading posterior começa após o fim real do bloco anterior.
- [ ] A janela `[S-3, S)` de cada clipe não está sobreposta ao vídeo anterior ou a balões, salvo pedido explícito.
- [ ] Nenhum GIF foi omitido por falta de solicitação específica de Loading.
- [ ] Cards superiores usam apenas Past/Future/Indecipherable conforme a instrução; inferiores têm 1–240 caracteres após trim.
- [ ] Cards fixos não são misturados com listas da mesma posição; intervalos dentro do clipe, ordenados, positivos e não sobrepostos.
- [ ] Todos os cards pedidos foram incluídos, sem rótulos de outros projetos nem revelação antecipada contra o pedido do autor.
- [ ] A última cauda do projeto não é cortada; não existe Loading extra sem vídeo seguinte.

**Se qualquer GIF obrigatório faltar ou não tiver os três segundos reservados, corrija o projeto antes de entregar.** Não basta dizer que o Loading está previsto no guia.

### 14.7. Testes e limitações

- [ ] Conferência estrutural: parse, chaves, referências, tempos, textos e regras de autoria.
- [ ] Conferência no aplicativo, quando possível: importação real, timeline, sprites/poses, TALK, BLINK, PT, cards, GIF e prévia.
- [ ] Exportação: MP4 efetivamente renderizado e conferido se acessível. Não inventar resultado de teste.
- [ ] As limitações do formato (fades, pausas, etc.) foram comunicadas quando a tarefa exigia esses recursos.

### 14.8. Proibições consolidadas

- Não usar schema/objetos V4 ou JSON interno do editor como contrato do react externo.
- Não gerar `state`, `character_tracks`, `timeline_tracks`, `timeline`, `group_reaction`, `use_talk`, `persist_expression`, `reset_expression_after`, `stagger`, `visibility`, `lookAt`, `gazeDuration` ou campos de planejamento como se fossem aceitos.
- Não criar paths, UUIDs, poses, categorias, presets, variantes ou traduções inventados.
- Não inventar, editar, omitir ou reordenar falas/pensamentos, nem converter notas de edição em textos de reação.
- Não presumir que um preset existe ou que TALK/BLINK/PT funcionam sem assets e testes correspondentes.
- Não antecipar conhecimento, confundir choque com admiração ou transformar romance futuro em sentimento presente.
- Não resetar emoção ou atenção a cada vídeo, balão, pose ou GIF; não congelar quem está silencioso por esquecimento.
- Não trocar todos os personagens de pose a cada marco nem misturar posturas não autorizadas.
- Não criar PT decorativo, retorno frontal artificial, virada de terceiros por pensamento ou alvo baseado apenas na ordem de falas.
- Não cortar leitura por fim do MP4; não acrescentar atraso automático ao `scene_end`; não confundir tempo relativo com absoluto.
- Não esquecer o Loading; não colidir sua janela com o bloco anterior; não usar evento de mídia improvisado para simulá-lo.
- Não declarar que o código do aplicativo foi alterado, que a importação ocorreu ou que o MP4 foi exportado quando isso não aconteceu.

---

## 15. Exemplos V6 e resumo operacional final

### 15.1. Projeto mínimo ilustrativo com Loading, cards e reação

Os nomes, número de vídeo e presets abaixo são fictícios para explicar a estrutura. Na geração real, substitua pelas referências confirmadas. Neste exemplo, a mídia dura pelo menos 10 s; a revelação termina em 7 s relativos, e a fala começa no tempo absoluto 10 s. A face de B muda após o gatilho. A duração de 15 s inclui a cauda da fala. A TV está no centro e as pessoas estão à esquerda.

```json
{
  "format": "NYMI_EDITOR_V6_REACT_V1",
  "title": "Exemplo ilustrativo",
  "seed": 20261105,
  "backgroundColor": "#d7b5cd",
  "autoPoseEverySeconds": 15,
  "autoListenerGaze": false,
  "cast": [
    { "character": "A", "x": -42, "y": 9, "scale": 121, "flipX": false, "poseCategory": "Em pé", "expression": "Séria" },
    { "character": "B", "x": -20, "y": 20, "scale": 121, "flipX": false, "poseCategory": "Sentado", "expression": "Normal" }
  ],
  "videos": [
    {
      "videoNumber": 1,
      "startSeconds": 3,
      "durationSeconds": 10,
      "layout": { "x": 0, "y": -5, "width": 26, "height": 66, "rotation": 0 },
      "presentation": { "loadingGif": true, "timeCard": "Future", "bottomCard": "Personagem da cena" }
    }
  ],
  "lines": [
    { "character": "A", "kind": "speech", "text": "Você viu isso?", "startSeconds": 10, "durationSeconds": 2.6 }
  ],
  "beats": [
    { "character": "B", "startSeconds": 10.2666666667, "expression": "Surpresa", "gaze": "left" },
    { "character": "B", "startSeconds": 11.5, "expression": "Confusa" },
    { "character": "B", "startSeconds": 13.3, "gaze": "right" }
  ],
  "durationSeconds": 15
}
```

O GIF ocupa [0, 3), cards [3, 13), fala [10, 12,6). B vira ao ouvir A e mantém a direção enquanto muda de emoção; retorna à TV após o encerramento. A expressão Confusa não é apagada pelo retorno. A duração mínima de 15 s deixa a cauda final para o encerramento. Não copiar os nomes ilustrativos como se fossem inventário real.

### 15.2. Bloco sem cards: Loading continua obrigatório

```json
{
  "videoNumber": 2,
  "startSeconds": 36,
  "presentation": { "loadingGif": true }
}
```

Este clipe pressupõe bloco anterior encerrado até 33 s. A ausência de cards não dispensa o GIF. Se o autor solicitar expressamente um vídeo sem Loading, use `loadingGif: false` ou omita o campo, mantendo os cards que foram pedidos. Não aplique a exceção aos demais vídeos.

### 15.3. Exemplo de reação persistente com PT

Para um personagem que está olhando para a esquerda durante conversa, uma nova emoção pode ser emitida sem `gaze`. O olhar persiste. Se o diálogo continuar com a resposta desse personagem, não gerar outro beat só para repetir a direção. Quando termina, o beat de retorno contém apenas `gaze` se a emoção não mudou. As seções 4.2–4.3 fornecem a sequência completa. Não converter PT em nome de preset.

### 15.4. Resumo operacional ultracurto (recuperado do V13.1)

```text
RAIZ: NYMI_EDITOR_V6_REACT_V1
CONTEÚDO: videos + lines
ESTADO: cast + beats, campos omitidos persistem
TEMPOS: absolutos em segundos, 30 FPS; cards em tempo relativo ao clipe
POSES: poseCategory real, autoPoseEverySeconds=15, postura fixa
PT: autoListenerGaze=false, gaze absoluto, continuidade por diálogo
TALK/BLINK: agendamento do runtime, preservam emoção
LOADING: presentation.loadingGif=true em todos os vídeos
JANELA: [S-3,S), depois da cauda anterior, inclusive primeiro
CARDS: superiores Past/Future/Indecipherable; inferiores texto solicitado
REAÇÕES: pico → processamento, avaliação de todos, beats causais
FALA: texto literal, leitura suficiente, scene_end exato salvo exceção
PENSAMENTO: privado, +0,4 s, sem TALK
AUDITORIA: por personagem, TikTok, fala, estado, tempo, cards e Loading
ENTREGA: .json válido, sem campos antigos; testes reais ou limitações
```

### 15.5. Regra final de precedência e manutenção

A última instrução explícita do usuário governa o resultado criativo; fatos e inventário atuais vencem exemplos históricos; V14.5 rege Intro, Loading e direção; a implementação real do V6 rege o que é importável. Se um requisito narrativo não for representável, preserve a intenção na atuação suportada e comunique os ajustes manuais restantes. Não introduza campos por analogia com o V4. Qualidade de atuação vence compactação, mas respeita os limites do compilador e não exige beats redundantes.

Em futuras atualizações: preservar este núcleo criativo, revisar o contrato real de importação/compilação do V6, confrontar os recursos do Fabricador, Poses Dev, biblioteca, preview e exportação, atualizar apenas os mecanismos que mudaram e incrementar a versão do guia. Não recuperar exemplos de elenco fixo de outros roteiros. A atualização documental não altera o aplicativo.
