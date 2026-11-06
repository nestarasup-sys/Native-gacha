# Pesquisa 20 — WebCodecs: VideoFrame/VideoEncoder e limites da substituição do FFmpeg

**Status:** PESQUISADA EM CÓDIGO + FONTES OFICIAIS; CAPACIDADE H.264 CONFIRMADA EM SMOKE SINTÉTICO; CENA REAL, ÁUDIO E GANHO PENDENTES.
**Revisão estática:** `Dev-V2@5166de7`; **data:** 06/11/2026. Revalidar versões e HEAD antes de implementar. Este documento não declara benchmark realizado.

## Questão técnica e escopo

**O WebCodecs no Chromium embutido poderia codificar quadros do Editor V6 mais rapidamente ou evitar cópias, sem perder MP4/H.264, áudio, PTS, overlays e compatibilidade Windows?**

## Mapa de integrações efetivamente observadas no Native Gacha

1. **[CÓDIGO]** `electron/domains/editorV6/exportRunner.ts` usa **FFmpeg externo**, não `VideoEncoder`; entrada `rawvideo bgra` a 30fps e saída H.264/MP4 por partes.

2. **[CÓDIGO]** `electron/domains/editorV6/exportWorkers.ts:17–36` extrai `NativeImage` pelo `capturePage` e encaminha BGRA para FFmpeg; uma API `VideoFrame` não receberá automaticamente a textura nativa do worker.

3. **[CÓDIGO]** `src/shared/editorV6Export.ts:12–52` define frame lógico, 30fps, splits Turbo e codec pretendido; um novo encoder deve consumir exatamente esses timestamps/frames.

4. **[CÓDIGO]** `electron/domains/editorV6/exportRunner.ts:372–497` trata codec H.264, concat de partes, mix de áudio, ffprobe, duração, emendas e validação; WebCodecs isolado não substitui esse trabalho.

5. **[CÓDIGO]** `src/renderer/src/features/editorV6/SceneSurface.tsx` inclui vídeo externo no SVG/DOM e `foreignObject` para camadas raster, o que impõe etapas antes de qualquer encoder.

6. **[CÓDIGO]** `electron/domains/editorV6/exportIpc.ts:64` resolve ffmpeg.exe/ffprobe.exe locais do app e faz validação de fontes; ainda seriam necessários backend e fallback para codecs indisponíveis.

7. **[CÓDIGO]** `package.json` não declara um muxer MP4 para WebCodecs nem adaptações de `VideoEncoder` em produção; WebCodecs deve ser tratado como **API exploratória**, não componente existente do exportador.

8. **[CÓDIGO]** `src/renderer/src/features/editorV6/editorV6ExportCommands.ts` prepara hair bundle antes do job; WebCodecs não elimina esse trabalho.

## Documentação oficial consultada e limites da API

1. **[FONTE OFICIAL] [MDN WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)** — WebCodecs transforma frames/chunks, mas **não muxa nem demuxa MP4/WebM** sozinho; formatos e codecs suportados variam.

2. **[FONTE OFICIAL] [MDN VideoEncoder](https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder)** — `isConfigSupported`, encodeQueueSize, `flush()` e `close()`; API tem restrições de disponibilidade e contexto seguro.

3. **[FONTE OFICIAL] [MDN WebCodecs Usage](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Using_the_WebCodecs_API)** — Manter fila bounded e `VideoFrame.close()` para prevenir consumo excessivo de memória/GPU; flush final obrigatório.

4. **[FONTE OFICIAL] [MDN VideoFrame](https://developer.mozilla.org/en-US/docs/Web/API/VideoFrame)** — Objeto transferível, timestamps em microssegundos e recursos gráficos que exigem ownership/lifetime.

5. **[FONTE OFICIAL] [Chrome WebCodecs](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs)** — Encoding assíncrono em worker pode reduzir pressão sobre thread principal, mas requer controle da fila e callback output.

6. **[FONTE OFICIAL] [W3C WebCodecs](https://www.w3.org/TR/webcodecs/)** — `VideoEncoder`, filas e timestamps são recursos do codec; a aplicação ainda precisa gerir duração/PTS e saída.

7. **[FONTE OFICIAL] [Registro AVC/H.264 para WebCodecs](https://www.w3.org/TR/webcodecs-avc-codec-registration/)** — Define o formato AVC dos chunks e configuração específica do encoder; não converte chunks em contêiner MP4.

8. **[FONTE OFICIAL] [FFprobe](https://ffmpeg.org/ffprobe.html)** — Contagem e integridade MP4 precisam ser verificadas independentemente do encoder.

**Limitação:** fontes consultadas cobrem a API pública atual, não o build Electron/Node instalado nem as milhões de linhas do motor upstream. Disponibilidade, licenças e formatos precisam de prova na versão empacotada.

## Hipóteses e conclusões fundamentadas

### 1. A primeira pergunta não é 'WebCodecs é rápido?'

[HIPÓTESE] Se os 41s extras são preparo/Canvas hair, WebCodecs pode não alterar esse custo. Benchmark do encoder requer frames constantes já renderizados e medir tempo total distinto.

### 2. A ponte Canvas→VideoFrame pode ser mais barata ou mais cara

[FONTE] VideoFrame aceita fontes Canvas/ImageBitmap/OffscreenCanvas, mas custo de conversão, cor, textura e scheduler dependem do Chromium/driver. Testar no Electron do build, não extrapolar de Chrome de outra versão.

### 3. Codec/container são contratos separados

[FONTE] EncodedVideoChunk não é arquivo MP4. Muxer de vídeo, metadata de codec/PTS, áudio AAC e faststart são projeto adicional; FFmpeg existente pode ser reutilizado como muxer apenas se suportar a entrada.

### 4. Timestamp do frame é microsegundo, não frame inteiro

[FONTE] A duração em 30fps corresponde a números racionais; calcular timestamp determinístico (arredondamento consistente) e validar sem drift após 150/300 frames.

### 5. Fallback e fechamento

[FONTE] isConfigSupported, encodeQueueSize, flush, close e tratamento de error callback são obrigatórios; context loss/driver podem mudar suporte H.264 mesmo quando interface está presente.

## Protocolo experimental que falta executar

1. **WC-01 — parcial:** No Electron 45.1.0 / Chromium 156 do LAB, `VideoEncoder`/`VideoFrame` existem e `isConfigSupported` aceitou H.264 1920×1080. A configuração pediu `hardwareAcceleration: "prefer-hardware"`; a API não confirmou qual dispositivo físico codificou.

2. **WC-02 — smoke sintético aprovado, comparação pendente:** [spike-webcodecs-encoder.cjs](../../../../scripts/editor-v6/spike-webcodecs-encoder.cjs) codificou 150 desenhos Canvas 1920×1080/30 em processo Electron novo e perfil temporário. Encode/flush: 1.569,8 ms; primeiro chunk: 453,3 ms; chunks H.264: 101.237 bytes; fila máxima: 5. FFmpeg remuxou por stream copy; FFprobe confirmou H.264, 150 quadros, 30/1, 5 s. A pasta temporária foi removida pelo supervisor.

3. **WC-03 — parcial:** MP4 silencioso e contagem foram validados; mux com áudio, PTS variável, seams, faststart, cancelamento e comparação de qualidade permanecem sem teste.

4. **WC-04:** Testar a cena real com `SceneSurface`, inclusive hair RGBA em `foreignObject`, faces, alpha, texto, vídeo externo e falha/recriação do encoder; sem perda de recursos.

5. **WC-05:** Comparar o mesmo projeto frio ponta a ponta (prep → render → encode → áudio/mux → validação) contra FFmpeg atual; rejeitar se não houver benefício com qualidade e integridade equivalentes.

## Riscos, compatibilidade e gates obrigatórios

- Sem codec/muxer selecionado e validado não há substituição de FFmpeg de produção.
- Não reduzir resolução/fps/qualidade ou deixar áudio de fora para declarar ganho.
- Manter `VideoFrame.close()` e `VideoEncoder.close()`/flush sob abort e erro.
- Respeitar as 2 lanes Turbo e o contrato de frames e emendas.
- Testar disponibilidade de contexto seguro/sandbox/CSP em portable Windows.

## Próxima decisão

**Veredito atualizado:** H.264 e remux de um desenho sintético funcionam nesta instalação, então a opção é tecnicamente viável para um próximo protótipo. O tempo de 1,57 s **não é comparação** com o exportador: a cena era um Canvas simples, sem personagem real, cabelo, áudio ou overlay. WebCodecs continua fora do produto; primeiro é preciso medir a captura de cena real e provar paridade RGBA.

**Próximo teste falsificável:** enviar o frame produzido pelo novo renderizador ao VideoEncoder sem materializar BGRA no processo main; comparar pixels pré-encode com captura atual, e depois medir MP4 completo com áudio. Ver [Pesquisa 01](01-ARQUITETURA-GERAL-E-INTEGRACOES.md), [Plano executável](../PLANO_EXECUTAVEL.md) e [Progresso](../PROGRESSO_E_RESULTADOS.md).
