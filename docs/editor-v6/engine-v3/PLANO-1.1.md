---
id: V6-ENGINE-PLAN-1.1
tipo: execucao-planejada
status: proposto
branch: Dev-v3
atualizado: 2026-11-20
anterior: PLANO-1.0.md
proximo: PLANO-1.2.md
---

# Plano 1.1 — Execução incremental, artefatos e decisões

**Regra:** entregar fatias verticais verificáveis. Cada fase tem critério de entrada, saída e abandono.
Um experimento que falha é resultado válido; não expandir escopo para salvá-lo.

## F0 — Congelar referência e mapear dependências [G0]

Entrada: branch `Dev-v3` intacta e documentação disponível.
- Mapear `EditorV6ExportPanel` -> serviços/IPC -> worker -> captura -> FFmpeg -> MP4.
- Mapear `EditorV6PlaybackScene`, `resolveEditorV6SceneAtFrame`, modelos de timeline e contratos de assets.
- Identificar todos os consumidores de animação, boca, cabelo, pose, expressão, export, previews e schemas.
- Criar fixtures **sintéticas e pequenas** de personagem, fundo, pose, expressão, fala/piscada, cabelo, vídeo sobreposto, texto/alpha e áudio.
- Guardar saídas de referência controladas: dados de fixture, frames selecionados pré-encode, MP4, metadados, hashes de entradas e versões.
- Separar exemplos que ilustram comportamento correto de **bugs conhecidos**. Não transformar defeito antigo em especificação.
- Reproduzir os testes relevantes; medir fase de preparo, pintura, captura, transferência, escrita FFmpeg, encoding e finalização.
- Definir níveis de tolerância visual com imagens de referência. Atualizar apenas mediante justificativa explícita.

**Saída G0:** matriz de cobertura, baseline reproduzível, relatório do que é medido e lista de discrepâncias.
**Bloqueio:** não iniciar migração em produção sem um oráculo mínimo de export e fixture.
Artefatos sugeridos: `tests/editor-v6/engine/`, `scripts/editor-v6/engine/`; caminhos são proposta, não diretórios existentes.

## F1 — Spike do compositor offline (risco tecnológico primeiro) [G1]

- Construir um executável/harness isolado, sem alterar export padrão.
- Consumir inicialmente uma estrutura pequena de comandos: cor de fundo, imagem, crop, alpha, z-order e transformação.
- Exportar **1 frame** 1920x1080 e **5 s/150 frames** de duas imagens estáticas.
- Medir custo de decode, raster, encode, RSS/peak, transporte, buffers e tempo total.
- Repetir com grandes imagens/atlases; incluir alpha e recorte de personagem.
- Comparar Sharp/libvips vs um segundo candidato **apenas se** o primeiro não provar geometria, qualidade ou velocidade suficientes.
- Rodar em Windows x64 empacotado e em processo isolado, nunca somente no ambiente de desenvolvimento.

**Saída G1:** uma rota que emite pixels e MP4 sem `capturePage` por quadro, com teste de equivalência e perfil.
**Abandono:** se os requisitos visuais centrais não cabem no backend, não construir o resto sobre ele.
**Contenção:** ainda não existem classes genéricas de backend, engine pública nem mudança de schema.

## F2 — Contrato temporal e núcleo puro [G2]

- Criar `src/engine-v6/core/` (local sugerido) com entrada explícita `project snapshot + export options + asset refs`.
- Normalizar blocos, intervalos `[início, fim)`, fonte de personagem, prioridades, posições, curvas e eventos por ID.
- Planejar um `FramePlan` imutável: fundo, objetos, personagens, faces, camadas e recursos necessários.
- Separar `prepareJob()` de `evaluateFrame(frame)`; preparo não deve editar o projeto persistido.
- Tratar FPS da timeline (30) e saída (24/30) por tempo racional ou inteiros, sem acúmulo de drift.
- Validar `frame 0`, bordas de bloco, seek aleatório, frames de cortes e cortes Turbo.
- Construir testes de reprodutibilidade sob partições diferentes e ordem aleatória dos frames.

**Saída G2:** IR versionado e frames determinísticos para cenas estáticas, sem React, DOM, IPC ou FFmpeg no core.
**Abandono/revisão:** se o contrato precisar carregar HTML, canvas ou objeto do worker, redesenhar o limite.
**Importante:** reaproveitar resolvedores atuais somente onde comprovadamente corretos; não transportar o acoplamento junto.

## F3 — Personagens, pose e expressões [G3]

- Importar/decodificar os assets do Fabricador/Customizador **por referência**, sem duplicar fonte de verdade.
- Reproduzir snapshots estáticos e transformações antes de interpolar poses.
- Implementar animação entre blocos, pivôs, escala, flip, rotação, máscara/crops e ordem de peças.
- Reaproveitar ou recalcular atlas conforme benchmark; não presumir que bake seja sempre necessário.
- Expressão/piscada usam agenda determinística; transições não podem sumir por cache ausente.
- Testes de personagem completo, duas revisões de fonte, cache invalidado e mudanças no corte.

**Saída G3:** frames de personagem e transições equivalentes aos casos aceitos do V6.
**Bloqueio:** não avançar para cabelo quando corpo/cabeça/máscaras divergem sem explicação.

## F4 — Boca e cabelo com escolhas independentes [G4]

- Boca: estados `talk`/`talk-blink`, ciclo, duração, composição de patch, escala e limites da máscara.
- Cabelo: **não portar a implementação atual automaticamente**. Fazer A/B das alternativas de [Plano 1.2](PLANO-1.2.md).
- Preparar apenas transições/trechos onde há movimento; cena estática reutiliza estado/bitmap.
- Separar custo de simulação (posição da malha) de composição (raster e máscara), memória e recompressão.
- Testar simultaneidade: troca de pose + fala + piscada + reação do cabelo, mais 2+ personagens.
- Controlar seeds, checkpoint/seek, término da reação e equivalência ao dividir o trabalho em workers.

**Saída G4:** todas as animações completas por frame sem dependência de tempo real da UI.
**Abandono:** se um algoritmo de cabelo for caro sem qualidade suficiente, compará-lo com outro.

## F5 — Mídia, áudio e MP4 [G5]

- Integrar vídeo entre fundo e primeiro plano, inclusive sobreposições, layouts, rotação e timecodes.
- Fixar semanticamente quais clipes simultâneos são visíveis e sua ordenação; alinhar com contrato autoral, não com acidente do preview.
- Integrar áudio, gain, mute, offsets, resampling, cortes e mux. Não usar relógio HTML.
- Preservar opções de export existentes e o MP4 padrão (CPU OpenH264/H.264, AAC, resolução, FPS).
- Fazer teste completo de 24 e 30 FPS, diferentes encoders **quando disponíveis**, junções, alpha, legendas e duração.
- Verificar que quadros repetidos não requerem novo raster; FFmpeg recebe cadência/timestamps corretos.

**Saída G5:** MP4 exportável e validado fim a fim em fixture, sem Electron `capturePage` por frame.

## F6 — Performance sustentada e memória [G6]

- Usar A/B com mesmo projeto/condições: pipeline antigo como controle e motor novo como candidato.
- Otimizar etapas dominantes medidas: assets, preparo, raster, cabelo, pipe, filtro/encode, latência inicial.
- Escolher concorrência com base em memória/CPU e tempos de parede; não multiplicar workers cegamente.
- Comparar 5/40/200 s, casos estáticos, animados e com vídeo, incluindo cancelamento.
- Testar streaming e pressão de memória em projetos longos, sem manter o vídeo todo em RAM.

**Saída G6:** relatório reproduzível de tempo total, qualidade, picos de memória e custos por fase.
**Objetivo:** buscar <=90 s no corte histórico; não declarar atingido sem medição válida.

## F7 — Integração controlada e rollback [G7]

- Expor adaptador de export no domínio V6 com seleção interna `legacy | engine` em ambiente de teste.
- Criar job ID, status, progresso, cancelamento, deadlines e publicação atômica com limpeza.
- Validar entradas do IPC e caminhos de mídia; worker com permissões mínimas e assets somente leitura.
- Garantir que projeto, undo/redo, biblioteca e preview rápido não dependam do processo de export.
- Rodar bateria de regressão e verificação do aplicativo empacotado, sem reescrever a página inteira.
- Alternar padrão somente depois do gate de [Plano 1.3](PLANO-1.3.md).

**Saída G7:** export V6 usa engine nova, com fallback de desenvolvimento para investigar diferenças.

## F8 — Retirada do legado com segurança [G8]

- Comprovar ausência de consumidores do renderer antigo, IPC e caches; inventariar arquivos e testes.
- Remover caminhos obsoletos **somente após** export novo estar aprovado e instalado/testado.
- Remover flags de diagnóstico temporárias; manter fixture e contratos úteis.
- Se dados salvos mudarem, usar migração versionada, leitura de legado e backup verificável.
- Atualizar documentação do produto e padronizar ciclo de manutenção da engine.

**Saída G8:** menos dívida arquitetural e nenhum caminho de export ambíguo.

## Ordem padrão e mudança de estratégia

`F0 -> F1 -> F2 -> F3 -> F4 -> F5 -> F6 -> F7 -> F8`.
Pode haver saltos de laboratório, nunca pular gates de fidelidade/dados antes do cutover.
A cada falha: registrar hipótese, medida, decisão e próximo experimento no estado vivo, sem diário interminável.
**Continua:** [Plano 1.2 — IR e sistemas de animação](PLANO-1.2.md).
