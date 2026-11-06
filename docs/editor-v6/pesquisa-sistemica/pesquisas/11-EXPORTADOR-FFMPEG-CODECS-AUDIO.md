# Pesquisa 11 — FFmpeg/ffprobe: raw BGRA, H.264, Turbo, áudio e validação MP4

**Estado:** PESQUISADA EM CÓDIGO E DOCUMENTAÇÃO PRIMÁRIA · RUNTIME/TESTES NÃO EXECUTADOS.
**Data:** 06/11/2026. **Base estática:** Dev-V2 (commit `5166de7`, antes dos documentos deste Grupo A). Revalidar HEAD e working tree local antes de implementar.

## Questão e critério de saída

O que custa tempo entre frame pronto e MP4 final validado? Quais filtros e codecs são realmente usados? Como comparar mudanças de encoder sem mascarar custo de criar cada quadro?

## Evidências verificadas no código do aplicativo

1. **[CÓDIGO]** `EditorV6ExportPanel.tsx:15` fixa perfil padrão `1920×1080`, `turbo:true`, `forceTurbo1080:true`, `encoder:'cpu'`, boca loop e hair reaction; UI não escolhe automaticamente AMD por existir GPU.

2. **[CÓDIGO]** `src/shared/editorV6Export.ts:32–52` valida frames do projeto, 1080p Turbo e cria duas partes para intervalo com dois ou mais quadros; áudio/vídeo têm intervalos em frames lógicos.

3. **[CÓDIGO]** `editorV6ExportCommands.ts:24–41` cria snapshot desligado do Immer e **pode preparar cabelo antes de iniciar o job do Main**. O relatório de exportRunner sozinho não cobre necessariamente todo tempo de clique.

4. **[CÓDIGO]** `exportRunner.ts:139–162` exige Windows (`win32`) para esse exportador BGRA, fixa fps 30 e identifica necessidade de sobreposição de mídia. `:101–112` monta opções de codificação H.264 e yuv420p/BT709.

5. **[CÓDIGO]** `exportRunner.ts:214–225` prepara mouth loops por trecho; `:238–295` cria FFmpeg, define filtros de vídeos overlay e `-f rawvideo -pixel_format bgra -video_size` com 30fps, e alimenta stdin com frames do worker.

6. **[CÓDIGO]** `exportRunner.ts:274–285` espera `worker.frame` e o callback de escrita `stdin.write`, registrando `ffmpegWriteMs`; o callback de stream não necessariamente iguala tempo de CPU efetivo de codificação.

7. **[CÓDIGO]** `exportRunner.ts:372` testa `h264_nvenc`, `h264_qsv`, `h264_amf`, `h264_mf`, `libopenh264` em modo `auto`; CPU explícito escolhe `libopenh264`. Não misturar hardware/CPU no A/B.

8. **[CÓDIGO]** `exportRunner.ts:375–450` valida características das partes H.264 antes de concatenação stream-copy, planeja `atrim`,`asetpts`,`aresample`,`adelay`,`amix` e `apad` quando há áudio e tenta recuperar fontes danificadas com aviso sem publicar MP4 ausente.

9. **[CÓDIGO]** `exportRunner.ts:440–497` usa ffprobe e validação de emendas/pacotes; publicação de MP4 ocorre após checks. Nunca medir somente tempo até `stdin.end()`.

10. **[CÓDIGO]** `exportIpc.ts:64–68` resolve `ffmpeg.exe`/`ffprobe.exe` do diretório de ferramentas da aplicação; versões reais dependem do binário embarcado.

11. **[CÓDIGO]** `src/shared/editorV6Export.ts:73–81` define campos de timings e contadores incluindo `captureStaleReadbacks`/`hairRasterPixels`; `exportRunner.ts` agrega em relatório por parte e fase.

## Pesquisa nas fontes oficiais

1. **[FONTE OFICIAL] [FFmpeg formats](https://ffmpeg.org/ffmpeg-formats.html)** — Demuxer concat exige streams compatíveis em codecs/time base; timestamps podem criar gaps quando duração errada.

2. **[FONTE OFICIAL] [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html)** — Filtros `overlay`, `atrim`, `asetpts`, `aresample`,`adelay`,`amix`,`apad` possuem sincronismo e políticas de EOF que precisam preservar os clips do projeto.

3. **[FONTE OFICIAL] [FFmpeg ffprobe](https://ffmpeg.org/ffprobe.html)** — `-show_frames`, `-show_packets`, `-count_packets`, `-count_frames` não são intercambiáveis sem condições de stream/perfil.

4. **[FONTE OFICIAL] [FFmpeg ffmpeg](https://ffmpeg.org/ffmpeg.html)** — Entrada rawvideo precisa definir dimensões/pixel format/frame rate explicitamente; pipeline FFmpeg recebe bytes, não DOM/SVG.

5. **[FONTE OFICIAL] [Node Stream](https://nodejs.org/api/stream.html)** — `writable.write` pode sinalizar backpressure; ignorá-lo provoca buffers crescentes e RSS alto.

**Limite de proveniência:** informações de documentação oficial foram confrontadas conceitualmente com as APIs usadas no código, mas o EXE e as versões efetivas instaladas não foram executados. Não existe medição própria neste estudo.

## Análise causal e possibilidades de mudança

### 1. O vídeo movimenta gigabytes de pixels brutos

300×1920×1080×4 = 2.488.320.000 bytes (~2,32 GiB) de BGRA único antes de cópias, mesmo com MP4 pequeno. Rota com duas camadas background/foreground pode dobrar fluxo bruto por frame, mas não necessariamente a RAM simultânea.

### 2. Encoder não pode acelerar física/atlas

Se custo dominante estiver na preparação capilar, trocar codec para AMF pode reduzir só uma fração pequena do total. Primeiro extrair tempo real preparação/render/capture/FFmpeg/concat.

### 3. Codec de áudio e vídeo devem ser tratados separadamente

Em projeto com mídia externa, `overlay` pode usar decodificação adicional e duas imagens de fundo/foreground; audio mix tem filtros e timestamps. Testar só personagem sem vídeo não aprova backend para casos reais.

### 4. Paridade de cor

`yuv420p`/BT709/TV range fixos no encoder têm efeito em tonalidade e bordas. Mesmo MP4 1080p/30 não prova visual idêntico se conversão RGBA/alpha mudar.

### 5. Stream copy é otimização existente

A junção `-c:v copy` elimina recodificação quando as partes são compatíveis. Alterar o encoder por lane ou os parâmetros pode impedir concatenação segura.

### 6. Métricas de parede vs acumuladores

Com duas lanes, soma de `ffmpegWriteMs`, `renderMs` etc. pode exceder o tempo total; comparar tempo do primeiro clique até output publicado, e subfases por parte.

## Experimentos propostos (ainda não rodados)

1. **FFM-01:** Mesmo fixture 150/300 frames, CPU H.264: separar tempo prep, worker startup, geração, pipe, encode, mux, probes, concat e validação.

2. **FFM-02:** Repetir com mouth loop + áudio + vídeo overlay em cenas autorizadas; comparar frames/seams e duração de mídia.

3. **FFM-03:** PoC CPU vs auto/AMF mantendo resoluções, qualidade-alvo e mesmas frames; registrar qual encoder foi REALMENTE selecionado.

4. **FFM-04:** Capturar perfil `ffmpeg -version`, `-buildconf`, `-encoders` e `ffprobe -version` do EXE/ambiente, registrar licenças e opção de distribuição.

5. **FFM-05:** Stress de cancelamento/falha: nenhum mp4 parcial publicado, reaproveitamento de frame não provoca corrupção em duas partes Turbo.

6. **FFM-06:** Testar `ffprobe -count_packets` vs decodificação em perfis com e sem B-frames e tempos de emenda em amostras controladas.

## Gates de segurança, qualidade e integração

- H.264 MP4 válido com 1920×1080, 30fps, contagem exata, áudio e qualidade equivalentes.
- Manter encoder CPU padrão como referência; otimização de hardware deve ter fallback real validado.
- Não tratar H.264 MP4 padrão como formato RGBA com transparência.
- Não eliminar mixagem, cabeçalho faststart, tratamento de fonte inválida, cancelamento ou auditoria de emendas.
- Não publicar informações privadas ou caminhos de mídia em logs/CI.
- Comparar tempo total incluindo preparação de cabelo que ocorre fora do job Main.

## Veredito da pesquisa

**O fluxo FFmpeg é tecnicamente bem defendido por validação e stream-copy; não parece o primeiro candidato a reescrever.** O estudo recomenda prova de custo de encode/cópias em 300 frames antes de AMF, WebCodecs ou transportes GPU. O desvio de 50s→9s com cabelo exige separar geração de pixels do trabalho de FFmpeg.

**[A CONFIRMAR]** Custo específico do encoder no Windows alvo, efeito da seleção AMF, impacto de filtros de vídeo externo, comportamento do pipe em hardware real e qual tempo do pre-job está fora do relatório.

**Rastreabilidade:** [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md), [Plano executável](../PLANO_EXECUTAVEL.md), [Matriz](../MATRIZ_DE_OPORTUNIDADES.md), [Fontes oficiais](../evidencias/FONTES-OFICIAIS.md).

## Smokes de backend no Windows LAB — 06/11/2026

O FFmpeg 8.1.2 do LAB lista `h264_mf`, `h264_d3d12va`, `h264_amf`, NVENC, QSV, Vulkan e libx264. A documentação oficial do FFmpeg informa que Media Foundation aceita software/hardware e que hardware requer D3D11; recomenda `nv12` como formato mais seguro para muitos encoders [FFmpeg Codecs — MediaFoundation](https://www.ffmpeg.org/ffmpeg-codecs.html#MediaFoundation). A versão `h264_d3d12va` consta na implementação oficial do FFmpeg 8.1 [D3D12VA H.264 encoder](https://ffmpeg.org/doxygen/8.1/d3d12va__encode__h264_8c_source.html).

- `h264_mf -hw_encoding 1`, 150 frames sintéticos 1080p30, entrada NV12: iniciou e terminou, ffprobe contou 150 frames yuv420p e decodificação completa não retornou erro. Com `yuv420p`/perfil textual `high` falhou negociação/opção; exigir `nv12` e perfil numérico funcionou neste build.
- Mesmo `testsrc2`, 12Mbps: SSIM MF vs libx264 `veryfast` = 0,981299; PSNR médio 26,08dB. Esse clip sintético não é avaliação perceptual, mas mostra diferença forte de compressão/configuração; não atende sozinho ao gate de qualidade do projeto.
- `h264_d3d12va` criou MP4 de 150 frames, mas decodificação reportou erros de blocos H.264. **Rejeitado** no estado atual, sem integrar ao app.
- O runner do produto atualmente passa `-hw_encoding 0` para MF e fixa pixel format yuv420p; portanto um MF escolhido hoje seria software, não aceleração GPU. Não tratar disponibilidade da lista `-encoders` como compatibilidade runtime.
- Nenhum benchmark frio completo foi rodado para MF/D3D12VA; outputs de smoke foram gerados na área temporária LAB e removidos. Nenhuma alteração de backend foi promovida.

**Decisão:** manter CPU/libx264 como opção explícita medida e Auto (AMF no PC atual). Só reabrir MF com caminho de formato/qualidade integrado e comparável ao pipeline completo, incluindo custo de conversão, saída de áudio/MP4, fallback, golden RGBA e 3 exports frios. D3D12VA requer corrigir/diagnosticar bitstream antes de qualquer cronômetro de velocidade.

## Atualização de encoder no LAB — 06/11/2026

### Preset CPU validado em projeto completo

Comparação fria de `libx264` manteve 12Mbps e trocou `veryfast` por `ultrafast`. Em hair ON, mediana 84,266→80,105s (3+3 exports); no controle OFF, 73,530→68,833s. Ambos foram decodificados integralmente: SSIM ≥0,997842, PSNR ≥52,763dB e áudio PCM idêntico. Fica como preset padrão local do `libx264`; a alteração só afeta CPU, não AMF/NVENC/QSV/MF. Revalidar em outro hardware/projeto antes de extrapolar.

No FFmpeg 8.1.2 local, `ffmpeg -encoders` lista `libx264`, AMF, Media Foundation, NVENC e QSV, mas não lista `libopenh264`. O código anterior selecionava somente `libopenh264` para `encoder:cpu`; um smoke real do comando UI falhou imediatamente com “Nenhum codificador H.264 pôde ser iniciado”. CPU foi corrigido para testar `libx264` primeiro (preset `veryfast`, 12 Mbps e threads limitadas), mantendo OpenH264 como segunda opção e libx264 no fallback de um backend acelerado.

Perfil UI completo 3+3, com processo/cache frios: `auto` escolheu AMF (83,18/90,12/84,83s; mediana 84,83); CPU escolheu libx264 (85,20/82,44/81,47s; mediana 82,44). No trecho comparável de 150 quadros, CPU↔AMF decodificado deu SSIM 0,99675 e PSNR 50,71dB; AAC estéreo 48kHz ficou idêntico após decode. A diferença mediana de tempo é pequena; manter CPU como padrão apenas para o projeto/hardware atual, com Auto/GPU selecionável e reavaliação em outros dispositivos.

Referência de opções/presets libx264: [documentação oficial FFmpeg Codecs](https://ffmpeg.org/ffmpeg-codecs.html).
