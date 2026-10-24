# Video Studio — correção da animação Gacha e bootstrap de mídia (24/10/2026)

Branch de trabalho: `Main-desenvolvimento`. Escopo: preview do editor e conveniência do launcher Windows. Não altera dados salvos nem o pipeline de exportação.

## Causa da animação estranha

A rodada anterior substituiu o desenho de pose/rosto interpolado por dois PNGs de estados finais empilhados com alpha de 1-t/t. Esse crossfade gerava um efeito fantasma, claramente diferente do Animador DEV (partes com juntas e rotação, `interpolateFrames`) e Animador Preset Rosto DEV (transforms faciais, pupilas, máscaras e efeitos, `interpolateTransform`).

A preview agora **não usa mais esse crossfade**. Para cada transição chama `TransitionRenderer.renderPreview`, que compõe Canvas Gacha e utiliza a interpolação real do personagem: `mixPoseArtwork`, `mixStudioTransforms`, `mixAppearance`, `mixEffects`, `mixStageElement` e `prepareSavedCharacterRenderer`. A mesma família de interpoladores é utilizada pelo caminho de exportação e reaproveita o compositor de personagem.

## Agendamento e degradação controlada

- O botão Play continua imediato; a interface não espera preparar 14 sprites.
- Pré-cálculo proativo do próximo boundary de personagem, quando a até 360 frames à frente do playhead; uma única janela relevante, não o projeto inteiro.
- **Primeira passagem:** calcula frames de articulação reais espaçados a cada 4 quadros (`+1, +5, +9, +13`), depois completa os restantes até 14 frames a 60 fps. Entre rasters a fila cede uma tarefa à interface.
- No Play, usa o frame Gacha exato se existir; senão o frame Gacha anterior da *mesma transição*. Se nenhum intermediário está pronto, exibe a origem autoral sem imagens fantasma. Ao chegar na key de destino, o estado final aparece normalmente.
- Um seek cancela trabalhos obsoletos, remove as identidades de transições antigas sem apagar o cache de imagens já prontas e requisita a amostra precisa no novo frame.

**Limitações:** se cada raster Gacha demorar muito, poucos ou nenhum dos 14 frames podem estar prontos a tempo e o resultado poderá parecer escalonado ou até um corte. Ainda não há garantias de 60 FPS visual nem paridade temporal com o projeto exportado; isso depende de render Gacha integral fora da thread de interface e cache de rigs reutilizáveis. Em particular, o editor usa a janela canônica de 15 frames/250 ms, enquanto exemplos do Animador Preset Rosto DEV exibem receitas de 650–900 ms e o Animador DEV suporta timelines completas; esta rodada **não importa automaticamente animações autorais salvas nesses módulos**. Para fidelidade literal às animações autorais, o formato da timeline precisa vincular/clonar as receitas/keyframes desses módulos e tratar durações diferenciadas tanto na preview quanto no export.

## Erros repetidos "Prepare resources/video-tools"

Na execução não empacotada, `resolveVideoStudioTools` só aceita FFmpeg/FFprobe preparados em `resources/video-tools` ou caminhos explícitos `GACHA_FFMPEG_PATH` e `GACHA_FFPROBE_PATH`. A pasta clonada do GitHub não contém binários grandes por definição.

- `ABRIR_DESENVOLVIMENTO.bat` passa a **perguntar**, apenas quando a dupla está ausente, se deseja instalar o pacote LGPL fixado em `resources/video-tools.manifest.json`. Não baixa nada sem aceitar o prompt nem se ambas as variáveis já estão definidas.
- O script `scripts/video-studio/prepare-ffmpeg-lgpl.ps1` valida URL/release imutável, SHA-256, restrições de licença e encoders. A etapa de instalação não modifica o perfil legado, nem acervos do usuário.
- Se as ferramentas faltarem e a opção for recusada/falhar, o serviço de preview **retorna a mídia original `gacha-video://studio/...` como fallback autorizado**, sem imprimir um stack trace de IPC por clipe. O vídeo original pode ainda falhar se o codec não for suportado por Chromium; exportação e proxy FFmpeg continuam indisponíveis até instalar os dois executáveis.
- Instalação manual imediata, a partir da raiz clonada, com o aplicativo fechado:
  `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\video-studio\prepare-ffmpeg-lgpl.ps1`.

## Verificações mínimas e faltantes

CI de Windows/Ubuntu: `test:video:next`, `test:export:synthetic`, `typecheck`, `build`, além da inspeção do launcher/manifest. Não confundir testes verdes com testes visuais reais.

Falta: validar na máquina Windows a troca de duas poses articuladas, uma transição de preset facial, sequência com 4 personagens e mídia importada, FPS real e o teste de estresse 180s; confirmar pixel parity e MP4 num projeto sintético. O renderizador inteiro ainda pode bloquear a UI momentaneamente ao preparar um rig e precisa migração supervisionada.

Não baixar bibliotecas privadas no CI; fixtures sintéticas somente.
