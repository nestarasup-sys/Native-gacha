# Video Studio G-V5 — dez etapas de reconstrução: timeline e prévia

**Data:** 23/10/2026. **Escopo:** Windows e branch `feature/model-source-editor`; PR #5 permanece draft. As implementações são incrementais e não afirmam paridade completa com o editor original.

## Dez avanços implementados

| Etapa | Mudança real | Limite verificável |
| --- | --- | --- |
| 1 | Desenho de balões de fala/pensamento no preview GPU, raster sob demanda por estado do texto, cache limitada e sem `toDataURL` a cada frame | Estilo de fallback provisório; não é o oráculo pixel a pixel do compositor antigo |
| 2 | Edição imutável do texto por segmento, preservando os outros segmentos e o texto do elemento compartilhado | Não implementa novo painel de fontes/efeitos |
| 3 | Reposicionar bloco de fala/pensamento sem alterar duração ou autoria | Bloqueio de faixa e limites de duração aplicados |
| 4 | Reposicionar clipe de vídeo mantendo `sourceStartFrame` e `sourceEndFrame` (PTS) | Validação do clip existente e dos limites |
| 5 | Volume e mudo imutáveis por clipe | Preview usa o ganho compartilhado; ainda sem mixer externo |
| 6 | Volume e mudo globais por projeto | Documento StudioDocument v1, sem alterar mídia-fonte |
| 7 | Excluir clipes de fala/vídeo sem tocar assets e respeitando locks | Undo/Redo trabalha sobre referências de documentos anteriores |
| 8 | Mover keyframe Gacha de um personagem mantendo pose, rosto, PT, guarda-roupa e imagem-fonte | Impede colisão de quadros na mesma faixa |
| 9 | Excluir keyframe mantendo a base original do ator e demais chaves | Não apaga o personagem |
| 10 | Nova UI contém inspetores para clipes, áudio e keyframes, com seleção na timeline | Operações locais até salvar uma cópia |

**Endurecimento extra:** a GPU valida antecipadamente o orçamento simultâneo de texturas/máscaras e IDs conflitantes, preservando o quadro anterior quando os recursos do novo frame seriam inválidos. A suíte Electron Windows de cinco segundos com quatro atores sintéticos passou a conter um balão de fala ativo e duas trocas de estado por ator.

## Como verificar

- `npm run test:video:rebuild` e `npm run test:video:next` incluem casos para balões, texto por clipe, PTS ao mover vídeo, mudo/volume, bloqueios, keyframe PT e proteção GPU.
- `npm run typecheck`, `npm run build`, CI Core Windows/Ubuntu, Quality e Electron GUI Windows, incluindo teste de orientação vertical vermelha/azul.
- Testes de fixture não provam desempenho com catálogo real. O próximo gate continua ser **renderizar corpo/roupa/cabelo/olhos/boca/pupilas PT independentes com golden real no Windows**, depois 5/15/30 s reais, decodificação isolada, export MP4 1080p60 com PTS/áudio e FFprobe.

**Restrições mantidas:** nenhuma alteração em `main`, sem sobrescrita de projetos pessoais e sem recriar `VideoStudioEditor.tsx`. Os componentes do exportador/oráculo antigo permanecem onde ainda possuem dependentes.
