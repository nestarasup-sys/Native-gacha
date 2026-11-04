# Editor V6 — Rodada 10 · Reexportação com preparo de cabelo reutilizável

**Data:** 04/11/2026. **Base:** `53c8c49b0f60be45fdcd726de98fd80dfedcb0f2`. **Branch:** `Dev-V2`.

## Fato medido / hipótese

O projeto real com Preset 2 gastou em média **18,23 s** preparando o cabelo em três execuções, e **16,10 s** na exportação principal (médias quentes). O preparo refaz os 11 bakes mesmo ao clicar exportar novamente sem alterar personagens, poses, mídia ou preset.

Esta rodada introduz um *cache de uma única preparação bem-sucedida*, somente em RAM e somente na interface de exportação, com orçamento de **40 milhões de caracteres de data URL**. A hipótese é evitar a fase de 18 s em uma **reexportação idêntica na mesma sessão do Editor**; não altera a primeira exportação, nem o benchmark atual que chama o preparador diretamente. Não representa tempo economizado já medido.

## Regras técnicas

- Chave: identidade imutável do documento, referencias a timeline/elementos/assets, `updatedAt`, slot e conteúdo integral do preset, intervalo, boca e duração do ciclo. Opções de encoder, tamanho e Turbo não mudam as camadas de cabelo.
- Invalidação quando o documento muda, a sincronização de fontes fica pendente, o Customizador salva, o Fabricador notifica mudanças, a janela retoma foco ou volta a ficar visível.
- Operação de bake que termina após invalidação **nunca reintroduz dados antigos** no cache.
- Erros e preparações acima do orçamento não são retidos.
- Um único bundle pode estar no cache; não há gravação em arquivos, localStorage ou projeto do usuário.
- A malha, física a 120 Hz, aparência, MP4, transições e áudio continuam inalterados.

## Testes e limite

O novo teste cobre reutilização, mudança de preset/intervalo, mudanças de documento, invalidação durante trabalho pendente, erro, orçamento e integridade referencial do bundle.

**Limite:** a reexportação rápida depende do mesmo objeto de documento e da mesma sessão. O cache é invalidado conservadoramente após eventos externos; projetos pesados com bundle maior que o orçamento não obtêm benefício. O cenário autorizado de benchmark realiza preparações diretas e não mede esta rota da interface — o Codex deve executar um teste A/B de **duas exportações seguidas pela interface** antes de afirmar resultado em segundos.
