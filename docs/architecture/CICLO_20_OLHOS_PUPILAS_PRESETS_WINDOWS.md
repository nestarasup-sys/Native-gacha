# Ciclo 20 — pupilas, Olhos DEV e Presets DEV: origem do desvio e correção Windows

Branch: `feature/model-source-editor` · PR #5. Não modificar/mesclar `main` sem autorização.
O aceite prioriza **Windows**; perfis pessoais, PNGs, poses, biblioteca de conjuntos e SQLite permanecem intocados.

## Erros reproduzíveis encontrados na implementação anterior

1. A prévia **Normal** do Presets DEV aplicava `resolvePresetPupilGaze` a cada render. A função convertia o deslocamento em magnitude absoluta e forçava sua direção. Ao cruzar o ponto neutro com o mouse, o deslocamento visual podia inverter em vez de acompanhar o gesto. O estado PT, que é apenas uma variante de olhar, contaminava o editor de posições.
2. Olhos DEV limitava artificialmente as pupilas a ±25% da largura/altura da cabeça no `movePreviewDrag`, `movePair` e sliders; ao alcançar o limite havia uma barreira invisível.
3. O arraste do Olhos DEV ignorava a rotação do olho e o espelhamento do asset direito. Era possível puxar à direita e o cálculo armazenado seguir na direção errada.
4. A prévia vinculada de Olhos DEV podia mostrar o PNG do **olho esquerdo** no lugar do direito já salvo, com fórmula de `flipX` distinta do Presets DEV. Os dois editores aparentavam possuir referências diferentes.
5. Presets DEV, ao criar um conjunto, escolhia os primeiros assets encontrados na biblioteca em vez de priorizar os pares atualmente selecionados e calibrados em Olhos DEV.
6. Mais grave: ao abrir um modelo com menos de 21 expressões publicadas, o carregamento acionava `importLegacyStandardExpressions` e gravava offsets automáticos, **inclusive reutilizando os IDs de slots já salvos**, o que podia sobrescrever escolhas autoradas e causar deformações. Essa escrita automática no carregamento foi eliminada.

## Contrato corrigido

- `src/shared/facePupilGeometry.ts`: transforma deslocamentos em coordenadas de preview e implementa a inversa exata do gesto. Aplica rotação e espelho **uma vez cada**, sem limites de autorias ocultos; a máscara permanece apenas uma contenção visual dos pixels.
- `FaceComponentsWorkspace.tsx`: arraste livre e contínuo, sliders expansíveis, entradas numéricas, mover em par sem limite arbitrário; usa a peça direita persistida. Atualização/salvamento continuam ocorrendo pela API anterior, sem alterar identidade dos assets.
- `ExpressionPresetWorkspace.tsx`: prévia Normal mostra **exatamente** os `transforms` originais do Olhos DEV ou do preset, sem forçar olhar; PT é uma visualização separada somente leitura. A edição e os comandos de restaurar não operam sobre PT.
- `src/shared/faceLibrarySelection.ts`: recupera a seleção previamente gravada por Olhos DEV no mesmo perfil local, com verificação de modelo/categoria; seleciona pares reais pela identidade de par ou nome, sem escolher uma peça direita não relacionada.
- `src/shared/faceExpressionDefaults.ts`: um conjunto vazio parte da calibração autorada de cada olho, pupila e sobrancelha e das transformações de catálogo de nariz/boca; clone defensivo, sem alterar assets, pose ou raster.
- O bootstrap não importa nem salva automaticamente 21 expressões pré-calculadas do legado; os slots vazios começam neutros, e os presets **existentes** permanecem como estão. A rotina de importação legada continua no repositório para eventual uso explícito com backup, mas não é executada durante abertura.

## Retrocompatibilidade e limite importante

**Nenhum preset pessoal foi reescrito automaticamente** como consequência da correção. Os que já tinham ajustes incorretos persistidos antes dela podem precisar de verificação visual e **Restaurar encaixe da peça** ou **Restaurar expressão** por opção do usuário. Não é correto reatribuir automaticamente valores antigos nem reescrever arquivos: seria impossível distinguir uma expressão intencionalmente exagerada de uma deformação antiga.

O Studio/Video Studio continuam consumindo o preset salvo sobre a base do Customizador. A mudança de geometria é de autoria/edição (Olhos DEV e Presets DEV), sem injeção de novas correções ocultas em tempo de renderização.

## Testes

- `tests/face-pupil-editor-continuity.test.mjs`: matriz de ângulos e espelhos, inversão matemática, 60 passos monotônicos, movimentos grandes além do limite anterior, seleção real Olhos DEV → Presets DEV, fallback seguro, neutralidade completa de todas as transformações e proteção contra escrita implícita.
- Fluxo visual Windows Electron mantém capturas de ambas as telas; não substitui verificação com os próprios PNGs do usuário.
- Validação final: testes Node/TypeScript, build, arquitetura e Electron Windows do mesmo commit. Linux não é critério de aceite deste ciclo.

## Aceite humano sugerido

1. Ajustar pupila individual à esquerda/direita e com o olho inclinado/espelhado: ela acompanha o mouse continuamente, sem retorno invertido.
2. Testar `Mover junto` e deslocamentos grandes. Fora do olho, os pixels ficam ocultos pela máscara, mas **os valores de posição continuam editáveis e recuperáveis**.
3. Abrir um conjunto novo no Presets DEV e verificar se sua posição neutra corresponde ao Olhos DEV. Normal pode ser editado; PT não sobrescreve nada.
4. Salvar, sair, reabrir o preset, retornar à base e conferir expressões no Studio/Video Studio com outro personagem.
5. Não usar `Restaurar` em presets antigos sem conferir sua composição; o restaurar é deliberado, não uma migração.
