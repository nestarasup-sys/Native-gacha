# Editor V6 — plano de aceleração máxima do export

Data: 30/10/2026. Base de análise: branch `Dev-V2`, commit `b79aaaf`.
Estado: planejamento; as etapas abaixo ainda não foram implementadas por este documento.

## Objetivo

Reduzir o tempo entre clicar em Exportar e receber o MP4 validado, incluindo preparação, renderização, codificação, áudio e publicação. Buscar o maior ganho comprovado no computador disponível, preservando resolução, 30 FPS, movimentos, expressões, roupas, transparências, ordem das camadas e sincronização de áudio.

A prévia continua com o comportamento atual: a presença das animações na exportação não exige habilitá-las na prévia.

Não prometer um multiplicador antes das medições. A duração total e a estabilidade determinam se uma otimização entra em produção.

## Ponto de partida confirmado no código

| Área | Recursos existentes | Oportunidade a investigar |
| --- | --- | --- |
| Preparação de poses | `prepareMotions.ts` agrupa transições por chave e reaproveita resultados do projeto | Evitar buscas completas repetidas e medir o custo de anexar cada resultado ao documento |
| Serviço de movimento | `motionIpc.ts` possui cache em memória/disco, janelas reutilizadas e concorrência configurável | Medir acertos reais, invalidação, tamanho e contenção antes de aumentar concorrência |
| Renderização | `exportWorker.tsx` mantém imagens preparadas e chaves visuais | Reduzir resolução de cena, trabalho React e preparação repetida por quadro |
| Captura | Export possui reaproveitamento de bitmap e tempos por fase | Identificar quando captura, IPC, cópia de memória ou espera do Chromium dominam |
| Paralelismo | Turbo usa até dois trechos; fallback usa um renderizador | Distribuir trabalho pelo custo e testar limites de CPU, GPU e memória |
| Codificação | Seleção automática NVENC/QSV/AMF com OpenH264 de recuperação | Medir o caminho completo; encoder rápido pode continuar esperando quadros |
| Finalização | Concatenação com cópia de vídeo, mixagem única, validação e publicação protegida | Medir composição de vídeos, áudio, emendas e tempo de finalização separadamente |

Referências: [exportação](EXPORTACAO.md), [preparação de transições](PREPARACAO_TRANSICOES.md), [arquitetura](ARQUITETURA_E_INTEGRACAO.md) e [testes offscreen](TESTES_DE_ESTRESSE_OFFSCREEN.md). Estes documentos continuam sendo a referência dos contratos existentes.

## 1. Estabelecer uma medição confiável — prioridade máxima

- Separar tempo total em leitura/validação, preparação de poses, preparação facial, abertura de workers, renderização/codificação, mixagem/junção, validação e publicação.
- Aproveitar `motionPreparation` e `frameTiming` dos relatórios existentes. Acrescentar métricas compatíveis quando necessário, sem somar tempos concorrentes como se fossem tempo total.
- Registrar acertos e falhas dos caches no serviço, bytes carregados, pico de memória e quantidade de workers/processos. `requested` na preparação não equivale a rasterização: pode recuperar cache do serviço.
- Identificar o caminho que limita o término do export. Ordenar as próximas mudanças pelo tempo recuperável nesse caminho.
- Registrar máquina, versão do app, encoder, resolução, intervalo, opções, estado dos caches e duração da mídia para cada comparação.

**Entrega:** tabela de referência e três maiores custos, com evidência. Nenhum ganho é declarado usando apenas a velocidade do encoder ou uma fixture pequena.

## 2. Remover trabalho repetido da preparação — prioridade alta

- Construir índices de assets, personagens, blocos e transições uma vez por preparação; evitar percorrer toda a timeline dentro de cada grupo.
- Investigar aplicação dos resultados em lote para reduzir cópias repetidas do documento, preservando IDs, anexos e semântica das funções compartilhadas.
- Preparar somente estados realmente usados e visíveis no intervalo exportado, respeitando estados herdados de blocos anteriores ao início do intervalo.
- Compartilhar uma tarefa em andamento quando a mesma chave for pedida novamente. Cancelar um consumidor não pode interromper trabalho ainda necessário por outro.
- Medir preparação de boca por trecho/lote e reaproveitar estados equivalentes quando a chave incluir todas as dependências visuais.

**Aceite:** pedidos e trabalho efetivo acompanham combinações únicas válidas; a saída permanece equivalente em intervalos completos e parciais.

## 3. Tornar os caches confiáveis e úteis — prioridade alta

- Auditar as chaves existentes antes de criar outro cache. Considerar revisão/conteúdo da fonte, personagem, rig, roupa, pose, expressão, parâmetros e versão do algoritmo conforme cada resultado realmente depende deles.
- Editar a folha original ou uma pose deve invalidar os resultados dependentes. Não aceitar uma imagem antiga só porque seu ID continua igual.
- Manter cache descartável, com limite em bytes, descarte por uso e recuperação diante de entrada incompleta/corrompida.
- Preservar separação entre catálogo-fonte, personagem e documento do Editor V6. Cache não vira cópia permanente do catálogo nem reescreve projetos.
- Reavaliar preparação antecipada ociosa já existente: priorizar estados úteis, suspender durante interação e evitar disputar recursos com export ativo.

**Aceite:** export aquecido evita preparação desnecessária; editar uma dependência atualiza a imagem correta; falha de cache causa reconstrução segura.

## 4. Reduzir o custo de cada quadro — prioridade alta

- Usar os tempos de resolução de cena, preparação de assets, commit React, espera de desenho, captura e IPC para escolher o primeiro alvo.
- Investigar índices temporais para localizar blocos ativos sem varrer a timeline inteira a cada quadro, preservando sobreposições e limites de blocos.
- Reutilizar composição estática, geometria e imagens quando suas dependências não mudarem. Separar camadas estáticas e animadas apenas se a medição justificar o custo adicional.
- Auditar as chaves visuais: incluir atlas, recorte, boca, piscar, pose, transformação e ordem de camadas. Uma chave incompleta pode congelar animações.
- Reaproveitar captura estática mantendo todos os quadros devidos no stream de 30 FPS. Vídeo e áudio continuam avançando mesmo quando um bitmap de personagem se repete.
- Reduzir alocações e cópias BGRA no caminho worker → main → FFmpeg quando as medições apontarem esse custo. Preservar tamanho, stride, alpha e ciclo de vida dos buffers.
- Só trocar esperas de desenho por outro mecanismo após demonstrar captura correta de SVG, fontes, imagens e transparências em Chromium.

**Aceite:** diminuir o custo da fase dominante sem quadros antigos, cortes de camada ou divergência visual.

## 5. Usar melhor CPU, GPU e memória — prioridade após reduzir desperdício

- Comparar um e dois workers com o mesmo projeto. Testar quantidades maiores apenas como experimento limitado por recursos, sem aumentar o padrão automaticamente.
- Investigar fila dinâmica de partes: partes desiguais em custo não devem deixar um worker ocioso enquanto outro termina sozinho.
- Equilibrar tamanho dos trechos, custo de abertura e reutilização de workers. Mais partes também aumentam preparação, emendas e validações.
- Respeitar pressão de memória e limites de sessões do encoder. Limitar tanto tarefas quanto bytes em trânsito; manter contrapressão na escrita do FFmpeg.
- Comparar encoder por hardware e CPU no tempo total e na qualidade. Alterações de parâmetros precisam preservar compatibilidade entre partes.
- Manter recuperação previsível e cancelamento completo. Reaproveitar partes após falha só pode ser proposto com validação de integridade e compatibilidade demonstrada.

**Aceite:** escolher a configuração com menor tempo total estável; não selecionar a que apenas usa mais CPU/GPU.

## 6. Experimentos estruturais — somente se os custos restantes justificarem

| Experimento | Quando investigar | Condição para adotar |
| --- | --- | --- |
| Compositor dedicado Canvas/WebGL | DOM/React ou captura dominam após as otimizações anteriores | Paridade de roupas, máscaras, texto, efeitos e camadas; manter contratos compartilhados |
| Transferência de frames em lotes | IPC domina e há memória disponível | Fila limitada, cancelamento imediato e nenhuma perda de quadros |
| Caminho de captura/codificação com menos cópias | Cópias BGRA dominam e a plataforma permite | Compatibilidade comprovada com Electron e fallback funcional |
| Cache de trechos renderizados | Reexports parciais são frequentes e predominantes | Dependências completas, encoder compatível, limites de disco e publicação segura |

Cada experimento precisa de comparação isolada e possibilidade de remoção. Evitar substituir o renderizador inteiro sem evidência de que ele limita o export.

## Matriz de validação e desempenho

Usar fixtures sintéticas em perfil isolado. O projeto real de estresse pode ser uma medição adicional sobre cópia preservada; não serve como área destrutiva de testes.

| Cenário | O que conferir |
| --- | --- |
| Cena estática longa | Reutilização de bitmap sem reduzir duração ou contagem de quadros |
| Muitas poses e roupas | Preparação por combinação, vínculos e alinhamento corretos |
| Fala, pensamento, expressões e presets PT | Variações visuais, boca, piscar e transições sem congelamentos |
| Timeline desordenada de 3–4 minutos | Sobreposições, memória, distribuição de carga e tempo total |
| Vídeos e áudios sobrepostos | Recortes, ganho, silêncio, composição e sincronização |
| Export parcial e cortes durante movimento | Estado anterior ao início e continuidade nas emendas |
| Fonte editada após cache aquecido | Invalidação correta; nenhuma imagem antiga |
| Cancelamento, falha de worker/encoder | Processos liberados, destino anterior preservado e recuperação |

Para cada candidato: comparar referência e mudança no mesmo ambiente, alternando a ordem, com pelo menos três rodadas por condição relevante. Separar cache frio, aquecido e reabertura do app; nunca limpar dados pessoais para simular cache frio.

Registrar mediana, dispersão, memória, quadros renderizados/reutilizados e falhas. Usar ganho `tempo de referência / tempo novo` e fator `tempo de export / duração do vídeo`; fator menor indica export mais rápido. Não misturar resoluções, opções ou qualidade entre variantes.

Validar contagem de quadros, 30 FPS, resolução, duração, áudio e emendas com os mecanismos existentes. Conferir amostras visuais nos pontos difíceis; hash do MP4 comprimido não demonstra equivalência visual. Testes sonoros automatizados ficam silenciosos; reprodução no PC somente quando solicitada, com volume baixo.

## Sequência de entregas

1. **Diagnóstico:** referência reproduzível, custos dominantes e métricas faltantes.
2. **Preparação:** índices, aplicação em lote e eliminação de pedidos repetidos conforme evidência.
3. **Cache:** invalidação auditada, limites e preparação antecipada útil.
4. **Quadros:** reduzir resolução de cena, commits, captura ou cópias conforme o maior custo restante.
5. **Agendamento e encoder:** testar distribuição de partes e limites de concorrência.
6. **Experimentos estruturais:** executar somente os que atacarem gargalos comprovados.

Cada entrega deve conter diff pequeno, verificação focada, comparação antes/depois, documentação dos contratos alterados e commit local. Executar typecheck, auditoria de arquitetura, testes relevantes do Editor V6 e build quando a implementação atingir esses caminhos. Não rodar export pesado para validar uma alteração apenas documental.

## Conclusão de cada etapa

- [ ] Ganho no tempo total reproduzido ou hipótese descartada com registro.
- [ ] Qualidade, movimentos, presets e áudio preservados.
- [ ] Pico de memória e consumo de disco conhecidos e limitados.
- [ ] Cache atualizado corretamente após edição de fontes.
- [ ] Cancelamento, fallback e destino existente protegidos.
- [ ] Dados originais preservados e commit local revisado.

O plano termina quando os custos dominantes foram tratados ou possuem limite técnico medido, e novas tentativas não apresentam ganho repetível sem comprometer qualidade ou estabilidade. “Aceleração máxima” é uma busca orientada por essas medições, não uma promessa de velocidade ilimitada.
