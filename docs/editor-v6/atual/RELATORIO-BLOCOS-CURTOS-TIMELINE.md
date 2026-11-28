# Blocos curtos e seleção na timeline

**Data:** 27/11/2026 · **Revisão inicial:** `9ca94965` · **Modo:** análise e testes offscreen.

## Diagnóstico do projeto aberto

O projeto V4 mais recente foi lido em modo somente leitura. A faixa da Seraphina contém três blocos consecutivos no trecho: quadros `3829–3937`, `3937–3938` e `3938–4082`. O bloco `3937–3938` dura um quadro. Na timeline inteira há 256 blocos de personagem; somente um tem um quadro e três duram menos de 15 quadros. Não há intervalos temporais sobrepostos nessa faixa, nem IDs de bloco duplicados no projeto (374 blocos no total).

`compileEditorV6ReactCharacterTracks` cria um estado por beat distinto; `normalizeEditorV6Timeline` define o fim de cada estado no próximo beat. Portanto, o quadro residual veio de tempos de estado separados por um quadro, e não de IDs/referências compartilhados ou arredondamento que cria sobreposição. O projeto persistido não contém o JSON original do roteiro, então não é possível atribuir aqueles tempos a uma instrução específica.

A seleção falhava por uma divergência entre geometria temporal e visual: a timeline desenha blocos com largura mínima de 3 px. Em zoom reduzido, retângulos de blocos consecutivos podem se sobrepor mesmo quando seus intervalos de quadros apenas encostam. O bloco que fica visualmente por cima capturava sempre o clique destinado ao vizinho. A exclusão já funcionava para um ID válido; o alvo coberto não recebia a seleção.

## Correções

- Cliques repetidos na mesma região agora percorrem os blocos cujas caixas visuais se sobrepõem. Arraste, alça de duração, menu contextual e seleção usam o bloco resolvido, permitindo selecionar, editar e excluir cada segmento sem modificar tempos nem dados do projeto.
- A importação mantém o tempo exato solicitado e emite aviso quando beats explícitos do mesmo personagem ficam separados por menos de 8 quadros. O aviso chama atenção para uma mudança possivelmente imperceptível e uma faixa difícil de clicar; não descarta o beat.
- O Guia V15.0 recomenda oito quadros entre mudanças e explica como percorrer blocos sobrepostos.
- O projeto aberto permaneceu intacto. Depois da atualização do app, os blocos nele existentes tornam-se acessíveis sem reimportar o roteiro.

## Verificação

- Vitest focado: seleção, importador e comandos de exclusão; 30 testes aprovados.
- Suíte V6 completa: 991 aprovados, 1 ignorado, em 201 arquivos de teste.
- `npm run typecheck`, `npm run audit:architecture` e `npx electron-vite build` aprovados.
- Não foi realizada uma sessão interativa visível nem salvo qualquer dado no projeto real. A interação foi verificada pela função pura de hit testing que a UI usa; o build foi executado sem abrir janela.

## Limite da conclusão

O código-fonte do roteiro importado não está embutido no projeto nativo; por isso, a causa do timestamp de um quadro só pode ser descrita como estado curto efetivamente salvo, sem afirmar qual comando o gerou. A regressão visual de seleção foi reproduzida pela geometria da timeline e coberta por teste sintético.
