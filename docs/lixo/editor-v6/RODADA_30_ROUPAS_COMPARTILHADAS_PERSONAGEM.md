# Rodada 30 — Pintura de roupas única para variantes normal/sem cabelo
**Data:** 04/11/2026 · **Branch:** Dev-V2 · **Etapa integrada:** reaproveitamento da pintura de roupa da mesma pose.

Na preparação de cada personagem+pose, `prepareSavedCharacterRenderer` era chamado duas vezes (normal e sem cabelo). Embora a R22 já compartilhasse o manifesto de peças, cada renderizador chamava `renderWardrobeOverlayCanvases` para redesenhar todas as roupas, inclusive PNGs tingidos e posicionamento. A R30 cria `GachaPreparedWardrobePair` exclusivamente para os dois renderizadores da **mesma pose**; ambos aguardam a mesma pintura de roupa.

Cada renderer continua compondo sua própria imagem do corpo, seu rosto e sua camada dianteira, sem compartilhar Canvas dinâmico do personagem. A fonte de roupas é somente lida por `prepareGachaStaticLayers` e deixa de ser necessária depois de compor os rigs. O pair é limpo depois de ambos terminarem. Não compartilha materiais entre personagens, poses ou exportações.

## Limitação explícita
**Os dois renderizadores ainda existem.** Uma verdadeira saída dual de personagem com somente um renderer, separando Posterior + Traseiro + rosto/roupas, continua sendo uma mudança de arquitetura de alto risco que requer paridade estrita nos 7 samples e 30 frames diferentes. Não foi forçada na produção sem esse gate. O objetivo desta etapa é eliminar uma pintura duplicada relevante e criar um contrato de compartilhamento seguro.

## Gates
Testes para concorrência, falhas, independência entre poses e exportações; Windows Server x64 CI de TypeScript/Editor V6/offscreen e teste no Windows 11 x64 com Preset 2 real. Medir `prepareCharacterRenderers` de R27 antes/depois; não inventar segundos.