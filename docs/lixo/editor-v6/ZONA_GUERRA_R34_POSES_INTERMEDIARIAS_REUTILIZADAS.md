# Zona de guerra — R34: reuso de poses intermediárias

**Status:** experimento habilitado somente na branch `dev-v2-zona-de-guerra`, protegendo `Dev-V2`.

O bake anterior cria um renderer completo para cada pose intermediária. A R32 já preservava os dois endpoints; a R34 amplia a identidade **exata** para todas as amostras interpoladas. A chave contém toda a customização do personagem, a revisão da fonte e o artwork inteiro interpolado. Sem hash probabilístico ou atalho visual: fontes, pivôs ou coordenadas diferentes recusam o reuso.

O método `renderToCanvas` continua repintando o rosto e a boca por amostra; mantém geometria/atlas/7 samples originais. Somente a montagem duplicada do corpo/roupa/cabelo é evitada.

O pool retém até **12 renderers** e um orçamento estimado de **96 MiB por worker**, sem persistência entre execuções. A saída do teste sintético exige PNGs de atlas byte a byte iguais apesar da mudança das coordenadas do personagem, que continuam distintas, e `preparedRigs=0` no segundo bake com as mesmas poses.

Esse resultado é sintético; quantos dos 21 bakes reais possuem a mesma sequência de poses/partes ainda é desconhecido. Exigir TypeScript, CI Windows, paridade BGRA/RGBA/flipX/Turbo, e um A/B de primeira exportação real para promover à `Dev-V2`.
