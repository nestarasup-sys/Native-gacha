# Prompt de continuidade — Editor V6

Continue a meta de exportar 200 s/6.000 quadros em até 90 s sem reduzir qualidade, áudio, resolução, quadros, emendas ou animações. Use o export padrão da interface com simplificação desmarcada, Preset 2 e CPU H.264 (`libopenh264`). Não executar nem testar renderizador C++.

A rodada 1.7 não promoveu código: A1 divergiu em geometria; A2 não demonstrou redundância no mesmo job; B1 piorou; B2 não tem estimador causal; C teve ganho mínimo pareado 1,44%, abaixo do gate autorizado de 2%. O baseline de produção continua a Execução 1.5, mediana 158,484 s. Não iniciar série integral para candidato que falhou gate curto.

Próxima prioridade: reduzir custo sustentado do renderer/FFmpeg de vídeo com hipótese apoiada por metadados e medição de pipeline. Compare pixels/PTS e contabilize preparação, captura, render, encode, RSS e qualidade. Não reabra candidatos rejeitados sem evidência nova. Veja [README](README.md), [Execução 1.7](EXECUCAO-1.7.md), [Experimentos](EXPERIMENTOS.md), [Arquivo preservado](ARQUIVO-PRESERVADO-1.7.md) e [Portão de exclusão](LISTA-MANUAL-LIXO-1.7.md).
