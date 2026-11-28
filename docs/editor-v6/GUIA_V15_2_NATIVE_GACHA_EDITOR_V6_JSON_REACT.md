# GUIA V15.2 — Native Gacha / Editor V6 — React por JSON

**Finalidade:** dirigir reações Gacha de alta qualidade e materializá-las no Editor V6. Entradas: roteiro exportado em Markdown, contexto do autor e inventário atual de personagens, expressões, poses, vídeos e fundo. Saída: JSON externo para **Importar vídeo em JSON** ou edição de uma cópia do projeto nativo existente, conforme o pedido.

**Contrato externo:** `NYMI_EDITOR_V6_REACT_V1` · 30 FPS. V15.2 é a versão da documentação, não do schema. Consolida o núcleo criativo V13.1/V12.4.1, PT contínuo/causal/seletivo (V14.2/14.6/14.7), continuidade emocional (V14.8), Loading, Intro, cards triplos e recomendação de 8 quadros entre beats da V15.0. Não altera o aplicativo.

**V15.2 — continuidade corporal e integridade de IDs:** a pose específica persiste até outra troca intencional; expressão, PT, balões e fronteiras de bloco não a redefinem. Correções nativas exigem snapshots compatíveis com a pose e a face desejadas, sem sacrificar uma para corrigir a outra. UUIDs são validados por categoria (§6.5, §8.3–8.4 e §9).

**Consulta:** 1. Escopo e fontes · 2. Contrato JSON · 3. Apresentação · 4. Planejamento temporal · 5. Atuação e continuidade emocional · 6. Sala, poses e PT (§6.5: persistência corporal) · 7. Dicionário facial · 8. Projetos nativos (§8.3: snapshots; §8.4: UUIDs) · 9. Fluxo e auditoria · 10. Exemplo integrado.

## 1. Escopo, precedência e fidelidade

### 1.1. Regras de precedência

- A implementação real da versão instalada rege o que é tecnicamente representável. A última instrução explícita do autor governa a intenção criativa; roteiro, fichas e inventário atuais vencem exemplos históricos e pesquisa externa. As regras deste guia preenchem o que o autor não especificou.
- **Preserve literalmente cada fala e pensamento:** texto, espaços/quebras, pontuação, falante, tipo, ordem e tradução fornecida. Não criar, corrigir, melhorar, resumir, unir, separar, traduzir, omitir ou reordenar sem autorização explícita. Se o autor pedir tradução, produza-a fiel e idiomática no campo de idioma correspondente, sem editar o original. Não invente falas para preencher lacunas. Rubricas, descrições, cards e falas do vídeo-fonte não são diálogos da sala. Uma pessoa citada no vídeo não vira integrante do elenco automaticamente.
- Separe criação de roteiro externo de edição de projeto nativo (§8). Não converta formatos sem pedido. Se uma intenção não for representável, mantenha o conteúdo suportado e comunique a edição manual necessária. Nunca fabrique recursos ou testes.

### 1.2. Inventário e evidências

Leia integralmente o roteiro, contexto adicional e notas. O **Exportar roteiro** da área Roteiros fornece Markdown com IDs, poses selecionadas em Poses Dev, presets, fichas, fundo, vídeos, descrições e tempos. Campos `Português`/`English` são strings JSON: decodifique aspas e escapes para obter o texto literal.

Confirme:
- elenco (UUID ou nome único do Customizador), modelo, fase/forma, personalidade, relações e conhecimento inicial;
- presets de expressão reais do modelo e categorias/variações de pose selecionadas em Poses Dev;
- ordem, ID/número publicado/nome único, duração e contexto de cada vídeo, além do fundo (UUID existente ou cor autorizada);
- pedidos de Intro, cards, pausas, abertura/fechamento, exceções de Loading e montagem.

Dados indisponíveis ou ambíguos: solicite o recurso essencial ou declare a limitação. Um caminho antigo `assets/...`, nome ilustrativo ou fallback não comprova disponibilidade. Não invente UUIDs, categorias, presets, sprites, traduções não solicitadas ou mídias. Se necessário, pesquise a obra distinguindo versões, identidade civil/heroica e fase narrativa, sem substituir a ficha do autor. Confira TALK/BLINK/PT na prévia quando possível.

## 2. Contrato técnico — JSON externo

### 2.1. Raiz e limites

Entregue um único arquivo `.json` em UTF-8, com um objeto JSON válido, sem comentários, cercas ou notas dentro do arquivo. Auditoria, ressalvas e ajustes manuais ficam fora do JSON. A raiz aceita somente os campos abaixo:

| Campo | Regra |
|---|---|
| `format` | `NYMI_EDITOR_V6_REACT_V1` |
| `title` | Título do roteiro |
| `seed` | Inteiro 0–2.147.483.647; sequência reproduzível |
| `backgroundColor` | `#RRGGBB` |
| `backgroundLibraryId` | Opcional; UUID de fundo real |
| `autoPoseEverySeconds` | 15 por padrão de autoria quando variações automáticas são permitidas; 0 desliga o automático, inclusive quando o autor exige somente trocas explicitamente dirigidas (§6.5) |
| `autoListenerGaze` | **`false` explícito** para direção manual; default do importador é `true` (ver §6) |
| `cast` | Elenco único, 1–24 pessoas |
| `videos` | Clipes em ordem, sem sobreposição na faixa de vídeo |
| `lines` | Falas e pensamentos |
| `beats` | Mudanças de estado visual |
| `intro` | Opcional, somente quando solicitada (§3.3) |
| `durationSeconds` | Duração mínima do conteúdo principal; nunca corta eventos |

Limites documentados: JSON até 2 MB; 500 vídeos, 10.000 linhas e 10.000 beats; compilador: 1.000 camadas, 1.000 estados visuais, 1.000 blocos por faixa, 5.000 assets e 1.000.000 de quadros. Cards: 1.000 blocos na faixa; Intro: 1.000 blocos e até 100 partes por apresentação. Mídias e memória podem impor limites adicionais. Quantidade de beats não comprova quantidade de estados compilados.

O [JSON Schema externo](schema/NYMI_EDITOR_V6_REACT_V1.schema.json) é gerado do schema Zod do importador e serve para edição/autocomplete estrutural. Ele não substitui a validação do aplicativo: referências de catálogo, quantização em quadros, intervalos e outras regras semânticas continuam sendo verificadas na importação.

### 2.2. Campos dos itens

| Lista | Obrigatórios / alternativas | Opcionais e observações |
|---|---|---|
| `cast` | `character`, `x`, `y` | `scale`, `flipX`, `poseCategory`, `expression`; legado `poseSlot` (§6) |
| `videos` | Exatamente um de `videoId`, `videoNumber`, `videoName`; `startSeconds` | `durationSeconds` limita o trecho ao tamanho da mídia; `layout` com `x`, `y`, `width`, `height`, `rotation` em porcentagens de palco para posição e tamanho; `rotation` para rotação; `presentation` conforme §3, obrigatório na autoria para Loading salvo dispensa |
| `lines` | `character`, `kind` (`speech`/`thought`), `text`, `startSeconds`, `durationSeconds` | `englishText` e layout de balão `x`, `y`, `width`, `height`; inglês acima, português abaixo; sem tradução, um balão |
| `beats` | `character`, `startSeconds` e pelo menos um de `expression`, `gaze`, `poseCategory` | Só mudanças reais; `gaze` absoluto `left`/`right`; campos omitidos persistem |

`character` referencia UUID ou nome único real do elenco. Em `cast`, a origem do palco é (0,0), x negativo à esquerda. A escala inicial importada é 121 para todos, mesmo se outro `scale` for informado. Especifique categoria, expressão e espelhamento coerentes; omissões podem acionar escolha automática determinística de pose/expressão, não uma interpretação emocional. `poseSlot` é legado: não combine com `poseCategory` no mesmo personagem; para pose base sem seleção, use `poseSlot: null` sem categoria. Não confunda ordem na lista de poses com slot. O `poseSlot` legado do `cast` não autoriza usar `poseSlot` em `beats`: o contrato externo documenta apenas `poseCategory` para mudanças corporais. Para exigir slots exatos ao longo da timeline, use edição nativa compatível ou ajuste no aplicativo (§6.5, §8.3).

`cast` define o estado inicial; `beats` alteram atributos persistentes. Um beat exclusivamente de expressão ou olhar não escolhe outra pose; preserve também a variação corporal efetiva, não apenas a categoria (§6.5). Beats da mesma pessoa que quantizam para o mesmo quadro podem combinar atributos diferentes; valores duplicados idênticos são consolidados pelo importador, mas valores conflitantes no mesmo atributo são rejeitados com os índices dos campos. Não repita atributos inalterados nem crie beats para simular avaliação de personagens. Reações transitórias usam entrada e saída justificadas, sem campo de duração/reset. O importador constrói snapshots e faixas nativos; TALK/BLINK são agendados pelo aplicativo com assets existentes. Fala aciona TALK; pensamento não aciona fala/escuta. As animações dependem dos recursos reais.

### 2.3. Relógios e recursos não representados

- `videos`, `lines`, `beats` e `durationSeconds` usam segundos absolutos do **conteúdo principal**, cujo zero é o fim da Intro (ou início do projeto sem Intro). Não some a duração da Intro manualmente. Cards usam segundos relativos ao início do clipe; itens de Intro usam tempo absoluto da timeline, partes relativas ao item. Em projeto nativo, examine os campos reais e o FPS (§8).
- Não emitir no react externo estruturas V4/nativas ou de planejamento: `schema_version`, `timeline`, `timeline_tracks`, `character_tracks`, `state`, `group_reaction`, `use_talk`, `at`, `comments`, `track_id`, `locked`, `collapsed`, `stagger`, `lookAt`, `target`, `speakerTarget`, `holdGaze`, `dialogueGroup`, `gazeDuration`, `persist_expression`, `reset_expression_after`, caminhos de assets ou metadados de faixas.
- `scene_end`, tempos de reação, motivo, alvo, frame e estados anteriores são dados internos de planejamento, não propriedades do JSON externo. Não inserir resolução, cor de nome, variantes de sprite, opacity, rotation de personagem, `stage_transform`, `visibility`, `clip_start`, `include_audio`, `hold_video_frame`, `fade_in`, `fade_out` ou label livre como campos de intercâmbio. Não herdar coordenadas em pixels do V4.
- Cortes internos, crop, pausas da mídia, close/zoom, isolamento fora da Intro, cartela integral fora da Intro, fades, visibilidade e áudio externo não estão documentados neste contrato. Áudio do vídeo segue o editor. Informe ajustes manuais; não simule essas funções com cards, Loading ou falas. A proibição vale para o react externo, não para campos reais de um projeto nativo.

## 3. Apresentação: Loading, cards e Intro

### 3.1. Loading obrigatório

Todo vídeo, inclusive o primeiro e os sem cards, deve usar `presentation.loadingGif: true` salvo dispensa explícita daquele vídeo/projeto. É política de autoria, não default do importador. Use apenas o GIF nativo; não crie mídia ou evento `loading`.

Para vídeo começando em S, GIF centralizado à frente da cena ocupa `[S-3,S)` (90 quadros). Se S < 3, o GIF é recortado no quadro zero; S=0 não exibe pré-roll. Se janelas coincidirem, aparece o GIF do próximo clipe sinalizado. Não planeje recortes/colisões como padrão: o GIF não desloca, pausa nem encurta mídia ou balões.

```text
videoEnd = início_do_vídeo + duração_visível
lineEnd = início_da_linha + duração_da_linha
blockEnd = max(videoEnd, fins_das_linhas_do_bloco, fim_de_beats_que_exigem_cauda)
loadingStart = blockEnd + silêncio_explícito_se_houver
nextVideoStart = loadingStart + 3
```

Antes do primeiro vídeo, use o fim da abertura como `blockEnd`, ou 0 se não houver abertura no conteúdo principal. Com Intro, o relógio principal começa ao final dela. Abertura vazia não recebe diálogos inventados. Ex.: abertura acaba em 6,4 s, vídeo 1 em 9,4 s; vídeo acaba em 29,4 s, pensamento final em 33 s; próximo GIF [33,36), vídeo 2 em 36 s.

Sem pedido de sobreposição, reserve os 3 s livres de vídeo anterior e balões; não corte texto para caber. Planeje caudas antes dos beats. Ao corrigir timing, desloque todo o bloco e os posteriores (vídeos, linhas, beats e vínculos), mantendo cards relativos ao clipe. Loading não reseta emoção, conhecimento ou pose; retorno frontal se conversa terminou, PT durante Loading somente por decisão narrativa explícita e sem conflito de conteúdo. Não adicionar GIF depois do último vídeo sem próximo clipe.

### 3.2. Cards de vídeo — formato V15

Ative cards somente se solicitados. Pedido geral com TEMPO/CARD ou dados equivalentes basta; classificação isolada da Base de Vídeos não ativa exibição. Identifique clipe por referência confirmada, sem confundir ator original e papel na adaptação.

Cada entrada de `presentation.cards` cria um bloco na faixa **Cards**, abaixo de **Vídeo**. Componentes independentes:

| Componente | Posição | Conteúdo |
|---|---|---|
| `temporal` | Acima do vídeo | Exclusivamente `Past`, `Future`, `Indecipherable` |
| `english` | Primeiro card inferior | Inglês, até 240 caracteres |
| `portuguese` | Segundo card inferior | Português, até 240 caracteres; sozinho encosta no vídeo |

Cada bloco e componente possui `startSeconds` inclusivo e `endSeconds` exclusivo, relativos ao início do clipe na timeline, mesmo com Intro. Mínimo de um quadro por intervalo; componentes contidos no bloco; exibição limitada à parte ativa do vídeo. Ao menos um componente por bloco. Componente informado tem `enabled: true` por padrão; omitido fica desligado; `enabled: false` guarda texto/tempo sem exibir. Texto vazio inferior fica invisível. Podem existir lacunas. Em sobreposição na mesma posição, prevalece o bloco que começa mais tarde, com desempate por ID. Evite sobreposições acidentais. Para ocupar todo o clipe, use 0 e duração visível; para trocar texto, outro bloco com intervalo correspondente.

**Direção narrativa:** copie rótulos aprovados literalmente; quando o autor delegar, use identificação curta de papéis confirmados. Traduza se solicitado (§1). `Indecipherable` somente quando o autor autorizar classificação incerta e o contexto for indecifrável; não chute passado/futuro. A fase é relativa à versão presente da sala. Não deduzir parentesco/romance, nem revelar identidade/tempo antes do momento autorizado; use intervalos dinâmicos quando necessário. O texto visível já pode ser conhecido naquele instante, mas não revela ações, motivações, desfecho ou memórias que ainda não apareceram. Card fixo solicitado permanece fixo.

**Composição:** os três cards usam a largura visível do vídeo e seguem posição/rotação; personagens, objetos e vídeo atrás dos cards; balões à frente. Prévia e MP4 usam a mesma composição SVG, segundo o contrato V15.0. Reserve margem acima e abaixo (a proporção da mídia altera a área visível), use textos curtos e confira legibilidade.

Exemplo de componentes independentes para um clipe de 20 s:

```json
{
  "videoNumber": 1,
  "startSeconds": 3,
  "durationSeconds": 20,
  "presentation": {
    "loadingGif": true,
    "cards": [
      {
        "startSeconds": 0, "endSeconds": 20,
        "temporal": { "startSeconds": 0, "endSeconds": 20, "text": "Past" },
        "english": { "startSeconds": 10, "endSeconds": 15, "text": "The first mission" },
        "portuguese": { "startSeconds": 10, "endSeconds": 15, "text": "A primeira missão", "enabled": true }
      },
      {
        "startSeconds": 16, "endSeconds": 20,
        "portuguese": { "startSeconds": 16, "endSeconds": 20, "text": "A chegada" }
      }
    ]
  }
}
```

**Legado:** `timeCard`, `timeCards`, `bottomCard`, `bottomCards` continuam aceitos; inferior legado vira componente português sem mudar texto. Intervalos sobrepostos de posições diferentes podem compartilhar bloco sem mudar tempos. Use `cards` nos novos roteiros, sem misturar formas legadas no mesmo vídeo. Exportação de roteiro usa `cards`. Não cole inglês e português com quebra de linha em um único componente quando houver cards nativos separados.

**Edição no aplicativo:** selecione o bloco no Inspetor para ajustar Exibir, texto, início, fim/duração de cada componente; mova/redimensione na timeline. Dividir cria duas cópias independentes, separa intervalos e desliga componentes sem trecho naquela metade. Duplicar cria outro bloco; Ctrl+C/Ctrl+V cola no cursor com vídeo ativo e vínculo ao destino. GIF permanece no clipe. Para edição direta do projeto nativo, não presuma que essa estrutura externa seja idêntica à interna (§8).

### 3.3. Intro opcional

Use `intro` apenas a pedido. Cria faixa Intro com um bloco por tela preta e por parte de apresentação. Itens começam no quadro zero e são consecutivos; `startSeconds` opcional do item é absoluto na timeline e permite lacuna, sem sobreposição.

- `kind: "character"`: `character` do `cast`; retrato à esquerda com pose/espelhamento iniciais sobre a cor do projeto; card branco à direita, `englishText` acima de `text`. `durationSeconds` padrão 8 s por personagem; ampliar por leitura. `parts` contém os dois textos e `startSeconds` relativo ao item: primeira parte em 0, seguintes avançam pelo menos um quadro e começam antes do fim. Parte dura até a seguinte ou fim. `expression` opcional com preset real; primeira herda expressão inicial, demais mantêm a última. Para só trocar expressão, repita os textos em nova parte. Intro não altera expressão do conteúdo principal.
- `kind: "black"`: tela preta inteira, `text` branco centralizado; mensagem livre, no começo, entre apresentações ou ao final. `durationSeconds` padrão 3,5 s.
- Até 800 caracteres por texto; 100 partes por personagem e 1.000 blocos de Intro. Quantização em 30 FPS. Apresentações e mensagens autorizadas podem ser criadas com fatos confirmados e textos bilíngues naturais, sem inventar biografia, antecipar segredos ou modificar falas originais.

Exemplo de valor de `intro` (fragmento ilustrativo, pessoas e presets devem existir):

```json
[
  { "kind": "black", "text": "Arquivo 07" },
  { "kind": "character", "character": "A", "durationSeconds": 12, "parts": [
    { "startSeconds": 0, "englishText": "My name is A.", "text": "Meu nome é A." },
    { "startSeconds": 5, "englishText": "I remember the warning.", "text": "Eu lembro do aviso.", "expression": "Preocupada" }
  ] },
  { "kind": "black", "text": "Outro ponto de vista", "durationSeconds": 2 },
  { "kind": "character", "character": "B", "parts": [
    { "startSeconds": 0, "englishText": "I was there too.", "text": "Eu também estava lá." }
  ] },
  { "kind": "black", "text": "A gravação começa" }
]
```

Intro dura 29 s; sem abertura adicional, primeiro `videos[].startSeconds: 3` resulta em Loading [29,32) e vídeo aos 32 s reais. Não some 29 aos demais campos. **Importar JSON** cria a faixa; Base de Vídeos/Roteiros preserva Intro no JSON original. Edite texto no Inspetor e duração pelas bordas do bloco; confira retrato, idiomas, expressão e prévia/MP4.

## 4. Planejamento temporal, leitura e beats

### 4.1. Evidências e reconciliação de marcadores

Para localizar acontecimentos, use em ordem: (1) tempo explicitamente ligado à ação na descrição/contexto; (2) `scene_end` válido e coerente; (3) marcadores de reação coletiva válidos; (4) duração total do vídeo; (5) campos incompletos. Essa ordem não substitui a regra de entrada exata do primeiro comentário.

| Situação | Decisão |
|---|---|
| Campo e descrição plausíveis | Combine ambos, sem antecipar informação. |
| `0,00`, vazio, não informado | Pode ser sentinela/provisório; procure ação real na descrição. Zero literal e coerente deve ser respeitado. |
| `-` | Liberdade para reagir ou não; não é proibição nem obrigação. |
| Tempo impossível/contraditório | Ignore o tempo inválido, registre incerteza; priorize evidência concreta. |
| Descrição sem tempo | Use `scene_end`, duração e estrutura para estimar só se necessário; não invente precisão quadro a quadro. |

Um beat visual é mudança de significado: frase, letra, revelação, entrada de pessoa, corte, arma, gesto/olhar, abraço, beijo, tom ou payoff. Descrição pode justificar mais que os dois marcadores, inclusive beats individuais/coletivos, silêncio, pose ou direção (somente se necessária). Não inventar pensamentos/falas para esses pontos.

Primeira reação coletiva, quando houver, marca pico; segunda mostra processamento/descontração/evolução, não reset. Marcador 1 ausente: procure primeiro impacto real; se não houver, avalie no `scene_end` sem atrasar o comentário. Marcador 2 ausente: procure processamento após pico e antes de `scene_end`, se houver espaço e motivo; não comprima estados só para preencher campos. Novos estímulos podem gerar beats adicionais. Referência de densidade: curtas 1–3, médias 2–5, longas quantos forem relevantes; sem quota matemática.

### 4.2. Falas, pensamentos e cauda

Primeiro comentário pós-cena: `startSeconds = início_do_vídeo + scene_end` válido, **sem silêncio/gap automático**. O processamento silencioso pode ocorrer antes de `scene_end`. Exceção: pausa expressamente pedida pelo autor (ex.: 2 s depois da reação); não generalize. Fala/pensamento durante vídeo somente quando autorizado pelo roteiro, com tempo suficiente e sem atropelar conteúdo audiovisual; se decisão delegada, escolha pela qualidade da cena e use apenas textos fornecidos. O vídeo pode continuar após `scene_end`; balão pode ultrapassar o MP4. Nunca comprima leitura para caber na mídia.

Conte palavras de cada idioma separadamente e use o maior número, nunca a soma. Duração explícita do autor prevalece. Piso de leitura:

| Palavras | Segundos |
|---:|---:|
| 1–3 | 2,6 |
| 4–7 | 3,2 |
| 8–12 | 3,9 |
| 13–18 | 4,9 |
| 19–25 | 6,2 |
| 26–35 | 7,6 |
| 36–45 | 9,0 |
| 46–60 | 11,0 |
| 61+ | Calcular individualmente |

```text
duração_base = 1.3 + 0.24 × palavras
duração_fala = max(piso, duração_base, 2.6)
duração_pensamento = duração_fala + 0.4
```

Arredonde aproximadamente a 0,1 s sem reduzir o mínimo calculado e ajuste à grade. Gap usual 0,3 s (0,3–0,5 s conforme ritmo); não é motivo para reset de olhar/emoção. Sem sobreposição acidental. Alterou duração? Recalcule comentários seguintes, beats, caudas, Loading e vídeos posteriores. Preserve sincronização e entrada exata pós-cena.

### 4.3. Quadros e transições

Quadro de uma fronteira = `ceil(t × 30)` com tolerância numérica mínima; intervalos `[início,fim)`. Ex.: 4,54 s relativos a início alinhado = 137 quadros. Calcule fronteiras no relógio correto; se for necessário garantir duração mínima, arredonde a duração para cima em quadros a partir do início quantizado. A duração total cobre o máximo do fim de vídeos, balões e estados que exigem cauda, mais silêncios solicitados; `durationSeconds` não encurta eventos.

Planeje pelo menos **8 quadros (0,267 s)** entre mudanças consecutivas do mesmo personagem, para que o estado e a transição sejam perceptíveis. O importador preserva os tempos solicitados e avisa sobre beats explícitos mais próximos. Estados curtos intencionais (até um quadro) podem ser válidos; não apagar automaticamente, mas verificar leitura visual. Se retângulos curtos se sobrepuserem na timeline, clique repetidamente para percorrê-los.

Transições elegíveis de pose/expressão podem começar até **250 ms antes** do quadro final do beat, limitadas pelo início do bloco anterior. Compense quando necessário para não antecipar o gatilho (por exemplo, estado final 8 quadros após o estímulo alinhado), sem deslocar o primeiro comentário. Confira a prévia, inclusive mudanças com olhar. Não há controle por beat de corte instantâneo no react externo; faixas amarelas dependem de estados distintos e animação habilitada. Não prometa transição ou estado instantâneo sem verificar.

## 5. Direção narrativa e continuidade emocional

### 5.1. Causalidade e avaliação individual

**O personagem não lê o roteiro.** Reage apenas ao que já viu, ouviu, sabe ou processou. Não antecipar próxima fala, ação, vídeo, revelação ou resultado. A IA pode ler adiante para planejar continuidade, não para transferir conhecimento. A expressão resulta de estímulo + personalidade + história + vínculo + conhecimento atual; escolha pela anatomia e menor intensidade suficiente (§7), não pela palavra emocional da frase.

Em cada impacto relevante (ameaça, humilhação, afeto, sofrimento, acusação, surpresa, romance, etc.), avalie todos os presentes. Preservar o estado é decisão ativa. Não obrigue todos a mudar ou a reagir com intensidade idêntica, nem tente usar todas as expressões. Personagens silenciosos continuam observando, ouvindo e interpretando. Reações simultâneas podem ser emitidas no mesmo quadro; atrasos individuais intencionais usam tempos distintos, sem campo `stagger`. Ex.: A surpreende-se no impacto, B admira, C permanece irritado, D processa o risco depois. Não gerar beat para C se nada mudou.

Para cada fala, faça quatro decisões separadas:
1. Falante: expressão coerente com intenção, antes ou no início da fala sem antecipar informação nova.
2. Destinatário: determine pelo conteúdo/contexto percebido, inclusive fala geral sem alvo individual; dirija olhar conforme §6.
3. Ouvintes: reagem quando a informação relevante chega (durante, perto do fim ou depois), não à frase completa no primeiro frame.
4. Silenciosos: avaliar quem observa ou escuta sem falar. Pensamento privado pode mudar a emoção do próprio pensador, nunca gerar escuta, resposta ou virada de terceiros; nem PT automático do pensador.

### 5.2. Estado emocional persistente

**A expressão pertence ao personagem, não ao balão.** A duração da leitura e a duração da emoção são independentes. A expressão adquirida permanece até surgir causa narrativa ou processamento psicológico coerente para outra. Omissão de `expression` preserva o estado. Não restaurar o rosto anterior ou neutro por conveniência.

| Acontecimento | Decisão |
|---|---|
| Início de fala/pensamento | Mudar expressão apenas se intenção/processamento justificar. |
| Fim de fala/pensamento | Manter expressão vigente, salvo resolução/evolução própria. |
| Outra pessoa fala | Avaliar estímulo quando percebido; sem reset. |
| PT, retorno frontal, pose | Preservar emoção; alterar somente atributo necessário. |
| TALK/BLINK termina | Retomar modo facial da emoção vigente, não preset anterior. |
| Silêncio, Loading, novo clipe | Manter estado enquanto válido; reagir ao estímulo novo quando ocorrer. |

Mantenha memória interna individual: expressão anterior/vigente, instante e causa, conhecimento, questão emocional aberta, condições de evolução/encerramento. Em cada troca, pergunte:
- O que acabou de ser percebido, pensado ou processado? Por que a expressão atual deixou de representar o estado interno?
- Se há retorno à expressão anterior, a causa da nova emoção se resolveu, dissipou ou evoluiu de forma plausível?
- A troca ainda faria sentido sem a borda do balão, PT, pose ou Loading naquele quadro? O instante respeita causalidade e transições?

Sem motivo independente, mantenha a expressão. Coincidir com fim de texto não prova erro, mas exige exame. Persistência não significa congelamento: surpresa, confusão, impressão, vergonha ou sorriso breves podem dissipar-se; preocupação, desconfiança e mágoa podem evoluir por assimilação, autocontrole, alívio ou passagem de tempo coerente, mesmo sem novo estímulo externo. Não invente eventos para justificar troca. Não fixe cauda emocional por duração de balão nem por segundos arbitrários. Não saltar para emoção final quando o processo requer etapas.

Exemplos: surpresa → confusão → preocupação ao reconhecer risco; preocupação → alívio → normal se risco se resolve; normal → sorriso breve → normal se a graça passa. Normal → preocupação → normal apenas porque pensamento termina é incorreto. A dúvida pode persistir como desconfiança, ou evoluir para seriedade por decisão de observar com cautela.

Se uma expressão durar cerca de 30 s, dois vídeos materialmente diferentes, ou um personagem mudar muito menos que os demais, reavalie se a permanência é intencional. Não trocar por variedade. Poses não contam como mudanças faciais. Ao longo de TikToks, o conhecimento se acumula: o sexto vídeo com um padrão repetido não precisa repetir o choque inicial; pode aprofundar suspeita, análise ou desconforto.

### 5.3. Relações, personalidade e intensidade

Não fixe pessoas por arquétipo. Um provocador pode perder sorriso diante de gravidade; autoridade pode preocupar-se sem perder postura; hostilidade pode evoluir em proteção gradualmente, sem mudança brusca de lealdade. A mesma situação pode provocar reações diferentes (defensivo suspeita, analítico avalia, provocador ironiza, protetor preocupa-se, territorial com vínculo irrita-se). Use o contexto, não esses exemplos como elenco predefinido.

Curiosidade não é amizade, provocação não é carinho, interesse não é romance. Vídeo futuro romântico não cria amor presente; não use `apaixonada` antes de vínculo/atração efetivamente desenvolvidos. Constrangimento não é afeto. Ciúme exige vínculo ou territorialidade fundamentada e ameaça percebida/sensação de substituição ou orgulho ferido; não é licença automática por romance ou parentesco. Aparição sugerindo morte, separação, traição ou romance não confirma o fato. Sofrimento pode gerar culpa, seriedade, repulsa, indignação, decepção, raiva, tristeza, cautela ou preocupação conforme indivíduo. Humor não cancela dor; negar interesse, manter educação quando ferido ou provocar por insegurança exige contexto. Romance não apaga outros conflitos.

### 5.4. Materialização e independência

| Recurso | Função |
|---|---|
| `expression` | Preset emocional real; persistente até mudança justificada. |
| `gaze` / PT | Direção horizontal absoluta; não emoção, pensamento ou pose. |
| `poseCategory` / `poseSlot` nativo | Categoria / variação corporal específica; ambas persistem até troca intencional. Preservam emoção e olhar; nenhum recurso facial as redefine (§6.5). |
| TALK | Modo facial durante fala: altera essencialmente boca, conserva emoção, sobrancelhas, olhos, marcas, blush, tensão, assimetria e olhar. |
| BLINK | Piscar: fecha pálpebra conforme assets, preserva emoção, boca, sobrancelhas e direção; não gerar beats de piscar. |
| `kind: "thought"` | Pensamento privado; sem TALK/escuta nem virada automática. |

Mudanças desses recursos podem coincidir se cada uma tiver justificativa independente. Nunca trocar a variação corporal para obter outra expressão, nem alterar a expressão para viabilizar uma pose. Reação silenciosa não depende de fala; escolha somente presets reais. Não invente variantes. Uma mudança emocional persistente requer só beat de entrada; transitória também precisa saída motivada. Exemplo ilustrativo: A à esquerda da TV pensa de 10 a 15 s, suspeita aos 10, retorna à frente aos 16, dúvida resolvida aos 22. Ajustes de transição incluídos para emoção:

```json
[
  { "character": "A", "startSeconds": 10.266666667, "expression": "Desconfiada" },
  { "character": "A", "startSeconds": 16, "gaze": "right" },
  { "character": "A", "startSeconds": 22.266666667, "expression": "Aliviada" }
]
```

Sem beat de retorno ao neutro aos 15 s; mudança de olhar não redefine expressão. Se a transição de olhar puder antecipar estímulo, ajuste seu tempo também (§4.3).

## 6. Sala, poses e direção de olhar (PT)

### 6.1. Geometria e pose

Respeite posições autorais; quando delegadas, distribua por relações, hierarquia, proximidade, tensão, frequência de falas e legibilidade. TV e elenco devem deixar espaço para cards e balões. Use x da primeira TV (`videos[0].layout.x`, ou 0); se posição mudar, reavalie alvo em cada trecho. A orientação normal na abertura continua válida mesmo sem vídeo visível.

| Lado da TV | `flipX` normal | Frente natural | PT |
|---|---|---|---|
| Esquerda | `false` | `right` | `left` |
| Direita | `true` | `left` | `right` |

O importador deduz espelhamento pelo lado se omitido; valor explícito é fixo e respeitado. Não use PT para compensar espelhamento incorreto. `gaze` é direção absoluta do palco, convertida para rosto local após flip. Compare x do alvo com x de quem olha: menor → `left`, maior → `right`; se x não distinguir, mantenha direção coerente, sem inventar eixo vertical/terceira direção. Altura, pose em pé/sentada não mudam direção horizontal. Extremos da sala normalmente já olham para todos à frente; quem está entre TV e pessoa do mesmo lado pode precisar virar. Mera presença atrás não exige PT. Em layouts atípicos use geometria real, não a tabela cegamente.

Distribua poses e expressões iniciais individualmente; igualdade permitida quando justificada ou quando não há variações suficientes. Mantenha categoria real de cada pessoa; não misture Em pé/Sentado sem pedido explícito. `autoPoseEverySeconds: 15` tenta uma troca elegível de **um** personagem por marco global, com seed reproduzível, somente variações selecionadas da categoria no Poses Dev (roteiros sem categoria mantêm comportamento legado). Não trocar todo o elenco a cada marco nem usar regra antiga de 7 s. Troca narrativa excepcional usa categoria permitida no beat; a categoria e a variação efetivamente escolhida persistem até nova troca corporal intencional (§6.5). Evite momentos críticos, deslocando o mínimo necessário quando houver controle confirmado; não invente categoria/slot para forçar pose ou alterar expressão/olhar. `0` desliga automático (§2).

### 6.2. PT seletivo e causal

**PT é exclusivamente direção de olhar.** Frente natural é padrão, não reset obrigatório. Só inicie PT quando houver finalidade visual concreta, necessária, causal e geometricamente coerente: contato com alguém atrás, atenção a estímulo atrás, desvio intencional ou direção explícita representável. Não há quota mínima/máxima; não criar PT decorativo nem eliminar funcional só para reduzir beats.

Antes de iniciar, manter ou encerrar cada intervalo, registre internamente direção atual/frontal, alvo (ou contato evitado), finalidade, estímulo percebido e instante, geometria e condição de término. Pergunte:
1. O alvo está realmente atrás, ou a direção oposta evita um contato visual concreto? A direção atual já resolve?
2. O estímulo já ocorreu e foi percebido? Faria sentido sem saber a próxima fala e sem usar o balão/expressão como gatilho? A mudança é necessária ou a expressão basta?
3. A finalidade continua durante o diálogo, pensamento, pausa ou novo estímulo? Quando termina?

**Gatilhos e exceções:**
- Reclamação geral, pergunta retórica, comentário sobre TV/sala, desabafo ou fala ao grupo não implica destinatário individual. Não virar o falante por saber que alguém atrás responderá depois. Preserve a direção vigente se justificada; sem motivo, frente. Um ouvinte que realmente acompanha o falante pode virar se necessário, sem obrigar reciprocidade nem todos os presentes a virar.
- Vocativo, pergunta, réplica, ordem, provocação ou gesto podem indicar destinatário. Inicie somente quando o direcionamento se torna perceptível (inclusive no meio/fim da frase se for o caso), nunca antecipando resposta futura. Relação prévia ou posição atrás não basta.
- Pensar em alguém, mencionar, julgar, lembrar, sentir ciúme/atração/raiva/vergonha não é olhar para essa pessoa. Pensamento pode acompanhar PT já justificado enquanto a finalidade durar; novo PT durante pensamento só com ação visual independente (chamada, alguém encarando, ação descrita, desvio concreto). O texto mental pode confirmar ação real, não apenas citar alguém. Nenhum terceiro reage ao pensamento privado.
- Vergonha, elogio, rubor e hesitação podem exigir apenas expressão. Desvio é seletivo quando há contato a evitar, foi pego encarando alguém ou direção autoral. Não exigir pessoa atrás se a finalidade é afastar o olhar; extremo pode virar para lado vazio por desvio real, nunca fingindo interlocutor. Se contato evitado está atrás, voltar à frente pode ser correto. `Desviando o olhar` como rubrica não autoriza PT em toda ocorrência: olhar para baixo, fechar olhos ou girar corpo não equivalem a `gaze` horizontal; respeite intenção quando suportada e informe limitações quando não.

### 6.3. Continuidade durante a conversa

Unidade de direção é a conversa, não a bolha. Separe início, manutenção e encerramento. Uma vez justificado, PT dura durante escuta, preparação, resposta dirigida ao mesmo alvo e pausas relacionadas, inclusive quando o ouvinte vira falante. Não criar retorno intermediário a cada gap de 0,3–0,5 s. Pausas maiores podem conservar atenção por expectativa/tensão. Interlocutores alternados na mesma direção não exigem novo beat; terceiro falante não desloca automaticamente todos. Em sobreposição, priorize alvo efetivamente acompanhado. Pensamento próprio não encerra nem prolonga PT por sua duração; mudanças de expressão, pose, TALK/BLINK não alteram olhar. Retorne à TV quando troca se resolver, foco mudar, estímulo da tela se tornar relevante ou comentário voltar ao vídeo. Não manter até fala futura distante só por conhecê-la. Corte de vídeo não é reset obrigatório de conversa ainda ativa. Retorno preserva emoção, categoria e variação corporal atuais (§5, §6.5).

### 6.4. Implementação e exemplo

`autoListenerGaze: true` recalcula olhares nas fronteiras de fala, inclusive sobreposição; `gaze` explícito ganha no mesmo quadro, mas fronteiras posteriores podem sobrescrever. Portanto use **`autoListenerGaze: false`** e planeje manualmente todos os integrantes, inclusive silenciosos. Só usar `true` por exceção autoral ou comportamento comprovado que não contrarie continuidade. O automático de poses é independente. Emita `gaze` inicial em 0 apenas se necessário; depois, apenas mudanças reais. Não repita direção/categoria ou troque `flipX` para forçar PT. Consolide com expressão/pose se mudarem no mesmo quadro. Ajuste transições e quadros (§4.3), sem deslocar textos para disfarçar olhar errado.

Exemplo: TV x=0, A x=-42, B x=-20, ambos sem flip. B reclama em geral [0,4), A chama B a partir de 4,3, B responde de 8,3 a 12 s; conversa termina aos 12. B permanece `right` durante reclamação e pausa; vira `left` apenas ao perceber chamada, conserva durante resposta/pausas e volta `right` ao fim. A já olha para B em `right` e não vira. Beats de B, nos instantes narrativos (ajuste transição elegível se necessária):

```json
[
  { "character": "B", "startSeconds": 4.3, "gaze": "left" },
  { "character": "B", "startSeconds": 12, "gaze": "right" }
]
```

Não virar aos 0 s por antecipar A; não retornar/virar nas fronteiras intermediárias. Variações: (a) A e outro interlocutor atrás de B alternam réplicas, B mantém esquerda; (b) espelhado à direita, A x=42, B x=20, flip true, B vira direita e retorna esquerda; (c) B pensa “Que idiota...” sem conversa ativa, não vira; se pensa durante diálogo ativo pode manter PT, retornando antes do fim do balão caso a troca já termine; (d) se alvo atrás elogia B e B quer evitar contato, voltar à frente pode ser o desvio correto; (e) revelação na TV pode encerrar PT antes de nova conversa legítima. Um pensamento de terceiro não interfere na conversa audível. Emoções adquiridas durante PT permanecem ao voltar à frente.

### 6.5. Persistência da pose específica — obrigatória (V15.2)

**A pose pertence ao estado corporal do personagem. Uma vez escolhida, a variação específica permanece até outra troca de pose intencional; não basta manter a categoria Em pé/Sentado.** Fala, pensamento, expressão (inclusive Normal), PT, TALK/BLINK, silêncio, Loading, novo vídeo e início/fim de bloco ou transição não são motivos para redefinir a postura. Uma pose anterior pode voltar por nova instrução corporal legítima, nunca por herança de um snapshot antigo.

- Diferencie categoria (`poseCategory` no react externo), variação selecionada (slot/identidade real da pose) e estado visual completo. No nativo observado, `poseSlot` identifica a variação. Não confunda índices, números da interface, IDs de assets ou mudanças de modo facial com uma troca corporal.
- Mantenha memória corporal interna por personagem: categoria, variação vigente, quadro da última troca, origem (autoral, narrativa planejada ou automática permitida), próxima troca autorizada e recursos necessários. Atualize só na troca; essa tabela não entra no JSON.
- No react externo, omita `poseCategory` em beats exclusivamente faciais/de olhar. Não repita a categoria para "segurar" a pose: pode provocar nova seleção. O automático de 15 s continua sendo uma política de geração permitida quando o autor não a restringe; cada seleção automática efetiva constitui uma troca planejada, não um retorno a cada balão. Se o autor exigir apenas trocas explícitas, use `autoPoseEverySeconds: 0`. Não acrescente um campo de slot em `beats` nem prometa controlar uma variação exata por categoria. Para essa precisão, use o nativo ou o aplicativo com recursos reais.
- No projeto nativo já montado, preserve as trocas materializadas válidas, inclusive as originadas pelo automático autorizado. Não gere novos marcos de 15 s nem reaplique o automático só porque está revisando expressões. A fronteira de um bloco completo não é evidência de intenção corporal: compare a sequência, as instruções do autor e, se disponível, uma versão anterior confiável (§8.3).
- Se uma troca coincide com mudança facial, confirme sua intenção corporal separadamente. Se a pose muda A → B → A, verifique as duas fronteiras: B pode ser uma postura narrativa válida, mas não uma pose emprestada temporariamente para mostrar uma expressão. Retornos válidos são preservados; não elimine variedade por contagem ou duração fixa.

Exemplo de planejamento (slots ilustrativos, não um contrato JSON):

| Tempo | Evento | Pose vigente |
|---|---|---|
| 0 s | Pose inicial 1 | 1 |
| 5 s | Troca intencional para pose 3 | 3 |
| 8 s | Surpresa | 3 |
| 12 s | Pensamento e mudança de expressão | 3 |
| 15 s | Fim de pensamento, volta ao Normal | 3 |
| 18 s | Mudança de olhar | 3 |
| 20 s | Troca intencional para pose 5 | 5 |

Neste exemplo o automático não está autorizado. A pose 3 permanece em todos os estados entre 5 e 20 s, inclusive se forem necessários vários blocos nativos. A pose 5 passa a persistir aos 20 s. Nenhuma expressão, olhar ou geometria deve ser sacrificada para obter essa sequência; se faltar uma combinação de assets, aplique §8.3.

## 7. Dicionário facial — 21 categorias

Referência criativa de anatomia, não catálogo de IDs/aliases nem instrução para fabricar sprites. Use nome/ID exato do preset disponível no modelo, incluindo acentos/barras. BASE tem boca fechada; TALK conserva construção facial com boca adequada. BLINK e PT obedecem §5–6. Escolha pelo estado interno e pela anatomia (sobrancelhas, olhos, boca, tensão, blush, sombra e marcas), menor intensidade suficiente. Não confundir choque/admiração, confusão/julgamento, preocupação antecipatória/dor consumada, vergonha/afeto, cansaço/impaciência ou sério/irritado/indignado. Uma sobrancelha elevada, olho estreito e boca torta de julgamento indicam desconfiança, não necessariamente confusão. Use `seria` → `irritada` → `indignada` como escala, não sinônimos.

### 7.1. `normal` — NEUTRAL / OBSERVING

**Objetivo:** estado padrão atento, calmo e analítico. Não deve parecer feliz, triste, bravo ou cansado. **Sobrancelhas:** relaxadas, próximas da altura natural, praticamente simétricas; sem arqueamento dramático e sem compressão central. **Olhos:** atentos, porém levemente relaxados. Pálpebras superiores discretamente mais baixas que um olhar totalmente alerta. **Boca:** fechada, relativamente larga, limpa e quase reta. Pode ter uma curva relaxada mínima, mas não chega a sorrir. Cantos equilibrados. **Tensão:** muito baixa. **Marcas/efeitos:** mínimas; sem blush e sem degradê escuro.

**Atuação:** personagem está escutando, observando ou pensando normalmente. Deve ser o ponto zero para comparar as outras expressões. **TALK:** abertura baixa, calma e quase simétrica.

**Critério de uso:** Não usar neutro para esconder reação que deveria existir.

### 7.2. `sorrindo de canto` — SIDE SMIRK

**Objetivo:** satisfação discreta, charme, provocação leve ou sensação de “eu sei de alguma coisa”. Não é malicioso. **Sobrancelhas:** confiantes e relaxadas; pode haver pequena assimetria, mas sem o arco agressivo do sorriso malicioso. **Olhos:** confiantes, relaxados e conscientes da outra pessoa; podem ficar ligeiramente mais estreitos que Neutral. **Boca:** fechada e lateralmente assimétrica. Um canto sobe de forma claramente visível, o outro permanece mais plano. Curva elegante. **Tensão:** baixa a média. **Marcas/efeitos:** pequenos sinais no canto da boca ou dos olhos; sem blush e normalmente sem sombra escura.

**Atuação:** provocação gentil, charme, pequena vitória, resposta irônica leve. **TALK:** abertura assimétrica mantendo o canto mais alto.

**Critério de uso:** Não usar como ameaça, malícia forte ou amor; charme, ironia e pequena vitória não implicam afeto.

### 7.3. `surpresa` — SURPRISE / SHOCK

**Objetivo:** reação imediata e forte a algo inesperado. **Sobrancelhas:** ambas claramente levantadas; arco alto, relativamente simétrico. **Olhos:** mais abertos que Neutral. A abertura vem principalmente da elevação da pálpebra superior. Deve ser uma das maiores aberturas do conjunto, mas sem deformar os olhos. **Boca:** continua fechada no BASE; relativamente larga, comprimida e tensa. Deve parecer que a pessoa travou por um instante. **Tensão:** alta e instantânea. **Marcas/efeitos:** pequenas marcas de reação ao redor dos olhos/bochechas; sombra emocional superior leve opcional; sem blush por padrão.

**Atuação:** “O quê?!”, descoberta repentina, susto, informação inesperada. **TALK:** abertura reativa pequena, maior que Neutral, mas nunca um grito enorme.

**Critério de uso:** Impacto repentino; após assimilação, evoluir conforme interpretação (confusão, suspeita, admiração, preocupação ou irritação), sem reset obrigatório.

### 7.4. `envergonhada` — EMBARRASSED / AWKWARD

**Objetivo:** constrangimento social, nervosismo, desconforto e dificuldade de reagir. **Sobrancelhas:** nervosas, com leve irregularidade; menos firmes e mais inseguras. **Olhos:** desconfortáveis; pálpebras levemente comprimidas. A expressão deve parecer retraída. **Boca:** fechada, largura média; comprimida, hesitante, irregular e até levemente trêmula. **Tensão:** média, nervosa. **Marcas/efeitos:** **blush claramente visível**, pequenas marcas de estresse; gota de suor pequena opcional. Sem degradê preto por padrão.

**Atuação:** personagem foi pego de surpresa socialmente, ficou sem graça, está tentando responder enquanto sente vergonha. **TALK:** pequena abertura hesitante mantendo a irregularidade.

**Critério de uso:** Romance em tela não basta: verificar vínculo e constrangimento real; blush não implica PT (§6).

### 7.5. `impressionada` — IMPRESSED

**Objetivo:** admiração, impacto positivo ou “uau” controlado. Menos intenso que Shock. **Sobrancelhas:** um pouco levantadas, de maneira controlada. **Olhos:** mais atentos e ligeiramente mais abertos que Neutral, porém claramente menos abertos que Surprise. **Boca:** fechada, relativamente larga, firme; pode ter compressão ou uma curva sutil de admiração. Não deve virar um grande sorriso. **Tensão:** média-baixa, positiva. **Marcas/efeitos:** pequenas marcas de impacto; brilho ocular discreto opcional; sem blush e sem degradê escuro por padrão.

**Atuação:** algo é surpreendentemente bom, competente, bonito ou impressionante. **TALK:** abertura compacta e controlada.

**Critério de uso:** Exige admiração positiva; não substituir choque.

### 7.6. `indignada` — INDIGNANT / ANGRY

**Objetivo:** raiva forte, indignação e confronto. Deve ser muito mais intenso que Serious ou Irritated. **Sobrancelhas:** fortemente abaixadas e inclinadas para dentro; lados internos descem/convergem na direção do centro do rosto. **Olhos:** afiados, tensos e agressivos; pálpebras superiores pressionam o olhar. **Boca:** fechada e larga; muito comprimida, dura, agressiva e achatada. Pode possuir ângulo descendente forte. **Tensão:** muito alta. **Marcas/efeitos:** marcas fortes de testa e sobrancelhas, linhas de tensão facial; símbolo de veia de raiva opcional. **Degradê escuro mais forte do conjunto**, concentrado na metade superior do rosto e enfraquecendo para baixo.

**Atuação:** verdadeira raiva, discussão séria, ofensa, ameaça ou situação intolerável. **TALK:** abertura curta, tensa, cortante, com cantos duros.

**Critério de uso:** Reservar para confronto ou raiva forte, não irritação genérica.

### 7.7. `desconfiada` — SUSPICIOUS / JUDGING

**Objetivo:** ceticismo, julgamento, descrença: “não acredito nisso”. **Sobrancelhas:** assimetria forte; **uma fica claramente mais alta que a outra**. **Olhos:** também assimétricos, com aparência julgadora; uma pálpebra pode pressionar mais que a outra. **Boca:** fechada, larga, torta/lateral. Um lado é puxado mais que o outro. **Tensão:** média. **Marcas/efeitos:** marcas limpas de julgamento; degradê superior moderado, claramente abaixo da intensidade de Angry. Sem blush.

**Atuação:** questionar a honestidade de alguém, achar algo suspeito, considerar uma explicação absurda. **TALK:** abertura lateral e cética, mantendo a boca torta.

**Critério de uso:** Dúvida, julgamento, intenção oculta ou descrença, não busca genuína de entendimento.

### 7.8. `sorriso maligno` — EVIL SIDE SMIRK

**Objetivo:** provocação sombria, calculista e deliberadamente maliciosa. **Sobrancelhas:** uma fica bastante arqueada e afiada; a outra mais baixa e firme. Assimetria maior que Side Smirk. **Olhos:** baixos, calculistas e levemente estreitados. **Boca:** fechada, larga, diagonal e fortemente assimétrica. Um canto fica muito mais alto. Curva afiada e maliciosa. **Tensão:** média, controlada. **Marcas/efeitos:** marcas discretas de malícia perto do olho/boca; sombra ominosa superior leve opcional; sem blush.

**Atuação:** personagem tem vantagem, pretende provocar, sabe algo perigoso ou está prestes a fazer algo questionável. **TALK:** abertura baixa e assimétrica mantendo o canto malicioso.

**Critério de uso:** Uso raro: malícia deliberada, vantagem ou conhecimento assimétrico, provocação mais agressiva que o sorriso de canto.

### 7.9. `nojo` — DISGUST / REPULSION

**Objetivo:** rejeição física/emocional clara. Não deve parecer apenas bravo. **Sobrancelhas:** contraídas e puxadas para baixo. **Olhos:** estreitados; uma pálpebra pode fechar mais que a outra. **Nariz:** levemente enrugado/tensionado — elemento importante dessa expressão. **Boca:** fechada, larga, retraída, irregular. Centro comprimido; um canto pode puxar para trás/cima enquanto o outro permanece rígido. **Tensão:** alta na região central do rosto. **Marcas/efeitos:** marcas no nariz e boca; sombra emocional moderada principalmente na metade superior, olhos e nariz. Sem blush.

**Atuação:** algo cheira mal, é repulsivo, moralmente nojento ou fisicamente desagradável. **TALK:** abertura compacta mantendo a retração dos cantos.

**Critério de uso:** Exige repulsa verdadeira, não raiva ou desaprovação genérica.

### 7.10. `orgulhosa` — PROUD / SMUG

**Objetivo:** autoconfiança, satisfação consigo mesmo, sensação de superioridade controlada. **Sobrancelhas:** arqueadas com confiança; mais equilibradas que Evil Smirk. **Olhos:** seguros; pálpebras superiores levemente abaixadas numa atitude relaxada e dominante. **Boca:** sorriso fechado, largo, limpo e quase simétrico. Ambos os cantos sobem discretamente. **Tensão:** baixa, controlada. **Marcas/efeitos:** pequenas marcas nos cantos da boca; sem blush e sem degradê escuro.

**Atuação:** “eu sabia”, “óbvio que consegui”, confiança elevada sem necessariamente ser hostil. **TALK:** abertura equilibrada e confiante, cantos levemente elevados.

**Critério de uso:** Autoconfiança/superioridade controlada, não provocação lateral.

### 7.11. `cansada` — TIRED / EXHAUSTED

**Objetivo:** exaustão real, falta de energia. Não tristeza. **Sobrancelhas:** soltas, fracas, sem energia muscular. **Olhos:** quase fechados; pálpebras superiores muito pesadas e baixas. **Boca:** fechada, relativamente larga, macia e caída; centro e cantos ligeiramente para baixo. Não muito comprimida. **Tensão:** muito baixa; peso facial alto. **Marcas/efeitos:** marcas visíveis abaixo dos olhos e sombreado delicado de fadiga; sem degradê preto geral.

**Atuação:** privação de sono, esforço prolongado, personagem sem energia para reagir. **TALK:** abertura fraca e baixa, cantos ainda caídos.

**Critério de uso:** Exige exaustão física/mental real; “cansado dessa conversa” pode ser irritação ou decepção.

### 7.12. `animada` — EXCITED / ENTHUSIASTIC

**Objetivo:** energia positiva forte. Não é Surprise. **Sobrancelhas:** abertas e otimistas. **Olhos:** vivos e brilhantes; pálpebras superiores um pouco levantadas, mas sem a abertura extrema de Shock. **Bochechas:** levemente erguidas pela energia do sorriso. **Boca:** **o sorriso fechado mais largo das 21 expressões originais do conjunto**; ambos os cantos claramente elevados, arco positivo forte. **Tensão:** positiva, alta. **Marcas/efeitos:** brilho ocular opcional; blush positivo muito leve opcional; sem degradê preto.

**Atuação:** entusiasmo genuíno, notícia boa, expectativa positiva, empolgação. **TALK:** abertura mais animada e larga, mas ainda controlada.

**Critério de uso:** Entusiasmo positivo real, não apenas energia elevada.

### 7.13. `ciumenta` — JEALOUS

**Objetivo:** ressentimento contido, ciúme e incômodo emocional. Não é raiva aberta. **Sobrancelhas:** puxadas discretamente para dentro, com pequena contração central. **Olhos:** intensos; pálpebras baixas e tensas. **Boca:** fechada, larga e moderadamente comprimida; um lado fica mais preso/puxado que o outro. **Tensão:** média-alta, reprimida. **Marcas/efeitos:** marcas de tensão; blush muito leve opcional; degradê emocional superior moderado, abaixo de Angry.

**Atuação:** personagem tenta esconder que algo afetou seu orgulho ou vínculo afetivo. **TALK:** abertura baixa e contida, mantendo tensão unilateral.

**Critério de uso:** Exige vínculo/territorialidade sustentados; pode ser romântico, fraternal ou orgulho ferido, não ciúme precoce automático.

### 7.14. `aliviada` — RELIEVED

**Objetivo:** liberação de tensão, “ufa”. Não é Excited. **Sobrancelhas:** completamente relaxadas. **Olhos:** semi-fechados ou suavemente relaxados; parecem soltos, não pesados como Tired. **Boca:** sorriso fechado raso, largo e suave; cantos sobem pouco. **Tensão:** muito baixa. **Marcas/efeitos:** pequena gota de suor ou brilho ocular opcionais; sem blush e sem degradê escuro.

**Atuação:** perigo passou, resposta desejada chegou, personagem finalmente relaxa. **TALK:** abertura baixa e suave mantendo leve sorriso.

**Critério de uso:** Somente depois de tensão efetivamente resolvida.

### 7.15. `seria` — SERIOUS

**Objetivo:** foco, gravidade e tensão controlada **sem raiva**. Serve para frases importantes, decisões, explicações e problemas reais. **Sobrancelhas:** ambas discretamente abaixo do Neutral; praticamente simétricas; lados internos podem apontar um pouco para dentro/baixo, mas com ângulo raso. **Olhos:** atentos, focados e moderadamente estreitos; pálpebra superior mais firme. **Boca:** fechada, média-larga, reta e firme. Pouquíssima curva; cantos neutros ou só minimamente endurecidos para baixo. **Tensão:** baixa-média e estável. **Marcas/efeitos:** marcas controladas mínimas; sem blush e normalmente sem degradê. Sombra de tensão muito leve apenas se necessário.

**Atuação:** “Agora temos um problema”, “Ela precisa comer”, conversa séria sem hostilidade. **TALK:** abertura horizontal, compacta e firme.

**Critério de uso:** Foco analítico, decisão, autoridade contida ou gravidade sem raiva.

### 7.16. `preocupada` — WORRIED

**Objetivo:** **ansiedade alerta/protetora**. A pessoa acredita no perigo e está preocupada com o que pode acontecer. É deliberadamente muito diferente de Sad/Hurt. **Assinatura:** **sobrancelhas altas + olhos abertos/alertas + boca pequena e apertada + gota de suor**. **Sobrancelhas:** ambas claramente altas; extremidades internas fortemente levantadas; arco de preocupação alto; ligeiramente puxadas uma em direção à outra. **Olhos:** claramente mais abertos e alertas que Sad/Hurt. Pálpebras superiores levantadas; nada de olhar pesado ou lacrimejante. **Boca:** fechada, **menor e mais apertada** que Sad. Formato horizontal tenso; centro pinçado; cantos puxados para dentro/lateralmente, e não para baixo. **Tensão:** alta, nervosa, antecipatória. **Marcas/efeitos:** **uma pequena gota de suor obrigatória**; marcas de ansiedade nas sobrancelhas/área externa dos olhos; sem lágrimas. Degradê superior de preocupação **leve a moderado**.

**Atuação:** medo pelo bem-estar de alguém, perceber que existe risco, esperar uma consequência ruim. A mente ainda está ativa procurando solução. **TALK:** abertura pequena e horizontalmente tensa; não usar cantos tristes para baixo.

**Critério de uso:** Risco antecipado e busca de solução, não dor já consumada.

### 7.17. `triste magoada` — SAD / HURT

**Objetivo:** dor emocional, vulnerabilidade e sofrimento. Deve ser o oposto visual de Worried: não alerta, mas **machucado e pesado**. **Assinatura:** **sobrancelhas de dor + olhos pesados + boca claramente caída + olhos úmidos**. **Sobrancelhas:** extremidades internas levantadas num arco doloroso; juntas no centro, porém o conjunto fica mais baixo que Worried. **Olhos:** pálpebras superiores claramente mais baixas/pesadas; abertura menor que Worried; olhar vulnerável, abatido. **Boca:** fechada, média-larga e **claramente curvada para baixo**. Ambos os cantos descem de forma perceptível; pequena instabilidade/tremor permitido. **Tensão:** emocional, para dentro. **Marcas/efeitos:** **brilho aquoso nos olhos obrigatório**, marcas emocionais suaves abaixo dos olhos obrigatórias; sem gota de suor; sem blush. Degradê emocional superior **moderado**.

**Atuação:** lembrança dolorosa, abandono, rejeição, insegurança profunda, personagem emocionalmente ferido. **TALK:** abertura triste mais larga e baixa; ambos os cantos continuam visivelmente caídos.

**Critério de uso:** Dor, rejeição, abandono ou vulnerabilidade real; não ansiedade antecipatória.

### 7.18. `irritada` — IRRITATED

**Objetivo:** impaciência e irritação clara, porém abaixo de Angry. “Você está me irritando.” **Sobrancelhas:** moderadamente abaixadas; extremidades internas apontam para dentro. Tensão visível, mas muito menor que Angry. **Olhos:** moderadamente estreitos, tensos e pouco impressionados. Mais afiados que Serious. **Boca:** fechada, média-larga; achatada e comprimida. Pode possuir leve diagonal ou puxão lateral. Mais dura que Serious, mas menos extrema que Angry. **Tensão:** média-alta. **Marcas/efeitos:** marcas de tensão em testa/têmpora; pequena marca de irritação permitida. Sem blush. **Degradê superior moderado**, claramente abaixo de Angry.

**Atuação:** paciência acabando, alguém disse algo irritante, personagem quer encerrar a discussão sem estar furioso. **TALK:** abertura curta, comprimida e cortante.

**Critério de uso:** Impaciência, resposta seca, provocação recebida ou desacordo moderado, não fúria.

### 7.19. `confusa` — CONFUSED

**Objetivo:** processar informação estranha, “hã?”, “como assim?”. Não é suspeita nem choque. **Assinatura:** **assimetria questionadora**. **Sobrancelhas:** assimétricas; uma visivelmente mais alta, a outra neutra ou discretamente baixa. A assimetria é curiosa, não julgadora. **Olhos:** atentos/procurando resposta; um pode estar ligeiramente mais aberto que o outro. **Boca:** fechada, pequena-média, **torta e questionadora**. Um canto claramente diferente do outro; centro pode ficar pinçado. **Tensão:** baixa-média, cognitiva. **Marcas/efeitos:** pequenas marcas de dúvida; símbolo de interrogação/uncertainty permitido. Sem blush e sem degradê escuro por padrão.

**Atuação:** personagem ainda está tentando entender; informação não encaixa; reação curta antes de perguntar algo. **TALK:** abertura pequena, questionadora e assimétrica.

**Critério de uso:** Informação ainda não encaixou; busca resposta, não descrença julgadora.

### 7.20. `decepcionada` — DISAPPOINTED

**Objetivo:** frustração resignada: “eu esperava mais”, “sério isso?”. Diferente de Confused porque **já entendeu** o que aconteceu; apenas desaprovou. **Assinatura:** **simetria resignada + queda suave**, em oposição à assimetria curiosa de Confused. **Sobrancelhas:** discretamente baixas; extremidades externas achatadas/caídas; tensão resignada e relativamente simétrica. **Olhos:** pálpebras superiores moderadamente baixas; olhar cansado da situação, mas não fisicamente exausto. Olhos mais equilibrados/simétricos que Confused. **Boca:** fechada, média-larga; **curva rasa para baixo**, ambos os cantos discretamente caídos. Muito mais uniforme que Confused e menos profunda que Sad/Hurt. **Tensão:** baixa-média, resignada. **Marcas/efeitos:** marcas discretas de desânimo; sem blush. Degradê emocional superior **leve a moderado**, mais quieto que Sad/Hurt.

**Atuação:** alguém tomou uma decisão ruim; comportamento ficou abaixo das expectativas; personagem desaprova sem explodir. **TALK:** abertura baixa e resignada, mantendo queda rasa e relativamente simétrica.

**Critério de uso:** Já compreendeu e desaprovou; não confusão nem exaustão real.

### 7.21. `apaixonada` — LOVE-STRUCK / LOVING GAZE

**Objetivo:** carinho, atração e ternura evidentes. **Não é vergonha.** Deve servir como estado romântico estável depois de Embarrassed. **Sobrancelhas:** suavemente levantadas, arco gentil e relaxado; pouquíssima tensão. **Olhos:** suaves, atentos e calorosos; pálpebras superiores relaxadas/levemente baixas; brilho ocular discreto permitido. **Boca:** fechada, média-larga, sorriso afetivo suave. Ambos os cantos sobem gentilmente; curva relaxada, podendo ter assimetria natural mínima. Não deve parecer Side Smirk. **Tensão:** quase nenhuma; sensação de segurança e afeto. **Marcas/efeitos:** pouquíssimas marcas. **Blush apenas opcional e MUITO leve**, localizado principalmente nas bochechas e obrigatoriamente muito mais fraco que Embarrassed. Sem degradê preto. Brilho ocular sutil recomendado.

**Atuação:** olhar para alguém com carinho, admiração romântica, proximidade emocional, ternura silenciosa. Pode ser usado depois de uma fase de vergonha para mostrar que o constrangimento passou e ficou apenas o afeto. **TALK:** abertura suave e afetuosa mantendo cantos gentilmente elevados.

**Critério de uso:** Carinho, ternura ou atração efetivos e vínculo romântico estabelecido/desenvolvido; não mero blush ou romance futuro em tela.

## 8. Edição de projetos nativos existentes

**Não é o react externo.** Identifique pelo conteúdo, não nome. Em um projeto observado, raiz contém `schemaVersion`, `elements`, `assets`, `media`, `timeline` (`fps`, `durationFrames`, `tracks`, `knownElementIds`); faixas de personagem possuem blocos `startFrame`, `durationFrames`, `state`. São campos observados, não schema universal. Leia a estrutura e FPS concretos; não aplique cegamente nomes externos (`presentation.cards`, `englishText`, `beats`) ao formato interno. A V15.0 documenta contrato externo dos cards, não todos os campos internos de todas as versões.

### 8.1. Diagnóstico e mudança mínima

1. Trabalhe em cópia. Preserve formato/versão, IDs, recursos, mídia, Intro, cards, configurações, metadados, posições, escalas, ordem, textos, tempos e edições manuais fora do escopo. Compare com guia/roteiro e inventário mais recentes.
2. Inventarie faixas, elementos, estados e referências. Simule pose específica, expressão efetiva e olhar, não só asset ou ID; diferencie mudanças corporais, faciais, de direção e de modo. Reconstrua as trocas intencionais a partir da fonte mais confiável disponível (§8.3), auditando toda a sequência, especialmente bordas de balões e A → B → A (§9).
3. Corrija estado com conjunto facial completo compatível do mesmo personagem, expressão, modelo, revisão, pose e direção. Verifique, quando existentes, `activeExpressionPresetId`, `faceAppearance`, `expressionBase`, `faceTransforms`, `activeExpressionEffects`, `activeExpressionGaze`, `assetId`, `faceModeAssetIds`, `activeFaceMode`, revisões e snapshots. Alterar apenas ID pode deixar aparência/render inconsistentes. Não copiar estado inteiro indiscriminadamente: conserve posição, escala, pose, espelhamento, olhar e outros atributos válidos do destino. Não usar assets de outro personagem ou inventar variantes. Se combinação compatível não estiver confirmada, aplique o bloqueio de §8.3: não troque a pose para obter uma face nem a face para obter uma pose.
4. Consolide blocos adjacentes apenas se equivalentes em todos os atributos relevantes e sem apagar fronteira intencional, transição ou referência. Preserve cobertura e duração das faixas; confira elementos-base e snapshots dependentes.
5. Cards bilíngues: examine estrutura nativa real e vinculação ao vídeo; preserve tempos, habilitação e posições. Use componentes nativos independentes quando confirmados; se versão não os documentar nem apresentar exemplo, solicite projeto de referência ou informe limitação, não invente campos. Não substituir rótulo original sem autorização.

### 8.2. Conteúdo e timing

Revisão facial não autoriza reescrever texto, excluir cenas ou encurtar projeto. Se exclusão for pedida, localize texto exato e réplicas dependentes; limite ao escopo autorizado, comunique decisões. Preserve lacuna ou feche conforme intenção e estrutura. Se fechar ou deslocar por correção temporal autorizada, ajuste em frames todas as faixas afetadas: vídeo, balões, cards vinculados, áudio, estados, caudas e Loading; preserve `mediaInFrame` e referências de mídia salvo mudança de corte. Não apague elemento/asset referenciado; não invente fala para preencher lacuna.

Reabra cópia gerada: parse, tipos, UUIDs por categoria (§8.4), referências, faixas ordenadas, duração positiva, cobertura e limites, sem novas lacunas/colisões indevidas. Compare programaticamente conteúdo e atributos não alterados; registre mudanças, duração e limitações. Confirme render, interpolação, TALK/BLINK, PT, poses e cards no aplicativo se acessível. Não declarar importação ou MP4 testados se não ocorreu.

### 8.3. Revisão de pose, face e snapshots

1. **Reconstruir intenção:** ordene todos os estados de personagem por frame, desde o primeiro estado efetivo do conteúdo principal até o final; trate Intro separadamente. Liste a pose vigente em cada intervalo, incluindo trocas com a mesma categoria. Compare com ordens autorais, montagem anterior confiável, estados-base, tempos de pose, expressão e PT. Marque a origem de cada troca e os casos ambíguos. Uma versão anterior é evidência, não autorização para desfazer edições posteriores; um padrão A → B → A ou coincidência com fala não prova erro sozinho.
2. **Separar os atributos:** monte a sequência de poses desejada e a sequência independente de expressões/direções que devem ser preservadas. Para cada estado completo, derive a combinação desejada: personagem/modelo e revisões de origem compatíveis + pose específica + preset/face efetiva + direção (local no nativo, respeitando `flipX`) + modo facial. Preserve tempos, identidade do elemento, visibilidade, transformações, escala, ordem e demais decisões fora do escopo.
3. **Inventariar combinações reais:** verifique se existe um snapshot completo para essa combinação no projeto ou se foi gerado e confirmado pelo Editor V6. Confira `poseSlot`, `poseSourceRevision`, `assetId`, `faceModeAssetIds`, `activeFaceMode`, `faceAppearance`, `expressionBase`, `faceTransforms`, `activeExpressionPresetId`, `activeExpressionEffects`, `activeExpressionGaze` e revisões relacionadas, quando presentes. Modos idle, TALK, BLINK e TALK+BLINK disponíveis devem corresponder à mesma pose, face e direção; respeite recursos efetivamente suportados pelo modelo. Um UUID existente não comprova compatibilidade visual. Não reutilize imagem, geometria ou modo de outra pose/personagem por conveniência. Preserve o alinhamento corporal autoral e ajuste geometria dependente de pose apenas quando necessário e respaldado por estado compatível.
4. **Aplicar correção mínima:** propagando a pose vigente até a próxima troca intencional, substitua somente o conjunto de campos dependentes da combinação; nunca copie indiscriminadamente um estado completo nem altere só `poseSlot` ou o ID da expressão. Use um snapshot compatível em cada bloco. Não redefina a pose nas fronteiras de balões ou de mudanças de expressão. Se for preciso dividir bloco, preserve a cobertura em frames, transições válidas e referências, com novos IDs conforme §8.4. Se consolidar estados equivalentes, confira vínculos antes de excluir IDs. Atualize elementos-base ou snapshots dependentes somente quando realmente precisarem acompanhar o estado corrigido; não aplique mudanças do conteúdo principal à Intro por padrão.
5. **Bloqueio por recurso ausente:** se falta a combinação desejada (por exemplo, pose 3 + Normal), não use pose 1 + Normal e não mantenha asset de pose 1 alterando apenas o slot para 3. Não substitua a emoção para mascarar a falta. Gere a combinação no aplicativo, com variantes necessárias, ou solicite um projeto/inventário atualizado que a contenha. Sem esses recursos, preserve os estados não reparáveis na cópia, liste personagem, frame/intervalo, pose, expressão, olhar e modo ausentes, e comunique a correção pendente. Uma reorganização alternativa de poses só pode ser feita com autorização explícita, distinguindo-a da restauração original. **Não declarar correção integral enquanto houver retorno indevido ou snapshot incompatível pendente.**
6. **Conferir:** simule novamente todos os estados, compare sequência de pose antes/depois com a intenção documentada e confirme expressão, olhar e conteúdo fora do escopo intactos. Verifique que todo estado novo tem referências válidas e combinação comprovada. A revisão estrutural não substitui prévia/renderização; transições interpoladas e o conteúdo dos arquivos físicos exigem teste no aplicativo.

### 8.4. UUIDs por categoria e referências

A regra de identificação V15.2 distingue entidades persistentes do projeto e blocos da timeline. Aplique conforme a categoria semântica da referência, não pelo nome genérico de uma chave `id`.

| Entidade / referência | Versões permitidas |
|---|---|
| ID do projeto | UUID v4 |
| IDs de elementos (incluindo identidade do elemento nos snapshots), assets, mídias e faixas | UUID v4 |
| IDs de blocos da timeline e referências a esses blocos | UUID v4 ou v5 |
| Referências da timeline a elementos, assets, mídias e faixas (p. ex. `elementId`, `assetId`, `mediaId`, `trackId`, `knownElementIds`) | UUID v4, igual ao ID da entidade-alvo |

A permissão de v5 em blocos/referências de blocos não torna válido um ID v5 de asset, elemento, mídia, faixa ou projeto. UUID v4 e v5 válidos têm formato hexadecimal 8-4-4-4-12, nibble de versão 4 ou 5 conforme tabela e variante RFC (primeiro nibble do quarto grupo: 8, 9, a ou b). Valide com parser de UUID, versão e variante, não apenas comprimento ou aparência. Preserve UUIDs válidos e a grafia das referências. Para novas entidades persistentes use UUID v4; para novos blocos use v4 como escolha simples, ou v5 determinístico se o mecanismo real o exigir e o namespace/chave forem conhecidos. Nunca gere novo ID para fingir existência de recurso.

- Inventarie definições por categoria, verifique unicidade no escopo correto e construa índices de resolução. A repetição legítima de uma referência ou do ID de elemento em snapshots do mesmo elemento não é duplicação de definição. Verifique o destino correto, não somente se uma string UUID existe em algum lugar do arquivo.
- Valide todas as referências internas, inclusive assets de modos faciais, elementos-base, blocos vinculados, faixas, mídia, cards, Intro, balões anexados e listas de IDs conhecidos, quando presentes. Campos opcionais nulos/ausentes aceitos pelo schema não são IDs inválidos. Referências externas de biblioteca, personagens, presets, catálogos e recursos físicos devem conservar os identificadores reais; verifique-as com inventário/aplicativo quando disponível, sem inventar correspondência. Não transforme nomes únicos permitidos pelo react externo em UUIDs fictícios.
- Não regenere IDs válidos em massa. Se um ID interno estiver inválido e a substituição for segura, crie mapeamento inequívoco antigo → novo por categoria e atualize todas as referências dependentes (inclusive chaves de mapas e índices documentados), verificando colisões, vínculos e resolução antes/depois. Se a entidade estiver vinculada a arquivos físicos, diretório do projeto, biblioteca ou cache externo, confirme também a migração desses vínculos no aplicativo; mudar só o JSON pode quebrar o carregamento. Se não puder garantir isso, informe o bloqueio e não rebatize arbitrariamente.
- Registre contagens por categoria/versão e referências sem resolução. IDs válidos não provam a existência física do asset nem garantem a renderização. Bloqueie entrega como validada quando houver versão proibida ou referência interna quebrada; só entregue revisão parcial claramente identificada se faltar recurso indispensável.

## 9. Fluxo único de produção e auditoria obrigatória

### 9.1. Ordem de execução

1. **Ler e extrair:** separe fontes/inventário/rubricas; extraia todos os textos com falante, tipo, tradução e ordem; confirme recursos atuais (§1). Determine formato de saída.
2. **Planejar sala e conteúdo:** elenco, posturas, posições, espelhamento e emoções iniciais; ordem dos clipes, abertura, Intro, cards, tempos de leitura, `scene_end`, caudas, Loading. Resolva todos os relógios e frames antes dos beats (§2–4).
3. **Dirigir:** tabela interna cronológica de acontecimentos (tempo relativo, absoluto, frame, causa e conhecimento). Avalie todos os presentes em cada impacto; mantenha registros emocionais, corporais e de atenção por pessoa. Planeje pico/processamento, falantes/ouvintes/silenciosos, PT por conversa, poses e transições (§5–7).
4. **Materializar:** emita somente campos do contrato e mudanças reais, consolidadas por pessoa/frame. Para nativo, alteração mínima conforme §8. Nenhuma tabela interna entra no JSON.
5. **Auditar e corrigir:** execute §9.2–9.4; reprocessar estados e tempos após cada edição. Não pule por reutilizar um arquivo anterior. Se houver PT injustificado, reset emocional, retorno indevido de pose, snapshot incompatível, UUID/referência inválidos ou Loading incorreto, bloqueie a entrega como integralmente corrigida até correção e nova auditoria. Se recurso necessário não estiver disponível/verificável, registre os casos pendentes e entregue apenas correção parcial segura identificada como tal, conforme §8.3–8.4; não simule sucesso.
6. **Entregar:** arquivo válido; auditoria detalhada separada quando solicitada, ressalvas pertinentes sempre comunicadas. Não alegue testes que não executou.

### 9.2. Auditoria de conteúdo, narrativa e tempo

- [ ] Compare literalmente todas as linhas com a fonte, preferencialmente por programa: quantidade, ordem, falante, tipo, texto, traduções fornecidas e mudanças expressamente autorizadas. Nada de notas convertidas em fala.
- [ ] Por clipe: ID/duração/ordem reais, descrição/contexto lidos, tempos concretos e marcadores reconciliados (zero/ausência não automáticos), pico/processamento e beats causais. Avaliação de todos, inclusive preservações. Primeiro comentário no `scene_end` válido ou exceção expressa.
- [ ] Por linha: intenção e expressão do falante/pensador, alvo real ou geral, ouvintes/silenciosos avaliados, chegada da informação e privacidade de pensamento; leitura bilíngue pela maior contagem, piso/fórmula, +0,4 s no pensamento, gaps e sobreposições.
- [ ] Por pessoa: ID/modelo/preset, categoria, pose específica e orientação iniciais, personalidade/relações/fase. Contabilize picos coletivos avaliados, mudanças individuais de expressão, expressões distintas, olhares reais, maior intervalo sem mudança facial, clipes sem reação individual. Revise permanências de ~30 s, dois clipes diferentes ou assimetrias de atuação. Não impor variedade nem confundir pose com expressão.
- [ ] Dicionário aplicado: anatomia, menor intensidade, surpresa não prolongada sem causa, preocupação ≠ tristeza, vergonha ≠ paixão, confusão ≠ desconfiança, cansaço real, sério ≠ irritado ≠ indignado, malícia rara, ciúme fundamentado; nenhuma antecipação de sentimento/conhecimento.
- [ ] Frames, relógios e transições: duração real cobre caudas; sem conflitos por pessoa/frame; 8 quadros recomendados ou estados curtos justificados; mudanças só após gatilho (considerar transição de até 250 ms). Revalidar downstream quando mudar qualquer timing.

### 9.3. Auditoria de estados persistentes — obrigatória

Simule cronologicamente cada atributo desde `cast` até fim do conteúdo principal, ou estados completos nativos no intervalo ativo de cada personagem (Intro separada). Cubra esse intervalo sem lacunas indevidas; compare antes/durante/depois de balões, mudanças de pose/direção, pausas, clipes e GIF. Não tomar a contagem de beats como prova de cobertura.

**Emoção:**
- [ ] Identifique todas as sequências A → B → A de expressões distintas, ignorando blocos intermediários que só mudam pose/olhar; examine também A → B → C quando C não tem causa. Cada entrada/saída tem estímulo ou processamento plausível, independente da duração do texto. Coincidência com fronteira não é prova automática de erro.
- [ ] Expressão adquirida permanece enquanto válida após pensamento/fala, retorno frontal, pose, TALK/BLINK e Loading; saída de reação transitória motivada, sem congelamento. Se erro, remova apenas `expression` indevido no react, preservando `gaze` e `poseCategory`. Remova beat inteiro só se vazio; reavalie estados seguintes e repetições tornadas redundantes. No nativo use estado facial completo compatível (§8), sem substituição global de presets.

**Pose:**
- [ ] Para cada personagem, registre toda a sequência de categoria e variação específica, início/fim de cada intervalo, motivo e origem da troca. No react externo, se a variação exata depende do compilador, audite as decisões de categoria/automático e confira a sequência compilada quando disponível; não invente slots.
- [ ] Examine todas as trocas A → B → A e A → B → C, especialmente em fronteiras de balões, mudanças faciais/PT, pausas e transições. A pose vigente continua entre trocas intencionais. Preserve retornos legítimos e evite novos marcos automáticos em revisões nativas. Não confunda troca de asset facial com troca corporal.
- [ ] Corrija sem perder expressão, olhar ou edições manuais; cada combinação de pose/face/direção/modos deve ser comprovada (§8.3). Nenhuma substituição de pose por conveniência de asset. Reexecute a simulação e compare com as trocas autorizadas. Se faltar snapshot, registre a pendência e não declare revisão integral.

**PT:**
- [ ] Simule cada intervalo de entrada em PT até saída: finalidade, estímulo realmente percebido, geometria, contato/alvo ou desvio, necessidade contínua, término. Verifique extremidades da sala; nenhum contato visual fictício. Pensamento, nome mencionado, vergonha, pose, fala ou mudança facial não justificam PT automático. Nenhuma virada de terceiro por pensamento.
- [ ] Falas gerais não ganham alvo pela próxima fala. Avalie falante e ouvintes separadamente. Procure `left → right → left` e `right → left → right`, sobretudo gaps de 0,3–0,5 s: não interromper conversa válida, não deixar PT preso depois de perder motivo. Resposta dirigida a quem está atrás conserva olhar durante TALK e pausas. Retorno preserva emoção/pose.
- [ ] Ao retirar `gaze` indevido, conserve outros atributos; retire/ajuste retorno só se redundante. Reexecute simulação e teste causal sem conhecimento futuro. Corrigir e reauditar todo PT sem necessidade ou mantido indevidamente; nenhuma quota de viradas.

### 9.4. Auditoria de estrutura, apresentação e testes

- [ ] JSON parseável, sem chaves duplicadas/números inválidos; raiz e campos aceitos no formato correto. Seed/cor/IDs/nomes únicos reais, elenco 1–24, nenhuma categoria/slot conflitante. Auto de pose padrão 15 quando permitido; `0` para direção somente explícita; olhar manual `false` salvo exceção. Cada vídeo tem uma referência válida; listas e compilador dentro dos limites.
- [ ] Sem sobreposição de vídeo; referências de linhas/beats pertencem ao elenco; cobertura e duração corretas. Nativo: verificar também §8, UUIDs por categoria (v4 nas entidades persistentes, v4/v5 nos blocos e referências a blocos), unicidade das definições, referências internas, snapshots e faixas; compare mudanças intencionais com original. Não presumir validação de recursos externos.
- [ ] N vídeos não dispensados = N Loadings ativos, 90 quadros livres antes de cada, inclusive primeiro após abertura/Intro; sem colisão com vídeo/balão anterior salvo autorização explícita; nenhuma cauda cortada nem GIF extra final. Corrigir se faltar ou colidir.
- [ ] Todos os cards solicitados presentes, `Past`/`Future`/`Indecipherable` válidos, textos corretos/limites, revelações no instante autorizado, componentes dentro de blocos e clipes, sem mistura de legado e formato unificado. Margem/legibilidade; idiomas em posições corretas. Intro com itens não sobrepostos, partes válidas, leitura, expressões reais e relógios corretos.
- [ ] Diferencie três níveis de confirmação: **estrutural** (parse, tempos, recursos conhecidos, autoria), **no aplicativo** (importação/abertura efetiva, timeline, poses, sprites, PT, TALK/BLINK, cards, GIF, transições, prévia), **renderização** (MP4 realmente exportado e conferido). Não inferir os dois últimos do primeiro. Se não houver app/mídia/assets, informe o que não foi testado e as edições manuais exigidas.

## 10. Exemplo integrado do react externo

Exemplo ilustrativo completo, não inventário. A e B à esquerda da TV; mídia publicada nº 1 com pelo menos 10 s. Posturas diferentes pressupõem autorização. Sem Intro; abertura vazia; vídeo em 3 s, `scene_end` relativo de 7 s; A pergunta a B aos 10 s. B vira após perceber, muda emoção durante troca e retorna sem reset emocional. Presets e referências devem ser substituídos por recursos reais.

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
      "layout": { "x": 0, "y": -5, "width": 26, "height": 40, "rotation": 0 },
      "presentation": {
        "loadingGif": true,
        "cards": [{
          "startSeconds": 0, "endSeconds": 10,
          "temporal": { "startSeconds": 0, "endSeconds": 10, "text": "Future" },
          "english": { "startSeconds": 0, "endSeconds": 10, "text": "The first mission" },
          "portuguese": { "startSeconds": 0, "endSeconds": 10, "text": "A primeira missão" }
        }]
      }
    }
  ],
  "lines": [
    { "character": "A", "kind": "speech", "text": "Você viu isso?", "englishText": "Did you see that?", "startSeconds": 10, "durationSeconds": 3.2 }
  ],
  "beats": [
    { "character": "B", "startSeconds": 10.266666667, "expression": "Surpresa", "gaze": "left" },
    { "character": "B", "startSeconds": 11.5, "expression": "Confusa" },
    { "character": "B", "startSeconds": 13.5, "gaze": "right" }
  ],
  "durationSeconds": 15
}
```

GIF [0,3), vídeo e cards [3,13), fala de 10 a 13,2 s; quatro palavras em inglês exigem piso 3,2 s. B mantém PT enquanto processa e retorna após o encerramento; `Confusa` persiste. A cauda final vai até 15 s. Se houver Intro de 29 s (§3.3), todo o conteúdo principal desloca automaticamente 29 s; não mudar seus tempos no JSON.

Vídeo sem cards continua com `presentation: { "loadingGif": true }`. Ex.: clipe nº 2 começando em 36 s pressupõe fim de bloco anterior até 33 s. Dispensa expressa permite `loadingGif: false` ou omissão somente nos clipes dispensados, conservando cards pedidos.

---

**Manutenção do guia:** preserve o núcleo criativo; ao atualizar, confronte o contrato real do importador/compilador, Fabricador, Poses Dev, biblioteca, prévia e exportação. Não recuperar exemplos específicos de outro elenco nem estruturas V4 como schema. Preservar independência entre pose específica, emoção e direção, e validar versões de UUID pelo tipo de entidade (§8.4). Incrementar versão documental sem presumir alteração no app.
