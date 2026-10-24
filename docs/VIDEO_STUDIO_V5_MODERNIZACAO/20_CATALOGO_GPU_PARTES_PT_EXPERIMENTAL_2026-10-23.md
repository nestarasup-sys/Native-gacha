# Novo Video Studio G-V5 — primeiro pipeline real catálogo → partes GPU

## Implementação nesta rodada

O editor pode agora ativar **Camadas Gacha GPU experimentais**. O compilador obtém o Customizer salvo, resolve modelo/pose/roupas e cabelo com as fontes oficiais do Fabricator e fornece ao WebGL **texturas independentes** para o rig atrás do rosto, sobreposições do catálogo, olhos esquerdo/direito, sobrancelhas, pupilas PT esquerda/direita com recorte de olho, efeitos, detalhes, acessórios e cabelo/roupa que ficam à frente do rosto.

A nova interface não usa o antigo `VideoStudioEditor.tsx`; reutiliza **a geometria do compositor de personagens já existente** na fase de validação para não inventar coordenadas dos assets PT. `prepareSavedCharacterRenderer` expõe passes de desenho do catálogo sem serializar quadros em PNG. A montagem e o cache de cada face ficam no módulo `catalogGpuCompiler.ts`. A GPU mantém a textura de corpo ao modificar uma pupila; receitas independentes evitam invalidar a pupila oposta. Camadas faciais vazias não entram na GPU; recorte por alfa é feito apenas na compilação do estado, não a cada quadro.

**Play/seek jamais esperam o rig:** a prévia mostra imediatamente o PNG StudioDocument v1 anterior enquanto o catálogo compila; troca para texturas por parte **somente quando todas as camadas daquele quadro estão prontas**. Falta de personagem no Customizer, falta de asset ou erro de compilação continua com PNG. A opção experimental começa desligada e não altera `StudioDocument`, saves, fonte ou exportador.

## Gates pendentes para ativação padrão

- **Paridade real Windows** de pixels, proporções, recorte, roupa, cabelo, blink, boca e máscaras PT com goldens do exportador/oráculo. A composição experimental ainda não é aprovada como equivalência do renderer antigo.
- Teste multiator com 5/15/30 segundos e recursos reais (mais custo por PID, FPS apresentado, VRAM e private bytes); o gate sintético anterior não cobre catálogo real.
- Refinar preparação para evitar 10 verificações completas de componentes por expressão; isolar o raster facial pesado fora da thread da prévia. Hoje a compilação é sob demanda, mas a fonte Canvas2D ainda fica em Chromium renderer.
- Interpolação genuína de pose articulada por peça, export 1080p60 pelo mesmo compositor, decoders e mixagem externos, sincronização PTS e FFprobe continuam por fazer.

Este commit é **primeiro marco experimental do compilador**, não a conclusão dos objetivos P1–P5.
