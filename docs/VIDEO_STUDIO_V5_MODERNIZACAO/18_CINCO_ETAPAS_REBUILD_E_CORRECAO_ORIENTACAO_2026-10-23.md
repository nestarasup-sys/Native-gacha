# Video Studio G-V5 — cinco etapas incrementais do novo motor (Windows)

**Branch exclusiva:** `feature/model-source-editor`, PR #5 draft. **Persistência:** `StudioDocument v1` sem migração/reescrita dos projetos pessoais.

## Etapas desta rodada

1. **Correção da inversão vertical:** textura de origem HTML usa primeira linha em v=0, `UNPACK_FLIP_Y_WEBGL=false` e o shader agora associa topo de palco ao topo da imagem. A suíte Windows adiciona oráculo em Chromium/Electron de quadrantes assimétricos **vermelho acima, azul abaixo**, capturados via CDP. A aprovação depende da execução do workflow, não de inferência pelo código.
2. **Máscaras Gacha na GPU:** `GachaGpuLayer.mask` permite textura alfa independente por olho/pupila, com duas texturas simultâneas e identidades/caches isolados; orçamento LRU protege texturas ainda utilizadas no quadro. A infraestrutura **não é o catálogo PT compilado**: faltam máscaras reais, olhos esquerdo/direito e golden normal/PT.
3. **Edição de personagem na nova UI:** controles de X/Y/rotação/escala/espelho alteram apenas `characterTransforms` e o elemento visível de maneira imutável; Undo/Redo existente, bloqueios de faixa, preservar `characterBases`, poses, roupas e PT. Não altera arquivos salvos até o usuário escolher Salvar cópia.
4. **Volume por vídeo:** preview aplica os ganhos do `videoAudioOutput` compartilhado, respeitando volume/mudo por projeto/clipe e escolhendo apenas um clip audível como relógio master. Ainda não há mixer multifaixa com áudio de dois vídeos simultâneos.
5. **Gate Windows curto, sem inventar FPS:** o smoke Electron agora roda uma composição **sintética** de quatro atores (300 quadros, 5 segundos e duas chaves visuais por ator), registra quadros efetivamente apresentados, pulados e estimativa de texturas GPU. Usa unicamente sandbox DEV AI temporária. **Não mede VRAM real nem equivale ao stress do projeto de 180s**.

## Próximos gates inegociáveis

O real compilador GPU do catálogo (pose/corpo/vestes/cabelos/normal/PT/pupilas independentes/máscaras/efeitos), golden real de um ator Windows, depois quatro atores 5/15/30 s com RAM+VRAM e FPS reais, decoders em processos externos, mixagem AV PTS, export MP4 1080p60 compartilhado com SceneEvaluator/FFprobe. Nada disso deve ser declarado concluído pelas cinco etapas acima.

A suíte de imagens vermelha/azul é um oráculo de **orientação**; não substitui validação facial, de export ou do cache em carga real.
