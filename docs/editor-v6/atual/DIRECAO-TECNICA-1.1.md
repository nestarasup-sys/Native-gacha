# Direção técnica 1.1 — Editor V6

**Recomendação de 19/11/2026 · `Dev-V2` · código analisado em `ae1a2013`.**

## A decisão

**Compartilhar as regras da cena, manter os motores especializados e refatorar primeiro a fronteira entre o compositor do export e o FFmpeg.** Faça a próxima mudança como um experimento isolado na exportação. Uma reestruturação do editor inteiro teria custo alto e pouca relação demonstrada com o tempo do MP4.

O V6 já usa o mesmo resolvedor para descobrir o que existe em cada quadro na edição, na reprodução e na exportação. O ponto de extensão é essa cena resolvida. Pose, expressão, piscada, boca e cabelo têm ritmos e necessidades diferentes. Mantê-los como módulos com responsabilidades claras permite corrigir um deles e comparar a imagem final. A prévia de edição, a reprodução e o MP4 podem aplicar políticas distintas, como fazem hoje com a reação do cabelo.

| Área | Decisão recomendada agora |
| --- | --- |
| Timeline, cortes e ordenação | Reaproveitar `resolveEditorV6SceneAtFrame` como fonte das regras comuns. Alterar o contrato apenas quando um consumidor real precisar de dados que ele ainda não oferece. |
| Pose e expressão | Manter o planejamento da transição, a interpolação e o preparo do atlas no fluxo existente. Tratar defeitos de escala ou enquadramento com fixtures de poses e expressões, em mudanças próprias. |
| Piscadas, boca e cabelo | Manter agendamento facial, ciclo de boca e física de cabelo como módulos distintos. Compor seus resultados no mesmo quadro e verificar casos de sobreposição, como fala com piscada e troca de pose. |
| Prévia e MP4 | Compartilhar significado de quadro, geometria e ordem visual. Preservar a interação da prévia e a renderização determinística da exportação. |
| Fontes e projeto | Manter o Fabricador como dono do catálogo, o Customizador como dono da aparência da instância e o V6 como dono da timeline e dos snapshots que o projeto consome. Preservar IDs, esquema salvo e canais existentes nesta rodada. |
| C++ | Manter como opção experimental. Os ensaios anteriores pararam no limite de 512 MiB de assets antes de produzir vídeo. Avaliar esse caminho depois de isolar o custo do compositor e demonstrar uso de memória limitado e paridade visual numa fixture. |

[Resolvedor da cena](../../../src/shared/editorV6TimelineScene.ts) · [Prévia](../../../src/renderer/src/features/editorV6/EditorV6PlaybackScene.tsx) · [Composição no worker](../../../src/renderer/src/features/editorV6/exportWorkerHairRuntime.ts) · [Histórico dos ensaios C++](PESQUISA-1.1.md#rodada-de-partes-e-renderização-c)

## O que o corte de 200 segundos já decidiu

- O corte é `[0, 6000)` de um projeto maior. O perfil padrão, com todas as animações, 1080p/30, OpenH264 e quatro workers, concluiu em **163,760 s do clique ao MP4 validado**. A renderização levou **109,489 s** e o preparo global **36,806 s**. Esses valores pertencem ao relatório histórico. O commit atual já tem um ajuste posterior na amplitude da boca e precisa de controle próprio para um novo A/B.
- Para chegar a **90 s** faltam **73,760 s**, aproximadamente **45%** do total da referência. Se as outras fases mantivessem seus tempos, a renderização teria cerca de **35,7 s** de orçamento. É uma conta para dimensionar a mudança, sem previsão de ganho. Mesmo zerar só o preparo global deixaria cerca de **127 s**.
- A captura serial das camadas já trouxe **9,25%** no A/B de 200 s. Na referência padrão, **4.346 de 6.000 quadros** reaproveitaram o bitmap anterior, mas o pipeline envia um quadro bruto ao FFmpeg a cada instante, inclusive nas repetições. Em trechos com vídeo, a entrada carrega fundo e primeiro plano juntos a 1920×2160 em BGRA. O FFmpeg separa as camadas, coloca o vídeo entre elas e codifica. Esse contrato explica por que reaproveitar o desenho poupa captura sem poupar a mesma quantidade de bytes no pipe.
- `paint-event`, espera extra de pintura, transporte alternativo por evento, PNG por quadro e pular chamadas para quadros repetidos já foram avaliados. Os resultados registrados favorecem atacar o custo por quadro ou os bytes que atravessam o pipe. Tempos somados de workers se sobrepõem. Use o tempo de parede para decidir.

[Pesquisa e medições](PESQUISA-1.1.md) · [Registro de execução](EXECUCAO-1.1.md) · [Escrita dos quadros](../../../electron/domains/editorV6/exportFramePipeline.ts) · [Composição no FFmpeg](../../../electron/domains/editorV6/exportVideoComposition.ts)

## Próxima tarefa que eu abriria

**Medir o teto de ganho ao tirar o fundo estático do fluxo BGRA por quadro.** Em trechos com vídeo em que o fundo permanece igual, o candidato é entregar essa imagem ao FFmpeg uma vez e repetir sua apresentação no próprio filtro. Continuar enviando o primeiro plano a cada quadro e manter a ordem **fundo → vídeo → primeiro plano**. Isso testa uma mudança no volume de entrada do FFmpeg. A tentativa anterior com buffers de camadas separados continuava transportando as duas camadas e testava outro custo.

1. **A/B sintético no FFmpeg.** Use o grafo atual como controle. Modele trechos com vídeo, fundo constante e primeiro plano com transparência, incluindo quadros únicos e repetidos. Use os mesmos pixels e o mesmo encoder nos dois lados. No candidato, envie o fundo uma vez para o grafo e use o pipe para o primeiro plano. Repita com fundo trocando perto de uma emenda para testar quando o trecho precisa voltar ao caminho padrão ou receber a imagem correta. Registre quantos quadros seriam elegíveis no perfil de referência com um contador no próximo benchmark, sem presumir cobertura a partir da contagem de quadros reaproveitados.
2. **Verifique se o ganho aparece no tempo de parede.** Compare bytes brutos enviados, tempo de streaming, espera do pipe e memória. Compare também os pixels antes da codificação e os quadros decodificados conforme o protocolo atual. Se o ganho estiver dentro da variação, ou a cobertura de fundos constantes for baixa, encerre esse candidato. Use o mesmo laboratório com vídeo e sem vídeo para decidir se vale atacar captura ou o custo de filtro e codificação.
3. **Integre só o caso simples se o A/B justificar.** Use os contratos existentes de plano de vídeo, captura e pipeline. O caminho padrão atende trechos fora do caso elegível. Teste a primeira e a última imagem de cada parte e mudanças de fundo, além de cancelamento, falha e limpeza. A decisão de tornar o caminho padrão vem depois da comparação completa.
4. **Valide no corte conhecido.** Comece com um A/B curto e use 200 s na cópia já autorizada se houver ganho repetível. Gere um controle com o mesmo código de partida, preset de cabelo, amplitude da boca, intervalo, resolução, FPS, encoder e número efetivo de workers. Compare o clique→MP4 validado, H.264/AAC, 6.000 quadros, sincronismo, emendas, qualidade e memória. Verifique também 24 FPS na fixture se o candidato mudar timestamps. Reserve o projeto inteiro de 12 minutos para verificar escala e estabilidade depois do corte de referência. O tempo dos primeiros 200 s não permite projetar com confiança o restante do projeto.

**Regra para a próxima decisão.** Se o pipe e a composição do vídeo forem o custo que cede no A/B, continue reduzindo dados enviados por trecho. Se o custo persistir sobretudo na captura e no retorno do quadro, compare uma prova de conceito de compositor alternativo consumindo a cena já resolvida e entregando os mesmos pixels. Se a nova medição mostrar que o preparo global passou a dominar, investigue as transições por revisão e por estado repetido dentro do job. Cada frente tem um teste e um critério de abandono antes de ganhar uma abstração compartilhada.

[Protocolo de comparação e aceite](TESTES-1.1.md) · [Escopo autorizado para o corte real](EXECUCAO-1.1.md#autorização-e-meta)
