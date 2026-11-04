# Rodada 22 — Eliminar a segunda preparação de atlas para reação após pose

**Branch:** Dev-V2. **Data:** 04/11/2026. **Escopo:** exportação MP4, **modo Balançar só o cabelo Posterior após trocar de pose**.

## Duplicação concreta removida

Antes o Editor V6 preparava os atlas canônicos de transição (corpo/rosto/cabelo normal) no exportador MP4 **e**, ao ativar a animação experimental do cabelo, preparava novamente atlas separados **sem cabelo** para as mesmas transições. Para o modo de reação única isso é redundante: o Posterior só começa a balançar depois que a pose termina, e **durante a transição o cabelo deve estar estático como no render normal**.

A R22 altera somente esse caminho:

1. `selectEditorV6HairlessTransitionBakes` retorna **zero bakes extras** quando `hairPoseReactionOnly` está ativo. Contínuo e loop continuam selecionando todos os bakes anteriores do intervalo. Se o projeto tem 11 transições, o modo reação pode dispensar até **11 atlas adicionais** de corpo/rosto sem cabelo.
2. O worker passa a usar o **atlas normal completo** da própria timeline nos sete frames de cada transição, sem compor o cabelo sobre o atlas nesse intervalo. Boca, olhos, roupas, transparência e rosto seguem os mesmos pixels do renderizador de produção.
3. `hairPoseReactionEndFrames` recebe eventos diretamente dos planos de troca de pose, sem exigir um atlas preparado antecipadamente na UI. Isso permite a reação começar após o fim mesmo quando o MP4 precisou preparar a transição canônica durante a exportação.
4. O cabelo posterior (`rearHair`) continua sendo a única peça deformada depois da pose; `backHair`, rabo de cavalo, franja e ahoge permanecem imóveis. Reação = uma única oscilação e retorno ao repouso, sem vento contínuo.
5. A preparação de personagens compartilha um `GachaReusableMaterialCache` **temporário dentro da exportação** para reduzir carregamento repetido dos mesmos manifestos de cabelo/roupas entre poses do mesmo personagem. O cache é descartado no fim dessa fase. Não guarda projetos, MP4s ou material de exportações anteriores.
6. `preparedCharacterMaterials.ts` separa o manifesto de roupas da chave que inclui o cabelo: assim os renderizadores **original e sem cabelo** aguardam o **mesmo carregamento de roupas** mesmo em chamadas concorrentes. A leitura das roupas também começa em paralelo às três categorias de cabelo, sem esperar pelo fim delas. A composição e os pixels finais continuam no renderer original. Testes cobrem chamadas concorrentes, roupas alteradas, falhas e exportações distintas.

## Segurança e testes

- Não altera `bakeMotion.ts`, renderer original, interface, Customizador, Fabricador ou persistência de snapshots.
- **Não elimina a preparação canônica de transições**: se o atlas original estiver ausente, o exportador MP4 o gera normalmente. Nenhum fallback perde poses.
- Novos testes unitários verificam seleção para 0, 1 e 2 transições, fronteiras do intervalo e que os modos contínuo/loop não sofram alteração.
- O teste offscreen do Windows percorre **os sete frames reais da transição sintética** e exige **BGRA idêntico bit a bit** entre a exportação normal e a exportação com reação sem atlas de cabelo. Depois confere o quadro parado, a reação posterior e o repouso.
- Demais testes de arquitetura, TypeScript, Editor V6 e MP4 Windows continuam obrigatórios. **Sem testes Linux**.

## Resultado esperado e o que ainda exige medição real

**Mudança estrutural entregue:** para reação única, deixa de acontecer um `bakeEditorV6Motion` extra para **cada transição** no preparador experimental; os atlas normais do exportador não desaparecem. Além disso, reuso temporário de materiais por personagem/pose reduz leituras redundantes.

**Não alegar segundos poupados até medir** no Windows 11 com o Preset 2 real e projeto de 300 quadros (cópia isolada e confirmada). Usar média e primeira exportação sem cache de exportações passadas. O tempo anterior de 18,23 s refere-se a versão antiga e não é uma medição da R22.

A próxima hipótese, se a medição comprovar benefício, é eliminar o bake extra também dos modos vento contínuo/loop por uma IR independente de atlas; isso requer equivalência de pose, alpha e boca e **não faz parte desta rodada**.
