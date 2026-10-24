# Rebuild G-V5: transições visíveis de snapshots na GPU — 23/10/2026

## Entrega parcial verificável

- O SceneEvaluator absoluto já fornece `character.transition` com o progresso suavizado a 60 fps.
- O preview reconstruído agora usa `planSnapshotSprites` para compor **somente o quadro atual**: duas texturas WebGL persistentes se as imagens de origem e destino diferirem, uma textura se forem iguais.
- Interpola posição, escala de personagem e rotação pelo mesmo `mixStageElement` compartilhado com o exportador; aplica `stageTransform` após a interpolação.
- Mantém ordem de camadas, cancelamento de seeks, memo limitada de imagens e limite de VRAM; sem serialização PNG por quadro, sem escrita nos projetos originais.
- Teste dedicado cobre quadro intermediário, geometria, flip, fallback de ausência de imagem, estágio e conservação das entradas. As verificações de TypeScript, Windows e UI dependem dos workflows do commit.

## Escopo propositalmente NÃO concluído

Essa transição faz crossfade de **imagens completas salvas**, não uma interpolação exata das partes articuladas ou dos pixels faciais. Piscada, fala, efeitos, máscaras e **pupilas PT esquerda/direita independentes** ainda precisam do compilador de sprites do catálogo e de golden visual Windows. A prévia de mídia ainda usa HTMLVideoElement com relógio em utilityProcess, sem decoder isolado completo; export MP4 integrado ao novo motor e stress real de quatro personagens também não estão liberados.

## Retenção de texturas de vídeo

O cache WebGL passou a diferenciar atualização de pixels de vídeo (\`texSubImage2D\`) de realocação de armazenamento (\`texImage2D\`). Atualização com dimensões estáveis não duplica o primeiro upload; mudança de resolução invalida só a textura correspondente e corrige o orçamento de bytes. Testes do WebGL mock cobrem as duas operações; métricas reais de GPU/VRAM no Windows permanecem pendentes.
