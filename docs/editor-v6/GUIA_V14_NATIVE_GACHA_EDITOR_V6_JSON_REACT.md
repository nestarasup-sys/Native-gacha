# GUIA V14.0 — Native Gacha / Editor V6 — JSON de React

**Editor-alvo:** Native Gacha, Editor V6, branch Dev-V2.  
**Formato externo:** NYMI_EDITOR_V6_REACT_V1.  
**Documento interno:** EditorV6Document, schemaVersion 1, 30 fps.  
**Origem criativa:** V13.1, com as regras de atuação e narrativa preservadas.  
**Estado:** implementação inicial; verificação no Windows e exportação real são obrigatórias antes de afirmar que está aprovado em produção.

## 1. Fonte da verdade

A IA entrega um JSON **portátil de intenções**, sem tentar inventar PNGs, IDs de renders, sprites ou o manifesto nativo. O importador associa personagens cadastrados, vídeos da Base, fundos da biblioteca e presets/poses reais do Fabricador; prepara imagens, cria a timeline e valida pelo schema nativo do V6.

**Não reescrever nem corrigir as falas/pensamentos do usuário.** Manter as palavras, acentos, pontuação e ordem. Pesquisa de personagens complementa atuação, nunca autoriza substituir o texto. O Editor V6 não tem o schema do Editor V4.

## 2. Exemplo JSON

Exemplo ilustrativo. Os nomes de presets e o vídeo número 1 **só funcionam se existirem no projeto real**.

~~~json
{
  "format": "NYMI_EDITOR_V6_REACT_V1",
  "title": "Entre a promessa e o futuro — react",
  "seed": 20261105,
  "backgroundColor": "#d7b5cd",
  "autoPoseEverySeconds": 15,
  "autoListenerGaze": true,
  "cast": [
    {"character":"Chloé","x":-35,"y":14,"scale":85,"poseSlot":1,"expression":"desconfiada"},
    {"character":"Luka","x":-14,"y":14,"scale":85,"poseSlot":2,"expression":"sereno"}
  ],
  "videos": [
    {"videoNumber":1,"startSeconds":8,"layout":{"x":0,"y":-14,"width":40,"height":40,"rotation":0}}
  ],
  "lines": [
    {"character":"Chloé","kind":"thought","text":"Isso não pode ser verdade...","startSeconds":0,"durationSeconds":3.9},
    {"character":"Chloé","kind":"speech","text":"Você viu isso?","startSeconds":16,"durationSeconds":3.2},
    {"character":"Luka","kind":"speech","text":"Vi, mas precisamos entender o contexto.","startSeconds":19.5,"durationSeconds":4.9}
  ],
  "beats": [
    {"character":"Chloé","startSeconds":10.5,"expression":"assustada"},
    {"character":"Chloé","startSeconds":14,"expression":"desconfiada"},
    {"character":"Luka","startSeconds":10.5,"expression":"preocupado"},
    {"character":"Luka","startSeconds":14,"expression":"pensativo"}
  ],
  "durationSeconds": 27
}
~~~

A IA **não deve escolher** nomes de expressão como no exemplo sem ter o catálogo real. Se não recebeu a lista de presets, deve pedir o inventário para o usuário. Os nomes dos personagens podem ser resolvidos por ID ou nome único, ignorando diferença de acentos e maiúsculas/minúsculas.

## 3. Campos aceitos

### Raiz

- format: texto fixo NYMI_EDITOR_V6_REACT_V1.
- title: título não vazio, até 100 caracteres.
- seed: inteiro de 0 a 2.147.483.647; torna poses/expressões de fallback repetíveis.
- backgroundColor: cor hexadecimal RGB, padrão #d7b5cd.
- backgroundLibraryId: UUID de um fundo já cadastrado na biblioteca de fundos de Roteiros (opcional).
- autoPoseEverySeconds: padrão 15, 0 desliga a troca automática.
- autoListenerGaze: padrão true; controla os olhares automáticos dos ouvintes.
- cast: elenco, de 1 a 24 personagens.
- videos: até 500 clipes, sem sobreposição.
- lines: falas/pensamentos em tempos absolutos.
- beats: trocas visuais de pose, expressão e olhar em tempos absolutos.
- durationSeconds: duração mínima do projeto (opcional).

### cast[]

Cada item possui character (UUID real ou nome único do Customizador), x, y, scale opcional, flipX opcional, poseSlot opcional, expression opcional e gaze opcional (left/right). O palco usa percentuais **centrados**: (0,0) no centro, x negativo esquerda, positivo direita. Não usar pixels do Gacha Editor V4. Usar somente poseSlot existente e expression com ID/nome real do Expressão Dev. Presets pertencem ao modelo do personagem.

Especificar a pose e expressão iniciais **individualmente** para garantir direção coerente. O fallback do importador é determinístico, mas não conhece a psicologia do personagem.

### videos[]

Cada item fornece exatamente uma destas três opções:
- videoId — UUID da Base de Vídeos;
- videoNumber — número publicado na Base de Vídeos;
- videoName — nome único do arquivo na Base de Vídeos.

startSeconds é absoluto no projeto. durationSeconds é opcional, para recortar o final do MP4, nunca ultrapassar o arquivo. layout opcional usa x/y/width/height/rotation em porcentagem do palco (não pixels).

**Falas posteriores ao fim do MP4 continuam aparecendo.** O V6 guarda essas bubbles em blocos independentes, sem tentar esticar o vídeo e sem cortar comentários.

### lines[]

Cada fala/pensamento tem character, kind (speech ou thought), text exato, startSeconds absoluto e durationSeconds maior que 0. x/y/width/height são opcionais para o balão. O texto deve manter quebras de linha e conteúdo originais.

A fala speech liga TALK automaticamente ao personagem pelo characterId durante o intervalo. O pensamento thought é privado e **não abre a boca** nem faz outros ouvintes virarem. Não emitir use_talk:true do antigo V4: não é o mecanismo do V6.

### beats[]

Cada beat tem character, startSeconds e um ou mais campos poseSlot, expression, gaze. Campos não citados **persistem do beat anterior**. O compilador gera estados visuais completos por bloco, com imagens reais idle/blink/talk/talk-blink. Não colocar toda a atuação nas falas: mudar expressão e pose pela lista beats.

No V6, PT é activeExpressionGaze left/right, **não** um preset com nome textual do tipo pt assustada. A expressão emocional permanece ao virar.

## 4. Regras criativas V13.1 que continuam obrigatórias

### PT inteligente e geometria

1. Antes de montar o arquivo, distribuir TV e elenco de acordo com relações e dinâmica narrativa, quando o usuário não especificou posições.
2. Durante uma fala, **somente** os ouvintes **do mesmo lado da TV, mais perto dela que o falante** (o falante está atrás deles) precisam virar de modo automático.
3. A virada só muda direção de olhar; mantém emoção, pose, escala e continuidade. Voltar ao olhar normal quando a atenção terminar.
4. Personagens do lado oposto da TV não viram em massa. Pensamentos não disparam PT em terceiros.
5. PT pode ser mantido em falas sucessivas para evitar movimentos artificiais. Falas sobrepostas devem ter direção estável.
6. Exceções narrativas, por exemplo responder diretamente alguém do lado oposto, devem ser expressas por beats explícitos.
7. O olhar normal aponta para o centro da TV (x do primeiro vídeo ou x=0): à esquerda, right; à direita, left. Olhar atrás, conforme a posição relativa do falante, pode usar left ou right — nunca interpretar left como emoção.

### Reações

- **Reação coletiva 1 = pico emocional** do estímulo que já apareceu. Avaliar todos, mas permitir que alguns preservem estado conscientemente.
- **Reação coletiva 2 = descontração/processamento** depois do pico: elaboração, reflexão, acolhimento ou mudança de leitura. Não forçar todos para normal.
- Valores 0,00 sem confirmação não significam necessariamente frame inicial. Interpretar descrição, cronologia e contexto; segunda reação deve ocorrer após o pico e, quando couber, antes de scene_end.
- Ninguém reage a informação que ainda não viu. Reações adicionais só quando há novo gatilho causal.
- A IA deve transformar esses momentos em beats específicos; o importador não escolhe emoções narrativas por conta própria.

### Scene end

scene_end é o início **exato da primeira fala ou pensamento pós-cena**. Se o vídeo começa aos 80 s e scene_end é 6.2 s, essa fala entra aos 86.2 s no campo startSeconds. **Não somar 0.6 s nem 0.5–2.5 s de silêncio automático antes dela.** Próximos comentários podem ter intervalos de leitura.

### Poses

- Início com poses reais diferentes sempre que o inventário permitir; repetir de modo equilibrado se há mais atores que poses.
- A cada **15 segundos globais** (15,30,45…), exatamente um personagem elegível muda para outra pose real do próprio modelo. Semente fixa para reprodução.
- Troca de pose não reinicia emoção nem olhar. Não inventar pose indisponível.
- A ferramenta gera cortes imediatos nos estados importados, para não antecipar o auge emocional em 250 ms. Transições podem ser ativadas manualmente após revisão.

### Expressões e personalidade

- Cada personagem inicia com um rosto coerente com personalidade, fase da história e clima da abertura, não todos em normal/seria.
- Para Miraculous, considerar **formas humanas/civis**, sem atribuir conhecimentos/poderes da identidade heroica automaticamente. Pesquisar contexto e relações quando necessário.
- Em fanfics e cenários originais, os fatos e fichas do autor têm precedência sobre interpretações externas.
- Não assumir traição, separação, morte ou romance sem revelação inequívoca. Não mudar expressão só para variar.

### Duração mínima das bubbles

Tabela do V13.1: 1–3 palavras: 2.6 s; 4–7: 3.2 s; 8–12: 3.9 s; 13–18: 4.9 s; 19–25: 6.2 s; 26–35: 7.6 s; 36–45: 9.0 s; 46–60: 11 s. Para 61+, cálculo próprio. Fórmula auxiliar 1.3 + 0.24 × palavras; usar o maior valor. Pensamentos recebem +0.4 s. Se houver duas línguas, considerar a mais longa. Entre comentários posteriores, respiro de referência 0.3 s; nunca atrasar a primeira bubble do scene_end.

## 5. Conversões e incompatibilidades

| Editor V4 e V13.1 | Novo V6 e guia V14 |
|---|---|
| schema_version 3 | schemaVersion 1, produzido pelo importador |
| timeline[] | timeline.tracks no projeto interno |
| character_tracks | períodos persistentes nas faixas character |
| dialogue | lines.kind=speech, vinculado ao characterId |
| thought | lines.kind=thought, privado |
| pt <emoção> | gaze left/right, imagem real preservando preset |
| use_talk:true | TALK automático do agendador speech |
| POSE 1 | poseSlot=1 somente se esse slot existir |
| assets/tiktoks/01.mp4 | videoNumber / videoName / videoId resolvidos localmente |
| assets/backgrounds/01.png | backgroundLibraryId ou importação manual do fundo |

Nunca colocar caminhos absolutos Windows nem inventar IDs de imagens, variantes de sprite ou preset.

## 6. Auditoria de importação obrigatória

1. JSON sintaticamente válido, UTF-8, formato V14 e limites respeitados.
2. Falas/pensamentos **literais e na ordem**, com acentos, pontuação e quebras de linha.
3. Elenco existente e sem duplicatas ambíguas.
4. Vídeos e fundo realmente presentes nas bibliotecas, sem UUID fictício.
5. Primeira reação = auge; segunda = processamento, causalmente após o gatilho.
6. scene_end no primeiro bloco pós-cena sem atraso.
7. Abertura com expressões pessoais e poses variadas.
8. PT somente para quem está à frente do falante e do mesmo lado, retornando depois; thoughts não viram outros.
9. Cada speech gera TALK quando os sprites faciais reais são preparados; thoughts não geram TALK.
10. Troca global determinística de pose real aos 15 s.
11. Estados visuais completos, contínuos, sem gaps e com imagens de base/face válidas.
12. Frames exatos a 30 fps, nenhum clipe ou bubble acima da duração total.
13. Validação final no schema Zod do V6 e salvamento em projeto **novo**.
14. Reabrir o projeto e comparar prévia com MP4 exportado no Windows, inclusive a cauda de falas pós-vídeo.

**Limites de segurança:** 24 atores, 500 vídeos, até 1000 camadas nativas, 1000 blocos por faixa, 1.000.000 frames e 5.000 assets. O compilador rejeita projetos com excesso de estados; performances longas podem precisar de deduplicação adicional. Não declarar aprovado sem rodar Electron, testes e exportação real.

## 7. Fluxo de uso

1. Criar personagens humanos no Customizador; criar poses e presets reais no Fabricador.
2. Cadastrar e publicar vídeos na Base de Vídeos. Se desejado, cadastrar o fundo no módulo Roteiros.
3. Dar à IA roteiro, elenco e catálogo disponível; pedir JSON conforme este guia.
4. Biblioteca do Editor V6 → **Importar JSON** → selecionar arquivo → conferir avisos → Validar e criar projeto.
5. Conferir timing, emoções, PT e TALK na prévia e exportar pelo fluxo nativo.

**Arquivos de referência:** src/shared/editorV6ReactImport.ts, src/renderer/src/features/editorV6/editorV6ReactImportCompiler.ts, EditorV6ReactImportDialog.tsx, editorV6FaceSchedule.ts, editorV6Schema.ts e tests/editor-v6/editorV6ReactImport.test.ts.

Auditoria de origem: docs/editor-v6/AUDITORIA_IMPORTACAO_JSON_IA_GUIA_V14_2026-11-05.md. A V14 substitui a arquitetura JSON do V13.1 para o V6 e preserva suas regras criativas.
