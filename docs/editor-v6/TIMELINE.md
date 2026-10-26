# Timeline do Editor V6

## Organização

- Três faixas gerais: Vídeo, Fala e Pensamento.
- Uma faixa automática para cada personagem do elenco.
- Tempo inteiro em quadros, a 30 FPS. Os campos de segundos são convertidos para o quadro mais próximo.
- O início do bloco define sua posição; a duração define a largura.
- Fala e pensamento são eventos de intervalo e podem se sobrepor a estados de personagens.
- Cada período de personagem guarda pose, expressão, posição, tamanho, imagem e visibilidade. O estado permanece até o próximo período.
- Selecionar um bloco leva o cursor ao início e abre seus controles. As poses e expressões continuam sendo editadas no Inspector da cena.

## Edição implementada

- Arrastar para mover; puxar a borda direita para ajustar duração.
- Em personagens, a borda entre períodos modifica o início do período seguinte, respeitando pelo menos um quadro de cada lado.
- Arrastar pausa a reprodução. Esc cancela a operação; soltar confirma uma única alteração no histórico.
- Indicação de início, fim e duração durante o arraste.
- Divisão no cursor, duplicação e exclusão de blocos. Excluir um bloco não remove o personagem do elenco.
- Menu de contexto com Inspector, início, fim, duplicação, divisão e exclusão.
- Magnetismo nas bordas dos blocos, cursor e limites da timeline; Alt ignora o encaixe temporariamente.
- Zoom, Fit, nomes compactos, renomear por duplo clique, ordenar, recolher, ocultar e bloquear faixas.
- Inspector do bloco com início, duração, texto, personagem associado e visibilidade do estado.
- Falas e pensamentos podem ser vinculados a um bloco visual, com deslocamento relativo limitado ao seu intervalo. Mover o visual move os comentários; dividir o visual divide ou redistribui os comentários correspondentes.

## Atalhos

| Tecla | Ação |
| --- | --- |
| Espaço | Reproduzir ou pausar |
| S | Alternar magnetismo |
| Alt durante arraste | Ignorar magnetismo |
| + / - | Aumentar ou diminuir zoom |
| Shift+Z | Alternar Fit e zoom anterior |
| Esquerda / Direita | Recuar ou avançar um quadro |
| Shift+Esquerda / Shift+Direita | Recuar ou avançar cinco quadros |
| Home / End | Ir ao início ou fim |
| Ctrl+K | Dividir bloco selecionado no cursor |
| Ctrl+D | Duplicar bloco selecionado |
| Delete / Backspace | Excluir bloco selecionado |
| Esc | Cancelar arraste ou fechar menu |
| Ctrl+Z / Ctrl+Y | Desfazer / refazer |

Os atalhos de edição da timeline não interceptam a digitação em campos de texto.

## Dados e desempenho

`src/shared/editorV6Timeline.ts` contém as operações e a resolução determinística da cena, sem dependências de React ou Electron. A prévia e os prints usam esse mesmo resolvedor.

A prévia agora usa `SceneSurface`, também reutilizado pelas capturas de quadros e prints. Fundos têm estados persistentes na faixa Vídeo. Arrastar um personagem na prévia cria ou atualiza o estado no quadro do cursor; o histórico registra o gesto inteiro uma vez. Veja [PREVIA.md](PREVIA.md).

O relógio usa `performance.now()` e `requestAnimationFrame`. Cada atualização calcula o quadro correspondente ao tempo decorrido, podendo pular quadros quando a interface atrasa. Não soma atrasos de temporizadores sucessivos.

Os índices de blocos são reutilizados por objeto de timeline. A busca de estados usa pesquisa binária. Os eventos sobrepostos usam também um índice de fim máximo para encerrar a busca pelos blocos inativos.

`EditorV6Timeline.tsx` desenha os blocos do trecho visível com margem lateral, mantém as linhas memorizadas e desenha o cursor em uma sobreposição separada. O cursor acompanha a rolagem durante a reprodução. Durante o arraste, a alteração fica em um rascunho local e só entra no documento/histórico ao soltar; cancelar descarta esse rascunho.

Os blocos guardam estados e referências às imagens do projeto. Ao alterar uma imagem de pose/expressão, a cópia só acontece se o conteúdo mudar. Outras poses preservam suas imagens anteriores. Imagens geradas que deixam de ter referência são retiradas do documento.

O salvamento registra os estados e tempos no JSON e continua usando a persistência transacional de imagens do Editor V6. A normalização de projetos antigos preserva IDs de blocos, tempos e estados existentes. Duplicar um projeto remapeia também os IDs dos estados, imagens e comentários vinculados.

## Recursos da referência que ainda dependem de outros módulos

A faixa Vídeo atualmente organiza os objetos/imagens e textos visuais já disponíveis no V6. Ela não realiza importação, decodificação ou reprodução de arquivos de vídeo.

O [exportador Turbo 2×](EXPORTACAO.md) já produz MP4 e permite importar e misturar trilhas sonoras pelo seu painel. Importação de vídeo, faixa de áudio na timeline, reprodução sincronizada de mídias na prévia, faixas personalizadas e eventos de loading/apresentação ainda precisam ser implementados.

A associação de uma fala a um personagem já fica nos dados do bloco; a troca automática da boca e o piscar automático durante a reprodução ainda precisam ser conectados ao renderizador facial. As mudanças de pose/expressão agora usam transições nos 250 ms anteriores à próxima mudança, com controle por faixa e por bloco. Veja [ANIMACOES.md](ANIMACOES.md).

## Verificação

Os testes em `tests/editor-v6/editorV6Timeline.test.ts` cobrem períodos independentes, imagens anteriores preservadas após alterações sucessivas, JSON válido, exclusão sem recriar blocos, faixas bloqueadas, fronteiras de um quadro, duplicação, magnetismo e comentários relativos ao dividir ou mover o visual.
