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

- Editor V6: 219 testes aprovados, 1 ignorado; três verificações de perfil sintético aprovadas.
- Customizador: 19 aprovados.
- Fontes/snapshots e geometria: 34 aprovados.
- TypeScript, arquitetura e build: aprovados. Uma execução inicial de build falhou por codificação UTF-8 de arquivo editado; a codificação foi corrigida e builds posteriores passaram.
- Motion Chromium: aprovado; composição com zero pixels diferentes em fundo transparente, preto, branco, colorido e quadriculado. Personagem espelhado e rotacionado 27 graus. Deriva corporal máxima de 1,14e-13 pixels.
- Export facial real: aprovado em 720p/1080p, 40 quadros, três personagens falando, dois trechos Turbo. Relatório e comparativo em out/editor-v6-face-export-check.
- Export real: aprovado; 81 quadros, áudio contínuo na emenda, cancelamento preservando destino.
- Overlay real: aprovado; 60 quadros, dois trechos Turbo e três vídeos.

## Limitações explícitas

Os resultados visuais são sintéticos. Não foi reproduzida uma sessão interativa completa com edições rápidas em todas as categorias do Fabricador e Customizador; a proteção contra resultados obsoletos foi exercitada por regressões de estado. O export facial não comprova toda a combinação de roupas, corpo personalizado, preset PT e transição de expressão na mesma emenda Turbo. Essa matriz combinada continua pendente; não há declaração de estabilidade definitiva para todos esses casos. Não foi medido impacto de memória desta integração. O workflow foi modificado localmente, mas não executado no GitHub Actions.
