# Ciclo 18 — correção global de dependências indevidas entre roupas

## Reprodução relatada

- Criar no **Roupas DEV**, sobre o **modelo original desmontado**, duas peças de calça para as coxas, posicionadas um pouco mais acima para deixar o joelho parcialmente descoberto.
- Encaixar as duas peças das canelas normalmente e salvar o conjunto sem alterar os PNGs.
- Equipar as quatro peças no Customizador: o encaixe mudava quando coxa e canela coexistiam.
- Ocultar as duas canelas: as coxas voltavam ao local correto.
- Restaurar as canelas: o desvio reaparecia. O inverso também ocorria.
- O mesmo mecanismo poderia afetar roupas de outras categorias ou acessórios com vários componentes.

## Duas causas encontradas

1. `wardrobePosePadding` aplicava **18 pixels de alongamento automático** a coxas e canelas apenas quando ambas as categorias estivessem equipadas. A função era invocada pelo Customizador, pela prévia do Roupas DEV e pela comparação de poses. Mangas também recebiam expansão automática de bordas, contrariando medidas salvas na folha original.
2. `renderWardrobeOverlay` substituía o centro de ajuste de cada componente pela **média dos centros de todos os componentes visíveis da mesma seleção**. Com escala ou rotação personalizada, ocultar ou restaurar um irmão deslocava o pivô e, consequentemente, as peças restantes.

## Correção

- **Preservar geometria individual da roupa autorada.** A compatibilidade da API `wardrobePosePadding` é mantida, mas deixa de introduzir ajustes automáticos invisíveis: `kneeOverlap = 0` e `edgePadding = 0`. Sobreposições deliberadas passam a ser responsabilidade do encaixe visual salvo pelo usuário no Roupas DEV.
- **Preservar o pivô individual por parte do corpo.** Cada componente usa a própria origem transformada em `wardrobeAdjustmentMatrix`, não a média dos irmãos visíveis.
- O modelo original, as poses, os PNGs, bindings já salvos e os ajustes do personagem não sofrem migração nem mutação durante a renderização.
- Não adiciona opções de fixação obrigatórias: roupas antigas permanecem legíveis.

## Regressões automatizadas

- `tests/wardrobe-composition-independence.test.mjs`: quatro peças de calça, com joelhos intencionalmente parcialmente descobertos, e todas as **16 combinações** de ocultação/restauração. Compara posição, escala, rotação e composição de ajustes individuais.
- A mesma suíte testa mangas e acessórios, impede expansão silenciosa, preserva a origem/manifesto/PNG e proíbe média de pivôs no renderizador.
- `electron/domains/fabricator/visualUiCapture.ts`: no Customizador Electron Windows com perfil sintético, oculta e restaura mangas independentes, mede os pixels da outra manga e registra `wardrobe-hide-restore.json`.
- `scripts/fabricator/review-real-ui-captures.cjs` valida que ambas as peças foram exercitadas e que não houve deslocamento significativo após ocultar/restaurar.

## Limites de validação

- Um teste de composição não é prova estética de todas as roupas pessoais. O usuário ainda precisa conferir a calça que revelou o problema em sua instalação Windows.
- A remoção de preenchimento implícito pode deixar visíveis eventuais costuras que **já existiam** e antes eram escondidas por pixels extras. A solução correta é encaixar/autorizar o recobrimento deliberadamente no Roupas DEV, não mover uma peça automaticamente quando outra é equipada.
- Não executar merge para `main` sem autorização. PR #5 continua em rascunho até revisão.
