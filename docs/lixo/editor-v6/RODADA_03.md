# Rodada 03 — estabilidade visual

Base: Dev-V2, 089126b. Trabalho local em Dev-V2, sem publicação.

## Correções incorporadas e compatibilidade

- Referências corporais e faciais são preservadas na limpeza, reparo de IDs e preparação de transições. Atlas facial ausente invalida a preparação, permitindo regeneração. Documentos legados continuam carregáveis.
- Patches faciais substituem a região RGBA completa antes da transformação do personagem. Isso permite remover pixels antigos e preservar semitransparência.
- Mudanças somente faciais usam referência corporal estável. Refreshes só publicam resultados se o estado ainda corresponde ao capturado antes do trabalho assíncrono.
- A atualização recente que evita aplicar dimensões corporais duas vezes foi preservada durante a integração.
- Variantes idle/blink/talk/talk-blink agora compartilham a união dos bounds. O canvas reutilizado é copiado antes da próxima variante; o teste Chromium verifica pixels fora do recorte idle.
- Versões facial 10, motion 7 e cache 9 invalidam resultados anteriores sem apagar caches pessoais.
- CI Windows executa o cenário facial real Electron/FFmpeg além da sobreposição de vídeos e guarda artefatos sintéticos.

## Verificações executadas

- Editor V6: 220 testes aprovados, 1 ignorado; três verificações de perfil sintético aprovadas.
- Customizador: 19 aprovados.
- Fontes/snapshots e geometria: 34 aprovados.
- TypeScript, arquitetura e build: aprovados. Uma execução inicial de build falhou por codificação UTF-8 de arquivo editado; a codificação foi corrigida e builds posteriores passaram.
- Motion Chromium: aprovado; composição com zero pixels diferentes em fundo transparente, preto, branco, colorido e quadriculado. Personagem espelhado e rotacionado 27 graus. Deriva corporal máxima de 1,14e-13 pixels.
- Export facial real: aprovado em 720p/1080p, 40 quadros, três personagens falando, dois trechos Turbo. Relatório e comparativo em out/editor-v6-face-export-check.
- Export real: aprovado; 81 quadros, áudio contínuo na emenda, cancelamento preservando destino.
- Overlay real: aprovado; 60 quadros, dois trechos Turbo e três vídeos.

## Matriz combinada concluída após a primeira entrega

- Fixture real de renderização: cabeça 110%, tronco 108%, coxa 125%, camisa vinculada ao tronco pelo sistema de roupas, cabelo, cabeça extra, olho e pupila com variante fechada. O destino da expressão usa o construtor compartilhado de PT (gaze left e movimento portátil da pupila), sem substituir o corpo. Três personagens, incluindo espelhamento e rotações.
- Uma transição de sete amostras entre os frames 16 e 22 atravessa a emenda Turbo 19/20. O documento passa por JSON roundtrip antes de exportar. A boca permanece obrigatória mesmo com mouthLoop false enviado como chamada legada.
- Os 40 quadros da região de corpo/roupa foram comparados com uma captura Chromium integral anterior à transição. MAE máximo 1,6712 em 720p e 1,7176 em 1080p, limite 5 em escala RGB 0–255 para H.264 e conversão YUV. Não se exige igualdade de pixels comprimidos. A comparação RGBA sem compressão permanece exata em cinco fundos.
- Export combinado: 885,7 ms em 720p e 1.132,4 ms em 1080p nesta execução. Esses valores não constituem benchmark A/B nem alegação de aceleração.
- O hook real de refresh foi montado em React/Chromium com Canvas e fontes sintéticas. Uma leitura antiga do modelo foi retida enquanto 12 revisões sucessivas foram enviadas. Após concluir a revisão 12, liberar a leitura antiga não alterou o asset atual. Cena e blocos mantiveram revisões consistentes de corpo/cabeça, modelo, pose, roupa, cabelo, cabeça extra e olhos.
- Reabertura: a normalização legada agora ignora assets pertencentes a um conjunto facial alinhado. O teste preserva também referências compartilhadas entre cena e timeline.
- Integridade: schema rejeita transição com atlas facial ausente. Na carga, referências derivadas incompletas são invalidadas em memória. Um teste grava o projeto em pasta temporária, remove somente seu PNG facial sintético, reabre e regenera a transição mantendo os blocos e imagens base. Undo/redo preserva ambos os atlas.
- O teste de recorte demonstra o caso antes/depois: idle ocupa 20×20; outra variante acrescenta 25 pixels fora dele. O recorte comum passa a 35×35 e mantém os 25 pixels. Falta de olho fechado é opcional apenas para variantes blink; falhas de talk continuam propagadas.
- Verificações complementares de Customizador, fontes, corpo, geometria e PT: 69 testes aprovados. Export real geral e overlay foram repetidos após as alterações de persistência e passaram.

## Evidências e limites

Comparativo: `out/editor-v6-face-export-check/face-mouth-compare-1080.png`. MP4s: `mouth-local-composition-720p.mp4` e `mouth-local-composition-1080p.mp4`, na mesma pasta. Métricas detalhadas: `result.json`. Esses arquivos são gerados e não integram os commits.

Os resultados são sintéticos; não foi utilizado o projeto pessoal. A corrida usa o hook real com provedores de catálogo sintéticos e revisões controladas, sem automatizar cliques nas telas do Fabricador. Não foi medido o impacto de memória desta integração. O workflow foi validado localmente por seus comandos, mas não executado no GitHub Actions porque não houve publicação. Um teste preexistente permanece ignorado na suíte Editor V6.
