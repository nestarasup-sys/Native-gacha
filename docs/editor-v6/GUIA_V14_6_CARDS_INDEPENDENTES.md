# Guia V14.6 — Cards independentes na timeline do Editor V6

**Versão vigente:** V14.6. Este complemento atualiza somente o comportamento dos cards do Guia V14.5. Para todas as demais regras, formatos e instruções criativas, use o V14.5 integral sem alterações. O app entrega os dois documentos juntos ao baixar o guia.

## O que mudou

Cards superiores (contexto temporal) e inferiores (texto) passam a ser blocos editáveis na faixa **Cards**, posicionada imediatamente abaixo de **Vídeo**. Cada bloco tem início e duração próprios, podendo ser selecionado, movido, redimensionado, dividido, duplicado e excluído sem cortar ou alterar o vídeo.

O card mantém associação ao bloco de vídeo de origem para obter geometria, proporção e janela de exibição. Ele acompanha a largura, posição, altura e rotação atuais do vídeo. O bloco tem início e duração próprios, mas só é desenhado enquanto o vídeo associado está ativo. Se o card começar antes do vídeo ou terminar depois dele, a parte excedente fica oculta; um card nunca aparece fora do intervalo do vídeo. Mover ou redimensionar o vídeo atualiza sua apresentação visual, enquanto os tempos próprios do card permanecem editáveis.

## Edição no aplicativo

- Selecione um vídeo para editar diretamente no Inspetor os textos dos cards associados e adicionar um card superior ou inferior.
- Selecione um bloco na faixa **Cards** para editar seu conteúdo, início e duração em segundos.
- O card superior aceita exclusivamente `Past`, `Future` ou `Indecipherable`.
- O card inferior aceita texto de até 240 caracteres.
- Para mostrar dois textos sucessivos durante um vídeo de 10 segundos, crie dois blocos na mesma posição: primeiro no início do vídeo, com duração de 5 segundos; segundo no início do quinto segundo, também com duração de 5 segundos. O vídeo permanece como um único bloco.
- Cards em posições diferentes podem ficar visíveis ao mesmo tempo. Na mesma posição, evite sobreposição; o JSON de roteiro não representa dois cards simultâneos na mesma posição.

## Sintaxe de roteiro e conversão

O JSON V6 mantém compatibilidade com `NYMI_EDITOR_V6_REACT_V1`. Os roteiros declaram os intervalos dentro de `videos[].presentation`; o importador converte cada intervalo em um bloco da faixa **Cards**. `startSeconds` e `endSeconds` são segundos relativos ao início do vídeo associado. A edição posterior no app usa quadros absolutos da timeline, independentes do vídeo.

```json
{
  "videos": [{
    "videoId": "00000000-0000-4000-8000-000000000001",
    "startSeconds": 0,
    "durationSeconds": 10,
    "presentation": {
      "timeCards": [
        { "startSeconds": 0, "endSeconds": 5, "text": "Past" },
        { "startSeconds": 5, "endSeconds": 10, "text": "Future" }
      ],
      "bottomCards": [
        { "startSeconds": 0, "endSeconds": 5, "text": "Primeiro texto" },
        { "startSeconds": 5, "endSeconds": 10, "text": "Segundo texto" }
      ]
    }
  }]
}
```

`bottomCard` e `timeCard`, sem intervalos, continuam aceitos em roteiros existentes e ocupam toda a duração do vídeo na conversão. `loadingGif` continua pertencendo ao vídeo e conserva seu comportamento anterior. A importação não cria cards quando o roteiro não os solicita.

Ao exportar um roteiro, o app converte os blocos de volta para `bottomCards` e `timeCards`, calculando segundos relativos ao início do vídeo associado. Cards simultâneos na mesma posição não cabem no formato JSON atual; o exportador avisa e omite o intervalo conflitante. Projeto salvo mantém os blocos independentes sem essa conversão.

## Prévia e exportação

Prévia e MP4 usam o mesmo desenho SVG e a mesma geometria vinculada ao vídeo. Cards ficam acima das imagens e demais elementos de cena. Balões de fala e pensamento ficam acima dos cards. A faixa controla o intervalo de exibição dentro da janela do vídeo; alterar um card não corta nem estende o vídeo.

Projetos antigos com cards fixos ou temporizados são migrados ao abrir/salvar: cada apresentação vira bloco independente na faixa **Cards**, com o intervalo e o texto existentes limitado à duração do vídeo. O GIF de Loading permanece no bloco de vídeo. A migração é repetível sem criar cópias de cards já convertidos.
