# Animações de pose e expressão — Editor V6

## Uso

Cada personagem mantém sua faixa e seus blocos estáticos. Quando pose ou expressão muda no próximo bloco, o V6 antecipa a transição em 250 ms e termina no início exato desse bloco. O primeiro bloco não tem entrada automática. Mudanças só de posição, piscar ou talk não criam essa transição.

O botão ◆/◇ na faixa liga/desliga as animações daquele personagem. No Inspector do bloco de destino, “Animar entrada (250 ms antes)” controla a fronteira individual. A faixa deve estar desbloqueada. A marca amarela indica o intervalo antecipado. Em períodos mais curtos, a transição usa apenas o tempo disponível desde o bloco anterior.

A preparação acontece automaticamente depois de editar. O aviso mostra andamento ou erro e permite tentar novamente. Play e exportação aguardam as transições necessárias; desativar a animação permite um corte estático.

## Motor e desempenho

O contrato e agendamento ficam em `src/shared/editorV6Motion.ts`. A 30 FPS, 250 ms equivalem a 7,5 quadros lógicos; só os sete quadros inteiros internos são amostrados. O estado final pertence ao bloco seguinte.

`editorV6MotionInterpolation.ts` interpola peças, tamanhos, pivôs explícitos, ângulos pelo caminho mais curto, face e efeitos com smoothstep. Catálogos faciais fornecem as calibrações reais. Desenhos/seleções discretas mudam no meio, sem dissolução do personagem inteiro. Rigs incompatíveis produzem erro explícito.

`bakeMotion.ts` usa o compositor canônico dedicado ao V6. Para expressão com pose fixa, um único rig é preparado; para mudanças corporais, os rigs intermediários são liberados após o desenho. Leituras de fontes e materiais são reutilizadas dentro do trabalho.

`motionIpc.ts` mantém fila serial, janela oculta e cancelamento. O preload expõe apenas leituras necessárias e canais do preparador. Deve permanecer autocontido: sandboxed preloads não podem importar chunks por require relativo. O teste de exportação verifica isso em Electron real.

Os intermediários são guardados em um atlas PNG de até aproximadamente 8 MP, com até sete recortes. A interface mantém cache LRU limitado a oito resultados/24 MB de strings; o documento guarda os atlas referenciados para reabrir e exportar sem consultar o Fabricador novamente. A resolução por quadro só escolhe um recorte indexado e o SceneSurface o desenha.

A chave inclui estados visuais e geometria dos extremos. Edições incompatíveis invalidam o atlas; resultados atrasados não substituem revisões atuais. O pruning remove imagens intermediárias sem referência e mantém snapshots do histórico imutáveis. Mover uma transição sem alterar seus intermediários permite reutilizar o mesmo atlas.

## Exportação

Prévia e exportação resolvem o mesmo estado e usam SceneSurface. O recorte participa da chave visual, impedindo reutilizar um quadro parado durante a animação. Cada parte Turbo recebe o projeto completo e pode começar no meio de uma transição. O main também rejeita exportação com atlas pendentes no intervalo escolhido.

## Validação e limites

Ver [RETOMAR_ANIMACOES.md](RETOMAR_ANIMACOES.md) para comandos e cobertura. As verificações reais usam fontes sintéticas e não substituem revisão artística de todas as roupas/poses reais. Não há promessa de velocidade fixa nem solver completo de cinemática inversa; rigs muito diferentes precisam de revisão ou corte.
