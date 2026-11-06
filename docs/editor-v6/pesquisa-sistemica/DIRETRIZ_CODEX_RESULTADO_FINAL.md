# Diretriz de execução — concluir a refatoração fria do Editor V6

**Autorização vigente do usuário, 06/11/2026:** objetivo = **resultado final melhor**, não preservar o encoder CPU, a técnica anterior, o Chromium ou qualquer escolha de implementação. Autorizado pesquisar, implementar, testar, substituir backend, ajustar configuração padrão e refatorar o **Editor V6 + módulos que o alimentam** na branch de laboratório, com integração e testes de regressão. Não alterar instalação/perfil originais ou fazer merge na `Dev-V2` sem instrução.

## Contrato de resultado

1. **Métrica principal:** **tempo do primeiro clique em Exportar até MP4 correto e validado**, com projeto recém-aberto/importado, processo e sessão novos, caches gerados previamente vazios, inclusive preparação pré-job, render, áudio, vídeo, mux, finalização/ffprobe. Toda comparação declarar CPU/GPU/driver/versão, configuração completa e input com hash.
2. **Livre escolha tecnológica:** CPU (libx264 ou encoder atual), AMD AMF, NVIDIA NVENC, Intel QSV, Media Foundation, FFmpeg, WebCodecs com muxer, WebGL/WebGPU/Direct3D, `paint`, `capturePage`, compositor ROI/nativo, qualquer outro caminho confiável. Testar **somente candidatos compatíveis com o hardware disponível**, checando em runtime. Benchmark de mesma configuração antes/depois para diagnóstico, mais competição entre encoders/backends **como variável experimental deliberada** para escolher o melhor produto. **Não exigir CPU como saída final**, nem empatar presets de qualidade diferentes fingindo comparação equivalente.
3. **Qualidade/funções inegociáveis:** formato MP4 H.264 1080p30 salvo quando esse é o perfil esperado; contagem/timestamps/áudio/vídeo externos corretos; máscaras/alpha/camadas, rosto, boca, cabelo posterior, poses, roupas, flip, múltiplos personagens, emendas, cancelamento, projetos/IDs e segurança de dados. Encoders diferentes **não geram bytes MP4 idênticos**: verificar golden RGBA **antes** da compressão quando o render mudou e comparar **qualidade do MP4 decodificado** (cores, SSIM/PSNR/VMAF se disponível, casos de bordas/movimento) com tolerâncias explícitas e inspeção dos casos sensíveis. Manter qualidade visual perceptual e confiabilidade, sem piorar visivelmente.
4. **Compatibilidade:** autodetectar backend e driver; escolher o mais rápido comprovadamente compatível para o cenário e fallback de CPU sem corrupção/quebras. Se hardware encoding funcionar no PC de teste, ele é candidato legítimo a padrão. Não introduzir dependência NVIDIA/AMD sem fallback para outras máquinas.
5. **Frieza e disco:** permitir memoização limitada **na mesma exportação**; proibir cache persistente de quadros/MP4/atlas/rig, “warm export” ou duplicação de gigabytes para mascarar custo. Uma única cópia verificada dos assets, sem reconstruir backups de 722 MB por execução; novos perfis temporários por rodada e limpeza segura de artefatos pesados **inclusive em falha**, com diagnósticos pequenos e controle de espaço. Nunca apagar dados canônicos.
6. **Baseline e comparação:** o usuário relatou 91 s com cabelo ON, sem parâmetros originais verificáveis; não comparar diretamente esse relato. O primeiro A/B LAB (116,32 s capturePage vs 110,47 s paint) usou preset/encoder diferentes e não vale como ganho. A nova linha de base executou o comando do botão UI, projeto inteiro (2.394 frames/79,8s), 1080p30 Turbo, preset 2 posterior-only, duas lanes, áudio e processo/sessão/cache frios; diálogo humano foi substituído por destino fixo temporário. Três AMF frias: 83,18/90,12/84,83s (mediana 84,83); três CPU/libx264: 85,20/82,44/81,47s (mediana 82,44). O perfil CPU agora realmente usa libx264 `veryfast`; neste ambiente Ryzen 5 4600G + RX 7600, sua mediana foi 2,8% menor. O tempo relatado de 91s ainda não foi reproduzido com a configuração original.
7. **Pesquisa+execução contínuas:** seguir ciclos curtos `medir gargalo → pesquisar API/codepaths → teste de regressão → implementação pequena → medir resultado frio → manter/reverter → atualizar documentos/commit`. Priorizar por **ganho real / risco / esforço**, não ordem numérica de pesquisas. Não parar após primeiro spike. Revisar módulos compartilhados (Fabricador, Customizador, Studio, bibliotecas, persistência, UI/preview), sem reescrever toda a tecnologia se uma mudança localizada bastar.
8. **Critério de encerramento:** entregar app LAB funcional, exportação fria mais rápida que baseline equivalível, desempenho de UI sem regressões, builds/testes relevantes passando, qualidade/áudio e múltiplos atores comparados, fallback operacional, relatório final com tempos frios (ao menos 3 corridas para candidatos finais), memória/pico de disco, ganhos aceitos e recusados, restrições e próximos itens não críticos. **Se uma meta não puder ser atingida, registrar o bloqueio e o melhor estado verificado — nunca declarar “concluído” por número de commits.**

## Ordem imediata sugerida

**P0 — fechar metodologia e risco:** tornar `paint-event` opt-in/fallback até paridade e stress completo; corrigir métricas de espera de paint (não contabilizar `capturePageMs=0` como “captura grátis”); validar token, timeouts/callbacks, alpha, vídeo layered, cancelamento, build; alinhar benchmark com UI e permitir modo alternativo de encoder como candidato.

**P1 — perfil causal:** particionar a diferença cabelo ON/OFF entre preparação pré-job, mouth/face, render hair em repouso/reação, readback e encode. Testar 0/1/várias trocas de pose e identificar operações full-rig refazidas sem necessidade.

**P2 — melhoria de maior retorno:** prototipar ROI/camadas e pré-render **em memória somente se o perfil justificar**; em paralelo comparar opções de encoder/GPU/FFmpeg de modo justo, com qualidade e fallback. Priorizar o que reduzir o tempo total.

**P3 — finalização integrada:** expandir para preview/timeline, compartilhamento de assets, recuperação, build portátil e bugs verificados; fechar matriz/ADRs, validar projeto real, publicar **somente código e Markdown** na `refactor/editor-v6-cold-lab` (não assets, perfis, mídia ou métricas com paths privados). Não mesclar na `Dev-V2`.

**Estado inicial desta diretriz:** política revisada e documentação atualizada; nenhuma mudança de código ou benchmark foi feita nesta revisão documental.

## Evidência de execução — 06/11/2026

### Atualização após equivalência UI e escolha do preset — 06/11/2026

- Hair OFF agora usa o comando do renderer/IPC da UI, processo/sessão/perfil novos e as mesmas 2.394 imagens, áudio, 1080p30 e duas lanes do cabelo ON.
- ON `veryfast` 83,63/84,27/85,12s; OFF `veryfast` 70,55/73,53/75,90s. A diferença inclui preparo e composição do cabelo.
- Preset x264 `ultrafast`, 12Mbps: ON 79,63/81,43/80,11s (mediana 80,11; −4,9% vs ON `veryfast`); OFF 71,13/68,68/68,83s (mediana 68,83; −6,4% vs OFF `veryfast`).
- Full decode ON SSIM 0,997842/PSNR 52,763dB; OFF SSIM 0,997868/52,827dB. PCM de áudio decodificado idêntico em todos os pares; zero escrita de cache em cada export.
- `ultrafast` agora é o default de libx264 no LAB a 12Mbps. `paint-event`, outro projeto/hardware e golden RGBA integral continuam pendentes; o app está funcional para avaliação, mas a refatoração global segue em andamento.

- Perfil UI ON CPU/libx264 inicial: 82,44s mediana (3 corridas). Perfil Auto/AMF: 84,83s (3 corridas). MP4s validaram 2.394 quadros/1080p30/áudio; amostra CPU↔AMF de 150 quadros: SSIM 0,996750, PSNR 50,710dB, AAC PCM decodificado idêntico.
- Controle OFF 3×: mediana 74,76s, mas benchmark usa runner direto e omite a camada de comando UI do ON. Resultado não prova diferença causal pura.
- Removida leitura/escrita persistente de atlases de movimento. Cada job tem escopo aleatório na chave de memória, isolado de exports prévios; deduplicação dentro da preparação permanece e entradas são liberadas ao sair. Três exports finais confirmaram 0 bytes de disco.
- Alpha crop: etapa `measureFaceModeCrop` mediana agregada 4,38→3,72s em três corridas por grupo. Três exports completos após a alteração: 80,94/87,85/82,13s, mediana 82,13s. A baseline anterior era 82,44s e a variação total não permite afirmar ganho ponta a ponta; o ganho observado é local (~15% na etapa).
- Verificações: integração Windows, suíte completa, Electron hair/scene offscreen, typecheck, auditoria de arquitetura e build aprovados; detalhes no [progresso](PROGRESSO_E_RESULTADOS.md).

**Limite para declarar resultado final:** ainda faltam A/B intercalado do scan e encoder, prova de golden RGBA completa, validação ampliada de áudio/vídeo/cancelamento, outros cenários/projetos e avaliação integrada de timeline/preview. O LAB está funcional para avaliação, mas esta evidência não encerra a refatoração global.
